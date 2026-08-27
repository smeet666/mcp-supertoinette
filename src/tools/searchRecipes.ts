/**
 * The tool that searches the recipes.
 *
 * Three things a caller could otherwise get wrong, and which the answer states
 * rather than leaving to be inferred.
 *
 * The site publishes no total anywhere on a search page, so `total_available`
 * is null and the number of pages is offered instead, named for what it is.
 *
 * The facets it counts are counted inside the query, and a recipe filed under
 * two categories is counted by both, so they do not add up to the rows served.
 *
 * A category the site does not know is answered exactly like a search that
 * matched nothing. A filter that finds nothing is therefore set aside, the
 * search is asked again without it, and the answer says which filter was
 * dropped and which ones the site does publish.
 */

import { z } from "zod";
import { SupertoinetteError } from "../errors.js";
import type { SearchOutcome, SupertoinetteClient } from "../supertoinette/client.js";
import type { Listing, ListingRow } from "../supertoinette/parseSearch.js";
import { strictInput } from "./arguments.js";
import { ok, SOURCE_NAME, type ToolResult } from "./shared.js";

export const searchRecipesDescription =
  "Search Supertoinette by a dish or an ingredient. Each row carries the identifier to read the " +
  "recipe with get_recipe. The site publishes no total, so 'total_available' is null and " +
  "'last_page' says how far the results run. The categories it counts beside a search are " +
  "returned as 'facets': pass one back as 'category' to narrow the search, spelled exactly as the " +
  "site spells it. A category the site does not know is answered like a search that matched " +
  "nothing, so a filter that finds nothing is dropped and the answer says so.";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 39;
const MAX_PAGE = 1000;

export const searchRecipesInput = {
  query: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .describe("A dish or an ingredient to look for, in French."),
  limit: z
    .number()
    .int()
    .min(1)
    .max(MAX_LIMIT)
    .optional()
    .describe(
      `Rows to render, ${DEFAULT_LIMIT} by default. The site serves at most ${MAX_LIMIT} to a page, and 'rows_published' always states what the page held.`,
    ),
  page: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE)
    .optional()
    .describe("Which page of results to read, 1 by default. 'last_page' says how far they run."),
  category: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .optional()
    .describe(
      "Narrow the search to one category, taken from the 'facets' of a previous answer and spelled " +
        "exactly as the site spells it. Never build one by hand: the site answers a wording it does " +
        "not know with a page that reads as an absence.",
    ),
} as const;

/** The declaration the SDK publishes, so an undeclared argument is refused there too. */
export const searchRecipesArgs = strictInput(searchRecipesInput);

const rowSchema = z.object({
  id: z.string().describe("Pass this to get_recipe."),
  title: z.string().describe("The title with the pictogram the site opens it with taken off."),
  title_as_published: z.string(),
  url: z.string().describe("The public page. Show this when citing the recipe."),
  image_url: z.string().nullable(),
  description: z.string().nullable(),
  categories: z.array(z.string()).describe("The categories the site files the row under."),
});

export const searchRecipesOutputShape = {
  query: z.string(),
  page: z.number().int().describe("The page these rows were read from."),
  last_page: z.number().int().describe("The highest page the site links to from this one."),
  category: z
    .string()
    .nullable()
    .describe("The category the answer was narrowed to, or null for a search across all of them."),
  results: z.array(rowSchema),
  result_count: z.number().int().describe("Rows rendered here."),
  rows_published: z.number().int().describe("Rows the page held, before any were rendered."),
  total_available: z
    .null()
    .describe("Supertoinette prints no total on a search page, so there is none to report."),
  facets: z
    .array(z.object({ label: z.string(), count: z.number().int() }))
    .describe(
      "The categories the site counts inside this search. A recipe filed under two is counted by " +
        "both, so these do not add up to the rows served.",
    ),
  url: z.string().describe("The page these rows were read from."),
  source: z.string(),
  notes: z.array(z.string()),
} as const;

export type SearchRecipesArgs = z.infer<typeof searchRecipesArgs>;

const NO_TOTAL_NOTE =
  "Supertoinette prints no total on a search page. 'last_page' is how far the results run, and the last page holds fewer rows than a full one.";

