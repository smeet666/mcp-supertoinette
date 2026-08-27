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
});
