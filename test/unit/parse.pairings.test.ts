/**
 * What reading a wine pairing has to establish.
 *
 * The rank is the whole of what the site claims about a wine: it says how well
 * one goes with a dish, in its own words, and it places five of them against
 * each other. A line the site wrote without a rank is therefore set aside
 * rather than given one, and nothing here scores or reorders what it read.
 */

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import type { SupertoinetteError } from "../../src/errors.js";
import {
  pairingIdFromHref,
  parsePairingIndex,
  parsePairingSheet,
} from "../../src/supertoinette/parsePairings.js";

const fixtures = join(dirname(fileURLToPath(import.meta.url)), "..", "fixtures");
const read = (name: string): string => readFileSync(join(fixtures, name), "utf8");

const SHEET_URL = "https://www.supertoinette.com/accords-mets-vins/2/veloute-de-gaverole.html";
const INDEX_URL = "https://www.supertoinette.com/accords-mets-vins";

const parseSheet = () => parsePairingSheet(read("pairing-sheet.html"), "2", SHEET_URL);

describe("parsePairingSheet", () => {
  it("names the dish by the heading the site gives it", () => {
    const { sheet } = parseSheet();

    expect(sheet.dish).toBe("Velouté de gaverole");
    expect(sheet.id).toBe("2");
    expect(sheet.url).toBe(SHEET_URL);
  });

  it("carries the style of wine the site opens with", () => {
    expect(parseSheet().sheet.style).toBe(
      "Un vin blanc sec assez puissant, au nez ouvert et à la bouche fraiche",
    );
  });

  it("keeps each rank in the site's own wording, and in its own order", () => {
    const { sheet } = parseSheet();

    expect(sheet.pairings.map((pairing) => pairing.rank)).toEqual([
      "Bon accord",
      "Très bon accord",
      "Excellent accord",
      "Accord quasi parfait",
      "Accord parfait",
    ]);
  });

  it("carries the wine as published, with whatever the site says about it", () => {
    const { sheet } = parseSheet();

    expect(sheet.pairings[0]?.wine).toBe("Coteaux de Varne - blanc sec assez puissant et rond");
    expect(sheet.pairings.at(-1)?.wine).toBe("Gaverole blanc");
  });

  it("sets aside a line the site wrote without a rank rather than giving it one", () => {
    const { sheet, skipped } = parseSheet();

    expect(sheet.pairings).toHaveLength(5);
    expect(skipped.some((reason) => reason.includes("Une ligne sans rang"))).toBe(true);
  });

  it("carries the recipes the site links beside the dish", () => {
    const { sheet } = parseSheet();

    expect(sheet.recipes).toEqual([
      {
        id: "4210",
        title: "Velouté de gaverole",
        url: "https://www.supertoinette.com/recette/4210/veloute-de-gaverole.html",
      },
    ]);
  });

  describe("a dish stripped of what the site usually prints", () => {
    const parseBare = () => parsePairingSheet(read("pairing-bare.html"), "3", SHEET_URL);

    it("names a dish the site gave no heading as holding none", () => {
      expect(parseBare().sheet.dish).toBe("");
    });

    it("renders an empty opening paragraph as no style at all", () => {
      expect(parseBare().sheet.style).toBeNull();
    });

    it("renders no recipe where the site linked none beside the dish", () => {
      expect(parseBare().sheet.recipes).toEqual([]);
    });
  });

  it("refuses a dish served without the wines it ranks", () => {
    try {
      parsePairingSheet(read("pairing-no-list.html"), "2", SHEET_URL);
      expect.unreachable("a dish without its wines is a failure");
    } catch (error) {
      expect((error as SupertoinetteError).code).toBe("parse_failure");
    }
  });

  it("refuses a page that is not a dish at all", () => {
    try {
      parsePairingSheet(read("pairing-not-a-sheet.html"), "2", SHEET_URL);
      expect.unreachable("a page that is not a dish is a failure");
    } catch (error) {
      expect((error as SupertoinetteError).code).toBe("parse_failure");
    }
  });
});

describe("parsePairingIndex", () => {
  const parseIndex = () => parsePairingIndex(read("pairing-index.html"), INDEX_URL);

  it("reads the dishes, with the identifier to open each", () => {
    expect(parseIndex().entries).toEqual([
      {
        id: "1",
        dish: "Aligot de Varne",
        url: "https://www.supertoinette.com/accords-mets-vins/1/aligot-de-varne.html",
      },
      {
        id: "2",
        dish: "Velouté de gaverole",
        url: "https://www.supertoinette.com/accords-mets-vins/2/veloute-de-gaverole.html",
      },
    ]);
  });

  it("leaves out a link that opens onto no dish", () => {
    expect(parseIndex().entries.map((entry) => entry.dish)).not.toContain(
      "Un lien hors de l'index",
    );
  });

  it("reads the last page from the numbers the site lists", () => {
    expect(parseIndex().last_page).toBe(42);
  });

  it("reads a page of the index the site drew no numbers on as one page", () => {
    const { last_page: lastPage, entries } = parsePairingIndex(
      read("pairing-index-bare.html"),
      INDEX_URL,
    );

    expect(lastPage).toBe(1);
    expect(entries).toHaveLength(1);
  });

  it("reads a block of page numbers the site drew empty as one page", () => {
    const html = read("pairing-index.html").replace(
      /<ul class="pagination"[\s\S]*?<\/ul>/,
      '<ul class="pagination"></ul>',
    );

    expect(parsePairingIndex(html, INDEX_URL).last_page).toBe(1);
  });

  it("refuses a page that is not the index at all", () => {
    try {
      parsePairingIndex(read("pairing-not-a-sheet.html"), INDEX_URL);
      expect.unreachable("a page that is not the index is a failure");
    } catch (error) {
      expect((error as SupertoinetteError).code).toBe("parse_failure");
    }
  });
});

describe("pairingIdFromHref", () => {
  it("finds the identifier in a dish link", () => {
    expect(pairingIdFromHref("/accords-mets-vins/10/aligot.html")).toBe("10");
    expect(pairingIdFromHref("/accords-mets-vins/10/aligot")).toBe("10");
  });

  it("finds nothing in a link that leads elsewhere", () => {
    expect(pairingIdFromHref("/accords-mets-vins")).toBeNull();
    expect(pairingIdFromHref("/recette/1/x.html")).toBeNull();
    expect(pairingIdFromHref("/accords-mets-vins/abc/x.html")).toBeNull();
  });
});
