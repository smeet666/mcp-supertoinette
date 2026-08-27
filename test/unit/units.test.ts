/**
 * The vocabulary of measures, and what each one says about scaling.
 *
 * A measure this does not recognise is worse than a wrong one: the amount falls
 * through to the countable branch and gets rounded as though a spoonful were an
 * indivisible object. So the spellings a page actually uses are what these
 * cases are about.
 */

import { describe, expect, it } from "vitest";
import {
  approximateEquivalent,
  chooseReadableUnit,
  demoteUnit,
  formatUnit,
  frenchPlural,
  frenchSingular,
  hasEmbeddedMeasure,
  isSpoonMeasure,
  lookupUnit,
  normalizeUnitKey,
  readPartitiveMeasure,
  type UnitInfo,
  unitDivisibility,
  unitKeys,
} from "../../src/recipe/units.js";

const unitOf = (text: string): UnitInfo => {
  const unit = lookupUnit(text);
  if (unit === null) {
    throw new Error(`${text} is not in the vocabulary`);
  }
  return unit;
};

describe("normalizeUnitKey", () => {
  it("lowercases, strips accents and drops the dots an abbreviation carries", () => {
    expect(normalizeUnitKey("C. à S.")).toBe("c a s");
  });

  it("drops the plural mark a page writes in brackets", () => {
    expect(normalizeUnitKey("cuillère(s) à soupe")).toBe("cuillere a soupe");
    expect(normalizeUnitKey("bocal(x)")).toBe("bocal");
    expect(normalizeUnitKey("boîte(es)")).toBe("boite");
  });
});

describe("lookupUnit", () => {
  it.each([
    ["g", "g"],
    ["grammes", "g"],
    ["Gr", "g"],
    ["KG", "kg"],
    ["litres", "l"],
    ["cuillères à soupe", "cuillère à soupe"],
    ["c. à c.", "cuillère à café"],
    ["pincées", "pincée"],
    ["boîtes", "boîte"],
  ])("reads %j as %j", (written, canonical) => {
    expect(unitOf(written).canonical).toBe(canonical);
  });

  it("finds nothing for a word that names no measure", () => {
    expect(lookupUnit("courgette")).toBeNull();
  });

  it("publishes its keys longest first, so a compound wins over a word inside it", () => {
    const keys = unitKeys();
    const compound = keys.indexOf("cuillere a soupe");
    const short = keys.indexOf("g");

    expect(compound).toBeLessThan(short);
  });
});

describe("what a measure says about scaling", () => {
  it("classes a mass and a volume as measured", () => {
    expect(unitOf("g").kind).toBe("measured");
    expect(unitOf("cl").kind).toBe("measured");
  });

  it("classes a spoon, a tin and a clove as portioned", () => {
    expect(unitOf("cuillère à soupe").kind).toBe("portioned");
    expect(unitOf("boîte").kind).toBe("portioned");
    expect(unitOf("gousse").kind).toBe("portioned");
  });

  it("classes a gesture as approximate", () => {
    expect(unitOf("pincée").kind).toBe("approximate");
    expect(unitOf("poignée").kind).toBe("approximate");
  });

  it("keeps a livre in the system the page wrote it in", () => {
    expect(unitOf("livre").system).toBe("imperial");
    expect(unitOf("g").system).toBe("metric");
  });

  it("names a spoon and a cup as the measures a share of one can be restated in", () => {
    expect(isSpoonMeasure(unitOf("cuillère à soupe"))).toBe(true);
    expect(isSpoonMeasure(unitOf("tasse"))).toBe(true);
    expect(isSpoonMeasure(unitOf("gousse"))).toBe(false);
  });
});

describe("unitDivisibility", () => {
  it("gives a gesture no half, since there is no half of a hand", () => {
    expect(unitDivisibility(unitOf("pincée"))).toBe("whole");
  });

  it("gives a pot and a tranche the quarter each of them gives up", () => {
    expect(unitDivisibility(unitOf("pot"))).toBe("quarter");
    expect(unitDivisibility(unitOf("tranche"))).toBe("quarter");
  });

  it("gives every other measure the half it splits on", () => {
    expect(unitDivisibility(unitOf("sachet"))).toBe("half");
    expect(unitDivisibility(unitOf("gousse"))).toBe("half");
  });
});

describe("readPartitiveMeasure", () => {
  it("reads a container the vocabulary has no entry for", () => {
    const read = readPartitiveMeasure("bouquet de persil");

    expect(read?.unit.canonical).toBe("bouquet");
    expect(read?.unit.kind).toBe("approximate");
    expect(read?.rest).toBe("de persil");
  });

  it("puts a plural container back in the singular", () => {
    expect(readPartitiveMeasure("ramequins de crème")?.unit.canonical).toBe("ramequin");
  });

  it("reads nothing where a word names an amount without stating one", () => {
    expect(readPartitiveMeasure("peu de sel")).toBeNull();
    expect(readPartitiveMeasure("moitié de la pâte")).toBeNull();
  });

  it("reads nothing where the word names a part of the food", () => {
    expect(readPartitiveMeasure("jus de citron")).toBeNull();
    expect(readPartitiveMeasure("blanc de poulet")).toBeNull();
  });

  it("reads nothing where the vocabulary already knows the word", () => {
    expect(readPartitiveMeasure("sachet de levure")).toBeNull();
  });

  it("reads nothing from a word too short to name a container", () => {
    expect(readPartitiveMeasure("ml de lait")).toBeNull();
  });

  it("reads nothing where no partitive follows", () => {
    expect(readPartitiveMeasure("beurre pommade")).toBeNull();
  });
});

