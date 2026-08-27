/**
 * Reading the quantity a line opens with, and writing one back.
 *
 * An ingredient line is a number, a measure and a name, in that order, and any
 * of the three may be missing. What matters here is refusing to read a number
 * where the line wrote none: "un oignon" names a vegetable and no amount, and
 * multiplying an article the line used as a determiner would put a figure on a
 * page that never claimed one.
 */

import type { UnitInfo } from "./units.js";
import { lookupUnit, readPartitiveMeasure } from "./units.js";

/** Captured whole rather than in a group, so the reading needs no fallback. */
const DECIMAL = /^\d+(?:[.,]\d+)?/;
const MIXED_FRACTION = /^(\d+)\s+(\d+)\s*\/\s*(\d+)/;
const SIMPLE_FRACTION = /^(\d+)\s*\/\s*(\d+)/;
const RANGE_JOINER = /^\s+(à|a|ou)\s+/i;
const LEADING_DASH = /^\s*(–|—|-)\s*/;
const OPENING_ARTICLE = /^\s*(un|une|quelques)\b\s*/i;
const LEADING_PARTITIVE = /^(?:de\s+la\s+|de\s+l'|d'|de\s+|du\s+|des\s+)/i;
const MEASURE_PARTITIVE = /^(?:de\s+la\s+|de\s+l'|d'|de\s+|du\s+|des\s+)/i;
const LEADING_WORD = /^\s*(\p{L}+)\s+/u;
const WHITESPACE = /\s+/;

/** Unicode vulgar fractions, which hand-written recipes use freely. */
const VULGAR_FRACTIONS: Record<string, number> = {
  "½": 0.5,
  "⅓": 1 / 3,
  "⅔": 2 / 3,
  "¼": 0.25,
  "¾": 0.75,
  "⅕": 0.2,
  "⅖": 0.4,
  "⅗": 0.6,
  "⅘": 0.8,
  "⅙": 1 / 6,
  "⅚": 5 / 6,
  "⅛": 0.125,
  "⅜": 0.375,
  "⅝": 0.625,
  "⅞": 0.875,
};

const VULGAR_CLASS = Object.keys(VULGAR_FRACTIONS).join("");
const MIXED_GLYPH = new RegExp(`^(\\d+)\\s*([${VULGAR_CLASS}])`);

/**
 * How many an article stands for.
 *
 * "quelques" is not a number the page wrote, and it is not nothing either: a
 * cook reading it takes a few. Three is what a few comes to, and the answer
 * says so rather than letting the reading pass unremarked.
 */
const ARTICLE_AMOUNTS: Record<string, number> = { un: 1, une: 1, quelques: 3 };

export interface ParsedQuantity {
  amount: number;
  /** Characters consumed from the start of the line. */
  length: number;
}

/**
 * Read a leading amount.
 *
 * Handles, in order of precedence: a whole number followed by a fraction, in
 * either the glyph form "3 ¼" or the written form "1 1/2"; a bare fraction; a
 * bare glyph; and a decimal, which French writes with a comma.
 *
 * Returns null when the line does not start with a number, which is the normal
 * case for "sel" or "poivre du moulin".
 */
export function parseLeadingQuantity(text: string): ParsedQuantity | null {
  const trimmed = text.trimStart();
  const offset = text.length - trimmed.length;

  // "3 ¼" and "3¼" before the bare "3", so the longest reading wins.
  const mixedGlyph = MIXED_GLYPH.exec(trimmed);
  if (mixedGlyph !== null) {
    /* v8 ignore next -- the pattern matched one of the glyphs it was built from,
       so both the group and the lookup are there. */
    const fraction = VULGAR_FRACTIONS[mixedGlyph[2] ?? ""] ?? Number.NaN;
    return { amount: Number(mixedGlyph[1]) + fraction, length: offset + mixedGlyph[0].length };
  }

  const mixed = MIXED_FRACTION.exec(trimmed);
  if (mixed !== null && Number(mixed[3]) !== 0) {
    return {
      amount: Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]),
      length: offset + mixed[0].length,
    };
  }

  const fraction = SIMPLE_FRACTION.exec(trimmed);
  if (fraction !== null) {
    // A denominator of zero is not a quantity. Reading the numerator alone
    // would leave "/0" in the item name and scale a number nobody wrote.
    if (Number(fraction[2]) === 0) {
      return null;
    }
    return {
      amount: Number(fraction[1]) / Number(fraction[2]),
      length: offset + fraction[0].length,
    };
  }

  const glyph = trimmed[0];
  if (glyph !== undefined && glyph in VULGAR_FRACTIONS) {
    /* v8 ignore next -- the glyph was just found in the table. */
    return { amount: VULGAR_FRACTIONS[glyph] ?? Number.NaN, length: offset + 1 };
  }

  const plain = DECIMAL.exec(trimmed);
  if (plain !== null) {
    const figure = plain[0];
    return { amount: Number(figure.replace(",", ".")), length: offset + figure.length };
  }

  return null;
}

