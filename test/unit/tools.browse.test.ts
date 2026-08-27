/**
 * What the three tools render, and what they qualify.
 *
 * The claim each of them has to be careful with is a claim of completeness: two
 * lists of categories are not the catalogue of categories, a page of a listing
 * is not the listing, and a page past the last one is not a category holding
 * nothing.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SupertoinetteError } from "../../src/errors.js";
import type { SupertoinetteClient } from "../../src/supertoinette/client.js";
import type { CategoryEntry, CategoryListing } from "../../src/supertoinette/parseBrowse.js";
import { parseCategoryMenus, parseListingPage } from "../../src/supertoinette/parseBrowse.js";
import type { PairingIndex, PairingSheet } from "../../src/supertoinette/parsePairings.js";
import { parsePairingIndex, parsePairingSheet } from "../../src/supertoinette/parsePairings.js";
import type { Read } from "../../src/types.js";
import { type BrowseRecipesArgs, runBrowseRecipes } from "../../src/tools/browseRecipes.js";
import { type GetWinePairingsArgs, runGetWinePairings } from "../../src/tools/getWinePairings.js";
import { type ListCategoriesArgs, runListCategories } from "../../src/tools/listCategories.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const read = (name: string): string => readFileSync(join(fixtures, name), "utf8");

const LISTING_URL = "https://www.supertoinette.com/recettes/91/recettes-soupes-potages";
const SHEET_URL = "https://www.supertoinette.com/accords-mets-vins/2/veloute.html";
const INDEX_URL = "https://www.supertoinette.com/accords-mets-vins";

const listingFrom = (name: string): CategoryListing =>
  parseListingPage(read(name), LISTING_URL).listing;

/** A stand-in client: no site is reached from a unit test. */
function fakeClient(over: Partial<Record<string, unknown>>): SupertoinetteClient {
  return over as unknown as SupertoinetteClient;
}

const answered = <T>(data: T, skipped?: string[]): Read<T> => ({
  data,
  cached: false,
  ...(skipped ? { skipped } : {}),
});

const textOf = (result: { content: Array<{ text: string }> }): string =>
  result.content[0]?.text ?? "";

const notesOf = (result: { structuredContent?: Record<string, unknown> }): string[] =>
  result.structuredContent?.["notes"] as string[];

describe("list_categories", () => {
  const categories = (): CategoryEntry[] => parseCategoryMenus(read("category-listing.html"));
  const client = () =>
    fakeClient({
      listCategories: async (): Promise<Read<CategoryEntry[]>> => answered(categories()),
    });

  const run = () => runListCategories(client(), {} as ListCategoriesArgs);

  it("renders the categories as prose and as a payload carrying the same claims", async () => {
    const result = await run();

    expect(result.structuredContent?.["category_count"]).toBe(4);
    expect(textOf(result)).toContain("91/recettes-soupes-potages: Soupes & potages");
    expect(textOf(result)).toContain("137/recettes-au-micro-ondes: Au micro-ondes");
  });

  it("groups the entries the way the site prints them", async () => {
    const result = await run();

    expect(textOf(result)).toContain("Kinds of dish, from the site's footer:");
    expect(textOf(result)).toContain("Ways of cooking and seasons, from the site's menu:");
  });

  it("says these are not every category the site files recipes under", async () => {
    expect(notesOf(await run()).some((note) => note.includes("not every category"))).toBe(true);
  });

  it("says a token is never assembled by hand", async () => {
    expect(notesOf(await run()).some((note) => note.includes("exactly as it came"))).toBe(true);
  });

  it("prints only the group the site filled", async () => {
    const footerOnly = fakeClient({
      listCategories: async (): Promise<Read<CategoryEntry[]>> =>
        answered(categories().filter((entry) => entry.listed_in === "footer")),
    });
    const result = await runListCategories(footerOnly, {} as ListCategoriesArgs);

    expect(textOf(result)).toContain("Kinds of dish");
    expect(textOf(result)).not.toContain("Ways of cooking");
  });

  it("says so plainly when the site listed none", async () => {
    const empty = fakeClient({
      listCategories: async (): Promise<Read<CategoryEntry[]>> => answered([]),
    });
    const result = await runListCategories(empty, {} as ListCategoriesArgs);

    expect(textOf(result)).toContain("listed no category");
  });

  it("refuses an argument it does not declare", async () => {
    await expect(
      runListCategories(client(), { famille: "x" } as unknown as ListCategoriesArgs),
    ).rejects.toThrow(/famille/);
  });
});

