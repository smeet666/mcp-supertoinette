/**
 * What multiplying an ingredient line is allowed to claim.
 *
 * Every case states one rule about a kitchen rather than about arithmetic: how
 * far one of a thing divides, which unit a quantity is readable in, and when a
 * result stops being the product it came from. The value of `scaling` carries
 * the whole honesty of the module, so it is asserted on every case.
 */

import { describe, expect, it } from "vitest";
import { scaleLine, scaleLines } from "../../src/recipe/scale.js";

const scaled = (line: string, factor: number) => scaleLine(line, { factor });
const textOf = (line: string, factor: number) => scaled(line, factor).text;

describe("a line carrying no quantity", () => {
  it.each(["Sel", "Poivre du moulin", "huile d'olive", "Pour la garniture :"])(
    "leaves %j exactly as published",
    (line) => {
      const result = scaled(line, 3);

      expect(result.text).toBe(line);
      expect(result.scaling).toBe("unscaled");
      expect(result.amount).toBeNull();
      expect(result.note).toContain("No quantity given");
    },
  );

  it("reads no number out of an article standing as a determiner", () => {
    const result = scaled("un oignon", 2);

    expect(result.text).toBe("un oignon");
    expect(result.scaling).toBe("unscaled");
  });

  it("reads no number out of a word that names an amount without stating one", () => {
    const result = scaled("un peu de sel", 2);

    expect(result.scaling).toBe("unscaled");
  });
});

describe("a factor of one", () => {
  it("hands the line back untouched rather than rewriting it", () => {
    const result = scaled("178 ml de lait", 1);

    expect(result.text).toBe("178 ml de lait");
    expect(result.scaling).toBe("scaled");
    expect(result.amount).toBe(178);
  });
});

describe("a mass or a volume", () => {
  it("multiplies exactly", () => {
    const result = scaled("200 g de farine", 2);

    expect(result.text).toBe("400 g de farine");
    expect(result.scaling).toBe("scaled");
    expect(result.unit).toBe("g");
  });

  it("climbs to the unit above once a full one of it is reached", () => {
    expect(textOf("200 g de farine", 10)).toBe("2 kg de farine");
    expect(textOf("100 g de farine", 9.99)).toBe("999 g de farine");
  });

  it("walks down before rounding, so a small share never rounds away", () => {
    expect(textOf("1 kg de sucre", 0.001)).toBe("1 g de sucre");
    expect(textOf("200 g de farine", 0.0005)).toBe("100 mg de farine");
  });

  it("writes half a litre in the unit below rather than as a fraction", () => {
    expect(textOf("1 l de lait", 0.5)).toBe("50 cl de lait");
  });

  it("keeps a quantity in the unit the page wrote when a bigger one cannot state it", () => {
    expect(textOf("1234 g de farine", 2)).toBe("2468 g de farine");
  });

  it("rounds in the unit the page wrote rather than walking down to state every digit", () => {
    expect(textOf("50 g de noisettes", 2 / 3)).toBe("33 g de noisettes");
  });

  it("walks down where the unit the page wrote is too coarse to hold the value", () => {
    expect(textOf("1,234 kg de farine", 1)).toBe("1,234 kg de farine");
    expect(textOf("0,617 kg de farine", 2)).toBe("1234 g de farine");
  });

  it("rounds to a step of five above a hundred", () => {
    const result = scaled("250 g de mascarpone", 1.7);

    expect(result.text).toBe("425 g de mascarpone");
    expect(result.scaling).toBe("scaled");
  });

  it("rounds to a step of one between ten and a hundred, and says so", () => {
    const result = scaled("30 g de beurre", 1.37);

    expect(result.text).toBe("41 g de beurre");
    expect(result.scaling).toBe("rounded");
    expect(result.note).toContain("Rounded");
  });

  it("keeps a tenth in the single digits, where a unit may be a livre", () => {
    const result = scaled("2,2 kg de boeuf", 0.5);

    expect(result.text).toBe("1,1 kg de boeuf");
    expect(result.scaling).toBe("scaled");
  });

  it("never asks for more than the page did when the recipe is made smaller", () => {
    const result = scaled("104 g de sucre", 0.99);

    expect(result.amount).toBeLessThanOrEqual(104);
    expect(result.text).toBe("104 g de sucre");
  });

  it("keeps two significant digits rather than deleting the ingredient", () => {
    const result = scaled("1 g de safran", 0.02);

    expect(result.text).toBe("20 mg de safran");
    expect(result.scaling).toBe("scaled");
  });

  it("says when a quantity falls below what a kitchen scale shows", () => {
    const result = scaled("1 mg de colorant", 0.02);

    expect(result.note).toContain("kitchen scale");
  });

  it("converts nothing between systems", () => {
    const result = scaled("1 livre de sucre", 2);

    expect(result.text).toBe("2 livres de sucre");
    expect(result.unit).toBe("livre");
  });
});

