/**
 * The tool that reads one category's recipes.
 *
 * A category listing prints a difficulty and a total time beside each row,
 * which a search listing does not, and it prints no category tags, which a
 * search listing does. The rows therefore carry what the page carries and no
 * field the site left blank is filled in from somewhere else.
 *
 * The site publishes no total here either, so how far the listing runs is what
 * is offered instead, and a page past the last one is named as such rather than
 * rendered as a category holding nothing.
 */

import { z } from "zod";
import { SupertoinetteError } from "../errors.js";
import type { BrowseRow, CategoryListing } from "../supertoinette/parseBrowse.js";
import type { SupertoinetteClient } from "../supertoinette/client.js";
import { strictInput } from "./arguments.js";
import { ok, SOURCE_NAME, type ToolResult } from "./shared.js";

export const browseRecipesDescription =
  "Read the recipes of one Supertoinette category, page by page. The category is a number and a " +
  "name together, taken from list_categories or from the 'tags' of a recipe, and never assembled " +
  "by hand. Each row carries the identifier get_recipe reads a recipe with, plus the difficulty " +
  "and the total time the site prints beside it. The site publishes no total, so 'last_page' says " +
  "how far the listing runs.";

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 30;
const MAX_PAGE = 1000;

export const browseRecipesInput = {
  category: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .describe(
      "The category to read, as a number and a name together, such as '107/recettes-desserts'. " +
        "Take one from list_categories or from a recipe's tags.",
    ),
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
    .describe("Which page to read, 1 by default. 'last_page' says how far the listing runs."),
} as const;

/** The declaration the SDK publishes, so an undeclared argument is refused there too. */
export const browseRecipesArgs = strictInput(browseRecipesInput);

const rowSchema = z.object({
  id: z.string().describe("Pass this to get_recipe."),
  title: z.string().describe("The title with the pictogram the site opens it with taken off."),
  title_as_published: z.string(),
  url: z.string().describe("The public page. Show this when citing the recipe."),
  image_url: z.string().nullable(),
  description: z.string().nullable(),
  difficulty: z
    .string()
    .nullable()
    .describe("The site's own wording, or null where it printed none."),
  total_minutes: z
    .number()
    .int()
    .nullable()
    .describe("Minutes, or null where the site printed no total."),
});

export const browseRecipesOutputShape = {
  category: z.string().describe("The category that was read."),
  title: z.string().nullable().describe("The site's own heading for the category."),
  page: z.number().int().describe("The page these rows were read from."),
  last_page: z.number().int().describe("The highest page the site links to from this one."),
  results: z.array(rowSchema),
  result_count: z.number().int().describe("Rows rendered here."),
  rows_published: z.number().int().describe("Rows the page held, before any were rendered."),
  total_available: z
    .null()
    .describe("Supertoinette prints no total on a category page, so there is none to report."),
  url: z.string().describe("The page these rows were read from."),
  source: z.string(),
  notes: z.array(z.string()),
} as const;

export type BrowseRecipesArgs = z.infer<typeof browseRecipesArgs>;

const NO_TOTAL_NOTE =
  "Supertoinette prints no total on a category page. 'last_page' is how far the listing runs, and the last page holds fewer rows than a full one.";

/** What an answer has to qualify, said in the answer rather than left to be inferred. */
function notesFor(
  listing: CategoryListing,
  rendered: BrowseRow[],
  page: number,
  skipped: string[],
): string[] {
  const notes: string[] = [];

  if (rendered.length === 0 && page > listing.last_page) {
    notes.push(
      `Page ${page} is past the last one, which is ${listing.last_page}. This says nothing about what the category holds.`,
    );
  }

  if (rendered.length < listing.results.length) {
    notes.push(
      `${rendered.length} of the ${listing.results.length} recipes this page holds are rendered here. Raise 'limit' for the rest.`,
    );
  }

  if (rendered.length > 0) {
    notes.push(NO_TOTAL_NOTE);
  }

  if (skipped.length > 0) {
    notes.push(
      `${skipped.length} ${skipped.length === 1 ? "row was" : "rows were"} set aside: ${skipped.join("; ")}.`,
    );
  }

  return notes;
}

const minutes = (value: number | null): string =>
  value === null ? "no total published" : `${value} min`;

/** One line per row. Every word of it comes from the listing. */
function render(listing: CategoryListing, rendered: BrowseRow[], page: number): string {
  const named = listing.title ?? "this category";
  if (rendered.length === 0) {
    return `Supertoinette served no recipe on page ${page} of ${named}.`;
  }

  return [
    `${named}, page ${page} of ${listing.last_page}.`,
    ...rendered.map((row) => {
      const how = row.difficulty === null ? "" : `, ${row.difficulty}`;
      return `${row.id}: ${row.title}${how}, ${minutes(row.total_minutes)}`;
    }),
  ].join("\n");
}

export async function runBrowseRecipes(
  client: SupertoinetteClient,
  args: BrowseRecipesArgs,
): Promise<ToolResult> {
  const parsed = browseRecipesArgs.safeParse(args);
  if (!parsed.success) {
    throw new SupertoinetteError(
      "invalid_input",
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const page = parsed.data.page ?? 1;
  const read = await client.browseRecipes(parsed.data.category, page);
  const listing = read.data;
  const rendered = listing.results.slice(0, parsed.data.limit ?? DEFAULT_LIMIT);
  const notes = notesFor(listing, rendered, page, read.skipped ?? []);

  return ok(
    {
      category: parsed.data.category,
      title: listing.title,
      page,
      last_page: listing.last_page,
      results: rendered,
      result_count: rendered.length,
      rows_published: listing.rows_published,
      total_available: null,
      url: listing.url,
      source: SOURCE_NAME,
      notes,
    },
    render(listing, rendered, page),
    { notes },
  );
}