export interface ParsedRange extends ParsedQuantity {
  /** Upper bound. `amount` carries the lower one. */
  max: number;
  /** How the range was written, so the rewrite can keep the same shape. */
  separator: string;
}

/**
 * Read a leading range such as "2 à 3", "3-4" or "225–500".
 *
 * Recipes use ranges where the exact amount is the cook's call, and both bounds
 * describe the same quantity. Reading only the first one is worse than reading
 * neither: the second number survives unscaled into the answer and contradicts
 * it.
 *
 * A descending pair is not a range. "1/2 3" is two amounts this has no business
 * joining, and a dash between two numbers is a range only when the second is
 * the larger.
 */
export function parseLeadingRange(text: string): ParsedRange | null {
  const low = parseLeadingQuantity(text);
  if (low === null) {
    return null;
  }

  const after = text.slice(low.length);
  // A written separator needs whitespace around it, so "5 oignons" is not read
  // as a bound followed by something unreadable.
  const separator = RANGE_JOINER.exec(after) ?? LEADING_DASH.exec(after);
  if (separator === null) {
    return null;
  }

  const high = parseLeadingQuantity(after.slice(separator[0].length));
  if (high === null || high.amount <= low.amount) {
    return null;
  }

  return {
    amount: low.amount,
    max: high.amount,
    /* v8 ignore next -- either pattern that matched carries its group. */
    separator: separator[1] ?? "",
    length: low.length + separator[0].length + high.length,
  };
}

/** The measure a line names after its figure, and what stands after it. */
export interface TakenUnit {
  unit: UnitInfo | null;
  rest: string;
}

/** At most this many words make up a measure, which is what "cuillère à soupe" takes. */
const LONGEST_MEASURE_WORDS = 3;

/**
 * Take the measure standing at the front of what follows a figure.
 *
 * The candidate is built from the words the page wrote and handed to the
 * vocabulary, which normalizes it. Matching a normalized string and then
 * cutting the published one at the length that matched would misplace the cut
 * wherever normalizing changes the length, which it does for an accent written
 * as two code points and for the "(s)" a page adds when it does not know how
 * many there will be.
 *
 * The longest candidate is tried first, so "cuillère à soupe" wins over a
 * shorter word inside it. A measure may stand behind the word introducing it,
 * as in "3/4 de tasse", and the two spellings name one quantity.
 */
export function takeUnit(text: string): TakenUnit {
  const withoutPartitive = text.replace(MEASURE_PARTITIVE, "").trimStart();
  const words = withoutPartitive.split(WHITESPACE);

  for (let count = Math.min(LONGEST_MEASURE_WORDS, words.length); count >= 1; count -= 1) {
    const unit = lookupUnit(words.slice(0, count).join(" "));
    if (unit !== null) {
      return { unit, rest: afterWords(withoutPartitive, words, count) };
    }
  }

  // A container or a gesture the vocabulary has no entry for is read from the
  // grammar that puts it between the amount and what it measures.
  const partitive = readPartitiveMeasure(withoutPartitive);
  if (partitive !== null) {
    return { unit: partitive.unit, rest: stripPartitive(partitive.rest) };
  }

  return { unit: null, rest: stripPartitive(withoutPartitive) };
}

/** What stands after the first `count` words, with the partitive taken off. */
function afterWords(text: string, words: string[], count: number): string {
  let index = 0;
  for (const word of words.slice(0, count)) {
    index = text.indexOf(word, index) + word.length;
  }
  return stripPartitive(text.slice(index));
}

const stripPartitive = (text: string): string =>
  text.trimStart().replace(LEADING_PARTITIVE, "").trim();