describe("a counted thing", () => {
  it("halves what a knife halves, and calls the arithmetic exact", () => {
    const result = scaled("5 gousses d'ail", 0.5);

    expect(result.text).toBe("2 1/2 gousses d'ail");
    expect(result.scaling).toBe("scaled");
  });

  it("keeps an oeuf whole, whichever side of the half the arithmetic fell on", () => {
    const result = scaled("3 oeufs", 0.5);

    expect(result.text).toBe("2 oeufs");
    expect(result.scaling).toBe("rounded");
  });

  it("keeps one oeuf rather than none, and says the line lost its share", () => {
    const result = scaled("1 oeuf", 0.1);

    expect(result.text).toBe("1 oeuf");
    expect(result.scaling).toBe("rounded");
    expect(result.note).toContain("no longer holds its share");
  });

  it("takes a vegetable to the quarter a knife makes of it", () => {
    const result = scaled("1 oignon", 0.25);

    expect(result.text).toBe("1/4 oignon");
    expect(result.scaling).toBe("scaled");
  });

  it("takes an échalote to a quarter, whose name opens on an accent", () => {
    const result = scaled("1 échalote", 0.25);

    expect(result.text).toBe("1/4 échalote");
    expect(result.scaling).toBe("scaled");
  });

  it("clamps a vegetable up to the quarter when the share falls below it", () => {
    const result = scaled("1 oignon", 0.1);

    expect(result.text).toBe("1/4 oignon");
    expect(result.scaling).toBe("rounded");
    expect(result.note).toContain("no longer holds its share");
  });

  it("offers a third where a knife goes further than the half", () => {
    expect(textOf("1 pomme", 0.4)).toBe("1/3 pomme");
  });

  it("stops a sachet at the half it splits on", () => {
    const result = scaled("1 sachet de levure", 0.1);

    expect(result.text).toBe("1/2 sachet de levure");
    expect(result.scaling).toBe("rounded");
  });

  it("keeps a jus at the half, since a quarter has to be poured back out", () => {
    expect(textOf("1 jus de citron", 0.25)).toBe("1/2 jus de citron");
  });

  it("keeps a blanc d'oeuf whole and a blanc de poulet at the half", () => {
    expect(textOf("1 blanc d'oeuf", 0.25)).toBe("1 blanc d'oeuf");
    expect(textOf("1 blanc de poulet", 0.25)).toBe("1/2 blanc de poulet");
  });

  it("counts a crevette whole, being a portion on its own", () => {
    expect(textOf("12 crevettes", 0.5)).toBe("6 crevettes");
    expect(textOf("1 crevette", 0.25)).toBe("1 crevette");
  });
});

describe("a spoon or a cup", () => {
  it("states a share in the smaller spoon rather than as a fraction of the larger", () => {
    expect(textOf("1 cuillère à soupe d'huile", 0.25)).toBe("3/4 cuillère à café d'huile");
  });

  it("keeps a half spoon where a kitchen owns one", () => {
    expect(textOf("1 cuillère à soupe d'huile", 0.5)).toBe("1/2 cuillère à soupe d'huile");
  });

  it("states a share of a cup in spoons", () => {
    expect(textOf("1 tasse de riz", 0.25)).toBe("4 cuillères à soupe de riz");
  });

  it("reads a spoon written in the abbreviations a page uses", () => {
    expect(scaled("2 c. à s. de sucre", 2).unit).toBe("cuillère à soupe");
    expect(scaled("1 c à c de sel", 3).unit).toBe("cuillère à café");
  });

  it("reads a measure whose plural mark the page put in brackets", () => {
    const result = scaled("4 cuillère(s) à soupe de crème", 2);

    expect(result.text).toBe("8 cuillères à soupe de crème");
  });
});

describe("an approximate measure", () => {
  it("multiplies the count and leaves the size of one to the cook", () => {
    const result = scaled("1 pincée de sel", 4);

    expect(result.text).toBe("4 pincées de sel");
    expect(result.scaling).toBe("scaled");
    expect(result.note).toContain("approximate measure");
    expect(result.note).toContain("half a teaspoon");
  });

  it("lands the count on a whole, since there is no half of a hand", () => {
    const result = scaled("1 pincée de sel", 0.5);

    expect(result.text).toBe("1 pincée de sel");
    expect(result.scaling).toBe("rounded");
  });

  it("reads a container the vocabulary has no entry for, from the grammar", () => {
    const result = scaled("1 bouquet de persil", 3);

    expect(result.text).toBe("3 bouquets de persil");
    expect(result.scaling).toBe("scaled");
  });

  it("converts an approximate measure into nothing else", () => {
    expect(scaled("2 poignées de roquette", 2).unit).toBe("poignée");
  });
});

describe("an article standing for a number", () => {
  it("reads une as one when a measure follows, and says so", () => {
    const result = scaled("une pincée de sel", 4);

    expect(result.text).toBe("4 pincées de sel");
    expect(result.note).toContain('"une" read as 1');
  });

  it("reads quelques as three, and says so", () => {
    const result = scaled("quelques feuilles de basilic", 2);

    expect(result.text).toBe("6 feuilles de basilic");
    expect(result.note).toContain('"quelques" read as 3');
  });
});

