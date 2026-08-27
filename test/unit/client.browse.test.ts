/**
 * What the three new reads establish, and what they refuse to state.
 *
 * No site is reached here: a stand-in fetch answers with the corpus, which is
 * what lets a case such as "the site holds nothing at that address" be stated
 * at all.
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

interface Answer {
  body?: string;
  status?: number;
}

function client(answer: Answer): { reader: SupertoinetteClient; asked: string[] } {
  const asked: string[] = [];
  const impl = (async (input: string | URL) => {
    asked.push(String(input));
    return new Response(answer.body ?? "", { status: answer.status ?? 200 });
  }) as unknown as typeof fetch;
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

describe("listCategories", () => {
  it("reads both lists off one page", async () => {
    const { reader, asked } = client({ body: read("category-listing.html") });
    const result = await settled(reader.listCategories());

    expect(result.data).toHaveLength(4);
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain("/recettes-cuisine-photos");
  });

  it("asks the site once for a list read twice", async () => {
    const { reader, asked } = client({ body: read("category-listing.html") });
    await settled(reader.listCategories());
    const again = await settled(reader.listCategories());

    expect(asked).toHaveLength(1);
    expect(again.cached).toBe(true);
  });
});

describe("browseRecipes", () => {
  it("reads one page of a category", async () => {
    const { reader, asked } = client({ body: read("category-listing.html") });
    const result = await settled(reader.browseRecipes("91/recettes-soupes-potages", 2));

    expect(result.data.results).toHaveLength(2);
    expect(asked[0]).toContain("/recettes/91/recettes-soupes-potages");
    expect(asked[0]).toContain("page=2");
  });

  it("refuses a token that cannot become an address, without asking the site", async () => {
    const { reader, asked } = client({ body: read("category-listing.html") });

    await expect(reader.browseRecipes("107", 1)).rejects.toMatchObject({ code: "invalid_input" });
    await expect(reader.browseRecipes("recettes-desserts", 1)).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(asked).toHaveLength(0);
  });

  it("reports a category the site does not hold as an absence", async () => {
    const { reader } = client({ status: 404 });

    await expect(settled(reader.browseRecipes("91/pas-le-bon-nom", 1))).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("says what it set aside on a page holding a row it could not render", async () => {
    const { reader } = client({ body: read("category-listing.html") });
    const result = await settled(reader.browseRecipes("91/recettes-soupes-potages", 1));

    expect(result.skipped).toHaveLength(2);
  });

  it("stores nothing it could not read, so a failure is not served back", async () => {
    const { reader, asked } = client({ body: read("category-not-a-listing.html") });

    await expect(settled(reader.browseRecipes("91/recettes-soupes-potages", 1))).rejects.toThrow();
    await expect(settled(reader.browseRecipes("91/recettes-soupes-potages", 1))).rejects.toThrow();
    expect(asked).toHaveLength(2);
  });
});

describe("getPairings", () => {
  it("reads one dish by the number in its address", async () => {
    const { reader, asked } = client({ body: read("pairing-sheet.html") });
    const result = await settled(reader.getPairings("2"));

    expect(result.data.pairings).toHaveLength(5);
    expect(asked[0]).toContain("/accords-mets-vins/2/");
  });

  it("refuses an identifier that cannot become an address, without asking the site", async () => {
    const { reader, asked } = client({ body: read("pairing-sheet.html") });

    await expect(reader.getPairings("pas-un-nombre")).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(asked).toHaveLength(0);
  });

  it("reports a dish the site does not hold as an absence", async () => {
    const { reader } = client({ status: 404 });

    await expect(settled(reader.getPairings("999999"))).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("says what it set aside on a page holding a line it could not rank", async () => {
    const { reader } = client({ body: read("pairing-sheet.html") });
    const result = await settled(reader.getPairings("2"));

    expect(result.skipped).toHaveLength(1);
  });
});

describe("listPairings", () => {
  it("reads one page of the index", async () => {
    const { reader, asked } = client({ body: read("pairing-index.html") });
    const result = await settled(reader.listPairings(3));

    expect(result.data.entries).toHaveLength(2);
    expect(result.data.last_page).toBe(42);
    expect(asked[0]).toContain("page=3");
  });

  it("leaves the first page unnumbered", async () => {
    const { reader, asked } = client({ body: read("pairing-index.html") });
    await settled(reader.listPairings(1));

    expect(asked[0]).not.toContain("page=");
  });
});