describe("browse_recipes", () => {
  const client = (listing: CategoryListing, skipped?: string[]) =>
    fakeClient({
      browseRecipes: async (): Promise<Read<CategoryListing>> => answered(listing, skipped),
    });

  const args = (value: Record<string, unknown>): BrowseRecipesArgs =>
    value as unknown as BrowseRecipesArgs;

  it("renders the rows with what the site prints beside each", async () => {
    const result = await runBrowseRecipes(
      client(listingFrom("category-listing.html")),
      args({ category: "91/recettes-soupes-potages" }),
    );

    expect(result.structuredContent?.["result_count"]).toBe(2);
    expect(result.structuredContent?.["title"]).toBe("Soupes & potages");
    expect(textOf(result)).toContain("4210: Velouté de gaverole, Recette facile, 70 min");
  });

  it("says a total is not published, and how far the listing runs instead", async () => {
    const result = await runBrowseRecipes(
      client(listingFrom("category-listing.html")),
      args({ category: "91/recettes-soupes-potages" }),
    );

    expect(result.structuredContent?.["total_available"]).toBeNull();
    expect(result.structuredContent?.["last_page"]).toBe(117);
    expect(notesOf(result).some((note) => note.includes("prints no total"))).toBe(true);
  });

  it("renders a row the site printed no total for without inventing one", async () => {
    const result = await runBrowseRecipes(
      client(listingFrom("category-listing.html")),
      args({ category: "91/recettes-soupes-potages" }),
    );

    expect(textOf(result)).toContain(
      "4211: Soupe de tourbin, Recette élaborée, no total published",
    );
  });

  it("cuts the list to what was asked for, and says what the cut left out", async () => {
    const result = await runBrowseRecipes(
      client(listingFrom("category-listing.html")),
      args({ category: "91/recettes-soupes-potages", limit: 1 }),
    );

    expect(result.structuredContent?.["result_count"]).toBe(1);
    expect(notesOf(result).some((note) => note.includes("Raise 'limit'"))).toBe(true);
  });

  it("says a page past the last one is past the last one, and nothing more", async () => {
    const result = await runBrowseRecipes(
      client(listingFrom("category-beyond-last.html")),
      args({ category: "91/recettes-soupes-potages", page: 9 }),
    );

    expect(textOf(result)).toContain("served no recipe on page 9");
    expect(notesOf(result).some((note) => note.includes("past the last one, which is 2"))).toBe(
      true,
    );
  });

  it("reports what the reading layer set aside", async () => {
    const result = await runBrowseRecipes(
      client(listingFrom("category-listing.html"), ["one row went"]),
      args({ category: "91/recettes-soupes-potages" }),
    );

    expect(notesOf(result).some((note) => note.includes("1 row was set aside"))).toBe(true);
  });

  it("counts several set-aside rows in the plural", async () => {
    const result = await runBrowseRecipes(
      client(listingFrom("category-listing.html"), ["one went", "another went"]),
      args({ category: "91/recettes-soupes-potages" }),
    );

    expect(notesOf(result).some((note) => note.includes("2 rows were set aside"))).toBe(true);
  });

  it("renders a row the site printed no difficulty for without inventing one", async () => {
    const listing = listingFrom("category-bare.html");
    const result = await runBrowseRecipes(client(listing), args({ category: "91/x-y" }));

    expect(textOf(result)).toContain("4210: Velouté de gaverole, no total published");
  });

  it("names a category the site gave no heading", async () => {
    const listing = { ...listingFrom("category-beyond-last.html"), title: null };
    const result = await runBrowseRecipes(client(listing), args({ category: "91/x-y", page: 9 }));

    expect(textOf(result)).toContain("this category");
  });

  it("refuses an argument it does not declare", async () => {
    await expect(
      runBrowseRecipes(
        client(listingFrom("category-listing.html")),
        args({ category: "91/recettes-soupes-potages", categorie: "x" }),
      ),
    ).rejects.toThrow(/categorie/);
  });
});

