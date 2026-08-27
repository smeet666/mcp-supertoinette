/**
 * What reading the categories and a category's recipes has to establish.
 *
 * The site prints its categories in two lists it carries on every page, and it
 * files recipes under hundreds of others it publishes in neither. Rendering the
 * two lists as the catalogue of categories would state a completeness the site
 * never claimed, so the count says what it counts and the answer says where
 * each entry was read.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SupertoinetteError } from "../../src/errors.js";
import { parseCategoryMenus, parseListingPage } from "../../src/supertoinette/parseBrowse.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const read = (name: string): string => readFileSync(join(fixtures, name), "utf8");

const URL_OF = "https://www.supertoinette.com/recettes/91/recettes-soupes-potages";

describe("parseCategoryMenus", () => {
  it("reads the categories the site lists in its footer", () => {
    const categories = parseCategoryMenus(read("category-listing.html"));
    const footer = categories.filter((entry) => entry.listed_in === "footer");

    expect(footer).toEqual([
      {
        label: "Soupes & potages",
        category: "91/recettes-soupes-potages",
        url: "https://www.supertoinette.com/recettes/91/recettes-soupes-potages",
        listed_in: "footer",
      },
      {
        label: "Desserts",
        category: "107/recettes-desserts",
        url: "https://www.supertoinette.com/recettes/107/recettes-desserts",
        listed_in: "footer",
      },
    ]);
  });

  it("reads the categories the site lists in its menu", () => {
    const categories = parseCategoryMenus(read("category-listing.html"));
    const menu = categories.filter((entry) => entry.listed_in === "menu");

    expect(menu.map((entry) => entry.label)).toEqual(["Au micro-ondes", "Recettes rapides"]);
    expect(menu[0]?.category).toBe("137/recettes-au-micro-ondes");
  });

  it("leaves out a link that opens onto no listing", () => {
    const categories = parseCategoryMenus(read("category-listing.html"));

    expect(categories.map((entry) => entry.label)).not.toContain("Pas une catégorie");
    expect(categories.map((entry) => entry.label)).not.toContain("Un lien hors des catégories");
    expect(categories.map((entry) => entry.label)).not.toContain("Recettes en photos");
  });

  it("reads the same two lists off any page the site serves", () => {
    expect(parseCategoryMenus(read("recipe-complete.html"))).toHaveLength(4);
    expect(parseCategoryMenus(read("search-results.html"))).toHaveLength(4);
  });

  it("reads nothing off a page carrying neither list", () => {
    expect(parseCategoryMenus("<html><body><p>rien</p></body></html>")).toEqual([]);
  });
});

describe("parseListingPage", () => {
  const parseListing = () => parseListingPage(read("category-listing.html"), URL_OF);

  it("names the listing by the heading the site gives it", () => {
    expect(parseListing().listing.title).toBe("Soupes & potages");
  });

  it("reads the recipes, with what the site prints beside each", () => {
    const { listing } = parseListing();

    expect(listing.results).toHaveLength(2);
    expect(listing.results[0]).toEqual({
      id: "4210",
      title: "Velouté de gaverole",
      title_as_published: "🥣Velouté de gaverole",
      url: "https://www.supertoinette.com/recette/4210/veloute-de-gaverole.html",
      image_url: "https://recette.supertoinette.com/new/veloute-800.webp",
      description: "Un velouté doux relevé de mirette.",
      difficulty: "Recette facile",
      total_minutes: 70,
    });
  });

  it("renders what the site printed nothing for as null", () => {
    const { listing } = parseListing();

    expect(listing.results[1]).toMatchObject({
      image_url: null,
      description: null,
      difficulty: "Recette élaborée",
      total_minutes: null,
    });
  });

  it("leaves out a row that opens onto something other than a recipe, and counts it", () => {
    const { listing, skipped } = parseListing();

    expect(listing.rows_published).toBe(4);
    expect(skipped.some((reason) => reason.includes("Dix veloutés"))).toBe(true);
    expect(skipped.some((reason) => reason.includes("Une ligne sans adresse"))).toBe(true);
  });

  it("reads the rows of the listing rather than links printed elsewhere on the page", () => {
    const { listing } = parseListing();

    expect(listing.results.map((row) => row.id)).not.toContain("999");
  });

  it("reads the last page from the numbers the site lists", () => {
    expect(parseListing().listing.last_page).toBe(117);
  });

  it("does not call a page past the last one an absence", () => {
    const { listing } = parseListingPage(read("category-beyond-last.html"), URL_OF);

    expect(listing.results).toEqual([]);
    expect(listing.last_page).toBe(2);
  });

  describe("a page stripped of what the site usually prints", () => {
    const parseBare = () => parseListingPage(read("category-bare.html"), URL_OF);

    it("names a listing the site gave no heading as holding none", () => {
      expect(parseBare().listing.title).toBeNull();
    });

    it("reads a block of page numbers the site drew empty as one page", () => {
      expect(parseBare().listing.last_page).toBe(1);
    });

    it("renders a row the site printed no properties beside as holding none", () => {
      expect(parseBare().listing.results[0]).toMatchObject({
        difficulty: null,
        total_minutes: null,
      });
    });

    it("renders a total the site wrote without a number as no total at all", () => {
      expect(parseBare().listing.results[1]).toMatchObject({
        difficulty: null,
        total_minutes: null,
      });
    });

    it("reads a total the site wrote in hours alone, and one in minutes alone", () => {
      expect(parseBare().listing.results[2]).toMatchObject({ total_minutes: 120 });
      expect(parseBare().listing.results[3]).toMatchObject({ total_minutes: 45 });
    });

    it("sets aside a row the site published with no heading", () => {
      expect(parseBare().skipped.some((reason) => reason.includes("no heading"))).toBe(true);
    });
  });

  it("reads a listing the site served with no block of page numbers as one page", () => {
    const html = read("category-bare.html").replace(/<ul class="pagination"[\s\S]*?<\/ul>/, "");

    expect(parseListingPage(html, URL_OF).listing.last_page).toBe(1);
  });

  it("refuses a page that is not a listing at all", () => {
    try {
      parseListingPage(read("category-not-a-listing.html"), URL_OF);
      expect.unreachable("a page that is not a listing is a failure");
    } catch (error) {
      expect((error as SupertoinetteError).code).toBe("parse_failure");
    }
  });
});
