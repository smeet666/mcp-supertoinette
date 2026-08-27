/**
 * The tool that publishes the categories the site browses by.
 *
 * It exists because a category is addressed by a number and a name together,
 * and the site answers the number paired with any other name by a 404 rather
 * than by a redirect. A token built by hand therefore reaches a page the site
 * does not hold, which a caller reads as the category holding no recipes.
 *
 * What it returns is what the site itself lists, and that is not the whole of
 * what it files recipes under: a recipe's own tags open onto hundreds of
 * further listings the site publishes in neither list. The answer says so,
 * because a count of forty reading as the catalogue of categories would be the
 * same fault as a listing rendered as complete.
 */

import { z } from "zod";
import { SupertoinetteError } from "../errors.js";
import type { CategoryEntry } from "../supertoinette/parseBrowse.js";
import type { SupertoinetteClient } from "../supertoinette/client.js";
import { strictInput } from "./arguments.js";
import { ok, SOURCE_NAME, type ToolResult } from "./shared.js";

export const listCategoriesDescription =
  "List the categories Supertoinette browses its recipes by. Each entry carries the token that " +
  "opens its listing with browse_recipes, and 'listed_in' says where the site printed it: its " +
  "footer holds the kinds of dish, its menu holds the ways of cooking and the seasons. Never build " +
  "a token by hand, because the site answers a number paired with the wrong name with a page it " +
  "does not hold. These two lists are not every category the site files recipes under: a recipe's " +
  "own tags open onto hundreds more that neither list publishes.";

export const listCategoriesInput = {} as const;

/** The declaration the SDK publishes, so an undeclared argument is refused there too. */
export const listCategoriesArgs = strictInput(listCategoriesInput);

export const listCategoriesOutputShape = {
  categories: z.array(
    z.object({
      label: z.string().describe("The site's own wording for it."),
      category: z
        .string()
        .describe("Pass this to browse_recipes. A number and a name, never assembled by hand."),
      url: z.string().describe("The public page. Show this when citing the category."),
      listed_in: z
        .enum(["footer", "menu"])
        .describe(
          "Where the site printed it: 'footer' for the kinds of dish, 'menu' for the ways of " +
            "cooking and the seasons.",
        ),
    }),
  ),
  category_count: z.number().int().describe("Entries the two lists hold."),
  url: z.string().describe("The page these categories were read from."),
  source: z.string(),
  notes: z.array(z.string()),
} as const;

export type ListCategoriesArgs = z.infer<typeof listCategoriesArgs>;

const NOT_EVERY_CATEGORY_NOTE =
  "These are the categories Supertoinette lists on its own pages, and not every category it files recipes under: a recipe's tags open onto hundreds more that neither list publishes. Read a recipe to find those.";

const TOKEN_NOTE =
  "A category is opened by a number and a name together. The site answers a number paired with any other name with a page it does not hold, so pass a token back exactly as it came.";

/** One line per category, grouped the way the site groups them. */
function render(categories: CategoryEntry[], url: string): string {
  if (categories.length === 0) {
    return `Supertoinette listed no category on ${url}.`;
  }

  const lines: string[] = [];
  for (const listed of ["footer", "menu"] as const) {
    const group = categories.filter((entry) => entry.listed_in === listed);
    if (group.length === 0) {
      continue;
    }
    lines.push(
      listed === "footer"
        ? "Kinds of dish, from the site's footer:"
        : "Ways of cooking and seasons, from the site's menu:",
    );
    lines.push(...group.map((entry) => `${entry.category}: ${entry.label}`));
  }
  return lines.join("\n");
}

export async function runListCategories(
  client: SupertoinetteClient,
  args: ListCategoriesArgs,
): Promise<ToolResult> {
  const parsed = listCategoriesArgs.safeParse(args);
  if (!parsed.success) {
    throw new SupertoinetteError(
      "invalid_input",
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const read = await client.listCategories();
  const categories = read.data;
  const url = "https://www.supertoinette.com/recettes-cuisine-photos";
  const notes = [NOT_EVERY_CATEGORY_NOTE, TOKEN_NOTE];

  return ok(
    {
      categories,
      category_count: categories.length,
      url,
      source: SOURCE_NAME,
      notes,
    },
    render(categories, url),
    { notes },
  );
}