describe("get_wine_pairings", () => {
  const sheet = (): PairingSheet =>
    parsePairingSheet(read("pairing-sheet.html"), "2", SHEET_URL).sheet;
  const index = (): PairingIndex => parsePairingIndex(read("pairing-index.html"), INDEX_URL);

  const client = (skipped?: string[]) =>
    fakeClient({
      getPairings: async (): Promise<Read<PairingSheet>> => answered(sheet(), skipped),
      listPairings: async (): Promise<Read<PairingIndex>> => answered(index()),
    });

  const args = (value: Record<string, unknown>): GetWinePairingsArgs =>
    value as unknown as GetWinePairingsArgs;

  it("renders one dish, keeping the site's own ranks and order", async () => {
    const result = await runGetWinePairings(client(), args({ id: "2" }));
    const dish = result.structuredContent?.["dish"] as Record<string, unknown>;

    expect(result.structuredContent?.["kind"]).toBe("dish");
    expect(result.structuredContent?.["index"]).toBeNull();
    expect(dish["pairing_count"]).toBe(5);
    expect(textOf(result)).toContain("Bon accord: Coteaux de Varne");
    expect(textOf(result)).toContain("Accord parfait: Gaverole blanc");
  });

  it("says the rank and the order are the site's claim", async () => {
    expect(
      notesOf(await runGetWinePairings(client(), args({ id: "2" }))).some((note) =>
        note.includes("Nothing here scores a wine"),
      ),
    ).toBe(true);
  });

  it("carries the recipes the site links beside the dish", async () => {
    const result = await runGetWinePairings(client(), args({ id: "2" }));

    expect(textOf(result)).toContain("Recipes: 4210 Velouté de gaverole");
  });

  it("reports the line it set aside for carrying no rank", async () => {
    const result = await runGetWinePairings(client(["one line went"]), args({ id: "2" }));

    expect(notesOf(result).some((note) => note.includes("1 line was set aside"))).toBe(true);
  });

  it("counts several set-aside lines in the plural", async () => {
    const result = await runGetWinePairings(client(["one went", "another"]), args({ id: "2" }));

    expect(notesOf(result).some((note) => note.includes("2 lines were set aside"))).toBe(true);
  });

  it("renders a dish the site opened with no style", async () => {
    const plain = fakeClient({
      getPairings: async (): Promise<Read<PairingSheet>> =>
        answered({ ...sheet(), style: null, recipes: [] }),
    });
    const result = await runGetWinePairings(plain, args({ id: "2" }));

    expect(textOf(result)).not.toContain("—");
    expect(textOf(result)).not.toContain("Recipes:");
  });

  describe("the index", () => {
    it("reads one page when a page is asked for rather than a dish", async () => {
      const result = await runGetWinePairings(client(), args({ page: 3 }));
      const listed = result.structuredContent?.["index"] as Record<string, unknown>;

      expect(result.structuredContent?.["kind"]).toBe("index");
      expect(result.structuredContent?.["dish"]).toBeNull();
      expect(listed["dish_count"]).toBe(2);
      expect(textOf(result)).toContain("1: Aligot de Varne");
    });

    it("reads the first page when neither a dish nor a page is asked for", async () => {
      const result = await runGetWinePairings(client(), args({}));
      const listed = result.structuredContent?.["index"] as Record<string, unknown>;

      expect(listed["page"]).toBe(1);
    });

    it("says the index runs alphabetically", async () => {
      expect(
        notesOf(await runGetWinePairings(client(), args({ page: 1 }))).some((note) =>
          note.includes("alphabetically"),
        ),
      ).toBe(true);
    });

    it("says so plainly when a page held no dish", async () => {
      const empty = fakeClient({
        listPairings: async (): Promise<Read<PairingIndex>> =>
          answered({ entries: [], last_page: 42, url: INDEX_URL }),
      });
      const result = await runGetWinePairings(empty, args({ page: 99 }));

      expect(textOf(result)).toContain("listed no dish on page 99");
    });
  });

  it("refuses a call naming both a dish and a page, since they ask different things", async () => {
    try {
      await runGetWinePairings(client(), args({ id: "2", page: 1 }));
      expect.unreachable("naming both is refused");
    } catch (error) {
      expect((error as SupertoinetteError).code).toBe("invalid_input");
      expect((error as SupertoinetteError).message).toContain("different questions");
    }
  });

  it("refuses an argument it does not declare", async () => {
    await expect(runGetWinePairings(client(), args({ plat: "aligot" }))).rejects.toThrow(/plat/);
  });
});
