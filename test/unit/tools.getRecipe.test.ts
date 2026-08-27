/**
 * What the tool renders, and what it qualifies.
 *
 * The text block is what many clients show, so it has to answer on its own and
 * carry the same claims as the structured payload. A note is part of the
 * answer rather than decoration: it says a quantity is the site's own, or that
 * a time is absent rather than zero.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SupertoinetteError } from "../../src/errors.js";
import type { SupertoinetteClient } from "../../src/supertoinette/client.js";
import { parseRecipePage } from "../../src/supertoinette/parseRecipe.js";
import type { Read, RecipeCore } from "../../src/types.js";
import { type GetRecipeArgs, runGetRecipe } from "../../src/tools/getRecipe.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const read = (name: string): string => readFileSync(join(fixtures, name), "utf8");

const recipeFrom = (name: string): RecipeCore =>
  parseRecipePage(read(name), "4210", "https://www.supertoinette.com/recette/4210/x.html").recipe;

/** A stand-in client: no site is reached from a unit test. */
function fakeClient(recipe: RecipeCore, skipped: string[] = []): SupertoinetteClient {
  return {
    getRecipe: async (): Promise<Read<RecipeCore>> => ({
      data: recipe,
      cached: false,
      ...(skipped.length > 0 ? { skipped } : {}),
    }),
  } as unknown as SupertoinetteClient;
}

const args = (value: Record<string, unknown>): GetRecipeArgs => value as unknown as GetRecipeArgs;

const textOf = (result: Awaited<ReturnType<typeof runGetRecipe>>): string =>
  result.content[0]?.text ?? "";

