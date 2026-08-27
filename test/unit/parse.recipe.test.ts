/**
 * What reading a recipe page has to establish.
 *
 * Every case here comes from something the site actually does, and each one is
 * a way of stating something the page does not carry: a step the structured
 * block prints twice, a time it writes as zero where the page shows no badge, a
 * link it points at another ingredient, a listing that calls itself a recipe.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { SupertoinetteError } from "../../src/errors.js";
import { parseRecipePage } from "../../src/supertoinette/parseRecipe.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const read = (name: string): string => readFileSync(join(fixtures, name), "utf8");

const COMPLETE_URL = "https://www.supertoinette.com/recette/4210/veloute-de-gaverole.html";
const parseComplete = () => parseRecipePage(read("recipe-complete.html"), "4210", COMPLETE_URL);

describe("parseRecipePage", () => {
  it("names the recipe by both the title as published and the title that reads well", () => {
    const { recipe } = parseComplete();

    expect(recipe.title_as_published).toBe("🥣Velouté de gaverole au pravin");
    expect(recipe.title).toBe("Velouté de gaverole au pravin");
    expect(recipe.id).toBe("4210");
    expect(recipe.url).toBe(COMPLETE_URL);
  });

  describe("the steps", () => {
    it("renders the last step once, where the structured block prints it twice", () => {
      const { recipe } = parseComplete();

      expect(recipe.steps).toHaveLength(4);
      expect(recipe.steps.at(-1)).toBe("Servir tiède, saupoudré de mirette.");
      expect(recipe.steps.at(-1)).not.toContain(" .");
      expect(recipe.steps.at(-2)).toBe("Verser le bouillon et laisser mijoter.");
    });

    it("keeps the words of a step and drops the emphasis the page puts on the verb", () => {
      const { recipe } = parseComplete();

      expect(recipe.steps[0]).toBe("Émincer les tiges de gaverole.");
    });

    it("leaves no gap where emphasis ended right before a punctuation mark", () => {
      const { recipe } = parseComplete();

      expect(recipe.steps.at(-1)).toBe("Servir tiède, saupoudré de mirette.");
    });

    it("carries the prose printed above the steps, and null when there is none", () => {
      expect(parseComplete().recipe.intro).toBe(
        "Une soupe de fin d'hiver, à servir dans des bols tièdes.",
      );
      expect(
        parseRecipePage(
          read("recipe-bare.html"),
          "7",
          "https://www.supertoinette.com/recette/7/x.html",
        ).recipe.intro,
      ).toBeNull();
    });

    it("leaves out the prose the page prints after the steps", () => {
      const { recipe } = parseComplete();

      expect(recipe.steps.join(" ")).not.toContain("sarpel");
    });
  });

  describe("the times", () => {
    it("reads each time the page displays a badge for", () => {
      const { recipe } = parseComplete();

      expect(recipe.prep_minutes).toBe(15);
      expect(recipe.cook_minutes).toBe(25);
      expect(recipe.total_minutes).toBe(70);
      expect(recipe.rest_minutes).toBe(30);
    });

    it("renders a time the page displays no badge for as null, where the block writes zero", () => {
      const { recipe } = parseRecipePage(
        read("recipe-bare.html"),
        "7",
        "https://www.supertoinette.com/recette/7/x.html",
      );

      expect(recipe.cook_minutes).toBeNull();
      expect(recipe.rest_minutes).toBeNull();
      expect(recipe.prep_minutes).toBe(10);
      expect(recipe.total_minutes).toBe(10);
    });
  });

  describe("the badges", () => {
    it("carries the difficulty as the wording the site chose", () => {
      expect(parseComplete().recipe.difficulty).toEqual({ label: "Recette facile" });
    });

    it("renders a missing difficulty as null rather than as an easy recipe", () => {
      const { recipe } = parseRecipePage(
        read("recipe-bare.html"),
        "7",
        "https://www.supertoinette.com/recette/7/x.html",
      );

      expect(recipe.difficulty).toBeNull();
    });

    it("carries the cost with the scale the page draws it on", () => {
      expect(parseComplete().recipe.cost_level).toEqual({
        label: "Economique",
        level: 1,
        scale: 3,
      });
      expect(
        parseRecipePage(
          read("recipe-bare.html"),
          "7",
          "https://www.supertoinette.com/recette/7/x.html",
        ).recipe.cost_level,
      ).toEqual({ label: "Normal", level: 2, scale: 3 });
    });
  });

  describe("the ingredients", () => {
    it("keeps the quantity apart from the words the line names the ingredient with", () => {
      const { recipe } = parseComplete();

      expect(recipe.ingredients[1]).toMatchObject({
        amount_text: "800 g",
        label: "de tiges de gaverole",
        raw: "800 g de tiges de gaverole",
        is_heading: false,
      });
    });

    it("renders a line the site prints as a heading as a heading", () => {
      const { recipe } = parseComplete();

      expect(recipe.ingredients[0]).toMatchObject({
        amount_text: null,
        label: "Pour le velouté :",
        is_heading: true,
      });
    });

    it("treats a line carrying a figure and no link as an ingredient", () => {
      const { recipe } = parseComplete();
      const pinch = recipe.ingredients.find((line) => line.raw.includes("mirette"));

      expect(pinch).toMatchObject({ is_heading: false, sheet: null });
    });

    it("treats a line carrying neither a figure nor a link as a heading", () => {
      const { recipe } = parseComplete();
      const heading = recipe.ingredients.find((line) => line.raw === "Pour servir");

      expect(heading).toMatchObject({ is_heading: true, amount_text: null });
    });

    it("treats a line carrying a link and no quantity as an ingredient", () => {
      const { recipe } = parseComplete();
      const salt = recipe.ingredients.at(-1);

      expect(salt).toMatchObject({ amount_text: null, label: "Sel", is_heading: false });
    });

    it("carries the ingredient page the site linked, without calling it the ingredient", () => {
      const { recipe } = parseComplete();

      expect(recipe.ingredients[1]?.sheet).toEqual({
        line: "de tiges de gaverole",
        sheet_id: "311",
        slug: "gaverole",
        url: "https://www.supertoinette.com/fiche-cuisine/311/gaverole.html",
      });
      expect(recipe.ingredient_sheets).toHaveLength(4);
    });

    it("carries no sheet for a line the site linked to nothing", () => {
      const { recipe } = parseComplete();

      expect(recipe.ingredients[4]?.sheet).toBeNull();
    });

    it("reads the list the recipe carries rather than one printed elsewhere on the page", () => {
      const { recipe } = parseComplete();

      expect(recipe.ingredients).toHaveLength(7);
      expect(recipe.ingredients.map((line) => line.label)).not.toContain(
        "Une liste qui n'est pas celle de la recette",
      );
    });
  });

  describe("what the site publishes beside the recipe", () => {
    it("carries the yield in the site's own wording", () => {
      expect(parseComplete().recipe.yield_text).toBe("6 personnes");
    });

    it("carries the rating on the scale the site published it against", () => {
      expect(parseComplete().recipe.rating).toEqual({ value: 4.2, count: 9, scale: 5 });
    });

    it("renders a rating the site did not publish as null", () => {
      const { recipe } = parseRecipePage(
        read("recipe-bare.html"),
        "7",
        "https://www.supertoinette.com/recette/7/x.html",
      );

      expect(recipe.rating).toBeNull();
    });

    it("carries every tag that opens onto a listing, and the token to open it", () => {
      const { recipe } = parseComplete();

      expect(recipe.tags).toEqual([
        {
          label: "Soupes & potages",
          category: "91/recettes-soupes-potages",
          url: "https://www.supertoinette.com/recettes/91/recettes-soupes-potages",
        },
        {
          label: "Gaverole",
          category: "4210/recettes-gaverole",
          url: "https://www.supertoinette.com/recettes/4210/recettes-gaverole",
        },
        {
          label: "Un lien hors des catégories",
          category: null,
          url: "https://www.supertoinette.com/quelque-part-ailleurs",
        },
      ]);
    });

    it("carries the questions the page answers under the steps, worded as published", () => {
      const { recipe } = parseComplete();

      expect(recipe.faq).toEqual([
        {
          question: "Peut-on la préparer la veille ?",
          answer: "👉Oui, elle se réchauffe doucement.",
        },
        {
          question: "Par quoi remplacer le pravin ?",
          answer: "👉Un beurre doux ordinaire convient.",
        },
      ]);
    });

    it("carries an empty list of questions for a page that answers none", () => {
      const { recipe } = parseRecipePage(
        read("recipe-bare.html"),
        "7",
        "https://www.supertoinette.com/recette/7/x.html",
      );

      expect(recipe.faq).toEqual([]);
    });

    it("states that this site publishes no nutrition rather than leaving the field out", () => {
      expect(parseComplete().recipe.nutrition).toBeNull();
    });

    it("carries the author, the category, the description and the date as published", () => {
      const { recipe } = parseComplete();

      expect(recipe.author).toBe("Aline du Verger");
      expect(recipe.category).toBe("Soupes & potages");
      expect(recipe.description).toBe(
        "Un velouté de gaverole doux, relevé d'une pointe de mirette.",
      );
      expect(recipe.published_at).toBe("2019-04-02T09:12:00Z");
      expect(recipe.images).toHaveLength(2);
    });
  });

  describe("a page this cannot read", () => {
    it("refuses a page carrying no structured block", () => {
      expect(() =>
        parseRecipePage(read("recipe-no-structured.html"), "1", "https://www.supertoinette.com/x"),
      ).toThrow(SupertoinetteError);
      try {
        parseRecipePage(read("recipe-no-structured.html"), "1", "https://www.supertoinette.com/x");
        expect.unreachable("a page carrying no block is a failure");
      } catch (error) {
        expect((error as SupertoinetteError).code).toBe("parse_failure");
      }
    });

    it("refuses a block that cannot be read, rather than rendering an empty recipe", () => {
      try {
        parseRecipePage(
          read("recipe-broken-structured.html"),
          "1",
          "https://www.supertoinette.com/x",
        );
        expect.unreachable("a block that cannot be read is a failure");
      } catch (error) {
        expect((error as SupertoinetteError).code).toBe("parse_failure");
      }
    });

    it("refuses a page whose block describes something other than a recipe", () => {
      try {
        parseRecipePage(read("recipe-not-a-recipe.html"), "1", "https://www.supertoinette.com/x");
        expect.unreachable("a page that is not a recipe is a failure");
      } catch (error) {
        expect((error as SupertoinetteError).code).toBe("parse_failure");
      }
    });

    it("refuses a listing that publishes a block calling itself a recipe", () => {
      try {
        parseRecipePage(read("listing-category.html"), "91", "https://www.supertoinette.com/x");
        expect.unreachable("a listing is not a recipe");
      } catch (error) {
        expect((error as SupertoinetteError).code).toBe("parse_failure");
      }
    });
  });
});
