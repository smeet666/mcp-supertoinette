/**
 * What rescaling a list a caller already holds is allowed to claim.
 *
 * The three counters are the summary of the whole answer, so they have to add
 * up to the list they describe: a caller reading only the counters must not be
 * told that every line scaled exactly when some of them moved.
 */

import { describe, expect, it } from "vitest";
import type { SupertoinetteError } from "../../src/errors.js";
import {
  factorFrom,
  runScaleIngredients,
  type ScaleIngredientsArgs,
} from "../../src/tools/scaleIngredients.js";

const args = (value: Record<string, unknown>): ScaleIngredientsArgs =>
  value as unknown as ScaleIngredientsArgs;

const textOf = (result: ReturnType<typeof runScaleIngredients>): string =>
  result.content[0]?.text ?? "";

describe("scale_ingredients", () => {
  it("multiplies every line by the factor it was given", () => {
    const result = runScaleIngredients(
      args({ ingredients: ["200 g de farine", "2 oeufs"], factor: 2 }),
    );

    expect(result.structuredContent?.["factor"]).toBe(2);
    expect(textOf(result)).toContain("400 g de farine");
    expect(textOf(result)).toContain("4 oeufs");
  });

  it("works the factor out from the two servings counts", () => {
    const result = runScaleIngredients(
      args({ ingredients: ["200 g de farine"], from_servings: 4, to_servings: 6 }),
    );

    expect(result.structuredContent?.["factor"]).toBe(1.5);
    expect(textOf(result)).toContain("300 g de farine");
  });

  it("counts what landed exactly, what moved and what carried no quantity", () => {
    const result = runScaleIngredients(
      args({ ingredients: ["200 g de farine", "3 oeufs", "Sel"], factor: 0.5 }),
    );

    expect(result.structuredContent?.["scaled_count"]).toBe(1);
    expect(result.structuredContent?.["rounded_count"]).toBe(1);
    expect(result.structuredContent?.["unscaled_count"]).toBe(1);
  });

  it("marks in the text block every line that is not the exact product", () => {
    const result = runScaleIngredients(args({ ingredients: ["3 oeufs", "Sel"], factor: 0.5 }));

    expect(textOf(result)).toContain("[rounded]");
    expect(textOf(result)).toContain("[unscaled]");
  });

  it("says what a rounded line and an unscaled line mean", () => {
    const result = runScaleIngredients(args({ ingredients: ["3 oeufs", "Sel"], factor: 0.5 }));
    const notes = result.structuredContent?.["notes"] as string[];

    expect(notes.some((note) => note.includes("no longer holds the exact product"))).toBe(true);
    expect(notes.some((note) => note.includes("no quantity that can be multiplied"))).toBe(true);
  });

  it("says a factor of one changed nothing", () => {
    const result = runScaleIngredients(args({ ingredients: ["200 g de farine"], factor: 1 }));
    const notes = result.structuredContent?.["notes"] as string[];

    expect(notes[0]).toContain("changes nothing");
  });

  it("carries each line's own note beside it", () => {
    const result = runScaleIngredients(args({ ingredients: ["1 oeuf"], factor: 0.1 }));
    const lines = result.structuredContent?.["ingredients"] as Record<string, unknown>[];

    expect(String(lines[0]?.["note"])).toContain("no longer holds its share");
  });

  it("credits the site in the text block", () => {
    const result = runScaleIngredients(args({ ingredients: ["1 oeuf"], factor: 2 }));

    expect(textOf(result)).toContain("Source: Supertoinette");
  });
});

describe("the factor a call asks for", () => {
  it("is the one given", () => {
    expect(factorFrom({ factor: 2 })).toBe(2);
  });

  it("is worked out from the two servings counts", () => {
    expect(factorFrom({ from_servings: 4, to_servings: 2 })).toBe(0.5);
  });

  it("is refused when both ways of asking are given, since they can differ", () => {
    expect(() => factorFrom({ factor: 2, from_servings: 4, to_servings: 6 })).toThrow(
      /either 'factor' or the two servings counts/,
    );
  });

  it("is refused when only one of the two servings counts is given", () => {
    expect(() => factorFrom({ from_servings: 4 })).toThrow(/from_servings' and 'to_servings'/);
    expect(() => factorFrom({ to_servings: 4 })).toThrow(/from_servings' and 'to_servings'/);
  });

  it("opens every refusal with the code a caller branches on", () => {
    try {
      factorFrom({});
      expect.unreachable("a call naming no factor is refused");
    } catch (error) {
      expect((error as SupertoinetteError).code).toBe("invalid_input");
      expect((error as SupertoinetteError).message).toContain("[invalid_input]");
    }
  });
});

describe("an argument the tool does not declare", () => {
  it("is refused, and the refusal names it", () => {
    expect(() =>
      runScaleIngredients(args({ ingredients: ["1 oeuf"], factor: 2, langue: "fr" })),
    ).toThrow(/langue/);
  });

  it("is refused when the list is empty", () => {
    expect(() => runScaleIngredients(args({ ingredients: [], factor: 2 }))).toThrow(
      /invalid_input/,
    );
  });

  it("is refused when the factor is not a positive number", () => {
    expect(() => runScaleIngredients(args({ ingredients: ["1 oeuf"], factor: 0 }))).toThrow(
      /invalid_input/,
    );
  });
});