describe("the number a French noun takes", () => {
  it.each([
    ["morceaux", "morceau"],
    ["bocaux", "bocal"],
    ["ananas", "ananas"],
    ["pincées", "pincée"],
    ["riz", "riz"],
  ])("puts %j back as %j", (plural, singular) => {
    expect(frenchSingular(plural)).toBe(singular);
  });

  it.each([
    ["morceau", "morceaux"],
    ["bocal", "bocaux"],
    ["ananas", "ananas"],
    ["pincée", "pincées"],
  ])("writes the plural of %j as %j", (singular, plural) => {
    expect(frenchPlural(singular)).toBe(plural);
  });
});

describe("approximateEquivalent", () => {
  it("gives the everyday equivalence a kitchen takes a pincée to be", () => {
    expect(approximateEquivalent(unitOf("pincée"))).toContain("half a teaspoon");
  });

  it("gives none for a gesture with no settled equivalence", () => {
    expect(approximateEquivalent(unitOf("lichette"))).toBeNull();
  });
});

describe("the ladders", () => {
  it("steps a kilo down to grams and a litre down to centilitres", () => {
    expect(demoteUnit(unitOf("kg"))).toMatchObject({ per: 1000 });
    expect(demoteUnit(unitOf("kg"))?.unit.canonical).toBe("g");
    expect(demoteUnit(unitOf("l"))?.unit.canonical).toBe("cl");
  });

  it("steps a spoon down to the smaller spoon", () => {
    expect(demoteUnit(unitOf("cuillère à soupe"))?.unit.canonical).toBe("cuillère à café");
    expect(demoteUnit(unitOf("tasse"))?.unit.canonical).toBe("cuillère à soupe");
  });

  it("stops at the bottom of a ladder", () => {
    expect(demoteUnit(unitOf("mg"))).toBeNull();
    expect(demoteUnit(unitOf("cuillère à café"))).toBeNull();
    expect(demoteUnit(unitOf("gousse"))).toBeNull();
  });
});

describe("chooseReadableUnit", () => {
  it("leaves a measure a kitchen already reads", () => {
    expect(chooseReadableUnit(unitOf("g"), 400)).toMatchObject({ ratio: 1 });
  });

  it("climbs once a full unit of the step above is reached", () => {
    const chosen = chooseReadableUnit(unitOf("g"), 2000);

    expect(chosen.unit.canonical).toBe("kg");
    expect(chosen.ratio).toBe(0.001);
  });

  it("stays where the page wrote it when the bigger unit cannot state the figure", () => {
    expect(chooseReadableUnit(unitOf("g"), 2468).unit.canonical).toBe("g");
  });

  it("walks down while the amount sits under one", () => {
    expect(chooseReadableUnit(unitOf("kg"), 0.001).unit.canonical).toBe("g");
    expect(chooseReadableUnit(unitOf("kg"), 0.000_000_1).unit.canonical).toBe("mg");
  });

  it("stops one step down, where the figure is large enough to be rounded", () => {
    const chosen = chooseReadableUnit(unitOf("l"), 1 / 3);

    expect(chosen.unit.canonical).toBe("cl");
    expect(chosen.ratio).toBe(100);
  });

  it("walks further down while the figure stays too small to round", () => {
    const chosen = chooseReadableUnit(unitOf("l"), 0.056_78);

    expect(chosen.unit.canonical).toBe("ml");
  });

  it("stops at the bottom of the ladder rather than losing the value", () => {
    expect(chooseReadableUnit(unitOf("mg"), 5.678)).toMatchObject({ ratio: 1 });
  });

  it("leaves anything that is not a mass or a volume alone", () => {
    expect(chooseReadableUnit(unitOf("gousse"), 1000)).toMatchObject({ ratio: 1 });
    expect(chooseReadableUnit(unitOf("g"), 0)).toMatchObject({ ratio: 1 });
  });
});

describe("formatUnit", () => {
  it("leaves a symbol as it is, whatever the count", () => {
    expect(formatUnit(unitOf("g"), 400)).toBe("g");
  });

  it("takes the plural from two onwards, as French does", () => {
    expect(formatUnit(unitOf("cuillère à soupe"), 1.5)).toBe("cuillère à soupe");
    expect(formatUnit(unitOf("cuillère à soupe"), 2)).toBe("cuillères à soupe");
  });

  it("writes the plural a word carries rather than adding an -s to it", () => {
    expect(formatUnit(unitOf("boîte"), 3)).toBe("boîtes");
    expect(formatUnit(unitOf("noix"), 3)).toBe("noix");
    expect(formatUnit(unitOf("sachet"), 3)).toBe("sachets");
  });
});

describe("hasEmbeddedMeasure", () => {
  it("spots a second quantity further along the line", () => {
    expect(hasEmbeddedMeasure("de sucre ou 1 cuillère à café de miel")).toBe(true);
    expect(hasEmbeddedMeasure("de lard de 2 cm d'épaisseur")).toBe(false);
  });

  it("spots a measure standing behind the word introducing it", () => {
    expect(hasEmbeddedMeasure("et 3/4 de tasse de riz")).toBe(true);
  });

  it("spots nothing in a plain ingredient name", () => {
    expect(hasEmbeddedMeasure("de tiges de gaverole")).toBe(false);
  });
});
