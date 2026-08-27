/**
 * What reading a page of search results has to establish.
 *
 * The site answers three different questions with pages that look alike, and
 * telling them apart is the whole of this reader's job: a search that matched
 * nothing, a page past the last one, and a page this cannot read at all. Two of
 * the three carry no row, and reporting either as the other states something
 * about the catalogue that never happened.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SupertoinetteError } from "../../src/errors.js";
import { parseSearchPage } from "../../src/supertoinette/parseSearch.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const read = (name: string): string => readFileSync(join(fixtures, name), "utf8");

const URL_OF = "https://www.supertoinette.com/liste-recettes?q=gaverole";
const parseResults = () => parseSearchPage(read("search-results.html"), URL_OF);

describe("the rows a listing holds", () => {
  it("reads the recipes, with the address to open each", () => {
    const { listing } = parseResults();

    expect(listing.results).toHaveLength(3);
    expect(listing.results[0]).toEqual({
      id: "4210",
      title: "Velouté de gaverole",
      title_as_published: "🥣Velouté de gaverole",
      url: "https://www.supertoinette.com/recette/4210/veloute-de-gaverole.html",
      image_url: "https://recette.supertoinette.com/new/veloute-800.webp",
      description: "Un velouté doux relevé de mirette.",
      categories: ["Soupes & potages", "Légumes"],
    });
  });

  it("keeps the title apart from the categories the site prints inside the link", () => {
    const { listing } = parseResults();

    expect(listing.results[1]?.title).toBe("Soupe de tourbin");
    expect(listing.results[1]?.categories).toEqual(["Soupes & potages"]);
  });

  it("renders a row the site filed under no category as holding none", () => {
    const { listing } = parseResults();

    expect(listing.results[2]).toMatchObject({
      id: "4212",
      title: "Bouillon de tourbin",
      categories: [],
    });
  });

  it("leaves out a row the site published with no heading at all", () => {
    const { skipped } = parseResults();

    expect(skipped.some((reason) => reason.includes("no heading"))).toBe(true);
  });

  it("renders a row the site published without a picture or a blurb as null", () => {
    const { listing } = parseResults();

    expect(listing.results[1]?.image_url).toBeNull();
    expect(listing.results[1]?.description).toBeNull();
  });

  it("leaves out a row that opens onto something other than a recipe, and counts it", () => {
    const { listing, skipped } = parseResults();

    expect(listing.results.map((row) => row.id)).not.toContain("12");
    expect(listing.rows_published).toBe(6);
    expect(skipped.some((reason) => reason.includes("Dix veloutés"))).toBe(true);
  });

  it("leaves out a row carrying no address at all", () => {
    const { skipped } = parseResults();

    expect(skipped.some((reason) => reason.includes("Une ligne sans adresse"))).toBe(true);
  });

  it("reads the rows of the listing rather than links printed elsewhere on the page", () => {
    const { listing } = parseResults();

    expect(listing.results.map((row) => row.id)).not.toContain("999");
  });
});

describe("what the site counts beside the rows", () => {
  it("reads each facet with the number the site put on it", () => {
    const { listing } = parseResults();

    expect(listing.facets).toEqual([
      { label: "Soupes & potages", count: 12 },
      { label: "Légumes", count: 3 },
    ]);
  });

  it("passes over the separators and the counts the site prints with no label", () => {
    const { listing } = parseResults();

    expect(listing.facets.map((facet) => facet.label)).not.toContain("");
    expect(listing.facets).toHaveLength(2);
  });

  it("reads a listing the site counted no category on", () => {
    const { listing } = parseSearchPage(read("search-uncounted.html"), URL_OF);

    expect(listing.facets).toEqual([]);
    expect(listing.results).toHaveLength(1);
  });

  it("reads a block of page numbers the site drew empty as one page", () => {
    const { listing } = parseSearchPage(read("search-uncounted.html"), URL_OF);

    expect(listing.last_page).toBe(1);
  });

  it("publishes no total, because the site prints none", () => {
    const { listing } = parseResults();

    expect(listing.total_available).toBeNull();
  });

  it("reads the last page from the numbers the site lists", () => {
    const { listing } = parseResults();

    expect(listing.last_page).toBe(47);
  });

  it("reads a listing with no block of page numbers as holding one page", () => {
    const { listing } = parseSearchPage(read("search-empty.html"), URL_OF);

    expect(listing.last_page).toBe(1);
  });
});

describe("a page carrying no row", () => {
  it("says the site matched nothing when the site says so", () => {
    const { listing } = parseSearchPage(read("search-empty.html"), URL_OF);

    expect(listing.results).toEqual([]);
    expect(listing.matched_nothing).toBe(true);
  });

  it("does not call a page past the last one an absence", () => {
    const { listing } = parseSearchPage(read("search-beyond-last.html"), URL_OF);

    expect(listing.results).toEqual([]);
    expect(listing.matched_nothing).toBe(false);
    expect(listing.last_page).toBe(2);
  });

  it("still reads what the site counts on a page past the last one", () => {
    const { listing } = parseSearchPage(read("search-beyond-last.html"), URL_OF);

    expect(listing.facets).toEqual([{ label: "Soupes & potages", count: 12 }]);
  });
});

describe("a page this cannot read", () => {
  it("refuses a page that is not a search at all", () => {
    try {
      parseSearchPage(read("search-not-a-search.html"), URL_OF);
      expect.unreachable("a page that is not a search is a failure");
    } catch (error) {
      expect((error as SupertoinetteError).code).toBe("parse_failure");
    }
  });

  it("refuses a recipe served in place of a listing", () => {
    try {
      parseSearchPage(read("recipe-complete.html"), URL_OF);
      expect.unreachable("a recipe is not a listing");
    } catch (error) {
      expect((error as SupertoinetteError).code).toBe("parse_failure");
    }
  });
});
