/**
 * The tool that reads one recipe.
 *
 * Everything it renders comes off the page. Where the page and the structured
 * block disagree, the answer says what the page shows a cook, and where the
 * site publishes nothing the field is null rather than zero: a recipe with no
 * cooking time and a recipe cooked for no time are different claims.
 *
 * Rescaling happens here rather than in the reading layer, so a program reading
 * through that layer gets the quantities the site published.
 */

import { z } from "zod";
import { SupertoinetteError } from "../errors.js";
import { scaleLines } from "../recipe/scale.js";
import type { SupertoinetteClient } from "../supertoinette/client.js";
import type { RecipeCore, RecipeYield, ScaledIngredient } from "../types.js";
import { strictInput } from "./arguments.js";
import { scaledIngredientSchema } from "./scaleIngredients.js";
import { ok, SOURCE_NAME, type ToolResult } from "./shared.js";

export const getRecipeDescription =
  "Read one recipe on Supertoinette by its identifier, which is the number in its address: 4210 in " +
  "/recette/4210/veloute-de-gaverole.html. Returns the ingredients, the steps, the times, the " +
  "difficulty and the cost the site publishes. A time the site does not publish comes back as null " +
  "rather than as zero. Pass 'servings' to rescale the quantities: each line then says whether the " +
  "arithmetic landed exactly, or had to move to stay an amount a kitchen can measure out.";

const MAX_SERVINGS = 1000;

export const getRecipeInput = {
  id: z
    .string()
    .trim()
    .min(1)
    .max(10)
    .describe(
      "The number in the recipe's address, such as '4210'. Search for a dish when you do not have one.",
    ),
  servings: z
    .number()
    .int()
    .positive()
    .max(MAX_SERVINGS)
    .optional()
    .describe(
      "Rescale the quantities to this many. Left out, they come back as the site published them. " +
        "It is refused when the site's own wording carries no number to scale from.",
    ),
} as const;

/** The declaration the SDK publishes, so an undeclared argument is refused there too. */
export const getRecipeArgs = strictInput(getRecipeInput);

const sheetSchema = z.object({
  line: z.string().describe("The words the site linked, as published."),
  sheet_id: z.string(),
  slug: z.string(),
  url: z.string(),
});

export const getRecipeOutputShape = {
  id: z.string(),
  title: z.string().describe("The title with the pictogram the site opens it with taken off."),
  title_as_published: z.string().describe("The title exactly as the site wrote it."),
  url: z.string().describe("The public page. Show this when citing the recipe."),
  description: z.string().nullable(),
  published_at: z.string().nullable(),

  yield: z
    .object({
      original_count: z
        .number()
        .int()
        .nullable()
        .describe("The number the site printed, when its wording carries one."),
      original_text: z.string().describe("The site's own wording, which is the claim it made."),
      requested: z.number().int().nullable().describe("What the caller asked for."),
      unit: z.string().nullable().describe("The site's own word for what it counts."),
      factor: z.number().describe("What the quantities were multiplied by."),
    })
    .describe("How many the recipe was written for, and how many were asked for."),
  ingredients: z.array(scaledIngredientSchema),
  ingredient_count: z.number().int().describe("Lines rendered, headings included."),
  steps: z.array(z.string()),
  intro: z.string().nullable().describe("The prose the page prints above the steps."),

  prep_minutes: z
    .number()
    .int()
    .nullable()
    .describe("Null when the site publishes no preparation time."),
  cook_minutes: z
    .number()
    .int()
    .nullable()
    .describe("Null when the site publishes no cooking time."),
  total_minutes: z.number().int().nullable(),
  rest_minutes: z
    .number()
    .int()
    .nullable()
    .describe("Resting time, which the page prints as 'Pause'."),

  category: z.string().nullable(),
  author: z.string().nullable(),
  rating: z
    .object({
      value: z.number(),
      count: z.number().int().describe("Reviews counted."),
      scale: z.number().describe("The top of the scale, as published."),
    })
    .nullable(),
  nutrition: z.null().describe("Supertoinette publishes none."),

  difficulty: z
    .object({ label: z.string() })
    .nullable()
    .describe("The site's own wording. It publishes no scale for this, so none is stated."),
  cost_level: z
    .object({ label: z.string(), level: z.number().int(), scale: z.number().int() })
    .nullable()
    .describe("The site's own wording, with the scale it draws the symbols on."),
  images: z.array(z.string()),
  tags: z.array(
    z.object({
      label: z.string(),
      category: z
        .string()
        .nullable()
        .describe("Pass this back to browse the category. Null when the link opens no listing."),
      url: z.string(),
    }),
  ),
  ingredient_sheets: z.array(sheetSchema),
  faq: z.array(z.object({ question: z.string(), answer: z.string() })),

  source: z.string(),
  notes: z.array(z.string()),
} as const;

