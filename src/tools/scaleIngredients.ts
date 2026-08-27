/**
 * The tool that rescales a list of ingredients a caller already holds.
 *
 * It reaches no site. What it offers is the arithmetic a kitchen would do, with
 * every line saying how exact its result is: a quantity that landed on the
 * product, one that had to move to stay usable, and one the line never carried.
 */

import { z } from "zod";
import { SupertoinetteError } from "../errors.js";
import { scaleLine } from "../recipe/scale.js";
import type { ScaledIngredient } from "../types.js";
import { strictInput } from "./arguments.js";
import { ok, type ToolResult } from "./shared.js";

export const scaleIngredientsDescription =
  "Rescale a list of French ingredient lines, offline. Give either 'factor', or 'from_servings' and " +
  "'to_servings' together. Each line comes back with what was done to it: 'scaled' when the " +
  "arithmetic landed exactly, 'rounded' when the value had to move to stay something a kitchen can " +
  "measure out, and 'unscaled' when the line carries no quantity at all. Nothing is converted " +
  "between unit systems, and an approximate measure such as a pincée keeps its own size.";

const MAX_LINES = 200;
const MAX_LINE_CHARS = 300;
const MAX_FACTOR = 100;
const MAX_SERVINGS = 1000;

export const scaleIngredientsInput = {
  ingredients: z
    .array(z.string().trim().min(1).max(MAX_LINE_CHARS))
    .min(1)
    .max(MAX_LINES)
    .describe("The lines to rescale, as the recipe wrote them."),
  factor: z
    .number()
    .positive()
    .max(MAX_FACTOR)
    .optional()
    .describe("What to multiply the quantities by. Give this, or the two servings counts."),
  from_servings: z
    .number()
    .int()
    .positive()
    .max(MAX_SERVINGS)
    .optional()
    .describe("How many the list was written for."),
  to_servings: z
    .number()
    .int()
    .positive()
    .max(MAX_SERVINGS)
    .optional()
    .describe("How many it should serve."),
} as const;

/** The declaration the SDK publishes, so an undeclared argument is refused there too. */
export const scaleIngredientsArgs = strictInput(scaleIngredientsInput);

export const scaledIngredientSchema = z.object({
  text: z.string().describe("The line as it now reads."),
  original: z.string().describe("The line as it was given."),
  scaling: z
    .enum(["scaled", "rounded", "unscaled"])
    .describe(
      "'scaled' when the number is the product itself, 'rounded' when the value moved or a floor " +
        "was reached, 'unscaled' when the line carries nothing multipliable.",
    ),
  amount: z.number().nullable().describe("The scaled quantity, read together with 'unit'."),
  amount_max: z.number().nullable().describe("Upper bound when the line gives a range."),
  unit: z
    .string()
    .nullable()
    .describe("The unit 'amount' is in, which may differ from the original."),
  is_heading: z
    .boolean()
    .describe("True for a line naming a part of the recipe rather than an ingredient."),
  note: z.string().optional().describe("Why the line was rounded, clamped or left alone."),
});

export const scaleIngredientsOutputShape = {
  factor: z.number().describe("What the quantities were multiplied by."),
  ingredients: z.array(scaledIngredientSchema),
  scaled_count: z.number().int().describe("Lines whose arithmetic landed exactly."),
  rounded_count: z.number().int().describe("Lines whose value had to move."),
  unscaled_count: z.number().int().describe("Lines carrying no quantity."),
  notes: z.array(z.string()),
} as const;

export type ScaleIngredientsArgs = z.infer<typeof scaleIngredientsArgs>;

/**
 * The factor a call asks for, or the reason it cannot be worked out.
 *
 * Naming both ways of asking and accepting neither would leave the tool to pick
 * one, which answers a question the caller did not settle.
 */
export function factorFrom(args: {
  factor?: number | undefined;
  from_servings?: number | undefined;
  to_servings?: number | undefined;
}): number {
  const { factor, from_servings: from, to_servings: to } = args;

  if (factor !== undefined) {
    if (from !== undefined || to !== undefined) {
      throw new SupertoinetteError(
        "invalid_input",
        "[invalid_input] Give either 'factor' or the two servings counts, and not both: they can ask for different things.",
      );
    }
    return factor;
  }

  if (from !== undefined && to !== undefined) {
    return to / from;
  }

  throw new SupertoinetteError(
    "invalid_input",
    "[invalid_input] Give 'factor', or 'from_servings' and 'to_servings' together, so the quantities have something to be multiplied by.",
  );
}

const UNSCALED_NOTE =
  "A line marked 'unscaled' carries no quantity that can be multiplied, and it comes back as it was given.";
const ROUNDED_NOTE =
  "A line marked 'rounded' no longer holds the exact product: it was moved to an amount a kitchen can measure out, and its own note says by how much.";
const NO_CHANGE_NOTE = "A factor of 1 changes nothing, so every line comes back as it was given.";

function notesFor(lines: ScaledIngredient[], factor: number): string[] {
  const notes: string[] = [];
  if (factor === 1) {
    notes.push(NO_CHANGE_NOTE);
  }
  if (lines.some((line) => line.scaling === "rounded")) {
    notes.push(ROUNDED_NOTE);
  }
  if (lines.some((line) => line.scaling === "unscaled")) {
    notes.push(UNSCALED_NOTE);
  }
  return notes;
}

const count = (lines: ScaledIngredient[], kind: ScaledIngredient["scaling"]): number =>
  lines.filter((line) => line.scaling === kind).length;

/** One line per ingredient, marked where the result is not the exact product. */
function render(lines: ScaledIngredient[], factor: number): string {
  return [
    `Scaled by ${factor}.`,
    ...lines.map((line) => {
      const mark = line.scaling === "scaled" ? "" : ` [${line.scaling}]`;
      return `- ${line.text}${mark}`;
    }),
  ].join("\n");
}

export function runScaleIngredients(args: ScaleIngredientsArgs): ToolResult {
  const parsed = scaleIngredientsArgs.safeParse(args);
  if (!parsed.success) {
    throw new SupertoinetteError(
      "invalid_input",
      parsed.error.issues.map((issue) => issue.message).join(" "),
    );
  }

  const factor = factorFrom(parsed.data);
  const lines = parsed.data.ingredients.map((line) => scaleLine(line, { factor }));
  const notes = notesFor(lines, factor);

  return ok(
    {
      factor,
      ingredients: lines,
      scaled_count: count(lines, "scaled"),
      rounded_count: count(lines, "rounded"),
      unscaled_count: count(lines, "unscaled"),
      notes,
    },
    render(lines, factor),
    { notes },
  );
}
