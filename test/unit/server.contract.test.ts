import { readFileSync } from "node:fs";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createServer, INSTRUCTIONS } from "../../src/server.js";

/**
 * Nothing here waits, but the clock and Math.random are pinned all the same:
 * building a server must not depend on the machine's time or on a draw.
 */
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
  vi.spyOn(Math, "random").mockReturnValue(0);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

/** Any attempt to reach the network while a tool is not called is a failure. */
const forbiddenFetch: typeof fetch = () => {
  throw new Error("the network was touched while building or listing");
};

async function connected(): Promise<Client> {
  const server = createServer({ fetchImpl: forbiddenFetch });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const client = new Client({ name: "contract-test", version: "0.0.0" });
  await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);
  return client;
}

function packageVersion(): string {
  const raw = readFileSync(new URL("../../package.json", import.meta.url), "utf8");
  const parsed = JSON.parse(raw) as { version: string };
  return parsed.version;
}

describe("createServer", () => {
  it("announces itself as mcp-supertoinette with the released version", async () => {
    const client = await connected();
    const info = client.getServerVersion();

    expect(info?.name).toBe("mcp-supertoinette");
    expect(info?.version).toBe(packageVersion());
  });

  it("registers get_recipe with a description, an output schema and read-only annotations", async () => {
    const client = await connected();
    const { tools } = await client.listTools();
    const tool = tools.find((candidate) => candidate.name === "get_recipe");

    if (tool === undefined) {
      throw new Error("get_recipe is not registered");
    }
    expect(typeof tool.description).toBe("string");
    expect((tool.description ?? "").length).toBeGreaterThan(0);
    expect(tool.outputSchema).toBeDefined();
    expect(tool.annotations?.readOnlyHint).toBe(true);
    expect(tool.annotations?.idempotentHint).toBe(true);
    expect(tool.annotations?.destructiveHint).not.toBe(true);
  });

  it("declares an input schema that refuses an argument it does not know", async () => {
    const client = await connected();
    const { tools } = await client.listTools();
    const tool = tools.find((candidate) => candidate.name === "get_recipe");

    if (tool === undefined) {
      throw new Error("get_recipe is not registered");
    }
    expect(tool.inputSchema.type).toBe("object");
    expect(tool.inputSchema.additionalProperties).toBe(false);
  });

  it("hands the instructions to the client", async () => {
    const client = await connected();

    expect(client.getInstructions()).toBe(INSTRUCTIONS);
  });

  it("builds with no argument at all and asks nothing of the network", () => {
    const globalFetch = vi.spyOn(globalThis, "fetch");

    expect(() => createServer()).not.toThrow();
    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("asks nothing of the network while a client connects and lists", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch");
    const client = await connected();
    await client.listTools();

    expect(globalFetch).not.toHaveBeenCalled();
  });

  it("registers every tool with a description, an output schema and read-only annotations", async () => {
    const client = await connected();
    const { tools } = await client.listTools();

    expect(tools.length).toBeGreaterThan(1);
    for (const tool of tools) {
      expect(
        (tool.description ?? "").length,
        `${tool.name} carries no description`,
      ).toBeGreaterThan(0);
      expect(tool.outputSchema, `${tool.name} declares no output schema`).toBeDefined();
      expect(
        tool.inputSchema.additionalProperties,
        `${tool.name} accepts undeclared arguments`,
      ).toBe(false);
      expect(tool.annotations?.readOnlyHint, `${tool.name} is not read-only`).toBe(true);
    }
  });

  it("lists the tools of two separately built servers in the same order", async () => {
    const first = await connected();
    const second = await connected();

    const firstNames = (await first.listTools()).tools.map((tool) => tool.name);
    const secondNames = (await second.listTools()).tools.map((tool) => tool.name);

    expect(firstNames).toEqual(secondNames);
    expect(firstNames).toEqual(["get_recipe", "scale_ingredients"]);
  });
});

describe("the wiring of every tool", () => {
  /**
   * Drives a pending call to its end on the fake clock, whatever waits the
   * lower layer inserts between two attempts.
   */
  async function settle<T>(promise: Promise<T>): Promise<T> {
    let outcome: { value: T } | { error: unknown } | undefined;
    promise.then(
      (value) => {
        outcome = { value };
      },
      (error: unknown) => {
        outcome = { error };
      },
    );
    for (let step = 0; step < 2000 && outcome === undefined; step += 1) {
      await vi.advanceTimersByTimeAsync(500);
    }
    if (outcome === undefined) {
      throw new Error("the call never settled on the fake clock");
    }
    if ("error" in outcome) {
      throw outcome.error;
    }
    return outcome.value;
  }

  /** Every tool, with arguments that reach the site rather than a refusal. */
  const CALLS = [{ name: "get_recipe", arguments: { id: "4210" } }] as const;

  it("answers scale_ingredients without touching the network at all", async () => {
    const server = createServer({ fetchImpl: forbiddenFetch });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "contract-test", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const result = await settle(
      client.callTool({
        name: "scale_ingredients",
        arguments: { ingredients: ["200 g de farine"], factor: 2 },
      }),
    );

    expect(result.isError).not.toBe(true);
  });

  it("answers a tool error rather than raising when scale_ingredients is refused", async () => {
    const server = createServer({ fetchImpl: forbiddenFetch });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "contract-test", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const result = await settle(
      client.callTool({ name: "scale_ingredients", arguments: { ingredients: ["1 oeuf"] } }),
    );

    expect(result.isError).toBe(true);
  });

  for (const call of CALLS) {
    it(`reads ${call.name} through the fetch it was handed, and answers a tool error when that read fails`, async () => {
      const seen: string[] = [];
      const impl: typeof fetch = (input) => {
        seen.push(String(input));
        return Promise.reject(new TypeError("the transport refused"));
      };
      const server = createServer({ fetchImpl: impl });
      const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
      const client = new Client({ name: "contract-test", version: "0.0.0" });
      await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

      const result = await settle(client.callTool({ ...call, arguments: { ...call.arguments } }));

      expect(seen.length).toBeGreaterThan(0);
      expect(result.isError).toBe(true);
    });
  }

  it("answers a tool error rather than raising when the arguments are refused", async () => {
    const server = createServer({ fetchImpl: forbiddenFetch });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: "contract-test", version: "0.0.0" });
    await Promise.all([client.connect(clientTransport), server.connect(serverTransport)]);

    const result = await settle(
      client.callTool({ name: "get_recipe", arguments: { id: "4210", portions: 4 } }),
    );

    expect(result.isError).toBe(true);
  });
});

describe("INSTRUCTIONS", () => {
  it("is not empty", () => {
    expect(INSTRUCTIONS.trim().length).toBeGreaterThan(0);
  });

  it("says what a recipe is addressed by", () => {
    expect(INSTRUCTIONS).toMatch(/number in its address/i);
  });

  it("says a time the site does not publish comes back as null rather than as zero", () => {
    expect(INSTRUCTIONS).toMatch(/null/);
    expect(INSTRUCTIONS).toMatch(/zero/);
  });

  it("says an ingredient sheet is the site's own link rather than the ingredient", () => {
    expect(INSTRUCTIONS).toMatch(/ingredient sheet/i);
  });

  it("says the difficulty carries no scale, because the site publishes none", () => {
    expect(INSTRUCTIONS).toMatch(/difficulty/i);
    expect(INSTRUCTIONS).toMatch(/scale/i);
  });

  it("says a rate_limited error says nothing about what the site holds", () => {
    expect(INSTRUCTIONS).toMatch(/rate_limited/);
  });

  it("asks for the site to be credited", () => {
    expect(INSTRUCTIONS).toMatch(/credit/i);
  });
});