export type GetRecipeArgs = z.infer<typeof getRecipeArgs>;

/** The number and the word in a yield the site wrote, such as "6 personnes". */
const YIELD_COUNT = /^\s*(\d+)\s*(\p{L}[\p{L}\s]*)?/u;

/**
 * What the recipe serves, and what was asked of it.
 *
 * The site's own wording is carried whole, because "4 à 6 personnes" and "4
 * personnes" are different claims and rewriting either would put words in the
 * site's mouth.
 */
export function yieldOf(recipe: RecipeCore, requested: number | null): RecipeYield {
  const text = recipe.yield_text ?? "";
  const match = YIELD_COUNT.exec(text);
  const count = match === null ? null : Number(match[1]);
  const unit = match?.[2]?.trim();

  return {
    original_count: count,
    original_text: text,
    requested,
    unit: unit === undefined || unit === "" ? null : unit,
    factor: requested !== null && count !== null && count > 0 ? requested / count : 1,
  };
}

const SHEET_NOTE =
  "An ingredient sheet is the page Supertoinette itself links a line to, and it sometimes points at a different ingredient from the one the line names. Read it as the site's own link rather than as the identity of the ingredient.";

const AS_PUBLISHED_NOTE = "Quantities are as Supertoinette published them.";

const ROUNDED_NOTE =
  "A line marked 'rounded' no longer holds the exact product: it was moved to an amount a kitchen can measure out, and its own note says by how much.";

const UNSCALED_NOTE =
  "A line marked 'unscaled' carries no quantity that can be multiplied, and it comes back as the site wrote it.";

const TIMES = ["prep_minutes", "cook_minutes", "total_minutes"] as const;

/** What an answer has to qualify, said in the answer rather than left to be inferred. */
function notesFor(
  recipe: RecipeCore,
  lines: ScaledIngredient[],
  scaled: RecipeYield,
  skipped: string[],
): string[] {
  const notes: string[] = [];

  if (scaled.requested === null) {
    notes.push(AS_PUBLISHED_NOTE);
  } else {
    notes.push(
      `Quantities were scaled from ${scaled.original_text} to ${scaled.requested}, a factor of ${Math.round(scaled.factor * 100) / 100}.`,
    );
    if (lines.some((line) => line.scaling === "rounded")) {
      notes.push(ROUNDED_NOTE);
    }
    if (lines.some((line) => line.scaling === "unscaled" && !line.is_heading)) {
      notes.push(UNSCALED_NOTE);
    }
  }

  if (recipe.ingredient_sheets.length > 0) {
    notes.push(SHEET_NOTE);
  }

  const missing = TIMES.filter((field) => recipe[field] === null);
  if (missing.length > 0) {
    notes.push(
      `Supertoinette publishes no ${missing.join(", ")} for this recipe, so ${missing.length === 1 ? "it is" : "they are"} null rather than zero.`,
    );
  }

  if (skipped.length > 0) {
    notes.push(`${skipped.length} thing(s) set aside: ${skipped.join("; ")}.`);
  }
  return notes;
}

const minutes = (value: number | null): string =>
  value === null ? "not published" : `${value} min`;

