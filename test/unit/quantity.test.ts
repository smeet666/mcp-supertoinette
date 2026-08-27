/**
 * Reading the quantity a line opens with.
 *
 * The rule that governs every case: a number is read only where the page wrote
 * one. An article a line used as a determiner is not a number, a word that
 * names an amount without stating one is not a number, and a denominator of
 * zero is not a quantity at all.
 */

import { describe, expect, it } from "vitest";
import {
  formatAmount,
  leadingWord,
  parseIngredient,
  parseLeadingQuantity,
  parseLeadingRange,
  takeUnit,
} from "../../src/recipe/quantity.js";

const amountOf = (text: string): number | null => parseLeadingQuantity(text)?.amount ?? null;

describe("parseLeadingQuantity", () => {
  it.each([
    ["200 g", 200],
    ["1,5 l", 1.5],
    ["1.5 l", 1.5],
    ["1/2 citron", 0.5],
    ["1 1/2 tasse", 1.5],
    ["½ citron", 0.5],
    ["3 ¼ tasses", 3.25],
    ["3¼ tasses", 3.25],
  ])("reads %j as %d", (text, expected) => {
    expect(amountOf(text)).toBeCloseTo(expected, 6);
  });

  it("reads nothing from a line that opens on a word", () => {
    expect(parseLeadingQuantity("sel")).toBeNull();
    expect(parseLeadingQuantity("")).toBeNull();
  });

  it("reads nothing from a fraction over zero, rather than the numerator alone", () => {
    expect(parseLeadingQuantity("1/0 citron")).toBeNull();
  });

  it("reads a mixed fraction over zero as the whole number alone", () => {
    expect(amountOf("2 1/0 tasses")).toBe(2);
  });

  it("says how much of the line it consumed", () => {
    expect(parseLeadingQuantity("  200 g")?.length).toBe(5);
  });
});

describe("parseLeadingRange", () => {
  it.each(["2 à 3 gousses", "2 a 3 gousses", "2 ou 3 gousses", "2-3 gousses", "2–3 gousses"])(
    "reads %j as a range",
    (text) => {
      expect(parseLeadingRange(text)).toMatchObject({ amount: 2, max: 3 });
    },
  );

  it("keeps the separator the page wrote", () => {
    expect(parseLeadingRange("2 à 3 gousses")?.separator).toBe("à");
    expect(parseLeadingRange("2-3 gousses")?.separator).toBe("-");
  });

  it("reads no range where the second number is the smaller", () => {
    expect(parseLeadingRange("3-2 oeufs")).toBeNull();
  });

  it("reads no range where nothing follows the separator", () => {
    expect(parseLeadingRange("2 à gousses")).toBeNull();
  });

  it("reads no range where the line opens on no number at all", () => {
    expect(parseLeadingRange("sel à volonté")).toBeNull();
  });

  it("reads no range where no separator follows the number", () => {
    expect(parseLeadingRange("5 oignons")).toBeNull();
  });
});

describe("takeUnit", () => {
  it("takes the measure and hands back what it measures", () => {
    expect(takeUnit("g de farine")).toMatchObject({ rest: "farine" });
    expect(takeUnit("g de farine").unit?.canonical).toBe("g");
  });

  it("takes the longest measure rather than a word inside it", () => {
    expect(takeUnit("cuillère à soupe de sucre").unit?.canonical).toBe("cuillère à soupe");
  });

  it("takes a measure standing behind the word introducing it", () => {
    expect(takeUnit("de tasse de riz").unit?.canonical).toBe("tasse");
  });

  it("takes a measure a page spelled with dots and a bracketed plural", () => {
    expect(takeUnit("c. à s. de sucre").unit?.canonical).toBe("cuillère à soupe");
    expect(takeUnit("cuillère(s) à soupe de crème").unit?.canonical).toBe("cuillère à soupe");
  });

  it("takes no measure where the word merely opens on one", () => {
    expect(takeUnit("gousses").unit?.canonical).toBe("gousse");
    expect(takeUnit("grenadine").unit).toBeNull();
  });

  it("hands the whole line back where it names no measure", () => {
    expect(takeUnit("oignons rouges")).toEqual({ unit: null, rest: "oignons rouges" });
  });
});

describe("parseIngredient", () => {
  it("reads a number, a measure and a name", () => {
    expect(parseIngredient("200 g de farine")).toMatchObject({
      amount: 200,
      amountMax: null,
      item: "farine",
      articleWord: null,
    });
  });

  it("reads a range with the wording the page used", () => {
    expect(parseIngredient("2 à 3 gousses d'ail")).toMatchObject({
      amount: 2,
      amountMax: 3,
      rangeSeparator: "à",
      item: "ail",
    });
  });

  it("reads a count with no measure at all", () => {
    expect(parseIngredient("4 oeufs")).toMatchObject({ amount: 4, unit: null, item: "oeufs" });
  });

  it("reads an article as a number where a measure follows it", () => {
    expect(parseIngredient("une pincée de sel")).toMatchObject({
      amount: 1,
      articleWord: "une",
      item: "sel",
    });
    expect(parseIngredient("quelques feuilles de basilic")).toMatchObject({
      amount: 3,
      articleWord: "quelques",
    });
  });

  it("reads no number from an article standing as a determiner", () => {
    expect(parseIngredient("un oignon")).toMatchObject({ amount: null, item: "un oignon" });
  });

  it("reads no number from a line naming an amount without stating one", () => {
    expect(parseIngredient("un peu de sel")).toMatchObject({ amount: null });
  });

  it("hands back the whole line where it carries no quantity", () => {
    expect(parseIngredient("Poivre du moulin")).toMatchObject({
      amount: null,
      unit: null,
      item: "Poivre du moulin",
    });
  });
});

describe("formatAmount", () => {
  it("writes a whole number plainly", () => {
    expect(formatAmount(4)).toBe("4");
  });

  it("writes the decimal with the comma French uses", () => {
    expect(formatAmount(1.5, { fractions: false })).toBe("1,5");
  });

  it("snaps to the fractions a measuring set carries", () => {
    expect(formatAmount(0.25)).toBe("1/4");
    expect(formatAmount(0.34)).toBe("1/3");
    expect(formatAmount(2.5)).toBe("2 1/2");
  });

  it("writes a value no fraction is near as a decimal", () => {
    expect(formatAmount(0.42)).toBe("0,42");
  });

  it("keeps two significant digits below what two decimals can show", () => {
    expect(formatAmount(0.0042, { fractions: false })).toBe("0,0042");
  });

  it("writes nothing for a value that is not a number", () => {
    expect(formatAmount(Number.NaN)).toBe("");
  });
});

describe("leadingWord", () => {
  it("names the word a line opens with", () => {
    expect(leadingWord("bouquet de persil")).toBe("bouquet");
  });

  it("names nothing where the line opens on a figure", () => {
    expect(leadingWord("200 g")).toBeNull();
  });
});
