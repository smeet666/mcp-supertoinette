/**
 * What a search renders, and what it qualifies.
 *
 * Two absences look alike on this site and mean different things: a query the
 * site matched nothing for, and a page past the last one. The answer says which
 * it is rather than letting a caller read either as the other.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SupertoinetteError } from "../../src/errors.js";
import type { SearchOutcome, SupertoinetteClient } from "../../src/supertoinette/client.js";
import { parseSearchPage } from "../../src/supertoinette/parseSearch.js";
import type { Listing } from "../../src/supertoinette/parseSearch.js";
import type { Read } from "../../src/types.js";
import { runSearchRecipes, type SearchRecipesArgs } from "../../src/tools/searchRecipes.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const read = (name: string): string => readFileSync(join(fixtures, name), "utf8");

const listingFrom = (name: string): Listing =>
  parseSearchPage(read(name), "https://www.supertoinette.com/liste-recettes?q=gaverole").listing;

/** A stand-in client: no site is reached from a unit test. */
function fakeClient(
  listing: Listing,
  options: { dropped?: string; skipped?: string[] } = {},
): SupertoinetteClient {
  return {
    searchRecipes: async (): Promise<Read<SearchOutcome>> => ({
      data: { listing, dropped_category: options.dropped ?? null },
      cached: false,
      ...(options.skipped ? { skipped: options.skipped } : {}),
    }),
  } as unknown as SupertoinetteClient;
}

const args = (value: Record<string, unknown>): SearchRecipesArgs =>
  value as unknown as SearchRecipesArgs;

const textOf = (result: Awaited<ReturnType<typeof runSearchRecipes>>): string =>
  result.content[0]?.text ?? "";

const notesOf = (result: Awaited<ReturnType<typeof runSearchRecipes>>): string[] =>
  result.structuredContent?.["notes"] as string[];

