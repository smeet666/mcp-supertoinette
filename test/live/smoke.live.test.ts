/**
 * One request per route, against the site itself.
 *
 * It runs behind an environment variable and as a nightly canary, because it is
 * the only thing that notices the day the site changes how it answers. The
 * assertions state the shape rather than the content: a recipe's rating moves
 * on its own, and a suite that pinned it would fail on a vote rather than on a
 * change worth knowing about.
 */

import process from "node:process";
import { describe, expect, it } from "vitest";
import { createLogger, loadConfig } from "../../src/config.js";
import { SupertoinetteClient } from "../../src/supertoinette/client.js";

const enabled = process.env["STO_LIVE"] === "1";
const live = enabled ? describe : describe.skip;

const client = new SupertoinetteClient({
  config: loadConfig(),
  logger: createLogger("silent"),
});

live("against Supertoinette itself", () => {
  it("reads a recipe by its identifier", async () => {
    const read = await client.getRecipe("1");
    const recipe = read.data;

    expect(recipe.id).toBe("1");
    expect(recipe.title.length).toBeGreaterThan(0);
    expect(recipe.url).toContain("/recette/1/");
    expect(recipe.steps.length).toBeGreaterThan(0);
    expect(recipe.ingredients.length).toBeGreaterThan(0);
    expect(recipe.yield_text).not.toBeNull();
  });

  it("renders the last step once, where the structured block prints it twice", async () => {
    const { data } = await client.getRecipe("1");
    const steps = data.steps;

    expect(steps.at(-1)).not.toBe(steps.at(-2));
  });

  it("answers an identifier the site does not hold with not_found", async () => {
    await expect(client.getRecipe("999999999")).rejects.toMatchObject({ code: "not_found" });
  });

  it("refuses an identifier that cannot become an address without asking the site", async () => {
    await expect(client.getRecipe("pas-un-nombre")).rejects.toMatchObject({
      code: "invalid_input",
    });
  });

  it("searches, and every row carries an identifier a recipe can be read by", async () => {
    const { data } = await client.searchRecipes({ query: "cabillaud", page: 1, category: null });

    expect(data.listing.results.length).toBeGreaterThan(0);
    expect(data.listing.total_available).toBeNull();
    expect(data.listing.last_page).toBeGreaterThanOrEqual(1);
    for (const row of data.listing.results) {
      expect(row.id).toMatch(/^\d+$/);
      expect(row.url).toContain("/recette/");
    }
  });

  it("counts categories inside the search rather than across the catalogue", async () => {
    const { data } = await client.searchRecipes({ query: "cabillaud", page: 1, category: null });

    expect(data.listing.facets.length).toBeGreaterThan(0);
    for (const facet of data.listing.facets) {
      expect(facet.label).not.toBe("");
      expect(Number.isInteger(facet.count)).toBe(true);
    }
  });

  it("says a search matched nothing only where the site says so", async () => {
    const { data } = await client.searchRecipes({
      query: "zzzzqqqwww",
      page: 1,
      category: null,
    });

    expect(data.listing.results).toEqual([]);
    expect(data.listing.matched_nothing).toBe(true);
  });

  it("does not call a page past the last one an absence", async () => {
    const { data } = await client.searchRecipes({ query: "cabillaud", page: 99, category: null });

    expect(data.listing.results).toEqual([]);
    expect(data.listing.matched_nothing).toBe(false);
    expect(data.listing.last_page).toBeLessThan(99);
  });

  it("drops a category the site does not know rather than reporting an absence", async () => {
    const { data } = await client.searchRecipes({
      query: "cabillaud",
      page: 1,
      category: "Pas une catégorie du site",
    });

    expect(data.dropped_category).toBe("Pas une catégorie du site");
    expect(data.listing.results.length).toBeGreaterThan(0);
  });

  it("keeps a category the site does publish", async () => {
    const { data } = await client.searchRecipes({
      query: "cabillaud",
      page: 1,
      category: "Poissons",
    });

    expect(data.dropped_category).toBeNull();
    expect(data.listing.results.length).toBeGreaterThan(0);
  });

  it("lists the categories the site prints in both of its own lists", async () => {
    const { data } = await client.listCategories();

    expect(data.length).toBeGreaterThan(10);
    expect(data.some((entry) => entry.listed_in === "footer")).toBe(true);
    expect(data.some((entry) => entry.listed_in === "menu")).toBe(true);
    for (const entry of data) {
      expect(entry.category).toMatch(/^\d+\/[a-z0-9-]+$/);
      expect(entry.label).not.toBe("");
    }
  });

  it("browses a category the list it published names", async () => {
    const { data: categories } = await client.listCategories();
    const first = categories[0];
    if (first === undefined) {
      throw new Error("the site listed no category to browse");
    }

    const { data } = await client.browseRecipes(first.category, 1);

    expect(data.results.length).toBeGreaterThan(0);
    expect(data.last_page).toBeGreaterThanOrEqual(1);
    for (const row of data.results) {
      expect(row.id).toMatch(/^\d+$/);
      expect(row.url).toContain("/recette/");
    }
  });

  it("does not call a category page past the last one an absence", async () => {
    const { data } = await client.browseRecipes("107/recettes-desserts", 999);

    expect(data.results).toEqual([]);
    expect(data.last_page).toBeLessThan(999);
  });

  it("refuses a category token the site would answer with a page it does not hold", async () => {
    await expect(client.browseRecipes("107/pas-le-bon-nom", 1)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("reads the wines the site ranks for a dish", async () => {
    const { data } = await client.getPairings("10");

    expect(data.dish).not.toBe("");
    expect(data.pairings.length).toBeGreaterThan(0);
    for (const pairing of data.pairings) {
      expect(pairing.rank).not.toBe("");
      expect(pairing.wine).not.toBe("");
    }
  });

  it("answers a dish the site does not hold with not_found", async () => {
    await expect(client.getPairings("999999")).rejects.toMatchObject({ code: "not_found" });
  });

  it("reads one page of the alphabetical index of dishes", async () => {
    const { data } = await client.listPairings(1);

    expect(data.entries.length).toBeGreaterThan(0);
    expect(data.last_page).toBeGreaterThan(1);
    for (const entry of data.entries) {
      expect(entry.id).toMatch(/^\d+$/);
      expect(entry.dish).not.toBe("");
    }
  });
});