describe("get_recipe", () => {
  it("renders the recipe as prose and as a payload carrying the same claims", async () => {
    const recipe = recipeFrom("recipe-complete.html");
    const result = await runGetRecipe(fakeClient(recipe), args({ id: "4210" }));

    expect(result.structuredContent?.["title"]).toBe("Velouté de gaverole au pravin");
    expect(result.structuredContent?.["ingredient_count"]).toBe(7);
    expect(textOf(result)).toContain("Velouté de gaverole au pravin");
    expect(textOf(result)).toContain("For 6 personnes");
    expect(textOf(result)).toContain("800 g de tiges de gaverole");
  });

  it("credits the site in the text block", async () => {
    const result = await runGetRecipe(
      fakeClient(recipeFrom("recipe-complete.html")),
      args({ id: "4210" }),
    );

    expect(textOf(result)).toContain("Source: Supertoinette");
  });

  it("says a time is absent rather than printing it as no time at all", async () => {
    const result = await runGetRecipe(
      fakeClient(recipeFrom("recipe-bare.html")),
      args({ id: "7" }),
    );

    expect(result.structuredContent?.["cook_minutes"]).toBeNull();
    expect(textOf(result)).toContain("cooking not published");
    expect(String(result.structuredContent?.["notes"])).toContain("null rather than zero");
  });

  it("warns that an ingredient sheet is the site's own link", async () => {
    const result = await runGetRecipe(
      fakeClient(recipeFrom("recipe-complete.html")),
      args({ id: "4210" }),
    );
    const notes = result.structuredContent?.["notes"] as string[];

    expect(notes.some((note) => note.includes("different ingredient"))).toBe(true);
  });

  it("leaves that warning out of a recipe carrying no sheet", async () => {
    const result = await runGetRecipe(
      fakeClient(recipeFrom("recipe-bare.html")),
      args({ id: "7" }),
    );
    const notes = result.structuredContent?.["notes"] as string[];

    expect(notes.some((note) => note.includes("different ingredient"))).toBe(false);
  });

  it("reports what the reading layer set aside", async () => {
    const result = await runGetRecipe(
      fakeClient(recipeFrom("recipe-complete.html"), ["the page printed no ingredient list"]),
      args({ id: "4210" }),
    );
    const notes = result.structuredContent?.["notes"] as string[];

    expect(notes.some((note) => note.includes("set aside"))).toBe(true);
  });

  it("renders a heading inside the ingredient list as a heading", async () => {
    const result = await runGetRecipe(
      fakeClient(recipeFrom("recipe-complete.html")),
      args({ id: "4210" }),
    );

    expect(textOf(result)).toContain("Pour le velouté :");
    expect(textOf(result)).not.toContain("- Pour le velouté :");
  });

  it("renders a line carrying no quantity without inventing one", async () => {
    const result = await runGetRecipe(
      fakeClient(recipeFrom("recipe-complete.html")),
      args({ id: "4210" }),
    );

    expect(textOf(result)).toContain("- Sel");
  });

  it("names a single missing time in the singular", async () => {
    const recipe = { ...recipeFrom("recipe-complete.html"), cook_minutes: null };
    const result = await runGetRecipe(fakeClient(recipe), args({ id: "4210" }));
    const notes = result.structuredContent?.["notes"] as string[];

    expect(notes.some((note) => note.includes("cook_minutes for this recipe, so it is"))).toBe(
      true,
    );
  });

  it("names several missing times in the plural", async () => {
    const recipe = {
      ...recipeFrom("recipe-complete.html"),
      prep_minutes: null,
      cook_minutes: null,
    };
    const result = await runGetRecipe(fakeClient(recipe), args({ id: "4210" }));
    const notes = result.structuredContent?.["notes"] as string[];

    expect(notes.some((note) => note.includes("so they are null rather than zero"))).toBe(true);
  });

  it("renders a recipe the site gives no yield and no cost for", async () => {
    const recipe = { ...recipeFrom("recipe-complete.html"), yield_text: null, cost_level: null };
    const result = await runGetRecipe(fakeClient(recipe), args({ id: "4210" }));

    expect(textOf(result)).not.toContain("For ");
    expect(textOf(result)).not.toContain("Economique");
  });

  it("refuses an argument it does not declare, naming it", async () => {
    await expect(
      runGetRecipe(fakeClient(recipeFrom("recipe-complete.html")), args({ id: "1", portions: 4 })),
    ).rejects.toThrow(/portions/);
  });

  it("rescales the quantities when a number of servings is asked for", async () => {
    const result = await runGetRecipe(
      fakeClient(recipeFrom("recipe-complete.html")),
      args({ id: "4210", servings: 3 }),
    );

    expect(result.structuredContent?.["yield"]).toMatchObject({
      original_count: 6,
      original_text: "6 personnes",
      requested: 3,
      unit: "personnes",
      factor: 0.5,
    });
    expect(textOf(result)).toContain("400 g de tiges de gaverole");
    expect(textOf(result)).toContain("For 3 personnes (published for 6 personnes)");
  });

  it("says what the quantities were scaled from and to", async () => {
    const result = await runGetRecipe(
      fakeClient(recipeFrom("recipe-complete.html")),
      args({ id: "4210", servings: 3 }),
    );
    const notes = result.structuredContent?.["notes"] as string[];

    expect(notes[0]).toContain("scaled from 6 personnes to 3");
  });

  it("says a line was rounded, and a line carried no quantity", async () => {
    const result = await runGetRecipe(
      fakeClient(recipeFrom("recipe-complete.html")),
      args({ id: "4210", servings: 3 }),
    );
    const notes = result.structuredContent?.["notes"] as string[];

    expect(notes.some((note) => note.includes("no longer holds the exact product"))).toBe(true);
    expect(notes.some((note) => note.includes("no quantity that can be multiplied"))).toBe(true);
  });

  it("says nothing about rounding when every line landed exactly", async () => {
    const recipe = {
      ...recipeFrom("recipe-complete.html"),
      ingredients: [
        {
          amount_text: "800 g",
          label: "de tiges",
          raw: "800 g de tiges",
          sheet: null,
          is_heading: false,
        },
      ],
      ingredient_sheets: [],
    };
    const result = await runGetRecipe(fakeClient(recipe), args({ id: "4210", servings: 3 }));
    const notes = result.structuredContent?.["notes"] as string[];

    expect(notes.some((note) => note.includes("no longer holds the exact product"))).toBe(false);
    expect(notes.some((note) => note.includes("no quantity that can be multiplied"))).toBe(false);
  });

  it("renders a yield the site stated as a bare number", async () => {
    const recipe = { ...recipeFrom("recipe-complete.html"), yield_text: "6" };
    const result = await runGetRecipe(fakeClient(recipe), args({ id: "4210", servings: 3 }));

    expect(result.structuredContent?.["yield"]).toMatchObject({ unit: null, original_count: 6 });
    expect(textOf(result)).toContain("For 3 (published for 6)");
  });

  it("carries a heading through a rescaling untouched", async () => {
    const result = await runGetRecipe(
      fakeClient(recipeFrom("recipe-complete.html")),
      args({ id: "4210", servings: 3 }),
    );
    const lines = result.structuredContent?.["ingredients"] as Record<string, unknown>[];

    expect(lines[0]).toMatchObject({ text: "Pour le velouté :", is_heading: true });
  });

  it("says a quantity is the site's own when no rescaling was asked for", async () => {
    const result = await runGetRecipe(
      fakeClient(recipeFrom("recipe-complete.html")),
      args({ id: "4210" }),
    );
    const notes = result.structuredContent?.["notes"] as string[];

    expect(notes[0]).toContain("as Supertoinette published them");
    expect(result.structuredContent?.["yield"]).toMatchObject({ requested: null, factor: 1 });
  });

  it("refuses to rescale a yield the site stated with no number", async () => {
    const recipe = { ...recipeFrom("recipe-complete.html"), yield_text: "un grand plat" };

    await expect(
      runGetRecipe(fakeClient(recipe), args({ id: "4210", servings: 3 })),
    ).rejects.toThrow(/no number to scale from/);
  });

  it("opens a refusal with the code a caller branches on", async () => {
    try {
      await runGetRecipe(fakeClient(recipeFrom("recipe-complete.html")), args({ id: "" }));
      expect.unreachable("an empty identifier is refused");
    } catch (error) {
      expect((error as SupertoinetteError).code).toBe("invalid_input");
      expect((error as SupertoinetteError).message).toContain("invalid_input");
    }
  });
});