describe("a range", () => {
  it("scales both bounds and keeps the wording the page used", () => {
    const result = scaled("2 à 3 gousses d'ail", 2);

    expect(result.text).toBe("4 à 6 gousses d'ail");
    expect(result.amount).toBe(4);
    expect(result.amount_max).toBe(6);
    expect(result.scaling).toBe("scaled");
  });

  it("keeps a dash against the numbers", () => {
    expect(textOf("200-300 g de guanciale", 2)).toBe("400-600 g de guanciale");
  });

  it("chooses one unit for both bounds, from the smaller end", () => {
    expect(textOf("225 à 500 g de farine", 2)).toBe("450 à 1000 g de farine");
  });

  it("states one amount when both ends meet at this size, and says why", () => {
    const result = scaled("2 à 3 gousses d'ail", 0.2);

    expect(result.text).toBe("1/2 gousse d'ail");
    expect(result.amount_max).toBeNull();
    expect(result.note).toContain("both ends come to the same amount");
  });

  it("reads a descending pair as one amount rather than as a range", () => {
    expect(scaled("3-2 oeufs", 2).amount_max).toBeNull();
  });
});

describe("the words around the number", () => {
  it("agrees the head of the item with the count", () => {
    expect(textOf("1 morceau de sucre", 3)).toBe("3 morceaux de sucre");
    expect(textOf("2 choux", 0.5)).toBe("1 chou");
  });

  it("leaves a name that carries its own -s in the singular", () => {
    expect(textOf("2 ananas", 0.5)).toBe("1 ananas");
  });

  it("agrees an adjective the recipe put after the noun", () => {
    expect(textOf("1 piment entier", 4)).toBe("4 piments entiers");
  });

  it("leaves a trailing word it has no reading for", () => {
    expect(textOf("1 pomme Golden", 3)).toBe("3 pommes Golden");
  });

  it("elides the partitive before a vowel and before a silent h", () => {
    expect(textOf("1 cuillère à soupe d'huile", 2)).toBe("2 cuillères à soupe d'huile");
    expect(textOf("100 g d'amandes", 2)).toBe("200 g d'amandes");
  });

  it("keeps a measure singular below two, where French does", () => {
    expect(textOf("1 cuillère à soupe de sucre", 1.5)).toBe("1 1/2 cuillère à soupe de sucre");
  });
});

describe("a second quantity the reader did not take", () => {
  it("says the rest of the line was left as published", () => {
    const result = scaled("2 tranches de lard de 2 cm d'épaisseur", 2);

    expect(result.text).toContain("2 cm");
  });

  it("warns when a further measure sits in the item name", () => {
    const result = scaled("1 cuillère à soupe de sucre ou 1 cuillère à café de miel", 2);

    expect(result.note).toContain("further quantity");
  });
});

describe("a dimension or a percentage", () => {
  it("leaves it in the name rather than multiplying it", () => {
    expect(textOf("2 tranches de lard de 2 cm d'épaisseur", 2)).toContain("2 cm d'épaisseur");
  });
});

describe("a line whose quantity is zero", () => {
  it("stays at nothing rather than being clamped up to a share", () => {
    expect(textOf("0 g de farine", 2)).toBe("0 g de farine");
    expect(textOf("0 oeuf", 2)).toBe("0 oeuf");
    expect(textOf("0 cuillère à soupe de sucre", 2)).toBe("0 cuillère à soupe de sucre");
  });
});

describe("a line naming a measure and nothing else", () => {
  it("comes back as the measure alone", () => {
    expect(textOf("200 g", 2)).toBe("400 g");
    expect(textOf("2 oeufs", 1)).toBe("2 oeufs");
  });
});

describe("more of the words around the number", () => {
  it("takes a noun in -ou to its -x plural", () => {
    expect(textOf("1 chou", 2)).toBe("2 choux");
  });

  it("puts a trailing adjective back in the singular", () => {
    expect(textOf("4 piments entiers", 0.25)).toBe("1 piment entier");
  });

  it("counts a whole thing above one without rounding it", () => {
    expect(textOf("2 oeufs", 1.5)).toBe("3 oeufs");
  });

  it("rounds a divisible thing above one to the whole nearest it", () => {
    expect(textOf("5 gousses d'ail", 0.27)).toBe("1 gousse d'ail");
  });

  it("scales a line that is a bare figure", () => {
    expect(textOf("2", 2)).toBe("4");
  });
});

describe("scaleLines", () => {
  it("carries a heading through untouched and marks it as one", () => {
    const [heading, line] = scaleLines(
      [
        { text: "Pour la garniture :", is_heading: true },
        { text: "200 g de farine", is_heading: false },
      ],
      { factor: 2 },
    );

    expect(heading).toMatchObject({
      text: "Pour la garniture :",
      scaling: "unscaled",
      is_heading: true,
      amount: null,
    });
    expect(heading?.note).toBeUndefined();
    expect(line).toMatchObject({ text: "400 g de farine", is_heading: false });
  });
});
