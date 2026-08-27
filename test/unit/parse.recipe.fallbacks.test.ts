/**
 * What the reader does with a page that leaves something out.
 *
 * The site has served recipes since 2002 and its pages have not all been
 * written the same way. Each case here states one thing the reader must do
 * rather than guess: fall back on the structured block where the page prints
 * nothing, and refuse where neither carries the answer.
 */

import { describe, expect, it } from "vitest";
import type { SupertoinetteError } from "../../src/errors.js";
import { frenchMinutes, isoMinutes, parseRecipePage } from "../../src/supertoinette/parseRecipe.js";

const URL_OF = "https://www.supertoinette.com/recette/4210/x.html";

/** A page carrying whatever the case under test needs, and nothing more. */
function page(block: unknown, body: string): string {
  return `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify(block)}</script>
</head><body><div id="recipe">${body}</div></body></html>`;
}

const RECIPE = {
  "@context": "http://schema.org/",
  "@type": "Recipe",
  name: "Velouté de gaverole",
  description: "Un velouté doux.",
  recipeYield: "6 personnes",
};

const STEPS = '<div class="recipe-prepa"><ol><li>Mélanger.</li></ol></div>';

const parse = (block: unknown, body: string) => parseRecipePage(page(block, body), "4210", URL_OF);

describe("a page that prints nothing where the block does", () => {
  it("names the recipe from the block when the page carries no heading", () => {
    expect(parse(RECIPE, STEPS).recipe.title).toBe("Velouté de gaverole");
  });

  it("describes the recipe from the block when the page carries no subtitle", () => {
    expect(parse(RECIPE, STEPS).recipe.description).toBe("Un velouté doux.");
  });

  it("takes the yield from the block when the page carries no servings line", () => {
    expect(parse(RECIPE, STEPS).recipe.yield_text).toBe("6 personnes");
  });

  it("renders every time as null when the page prints no badge at all", () => {
    const { recipe } = parse({ ...RECIPE, prepTime: "PT15M", totalTime: "PT15M" }, STEPS);

    expect(recipe.prep_minutes).toBeNull();
    expect(recipe.total_minutes).toBeNull();
    expect(recipe.difficulty).toBeNull();
    expect(recipe.cost_level).toBeNull();
  });

  it("renders an empty description as null rather than as an empty line", () => {
    const { recipe } = parse({ ...RECIPE, description: "" }, `<p class="subtitle"></p>${STEPS}`);

    expect(recipe.description).toBeNull();
  });

  it("renders an empty paragraph above the steps as no prose at all", () => {
    const { recipe } = parse(
      RECIPE,
      '<div class="recipe-prepa"><p> </p><ol><li>Mélanger.</li></ol></div>',
    );

    expect(recipe.intro).toBeNull();
  });

  it("renders an empty servings line as null", () => {
    const { recipe } = parse(
      { ...RECIPE, recipeYield: "" },
      `<p><span>Recette pour</span> <strong></strong></p>${STEPS}`,
    );

    expect(recipe.yield_text).toBeNull();
  });
});

describe("the row of badges", () => {
  it("passes over a badge it has no reading for", () => {
    const body = `<ul class="details"><li>Sans four</li><li>Préparation: 15 min</li></ul>${STEPS}`;
    const { recipe } = parse({ ...RECIPE, prepTime: "PT15M" }, body);

    expect(recipe.prep_minutes).toBe(15);
    expect(recipe.difficulty).toBeNull();
    expect(recipe.rest_minutes).toBeNull();
  });
});

describe("the credit the block carries", () => {
  it("reads an author written as a plain name", () => {
    expect(parse({ ...RECIPE, author: "Aline du Verger" }, STEPS).recipe.author).toBe(
      "Aline du Verger",
    );
  });

  it("reads an author written as a person", () => {
    expect(
      parse({ ...RECIPE, author: { "@type": "Person", name: "Aline" } }, STEPS).recipe.author,
    ).toBe("Aline");
  });

  it("renders an author the block leaves out as null", () => {
    expect(parse(RECIPE, STEPS).recipe.author).toBeNull();
    expect(parse({ ...RECIPE, author: { "@type": "Person" } }, STEPS).recipe.author).toBeNull();
    expect(parse({ ...RECIPE, author: 42 }, STEPS).recipe.author).toBeNull();
  });
});

describe("the pictures the block lists", () => {
  it("reads a single picture written on its own", () => {
    expect(
      parse({ ...RECIPE, image: "https://example.invalid/a.webp" }, STEPS).recipe.images,
    ).toEqual(["https://example.invalid/a.webp"]);
  });

  it("keeps only the addresses of a list holding something else as well", () => {
    expect(
      parse({ ...RECIPE, image: ["https://example.invalid/a.webp", 7] }, STEPS).recipe.images,
    ).toEqual(["https://example.invalid/a.webp"]);
  });

  it("renders no picture when the block lists none it can read", () => {
    expect(parse(RECIPE, STEPS).recipe.images).toEqual([]);
    expect(parse({ ...RECIPE, image: { url: "x" } }, STEPS).recipe.images).toEqual([]);
  });
});

