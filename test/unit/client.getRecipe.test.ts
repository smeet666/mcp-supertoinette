/**
 * What the reading layer establishes, and what it refuses to state.
 *
 * No site is reached here: a stand-in fetch answers with the corpus, which is
 * what lets a case such as "the site asked this client to slow down" be stated
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

/** A configuration that spends no time waiting, so a test states behaviour rather than pacing. */
const config = (over: Partial<Config> = {}): Config => ({
  ...loadConfig({}),
  minIntervalMs: 3000,
  maxRetries: 0,
  ...over,
});

interface Answer {
  status?: number;
  body?: string;
  url?: string;
  headers?: Record<string, string>;
}

/**
 * The failure a read ended in, caught as the read is started.
 *
 * The rejection lands while the fake clock is being wound forward, so a handler
 * that goes on afterwards arrives after the fact and the runner reports the
 * rejection as unhandled.
 */
async function failureOf(reading: Promise<unknown>): Promise<{ code?: string }> {
  const caught = reading.then(
    () => ({}),
    (error: { code?: string }) => error,
  );
  await vi.runAllTimersAsync();
  return caught;
}

/** A fetch that answers from the corpus and records what it was asked for. */
function stubFetch(answers: Answer[]): { impl: typeof fetch; asked: string[] } {
  const asked: string[] = [];
  let index = 0;
  const impl = (async (input: string | URL) => {
    asked.push(String(input));
    const answer = answers[Math.min(index, answers.length - 1)] ?? {};
    index += 1;
    return new Response(answer.body ?? "", {
      status: answer.status ?? 200,
      headers: answer.headers ?? {},
    });
  }) as unknown as typeof fetch;
  return { impl, asked };
}

function client(answers: Answer[], over: Partial<Config> = {}): SupertoinetteClient {
  const { impl } = stubFetch(answers);
  return new SupertoinetteClient({
    config: config(over),
    logger: createLogger("silent"),
    fetchImpl: impl,
  });
}

describe("getRecipe", () => {
  it("reads a recipe and reports that it came fresh", async () => {
    const reading = client([{ body: read("recipe-complete.html") }]).getRecipe("4210");
    await vi.runAllTimersAsync();
    const result = await reading;

    expect(result.cached).toBe(false);
    expect(result.data.title).toBe("Velouté de gaverole au pravin");
    expect(result.data.id).toBe("4210");
  });

  it("asks the site once for a recipe read twice", async () => {
    const { impl, asked } = stubFetch([{ body: read("recipe-complete.html") }]);
    const reader = new SupertoinetteClient({
      config: config(),
      logger: createLogger("silent"),
      fetchImpl: impl,
    });

    const first = reader.getRecipe("4210");
    await vi.runAllTimersAsync();
    await first;
    const second = reader.getRecipe("4210");
    await vi.runAllTimersAsync();
    const repeated = await second;

    expect(asked).toHaveLength(1);
    expect(repeated.cached).toBe(true);
  });

  it("refuses an identifier that cannot become an address, without asking the site", async () => {
    const { impl, asked } = stubFetch([{ body: read("recipe-complete.html") }]);
    const reader = new SupertoinetteClient({
      config: config(),
      logger: createLogger("silent"),
      fetchImpl: impl,
    });

    await expect(reader.getRecipe("pas-un-nombre")).rejects.toMatchObject({
      code: "invalid_input",
    });
    expect(asked).toHaveLength(0);
  });

  it("reports an identifier the site does not hold as an absence", async () => {
    expect(await failureOf(client([{ status: 404 }]).getRecipe("999999"))).toMatchObject({
      code: "not_found",
    });
  });

  it("reports a request the site asked to slow down as rate_limited rather than as nothing found", async () => {
    expect(await failureOf(client([{ status: 429 }]).getRecipe("4210"))).toMatchObject({
      code: "rate_limited",
    });
  });

  it("reports a page it cannot read as a failure rather than as an empty recipe", async () => {
    const reading = client([{ body: read("recipe-no-structured.html") }]).getRecipe("4210");

    expect(await failureOf(reading)).toMatchObject({ code: "parse_failure" });
  });

  it("refuses a listing served in place of a recipe", async () => {
    const reading = client([{ body: read("listing-category.html") }]).getRecipe("91");

    expect(await failureOf(reading)).toMatchObject({ code: "parse_failure" });
  });

  it("stores nothing it could not read, so a failure is not served back", async () => {
    const { impl, asked } = stubFetch([{ body: read("recipe-no-structured.html") }]);
    const reader = new SupertoinetteClient({
      config: config(),
      logger: createLogger("silent"),
      fetchImpl: impl,
    });

    expect(await failureOf(reader.getRecipe("4210"))).toMatchObject({ code: "parse_failure" });
    expect(await failureOf(reader.getRecipe("4210"))).toMatchObject({ code: "parse_failure" });

    expect(asked).toHaveLength(2);
  });

  it("says what it set aside on a recipe printing no ingredient list", async () => {
    const page = read("recipe-complete.html").replace(/ingredientsList/g, "somethingElse");
    const reading = client([{ body: page }]).getRecipe("4210");
    await vi.runAllTimersAsync();
    const result = await reading;

    expect(result.skipped).toHaveLength(1);
    expect(result.skipped?.[0]).toContain("ingredient");
  });

  it("attaches nothing when nothing was set aside", async () => {
    const reading = client([{ body: read("recipe-complete.html") }]).getRecipe("4210");
    await vi.runAllTimersAsync();
    const result = await reading;

    expect(result.skipped).toBeUndefined();
  });

  it("reports the spacing in force rather than a figure it guessed", () => {
    expect(client([]).currentIntervalMs).toBe(3000);
  });

  it("reads through the runtime's own fetch when it was handed none", async () => {
    const seen: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation((async (input: string | URL) => {
      seen.push(String(input));
      return new Response(read("recipe-complete.html"), { status: 200 });
    }) as unknown as typeof fetch);

    const reader = new SupertoinetteClient({ config: config(), logger: createLogger("silent") });
    const reading = reader.getRecipe("4210");
    await vi.runAllTimersAsync();
    const result = await reading;

    expect(seen).toHaveLength(1);
    expect(result.data.title).toBe("Velouté de gaverole au pravin");
    vi.restoreAllMocks();
  });
});