const FACET_NOTE =
  "A facet counts inside this search, and a recipe filed under two categories is counted by both. The counts do not add up to the rows served.";

const LOOSE_NOTE =
  "The site matches a query loosely, so a row may carry only one of the words that were asked for.";

/** What an answer has to qualify, said in the answer rather than left to be inferred. */
function notesFor(
  listing: Listing,
  outcome: SearchOutcome,
  rendered: ListingRow[],
  page: number,
  skipped: string[],
): string[] {
  const notes: string[] = [];

  if (outcome.dropped_category !== null) {
    const published = listing.facets.map((facet) => facet.label);
    notes.push(
      `The category "${outcome.dropped_category}" found nothing, so the search was made again without it. ${
        published.length > 0
          ? `Supertoinette counts these categories for this query: ${published.join(", ")}.`
          : "Supertoinette counts no category for this query."
      }`,
    );
  }

  if (listing.matched_nothing) {
    notes.push("Supertoinette matched nothing for this query.");
  } else if (rendered.length === 0 && page > listing.last_page) {
    notes.push(
      `Page ${page} is past the last one, which is ${listing.last_page}. This says nothing about what the query matched.`,
    );
  }

  if (rendered.length < listing.results.length) {
    notes.push(
      `${rendered.length} of the ${listing.results.length} recipes this page holds are rendered here. Raise 'limit' for the rest.`,
    );
  }

  if (rendered.length > 0) {
    notes.push(LOOSE_NOTE);
    notes.push(NO_TOTAL_NOTE);
  }

  if (listing.facets.length > 0) {
    notes.push(FACET_NOTE);
  }

  if (skipped.length > 0) {
    notes.push(
      `${skipped.length} ${skipped.length === 1 ? "row was" : "rows were"} set aside: ${skipped.join("; ")}.`,
    );
  }

  return notes;
}

/**
 * One line per row. Every word of it comes from the listing, so a reader of the
 * text block learns nothing the structured payload does not also carry.
 */
function render(listing: Listing, rendered: ListingRow[], query: string, page: number): string {
  if (rendered.length === 0) {
    return listing.matched_nothing
      ? `Supertoinette matched nothing for "${query}".`
      : `Supertoinette served no recipe on page ${page} for "${query}".`;
  }

  const heading = `Recipes for "${query}", page ${page} of ${listing.last_page}.`;
  const rows = rendered.map((row) => {
    const filed = row.categories.length === 0 ? "" : ` (${row.categories.join(", ")})`;
    return `${row.id}: ${row.title}${filed}`;
  });
  const counted =
    listing.facets.length === 0
      ? []
      : [
          "",
          `Categories counted: ${listing.facets.map((f) => `${f.label} ${f.count}`).join(", ")}`,
        ];

  return [heading, ...rows, ...counted].join("\n");
}

export async function runSearchRecipes(
  client: SupertoinetteClient,
  args: SearchRecipesArgs,
): Promise<ToolResult> {
  const parsed = searchRecipesArgs.safeParse(args);
  if (!parsed.success) {
    throw new SupertoinetteError(
      "invalid_input",
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const page = parsed.data.page ?? 1;
  const asked = parsed.data.category ?? null;
  const read = await client.searchRecipes({ query: parsed.data.query, page, category: asked });
  const { listing, dropped_category: dropped } = read.data;

  const rendered = listing.results.slice(0, parsed.data.limit ?? DEFAULT_LIMIT);
  const notes = notesFor(listing, read.data, rendered, page, read.skipped ?? []);

  return ok(
    {
      query: parsed.data.query,
      page,
      last_page: listing.last_page,
      // The category the answer actually stands on: null when the filter was
      // set aside, since the rows come from a search that never carried it.
      category: dropped === null ? asked : null,
      results: rendered,
      result_count: rendered.length,
      rows_published: listing.rows_published,
      total_available: null,
      facets: listing.facets,
      url: listing.url,
      source: SOURCE_NAME,
      notes,
    },
    render(listing, rendered, parsed.data.query, page),
    { notes },
  );
}