/** One line read apart: what it counts, in what measure, of what. */
export interface ParsedIngredient {
  amount: number | null;
  /** Upper bound when the line gives a range, null otherwise. */
  amountMax: number | null;
  /** The word or sign a range was written with. */
  rangeSeparator: string | null;
  unit: UnitInfo | null;
  /** What is being measured, as the line named it. */
  item: string;
  /** The article the line used in place of a figure, when it used one. */
  articleWord: string | null;
}

/**
 * Read one ingredient line.
 *
 * An article counts as a quantity only when a measure follows it, because that
 * is where it stands for a number: "une pincée" is one pinch, while "un oignon"
 * names a vegetable and no amount at all. Reading the second as the first would
 * multiply a number the line never wrote.
 */
export function parseIngredient(line: string): ParsedIngredient {
  const text = line.trim();

  const range = parseLeadingRange(text);
  if (range !== null) {
    const taken = takeUnit(text.slice(range.length).trimStart());
    return {
      amount: range.amount,
      amountMax: range.max,
      rangeSeparator: range.separator,
      unit: taken.unit,
      item: taken.rest,
      articleWord: null,
    };
  }

  const quantity = parseLeadingQuantity(text);
  if (quantity !== null) {
    const taken = takeUnit(text.slice(quantity.length).trimStart());
    return {
      amount: quantity.amount,
      amountMax: null,
      rangeSeparator: null,
      unit: taken.unit,
      item: taken.rest,
      articleWord: null,
    };
  }

  const article = OPENING_ARTICLE.exec(text);
  if (article !== null) {
    const taken = takeUnit(text.slice(article[0].length));
    /* v8 ignore next -- the pattern that matched carries its group. */
    const word = article[1] ?? "";
    const stood = ARTICLE_AMOUNTS[word.toLowerCase()];
    // Without a measure the article is a determiner, so the line keeps every
    // word it was written with and reports no quantity.
    if (taken.unit !== null && stood !== undefined) {
      return {
        amount: stood,
        amountMax: null,
        rangeSeparator: null,
        unit: taken.unit,
        item: taken.rest,
        articleWord: word,
      };
    }
  }

  return {
    amount: null,
    amountMax: null,
    rangeSeparator: null,
    unit: null,
    item: text,
    articleWord: null,
  };
}

export interface FormatAmountOptions {
  /**
   * Whether to snap near-fractions to 1/4, 1/3, 1/2, 2/3 and 3/4.
   *
   * True for things a cook counts or spoons out: "1/3 tasse" is how a kitchen
   * expresses it, "0,33 tasse" is not. False for mass and volume, which are
   * decimal by nature: nobody weighs "8 1/3 kg" of sugar, they weigh 8,33 kg.
   */
  fractions?: boolean;
}

/** The fractions a kitchen writes, and how close a value has to sit to one. */
const KITCHEN_FRACTIONS: [number, string][] = [
  [0.25, "1/4"],
  [1 / 3, "1/3"],
  [0.5, "1/2"],
  [2 / 3, "2/3"],
  [0.75, "3/4"],
];
const FRACTION_TOLERANCE = 0.02;

/** Render an amount the way a French recipe writes it, comma and all. */
export function formatAmount(amount: number, options: FormatAmountOptions = {}): string {
  if (!Number.isFinite(amount)) {
    return "";
  }
  if (Number.isInteger(amount)) {
    return String(amount);
  }
  if (options.fractions === false) {
    return decimal(amount);
  }

  const whole = Math.floor(amount);
  const rest = amount - whole;
  for (const [value, label] of KITCHEN_FRACTIONS) {
    if (Math.abs(rest - value) < FRACTION_TOLERANCE) {
      return whole > 0 ? `${whole} ${label}` : label;
    }
  }

  return decimal(amount);
}

/**
 * Two decimals is finer than any kitchen resolves, and for anything smaller
 * than that it is zero. A quantity that survived being divided a thousandfold
 * must not be handed back as none of the ingredient, so below that point the
 * significant digits are what gets written.
 */
function decimal(value: number): string {
  const rounded =
    value !== 0 && Math.abs(value) < 0.01
      ? Number(value.toPrecision(2))
      : Math.round(value * 100) / 100;
  return String(rounded).replace(".", ",");
}

/** The word a line opens with, for a reader deciding what it names. */
export function leadingWord(text: string): string | null {
  return LEADING_WORD.exec(text)?.[1] ?? null;
}