function renderIngredient(line: ScaledIngredient): string {
  if (line.is_heading) {
    return line.text;
  }
  const mark = line.scaling === "scaled" ? "" : ` [${line.scaling}]`;
  return `- ${line.text}${mark}`;
}

/**
 * One block of prose. Every word of it comes from the recipe, so a reader of
 * the text block learns nothing the structured payload does not also carry.
 */
function renderRecipe(recipe: RecipeCore, lines: ScaledIngredient[], scaled: RecipeYield): string {
  const serves =
    scaled.requested === null
      ? scaled.original_text
      : `${scaled.requested}${scaled.unit === null ? "" : ` ${scaled.unit}`} (published for ${scaled.original_text})`;

  const heading = [
    recipe.title,
    serves === "" ? null : `For ${serves}`,
    recipe.difficulty === null ? null : recipe.difficulty.label,
    recipe.cost_level === null ? null : recipe.cost_level.label,
  ]
    .filter((part): part is string => part !== null)
    .join(" — ");

  const times = [
    `preparation ${minutes(recipe.prep_minutes)}`,
    `cooking ${minutes(recipe.cook_minutes)}`,
    recipe.rest_minutes === null ? null : `resting ${recipe.rest_minutes} min`,
    `total ${minutes(recipe.total_minutes)}`,
  ]
    .filter((part): part is string => part !== null)
    .join(", ");

  return [
    heading,
    times,
    "",
    "Ingredients:",
    ...lines.map(renderIngredient),
    "",
    "Steps:",
    ...recipe.steps.map((step, index) => `${index + 1}. ${step}`),
  ].join("\n");
}

export async function runGetRecipe(
  client: SupertoinetteClient,
  args: GetRecipeArgs,
): Promise<ToolResult> {
  const parsed = getRecipeArgs.safeParse(args);
  if (!parsed.success) {
    // Raised rather than rendered: the wiring above turns any failure into the
    // one error shape, so a refusal reads the same whichever layer produced it.
    // Every grievance, rather than the first: a call refused on two arguments
    // that names one sends a caller back for a second refusal.
    throw new SupertoinetteError(
      "invalid_input",
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const read = await client.getRecipe(parsed.data.id);
  const recipe = read.data;
  const requested = parsed.data.servings ?? null;
  const scaled = yieldOf(recipe, requested);

  // Scaling from a yield the site never stated as a number would invent the
  // proportion the whole answer rests on, so the call is refused instead.
  if (requested !== null && scaled.original_count === null) {
    throw new SupertoinetteError(
      "invalid_input",
      `[invalid_input] Supertoinette states this recipe's yield as "${scaled.original_text}", which carries no number to scale from. Read it without 'servings', or use scale_ingredients on the lines you choose.`,
    );
  }

  const lines = scaleLines(
    recipe.ingredients.map((line) => ({ text: line.raw, is_heading: line.is_heading })),
    { factor: scaled.factor },
  );
  const notes = notesFor(recipe, lines, scaled, read.skipped ?? []);

  return ok(
    {
      id: recipe.id,
      title: recipe.title,
      title_as_published: recipe.title_as_published,
      url: recipe.url,
      description: recipe.description,
      published_at: recipe.published_at,
      yield: scaled,
      ingredients: lines,
      ingredient_count: lines.length,
      steps: recipe.steps,
      intro: recipe.intro,
      prep_minutes: recipe.prep_minutes,
      cook_minutes: recipe.cook_minutes,
      total_minutes: recipe.total_minutes,
      rest_minutes: recipe.rest_minutes,
      category: recipe.category,
      author: recipe.author,
      rating: recipe.rating,
      nutrition: null,
      difficulty: recipe.difficulty,
      cost_level: recipe.cost_level,
      images: recipe.images,
      tags: recipe.tags,
      ingredient_sheets: recipe.ingredient_sheets,
      faq: recipe.faq,
      source: SOURCE_NAME,
      notes,
    },
    renderRecipe(recipe, lines, scaled),
    { notes },
  );
}