describe("the rating the block carries", () => {
  it("counts ratings where the block gives no review count", () => {
    const block = {
      ...RECIPE,
      aggregateRating: { ratingValue: "4.2", ratingCount: "9", bestRating: "5" },
    };

    expect(parse(block, STEPS).recipe.rating).toEqual({ value: 4.2, count: 9, scale: 5 });
  });

  it("renders a rating missing the scale it sits on as null", () => {
    const block = { ...RECIPE, aggregateRating: { ratingValue: "4.2", reviewCount: "9" } };

    expect(parse(block, STEPS).recipe.rating).toBeNull();
  });

  it("renders a rating written as something other than an object as null", () => {
    expect(parse({ ...RECIPE, aggregateRating: "4.2" }, STEPS).recipe.rating).toBeNull();
  });
});

describe("the ingredient page a line links to", () => {
  it("carries no sheet for a link that leads outside the ingredient pages", () => {
    const body = `<ul class="ingredientsList"><li>2 <a href="/glossaire-cuisine/1/culinaire/emincer.html">échalotes</a></li></ul>${STEPS}`;
    const { recipe } = parse(RECIPE, body);

    expect(recipe.ingredients[0]?.sheet).toBeNull();
    expect(recipe.ingredients[0]?.label).toBe("échalotes");
    expect(recipe.ingredient_sheets).toEqual([]);
  });
});

describe("the questions the page answers", () => {
  it("leaves out a question the page never answered", () => {
    const body = `${STEPS}<h2>FAQ</h2><p><strong>Une question ?</strong></p>`;

    expect(parse(RECIPE, body).recipe.faq).toEqual([]);
  });

  it("leaves out a question followed by another question rather than by an answer", () => {
    const body = `${STEPS}<h2>FAQ</h2><p><strong>Une question ?</strong></p><p><strong>Une autre ?</strong></p><p>Oui.</p>`;
    const { recipe } = parse(RECIPE, body);

    expect(recipe.faq).toEqual([{ question: "Une autre ?", answer: "Oui." }]);
  });
});

describe("a page this cannot read", () => {
  it("refuses a recipe printing no steps", () => {
    try {
      parse(RECIPE, "<p>Rien à faire.</p>");
      expect.unreachable("a recipe without steps is a failure");
    } catch (error) {
      expect((error as SupertoinetteError).code).toBe("parse_failure");
    }
  });

  it("refuses a recipe whose preparation holds no list of steps", () => {
    try {
      parse(RECIPE, '<div class="recipe-prepa"><p>Rien à faire.</p></div>');
      expect.unreachable("a preparation without a list is a failure");
    } catch (error) {
      expect((error as SupertoinetteError).code).toBe("parse_failure");
    }
  });

  it("reads a block published inside a list of blocks", () => {
    const html = `<!doctype html><html><head>
<script type="application/ld+json">${JSON.stringify([{ "@type": "WebPage" }, RECIPE])}</script>
</head><body><div id="recipe">${STEPS}</div></body></html>`;

    expect(parseRecipePage(html, "4210", URL_OF).recipe.title).toBe("Velouté de gaverole");
  });

  it("passes over a block it cannot read to reach one it can", () => {
    const html = `<!doctype html><html><head>
<script type="application/ld+json">{ oops </script>
<script type="application/ld+json">${JSON.stringify(RECIPE)}</script>
</head><body><div id="recipe">${STEPS}</div></body></html>`;

    expect(parseRecipePage(html, "4210", URL_OF).recipe.title).toBe("Velouté de gaverole");
  });

  it("leaves out an empty step rather than rendering a blank line", () => {
    const body = '<div class="recipe-prepa"><ol><li>Mélanger.</li><li> </li></ol></div>';

    expect(parse(RECIPE, body).recipe.steps).toEqual(["Mélanger."]);
  });
});

describe("reading a duration", () => {
  it.each([
    ["PT15M", 15],
    ["PT1H", 60],
    ["PT1H10M", 70],
    ["PT0M", 0],
  ])("reads %s as %i minutes", (value, expected) => {
    expect(isoMinutes(value)).toBe(expected);
  });

  it.each(["", "15 min", "P1D", null, 15])("reads %j as no duration at all", (value) => {
    expect(isoMinutes(value)).toBeNull();
  });

  it.each([
    ["30 min", 30],
    ["1 h 10 min", 70],
    ["2 h", 120],
    ["Pause: 45 min", 45],
  ])("reads %s as %i minutes", (value, expected) => {
    expect(frenchMinutes(value)).toBe(expected);
  });

  it("reads a badge carrying no number as no duration at all", () => {
    expect(frenchMinutes("Pause")).toBeNull();
  });
});
