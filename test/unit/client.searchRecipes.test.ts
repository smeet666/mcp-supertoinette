/**
 * What searching establishes, and what it refuses to state.
 *
 * The case that matters most is the one the site cannot be asked about: it
 * answers a category it does not know exactly as it answers a search that
 * matched nothing. Asking again without the filter is the only way to tell one
 * from the other, and it costs a second request.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Config } from "../../src/config.js";
import { createLogger, loadConfig } from "../../src/config.js";
import { SupertoinetteClient } from "../../src/supertoinette/client.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const read = (name: string): string => readFileSync(join(fixtures, name), "utf8");

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
});

afterEach(() => {
  vi.useRealTimers();
});

const config = (): Config => ({ ...loadConfig({}), minIntervalMs: 3000, maxRetries: 0 });

/** A fetch that answers each address from the corpus, and records what was asked. */
function stubFetch(answer: (url: string) => string): { impl: typeof fetch; asked: string[] } {
  const asked: string[] = [];
  const impl = (async (input: string | URL) => {
    const url = String(input);
    asked.push(url);
    return new Response(answer(url), { status: 200 });
  }) as unknown as typeof fetch;
  return { impl, asked };
}

function client(answer: (url: string) => string): {
  reader: SupertoinetteClient;
  asked: string[];
} {
  const { impl, asked } = stubFetch(answer);
  return {
    reader: new SupertoinetteClient({
      config: config(),
      logger: createLogger("silent"),
      fetchImpl: impl,
    }),
    asked,
  };
}

/** Drive a read to its end on the fake clock. */
async function settled<T>(reading: Promise<T>): Promise<T> {
  const caught = reading.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );
  await vi.runAllTimersAsync();
  const outcome = await caught;
  if ("error" in outcome) {
    throw outcome.error;
  }
  return outcome.value;
}

describe("searchRecipes", () => {
  it("reads one page of results", async () => {
    const { reader } = client(() => read("search-results.html"));
    const result = await settled(
      reader.searchRecipes({ query: "gaverole", page: 1, category: null }),
    );

    expect(result.data.listing.results).toHaveLength(3);
    expect(result.data.dropped_category).toBeNull();
    expect(result.cached).toBe(false);
  });

  it("asks the site once for a page read twice", async () => {
    const { reader, asked } = client(() => read("search-results.html"));
    await settled(reader.searchRecipes({ query: "gaverole", page: 1, category: null }));
    const again = await settled(
      reader.searchRecipes({ query: "gaverole", page: 1, category: null }),
    );

    expect(asked).toHaveLength(1);
    expect(again.cached).toBe(true);
  });

  it("carries the query, the page and the category into the address", async () => {
    const { reader, asked } = client(() => read("search-results.html"));
    await settled(
      reader.searchRecipes({ query: "tarte aux pommes", page: 3, category: "Entrées & salades" }),
    );

    expect(asked[0]).toContain("q=tarte+aux+pommes");
    expect(asked[0]).toContain("page=3");
    expect(asked[0]).toContain("c=Entr%C3%A9es+%26+salades");
  });

  it("refuses a query with nothing in it, without asking the site", async () => {
    const { reader, asked } = client(() => read("search-results.html"));

    await expect(
      reader.searchRecipes({ query: "   ", page: 1, category: null }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(asked).toHaveLength(0);
  });

  it("reports a search the site matched nothing for as an absence", async () => {
    const { reader } = client(() => read("search-empty.html"));
    const result = await settled(reader.searchRecipes({ query: "zzzz", page: 1, category: null }));

    expect(result.data.listing.matched_nothing).toBe(true);
    expect(result.data.dropped_category).toBeNull();
  });

  describe("a category the site does not know", () => {
    /** The site answers an unknown facet with the page it answers a miss with. */
    const answerFacetWithNothing = (url: string): string =>
      url.includes("c=") ? read("search-empty.html") : read("search-results.html");

    it("is set aside, and the search is made again without it", async () => {
      const { reader, asked } = client(answerFacetWithNothing);
      const result = await settled(
        reader.searchRecipes({ query: "gaverole", page: 1, category: "Pas une catégorie" }),
      );

      expect(asked).toHaveLength(2);
      expect(asked[1]).not.toContain("c=");
      expect(result.data.dropped_category).toBe("Pas une catégorie");
      expect(result.data.listing.results).toHaveLength(3);
    });

    it("is left alone when the query itself matched nothing", async () => {
      const { reader } = client(() => read("search-empty.html"));
      const result = await settled(
        reader.searchRecipes({ query: "zzzz", page: 1, category: "Soupes & potages" }),
      );

      expect(result.data.dropped_category).toBeNull();
      expect(result.data.listing.matched_nothing).toBe(true);
    });

    it("costs one request when the filter did find rows", async () => {
      const { reader, asked } = client(() => read("search-results.html"));
      const result = await settled(
        reader.searchRecipes({ query: "gaverole", page: 1, category: "Soupes & potages" }),
      );

      expect(asked).toHaveLength(1);
      expect(result.data.dropped_category).toBeNull();
    });
  });

  it("says what it set aside on a page holding a row it could not render", async () => {
    const { reader } = client(() => read("search-results.html"));
    const result = await settled(
      reader.searchRecipes({ query: "gaverole", page: 1, category: null }),
    );

    expect(result.skipped).toHaveLength(3);
  });

  it("reports a page it cannot read as a failure rather than as an empty listing", async () => {
    const { reader } = client(() => read("search-not-a-search.html"));

    await expect(
      settled(reader.searchRecipes({ query: "gaverole", page: 1, category: null })),
    ).rejects.toMatchObject({ code: "parse_failure" });
  });
});
