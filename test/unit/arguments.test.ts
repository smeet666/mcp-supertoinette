/**
 * How an argument is refused, and in whose words.
 *
 * A caller branches on the code a refusal opens with, and an argument is
 * refused along two paths: the code of a tool writes its own refusals, and the
 * schema refuses on its own before that code runs. Both have to open the same
 * way, or a caller finds the vocabulary one time in two.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { SupertoinetteClient } from "../../src/supertoinette/client.js";
import type { Read, RecipeCore } from "../../src/types.js";
import { strictInput } from "../../src/tools/arguments.js";
import { type GetRecipeArgs, runGetRecipe } from "../../src/tools/getRecipe.js";

/** A stand-in client: no site is reached from a unit test. */
function fakeClient(): SupertoinetteClient {
  return {
    getRecipe: async (id: string): Promise<Read<RecipeCore>> => ({
      data: { id, title: "", steps: [], ingredients: [] } as unknown as RecipeCore,
      cached: false,
    }),
  } as unknown as SupertoinetteClient;
}

const args = (value: Record<string, unknown>): GetRecipeArgs => value as unknown as GetRecipeArgs;

/** The refusal a call earns, as the caller reads it. */
async function refusalOf(value: Record<string, unknown>): Promise<string> {
  try {
    await runGetRecipe(fakeClient(), args(value));
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  throw new Error("the call was not refused");
}

/** The name a refusal suggests, when it suggests one. */
const suggestionIn = (message: string): string | undefined =>
  /did you mean '([^']+)'/.exec(message)?.[1];

describe("an argument the tool does not declare", () => {
  it("is refused, and the refusal opens with the code a caller branches on", async () => {
    const message = await refusalOf({ id: "1", portions: 4 });

    expect(message).toContain("[invalid_input]");
    expect(message).toContain("portions");
  });

  it("names every undeclared argument rather than only the first", async () => {
    const message = await refusalOf({ id: "1", portions: 4, langue: "fr" });

    expect(message).toContain("portions");
    expect(message).toContain("langue");
  });

  it("says what the tool does take", async () => {
    const message = await refusalOf({ id: "1", portions: 4 });

    expect(message).toContain("id");
  });
});

describe("a declared name spelled otherwise", () => {
  it.each(["Id", "ID", "i_d"])(
    "suggests id for %s, the same name written differently",
    async (name) => {
      const message = await refusalOf({ [name]: "1" });

      expect(suggestionIn(message)).toBe("id");
    },
  );

  it("suggests nothing for recipeid, since two letters in common say nothing", async () => {
    const message = await refusalOf({ recipeid: "1" });

    expect(suggestionIn(message)).toBeUndefined();
    expect(message).toContain("This tool takes: id");
  });

  it("suggests idd, one slip away from the name it declares", async () => {
    const message = await refusalOf({ idd: "1" });

    expect(suggestionIn(message)).toBe("id");
  });

  it("suggests nothing for a name that means something else entirely", async () => {
    const message = await refusalOf({ ingredientsOfTheRecipe: [] });

    expect(suggestionIn(message)).toBeUndefined();
  });

  it("suggests nothing for a name holding no letters or digits at all", async () => {
    const message = await refusalOf({ "-": "1" });

    expect(suggestionIn(message)).toBeUndefined();
  });
});

describe("a declared argument outside its bounds", () => {
  it("is refused by [invalid_input] when the identifier is empty", async () => {
    const message = await refusalOf({ id: "" });

    expect(message).toContain("[invalid_input]");
  });

  it("is refused by [invalid_input] when the identifier is longer than one can be", async () => {
    const message = await refusalOf({ id: "12345678901234" });

    expect(message).toContain("[invalid_input]");
  });

  it("is refused by [invalid_input] when the identifier is not a string at all", async () => {
    const message = await refusalOf({ id: 4210 });

    expect(message).toContain("[invalid_input]");
  });

  it("is refused by [invalid_input] when the identifier is missing", async () => {
    const message = await refusalOf({});

    expect(message).toContain("[invalid_input]");
  });
});

describe("strictInput", () => {
  const shape = () =>
    strictInput({
      family: z.string(),
      limit: z.number().int().min(1).max(10).optional(),
      mode: z.string().default("plain"),
    });

  it("refuses an undeclared key with the code in front", () => {
    const parsed = shape().safeParse({ family: "legume", unknown: "x" });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain("[invalid_input]");
  });

  it("carries the code onto a bound raised by a check rather than by the schema", () => {
    const parsed = shape().safeParse({ family: "legume", limit: 99 });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain("[invalid_input]");
  });

  it("carries the code through a wrapper onto the type it wraps", () => {
    const parsed = shape().safeParse({ family: "legume", mode: 7 });

    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues[0]?.message).toContain("[invalid_input]");
  });

  it("suggests the declared name a longer one opens on", () => {
    const parsed = shape().safeParse({ family: "x", familyName: 1 });

    expect(parsed.error?.issues[0]?.message).toContain("did you mean 'family'");
  });

  it("accepts what it declares", () => {
    const parsed = shape().safeParse({ family: "legume", limit: 3 });

    expect(parsed.success).toBe(true);
  });

  it("names one undeclared key in the singular and several in the plural", () => {
    const one = shape().safeParse({ family: "x", a: 1 });
    const two = shape().safeParse({ family: "x", a: 1, b: 2 });

    expect(one.error?.issues[0]?.message).toContain("Unknown argument");
    expect(two.error?.issues[0]?.message).toContain("Unknown arguments");
  });
});