describe("search_recipes", () => {
  it("renders the rows as prose and as a payload carrying the same claims", async () => {
    const result = await runSearchRecipes(
      fakeClient(listingFrom("search-results.html")),
      args({ query: "gaverole" }),
    );

    expect(result.structuredContent?.["result_count"]).toBe(3);
    expect(result.structuredContent?.["rows_published"]).toBe(6);
    expect(textOf(result)).toContain("4210: Velouté de gaverole");
    expect(textOf(result)).toContain("Source: Supertoinette");
  });

  it("publishes no total, and says how far the results run instead", async () => {
    const result = await runSearchRecipes(
      fakeClient(listingFrom("search-results.html")),
      args({ query: "gaverole" }),
    );

    expect(result.structuredContent?.["total_available"]).toBeNull();
    expect(result.structuredContent?.["last_page"]).toBe(47);
    expect(notesOf(result).some((note) => note.includes("prints no total"))).toBe(true);
  });

  it("returns the categories the site counts, and says they do not add up", async () => {
    const result = await runSearchRecipes(
      fakeClient(listingFrom("search-results.html")),
      args({ query: "gaverole" }),
    );

    expect(result.structuredContent?.["facets"]).toEqual([
      { label: "Soupes & potages", count: 12 },
      { label: "Légumes", count: 3 },
    ]);
    expect(notesOf(result).some((note) => note.includes("do not add up"))).toBe(true);
  });

  it("says the site matches a query loosely", async () => {
    const result = await runSearchRecipes(
      fakeClient(listingFrom("search-results.html")),
      args({ query: "gaverole" }),
    );

    expect(notesOf(result).some((note) => note.includes("loosely"))).toBe(true);
  });

  it("cuts the list to what was asked for, and says what the cut left out", async () => {
    const result = await runSearchRecipes(
      fakeClient(listingFrom("search-results.html")),
      args({ query: "gaverole", limit: 1 }),
    );

    expect(result.structuredContent?.["result_count"]).toBe(1);
    expect(notesOf(result).some((note) => note.includes("Raise 'limit'"))).toBe(true);
  });

  it("reports what the reading layer set aside, counting one row in the singular", async () => {
    const result = await runSearchRecipes(
      fakeClient(listingFrom("search-results.html"), { skipped: ["one row went"] }),
      args({ query: "gaverole" }),
    );

    expect(notesOf(result).some((note) => note.includes("1 row was set aside"))).toBe(true);
  });

  it("counts several set-aside rows in the plural", async () => {
    const result = await runSearchRecipes(
      fakeClient(listingFrom("search-results.html"), { skipped: ["one went", "another went"] }),
      args({ query: "gaverole" }),
    );

    expect(notesOf(result).some((note) => note.includes("2 rows were set aside"))).toBe(true);
  });

  it("renders a row the site filed under no category without empty brackets", async () => {
    const result = await runSearchRecipes(
      fakeClient(listingFrom("search-results.html")),
      args({ query: "gaverole" }),
    );

    expect(textOf(result)).toContain("4212: Bouillon de tourbin\n");
  });

  it("renders a listing the site counted no category on", async () => {
    const result = await runSearchRecipes(
      fakeClient(listingFrom("search-uncounted.html")),
      args({ query: "gaverole" }),
    );

    expect(result.structuredContent?.["facets"]).toEqual([]);
    expect(textOf(result)).not.toContain("Categories counted");
  });

  describe("a page holding no row", () => {
    it("says the site matched nothing when the site said so", async () => {
      const result = await runSearchRecipes(
        fakeClient(listingFrom("search-empty.html")),
        args({ query: "zzzz" }),
      );

      expect(result.structuredContent?.["result_count"]).toBe(0);
      expect(textOf(result)).toContain("matched nothing");
      expect(notesOf(result).some((note) => note.includes("matched nothing"))).toBe(true);
    });

    it("says a page past the last one is past the last one, and nothing more", async () => {
      const result = await runSearchRecipes(
        fakeClient(listingFrom("search-beyond-last.html")),
        args({ query: "gaverole", page: 9 }),
      );

      expect(textOf(result)).not.toContain("matched nothing");
      expect(notesOf(result).some((note) => note.includes("past the last one, which is 2"))).toBe(
        true,
      );
    });
  });

  describe("a category that found nothing", () => {
    it("says which filter was dropped and which ones the site publishes", async () => {
      const result = await runSearchRecipes(
        fakeClient(listingFrom("search-results.html"), { dropped: "Pas une catégorie" }),
        args({ query: "gaverole", category: "Pas une catégorie" }),
      );
      const note = notesOf(result).find((line) => line.includes("Pas une catégorie"));

      expect(note).toContain("found nothing");
      expect(note).toContain("Soupes & potages");
    });

    it("reports the answer as standing on no category, since the rows came without one", async () => {
      const result = await runSearchRecipes(
        fakeClient(listingFrom("search-results.html"), { dropped: "Pas une catégorie" }),
        args({ query: "gaverole", category: "Pas une catégorie" }),
      );

      expect(result.structuredContent?.["category"]).toBeNull();
    });

    it("keeps the category the answer does stand on", async () => {
      const result = await runSearchRecipes(
        fakeClient(listingFrom("search-results.html")),
        args({ query: "gaverole", category: "Soupes & potages" }),
      );

      expect(result.structuredContent?.["category"]).toBe("Soupes & potages");
    });

    it("says the site counts no category where it published none", async () => {
      const result = await runSearchRecipes(
        fakeClient(listingFrom("search-empty.html"), { dropped: "Pas une catégorie" }),
        args({ query: "gaverole", category: "Pas une catégorie" }),
      );

      expect(notesOf(result).some((note) => note.includes("counts no category"))).toBe(true);
    });
  });

  it("refuses an argument it does not declare, naming it", async () => {
    await expect(
      runSearchRecipes(
        fakeClient(listingFrom("search-results.html")),
        args({ query: "gaverole", categorie: "x" }),
      ),
    ).rejects.toThrow(/categorie/);
  });

  it("opens a refusal with the code a caller branches on", async () => {
    try {
      await runSearchRecipes(
        fakeClient(listingFrom("search-results.html")),
        args({ query: "gaverole", limit: 0 }),
      );
      expect.unreachable("a limit below one is refused");
    } catch (error) {
      expect((error as SupertoinetteError).code).toBe("invalid_input");
      expect((error as SupertoinetteError).message).toContain("invalid_input");
    }
  });
});
