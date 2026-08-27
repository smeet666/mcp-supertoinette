/**
 * The tool that reads the wines the site puts against a dish.
 *
 * The site ranks five wines for each dish, in its own words, from a good match
 * to a perfect one. That ranking is its claim and nobody else's: nothing here
 * scores a wine, reorders the five, or supplies a rank the site left off.
 *
 * A dish is reached by the number in its address, and the index that publishes
 * those numbers runs alphabetically over dozens of pages. Called with a page
 * rather than an identifier, this tool reads one page of that index, which is
 * how a caller finds the number for a dish whose name they know.
 */

import { z } from "zod";
import { SupertoinetteError } from "../errors.js";
import type { IndexEntry, PairingSheet } from "../supertoinette/parsePairings.js";
import type { SupertoinetteClient } from "../supertoinette/client.js";
import { strictInput } from "./arguments.js";
import { ok, SOURCE_NAME, type ToolResult } from "./shared.js";

export const getWinePairingsDescription =
  "Read the wines Supertoinette ranks for one dish, given the number in its address as 'id'. Each " +
  "wine comes with the site's own wording for how well it goes, from 'Bon accord' to 'Accord " +
  "parfait'. Called with 'page' instead, it reads one page of the alphabetical index of dishes, " +
  "which is where the identifiers come from: the index runs alphabetically, so a dish beginning " +
  "with a late letter sits on a late page.";

const MAX_PAGE = 100;

export const getWinePairingsInput = {
  id: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .optional()
    .describe("The number in a dish's address, such as '10'. Give this or 'page'."),
  page: z
    .number()
    .int()
    .min(1)
    .max(MAX_PAGE)
    .optional()
    .describe(
      "Read one page of the alphabetical index of dishes instead of one dish. Give this or 'id'.",
    ),
} as const;

/** The declaration the SDK publishes, so an undeclared argument is refused there too. */
export const getWinePairingsArgs = strictInput(getWinePairingsInput);

/**
 * Two answers, because the tool answers two questions, each described whole.
 *
 * The branch is carried in a field rather than in the shape of the answer
 * itself: an answer about a dish holds fields an answer about the index never
 * has, and one flat object mixing them would describe every call as though it
 * could hold both. `kind` says which of the two arrived, and the other is null.
 */
const dishShape = z.object({
  id: z.string(),
  dish: z.string().describe("The site's own name for it."),
  style: z
    .string()
    .nullable()
    .describe("The style of wine the site opens with. Null where it wrote none."),
  pairings: z.array(
    z.object({
      rank: z
        .string()
        .describe("The site's own wording for how well it goes, such as 'Accord parfait'."),
      wine: z.string().describe("The wine and whatever the site writes about it, as published."),
    }),
  ),
  pairing_count: z.number().int(),
  recipes: z
    .array(z.object({ id: z.string(), title: z.string(), url: z.string() }))
    .describe("The recipes the site links beside the dish. Read one with get_recipe."),
  url: z.string(),
});

const indexShape = z.object({
  page: z.number().int(),
  last_page: z.number().int().describe("The highest page the site links to from this one."),
  dishes: z.array(z.object({ id: z.string(), dish: z.string(), url: z.string() })),
  dish_count: z.number().int().describe("Dishes this page holds."),
  url: z.string(),
});

export const getWinePairingsOutputShape = {
  kind: z
    .enum(["dish", "index"])
    .describe("Which of the two answers arrived. The other field is null."),
  dish: dishShape.nullable().describe("The wines ranked for one dish, when 'id' was given."),
  index: indexShape.nullable().describe("One page of the index of dishes, when 'page' was given."),
  source: z.string(),
  notes: z.array(z.string()),
} as const;

export type GetWinePairingsArgs = z.infer<typeof getWinePairingsArgs>;

const RANK_NOTE =
  "The rank is Supertoinette's own wording for how well a wine goes with the dish, and the order is the site's. Nothing here scores a wine or places one against another.";

const INDEX_NOTE =
  "The index runs alphabetically, so a dish whose name begins with a late letter sits on a late page. Pass a dish's 'id' back to read the wines ranked for it.";

/** One line per wine, in the order the site ranked them. */
function renderDish(sheet: PairingSheet): string {
  const opening = sheet.style === null ? sheet.dish : `${sheet.dish} — ${sheet.style}`;
  return [
    opening,
    ...sheet.pairings.map((pairing) => `${pairing.rank}: ${pairing.wine}`),
    ...(sheet.recipes.length === 0
      ? []
      : [
          "",
          `Recipes: ${sheet.recipes.map((recipe) => `${recipe.id} ${recipe.title}`).join(", ")}`,
        ]),
  ].join("\n");
}

/** One line per dish, with the identifier that opens it. */
function renderIndex(entries: IndexEntry[], page: number, lastPage: number): string {
  if (entries.length === 0) {
    return `Supertoinette listed no dish on page ${page}.`;
  }
  return [
    `Dishes, page ${page} of ${lastPage}.`,
    ...entries.map((entry) => `${entry.id}: ${entry.dish}`),
  ].join("\n");
}

export async function runGetWinePairings(
  client: SupertoinetteClient,
  args: GetWinePairingsArgs,
): Promise<ToolResult> {
  const parsed = getWinePairingsArgs.safeParse(args);
  if (!parsed.success) {
    throw new SupertoinetteError(
      "invalid_input",
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const { id, page } = parsed.data;
  if (id !== undefined && page !== undefined) {
    throw new SupertoinetteError(
      "invalid_input",
      "[invalid_input] Give either 'id' to read one dish or 'page' to read the index, and not both: they answer different questions.",
    );
  }

  if (id === undefined) {
    const asked = page ?? 1;
    const read = await client.listPairings(asked);
    const index = read.data;
    const notes = [INDEX_NOTE];

    return ok(
      {
        kind: "index",
        dish: null,
        index: {
          page: asked,
          last_page: index.last_page,
          dishes: index.entries,
          dish_count: index.entries.length,
          url: index.url,
        },
        source: SOURCE_NAME,
        notes,
      },
      renderIndex(index.entries, asked, index.last_page),
      { notes },
    );
  }

  const read = await client.getPairings(id);
  const sheet = read.data;
  const skipped = read.skipped ?? [];
  const notes = [
    RANK_NOTE,
    ...(skipped.length > 0
      ? [
          `${skipped.length} ${skipped.length === 1 ? "line was" : "lines were"} set aside: ${skipped.join("; ")}.`,
        ]
      : []),
  ];

  return ok(
    {
      kind: "dish",
      dish: {
        id: sheet.id,
        dish: sheet.dish,
        style: sheet.style,
        pairings: sheet.pairings,
        pairing_count: sheet.pairings.length,
        recipes: sheet.recipes,
        url: sheet.url,
      },
      index: null,
      source: SOURCE_NAME,
      notes,
    },
    renderDish(sheet),
    { notes },
  );
}
