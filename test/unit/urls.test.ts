/**
 * What an address this server asks for may be, and what it may never be.
 *
 * The site's robots.txt disallows a hundred one-word paths laid as traps for a
 * crawler that follows whatever it finds, so every address is built here from
 * an identifier rather than taken from a page. These cases state that.
 */

import { describe, expect, it } from "vitest";
import {
  absolute,
  categoryTokenFromHref,
  categoryUrl,
  isCategoryToken,
  isId,
  recipeIdFromHref,
  recipeUrl,
  searchUrl,
  sheetFromHref,
  SITE_ORIGIN,
} from "../../src/supertoinette/urls.js";

describe("isId", () => {
  it.each(["1", "42", "12733"])(
    "accepts %s, which is what the site numbers a recipe with",
    (id) => {
      expect(isId(id)).toBe(true);
    },
  );

  it.each(["", "0", "007", "12a", "-1", "1.5", "../etc", "1/2", "99999999999"])(
    "refuses %j, which the site would answer with a page it does not hold",
    (id) => {
      expect(isId(id)).toBe(false);
    },
  );
});

describe("recipeUrl", () => {
  it("builds the address from the number alone", () => {
    expect(recipeUrl("4210")).toBe(`${SITE_ORIGIN}/recette/4210/recette.html`);
  });

  it("stays on the route it knows for a value carrying a path of its own", () => {
    expect(recipeUrl("4210/../../paralyse")).not.toContain("/paralyse/");
  });
});

describe("searchUrl", () => {
  it("carries the query, and leaves the first page unnumbered", () => {
    expect(searchUrl("tarte aux pommes", 1, null)).toBe(
      `${SITE_ORIGIN}/liste-recettes?q=tarte+aux+pommes`,
    );
  });

  it("numbers a later page", () => {
    expect(searchUrl("tarte", 3, null)).toContain("page=3");
  });

  it("carries a category the site spells with an ampersand", () => {
    expect(searchUrl("tarte", 1, "Entrées & salades")).toContain("c=Entr%C3%A9es+%26+salades");
  });
});

describe("isCategoryToken", () => {
  it("accepts the number and slug the site addresses a listing with", () => {
    expect(isCategoryToken("107/recettes-desserts")).toBe(true);
  });

  it.each(["107", "recettes-desserts", "107/", "/recettes-desserts", "107/Recettes", "107/a/b"])(
    "refuses %j, which is not what a listing is addressed by",
    (token) => {
      expect(isCategoryToken(token)).toBe(false);
    },
  );
});

describe("categoryUrl", () => {
  it("keeps the number and the slug together, since the site answers a mismatch with nothing", () => {
    expect(categoryUrl("107/recettes-desserts", 1)).toBe(
      `${SITE_ORIGIN}/recettes/107/recettes-desserts`,
    );
  });

  it("numbers a later page", () => {
    expect(categoryUrl("107/recettes-desserts", 4)).toContain("page=4");
  });
});

describe("reading a link the site printed", () => {
  it("finds the identifier in a recipe link", () => {
    expect(recipeIdFromHref(`${SITE_ORIGIN}/recette/4210/veloute.html`)).toBe("4210");
  });

  it("finds nothing in a link that leads elsewhere", () => {
    expect(recipeIdFromHref(`${SITE_ORIGIN}/diaporama/12/dix-veloutes`)).toBeNull();
    expect(recipeIdFromHref(`${SITE_ORIGIN}/recette/abc/x.html`)).toBeNull();
  });

  it("finds the token in a listing link", () => {
    expect(categoryTokenFromHref(`${SITE_ORIGIN}/recettes/107/recettes-desserts`)).toBe(
      "107/recettes-desserts",
    );
  });

  it("finds nothing in a link that opens no listing", () => {
    expect(categoryTokenFromHref(`${SITE_ORIGIN}/quelque-part`)).toBeNull();
    expect(categoryTokenFromHref(`${SITE_ORIGIN}/recettes/107`)).toBeNull();
  });

  it("finds the identifier and the slug of an ingredient page", () => {
    expect(sheetFromHref(`${SITE_ORIGIN}/fiche-cuisine/311/gaverole.html`)).toEqual({
      id: "311",
      slug: "gaverole",
    });
  });

  it("finds nothing in a link that is not an ingredient page", () => {
    expect(sheetFromHref(`${SITE_ORIGIN}/recette/1/x.html`)).toBeNull();
    expect(sheetFromHref(`${SITE_ORIGIN}/fiche-cuisine/311`)).toBeNull();
    expect(sheetFromHref(`${SITE_ORIGIN}/fiche-cuisine/abc/gaverole.html`)).toBeNull();
    expect(sheetFromHref(`${SITE_ORIGIN}/fiche-cuisine/311/.html`)).toBeNull();
  });
});

describe("absolute", () => {
  it("turns a link the site printed into an address a caller can open", () => {
    expect(absolute("/recette/1/x.html")).toBe(`${SITE_ORIGIN}/recette/1/x.html`);
  });
});
