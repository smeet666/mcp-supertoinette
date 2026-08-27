/**
 * Multiplying an ingredient line, and saying how exact the result is.
 *
 * Nothing is multiplied blindly. A countable thing lands on the smallest share
 * a cook can take out of one of it, which depends on the thing: a gousse
 * halves, an oeuf does not, an oignon goes to quarters under a knife. A
 * measurement moves to a smaller unit before it is rounded, so a small share
 * never rounds away to nothing. A line carrying nothing multipliable is left as
 * published and flagged.
 *
 * The three values of `scaling` carry the whole honesty of this module.
 * `scaled` means the number rendered is the product itself. `rounded` means the
 * value moved, or a floor was reached. `unscaled` means the line carries no
 * readable quantity.
 */

import type { ScaledIngredient } from "../types.js";
import { formatAmount, type ParsedIngredient, parseIngredient } from "./quantity.js";
import type { Divisibility, UnitInfo } from "./units.js";
import {
  approximateEquivalent,
  chooseReadableUnit,
  demoteUnit,
  formatUnit,
  frenchPlural,
  hasEmbeddedMeasure,
  isSpoonMeasure,
  QUARTERED_MEASURE,
  unitDivisibility,
} from "./units.js";

const COMBINING_MARK = /[̀-ͯ]/g;
const LIGATURE_OE = /œ/g;
/**
 * A noun whose singular already carries a sibilant, which therefore takes no
 * plural mark: ananas, radis, couscous, anis.
 *
 * A vowel before the final -s is what separates one of these from an ordinary
 * plural, where the -s follows a consonant as in "oeufs".
 */
const ALREADY_SIBILANT = /(?:[aiou]s|z)$/i;
const VOWEL_OPENING = /^[aeiouàâäéèêëîïôöûü]/i;
const PLURAL_ENDING = /(?:s|x)$/i;
const OU_ENDING = /ou$/i;
/** A range written with a dash, which stays against the numbers. */
const DASH_SEPARATOR = /^[-–—]$/;

/**
 * "de" becomes "d'" before a vowel sound.
 *
 * The h is the hard case: it is silent in "huile" and sounded in "haricot", and
 * only a word list separates them. Elision is therefore limited to vowels plus
 * the handful of h-words a recipe actually uses, because "de haricots" merely
 * reads as careless while "d'haricots" reads as wrong.
 */
const MUTE_H_WORDS = /^(?:huile|huiles|hu[iî]tres?|herbes?|hysope)\b/i;

/* -------------------------------------------------------------------------- */
/* Rounding                                                                    */
/* -------------------------------------------------------------------------- */

/** Round to a step, keeping two decimals at most. */
function roundTo(value: number, step: number): number {
  return Math.round(Math.round(value / step) * step * 100) / 100;
}

/**
 * Round a measured amount to something a kitchen scale can show.
 *
 * Large amounts do not need fine precision and small ones do, so the step grows
 * with the value rather than being fixed. The step stays a tenth in the single
 * digits because a unit can be a livre as easily as a gram, and rounding 2,2
 * livres to 2 would throw away a tenth of the ingredient.
 *
 * A whole number is already what a scale shows, so it is left where the
 * arithmetic put it: 1234 g doubled is 2468 g, and a step of five grams would
 * report 2470 for a product that needed no rounding at all.
 */
function roundMeasured(value: number): number {
  if (Number.isInteger(value)) {
    return value;
  }
  if (value >= 100) {
    return roundTo(value, 5);
  }
  if (value >= 10) {
    return roundTo(value, 1);
  }
  if (value >= 1) {
    return roundTo(value, 0.1);
  }
  return Math.round(value * 100) / 100;
}

/** Below this there is nothing a kitchen can measure out of a spoonful. */
const SMALLEST_USABLE_FRACTION = 0.25;

/** The smallest share of one thing that is still worth putting in a bowl. */
const SMALLEST_USABLE: Record<Divisibility, number> = { whole: 1, half: 0.5, quarter: 0.25 };

/** True when a number is a whole or a half, to the last bit of precision. */
function isHalfStep(value: number): boolean {
  return Math.abs(value * 2 - Math.round(value * 2)) < 1e-9;
}

/** Two decimals, which is finer than any kitchen resolves. */
function trim(value: number): number {
  return Math.round(value * 100) / 100;
}

interface Rounded {
  value: number;
  /** The floor was hit, so this line no longer holds its share of the recipe. */
  clamped: boolean;
}

/** The candidate in a list that sits closest to a value. */
function nearest(value: number, candidates: number[], fallback: number): number {
  /* v8 ignore next -- every caller filters against a ceiling that is at least
     the floor, so the shortest list it can build still holds the floor. */
  let closest = candidates[0] ?? fallback;
  for (const candidate of candidates) {
    if (Math.abs(value - candidate) < Math.abs(value - closest)) {
      closest = candidate;
    }
  }
  return closest;
}

/**
 * Round a counted thing to an amount a kitchen produces.
 *
 * A count lands on a whole. The one exception is a share that comes out on a
 * half by itself, for a thing a knife can halve: half a gousse d'ail is a real
 * amount, and rounding it up to a whole adds a fifth of the garlic to a recipe
 * that asked for five.
 *
 * How finely the thing divides decides the floor. Under that floor the amount
 * is clamped up rather than shrunk towards nothing, which keeps the ingredient
 * in the recipe at the cost of its proportion, and the caller is told through
 * `clamped`. The ceiling stops a shrinking recipe from ever asking for more
 * than it started with.
 */
function roundCountable(value: number, divisibility: Divisibility, ceiling: number): Rounded {
  if (value <= 0) {
    return { value: 0, clamped: false };
  }

  const floor = SMALLEST_USABLE[divisibility];

  if (divisibility !== "whole" && value >= floor && isHalfStep(value)) {
    return { value: trim(value), clamped: false };
  }

  if (divisibility === "whole") {
    // Below the halfway mark the nearest whole is none, and dropping the
    // ingredient is worse than overstating it, so the line keeps one and says
    // it no longer holds its share.
    return value < 0.5
      ? { value: floor, clamped: true }
      : { value: Math.round(value), clamped: false };
  }

  if (value < floor) {
    return { value: floor, clamped: true };
  }

  if (value < 1) {
    // A knife takes a vegetable to quarters and thirds; anything else offers
    // the half it can be split on.
    const steps = divisibility === "quarter" ? [0.25, 1 / 3, 0.5, 2 / 3, 0.75, 1] : [0.5, 1];
    const candidates = steps.filter(
      (candidate) => candidate >= floor && candidate <= Math.max(ceiling, floor),
    );
    return { value: trim(nearest(value, candidates, floor)), clamped: false };
  }

  return { value: Math.round(value), clamped: false };
}

/**
 * Round a spoon or a cup, which a kitchen measures out in halves and in the
 * fractions printed on a measuring set.
 */
function roundSpoon(value: number, ceiling: number): Rounded {
  if (value <= 0) {
    return { value: 0, clamped: false };
  }

  if (value < 1) {
    const candidates = [SMALLEST_USABLE_FRACTION, 1 / 3, 0.5, 2 / 3, 0.75, 1].filter(
      (candidate) => candidate <= Math.max(ceiling, SMALLEST_USABLE_FRACTION),
    );
    return {
      value: trim(nearest(value, candidates, SMALLEST_USABLE_FRACTION)),
      clamped: value < SMALLEST_USABLE_FRACTION,
    };
  }

  return { value: roundTo(value, 0.5), clamped: false };
}

/**
 * Walk a spoon or a cup down to the smaller spoon while the amount sits under
 * one, so a share is stated in a measure that exists.
 *
 * An amount already on a whole or a half stays where the line put it: half a
 * cuillère à soupe is a spoon a kitchen owns, and there is nothing to gain by
 * calling it a cuillère à café et demie.
 */
function stepDownSpoon(unit: UnitInfo, reference: number): { unit: UnitInfo; ratio: number } {
  let current = unit;
  let ratio = 1;

  while (reference * ratio < 1 && !isHalfStep(reference * ratio)) {
    const step = demoteUnit(current);
    if (step === null) {
      break;
    }
    ratio *= step.per;
    current = step.unit;
  }

  return { unit: current, ratio };
}

/**
 * How close a result has to be to the exact product to be called exact.
 *
 * Two tests, because one of them alone is wrong at some scale. An absolute gap
 * of a hundredth is beneath what a kitchen resolves at ordinary sizes, and at a
 * hundredth of a millilitre it is the whole quantity: 0,006 rounded to 0,01
 * sits inside the absolute gap while being two thirds larger than what was
 * asked for. A share of half a percent catches that without calling ordinary
 * rounding inexact.
 */
const EXACT_WITHIN = 0.01;
const EXACT_SHARE = 0.005;

function landedExactly(exact: number, amount: number): boolean {
  const gap = Math.abs(exact - amount);
  if (gap > EXACT_WITHIN) {
    return false;
  }
  return exact === 0 || gap / Math.abs(exact) <= EXACT_SHARE;
}

interface ScaledBound {
  amount: number;
  clamped: boolean;
  /** The exact product in the unit the recipe wrote, for a readable note. */
  raw: number;
  /** How many of the unit that came back fit in one of the unit the recipe wrote. */
  ratio: number;
}

/**
 * Whether a bound came out as the exact product, judged in the finer of the two
 * units involved.
 *
 * An absolute tolerance only means what it says at one scale. Read in kilos, a
 * hundredth is ten grams, so a quantity moved from 2468 g to 2470 g would pass
 * as exact for being 0,002 kg away; read in grams, the same gap is two grams
 * and the answer is that the value moved.
 */
function boundLandedExactly(bound: ScaledBound): boolean {
  const fine = Math.max(bound.ratio, 1);
  return landedExactly(bound.raw * fine, bound.amount * (fine / bound.ratio));
}

interface ScaledMeasure {
  /**
   * One bound for a single measure, two for a range, in that order. The shape
   * says so, because every reader takes the first without checking: a measure
   * that scaled to nothing is not a thing this can produce.
   */
  bounds: [ScaledBound, ...ScaledBound[]];
  /** The unit every bound is expressed in, which both ends of a range share. */
  unit: UnitInfo | null;
}

/**
 * Scale one measure, both ends of a range together.
 *
 * The unit is chosen once, from the smaller end of a range, and applied to
 * every bound. Both ends have to share one unit, or "450 à 1000 g" comes back
 * as "0,45 à 1 kg", where the small end has been rounded away. A large number
 * in a small unit is merely long to read.
 *
 * A measurement walks down to a smaller unit before it is rounded, so a
 * quantity divided a thousandfold never rounds to zero and states that the
 * recipe needs none of it.
 */
function scaleMeasure(
  low: number,
  high: number | null,
  unit: UnitInfo | null,
  factor: number,
  divisibility: Divisibility,
): ScaledMeasure {
  interface End {
    published: number;
    raw: number;
  }

  const ends: [End, ...End[]] =
    high === null
      ? [{ published: low, raw: low * factor }]
      : [
          { published: low, raw: low * factor },
          { published: high, raw: high * factor },
        ];

  const eachEnd = <T>(read: (end: End) => T): [T, ...T[]] => [
    read(ends[0]),
    ...ends.slice(1).map(read),
  ];

  const positive = ends.map((end) => end.raw).filter((raw) => raw > 0);
  const reference = positive.length > 0 ? Math.min(...positive) : low * factor;

  /** Both bounds share one unit, and each keeps the precision that unit affords. */
  const inUnit = (target: UnitInfo, ratio: number): ScaledMeasure => ({
    bounds: eachEnd(({ published, raw }) => {
      const exact = raw * ratio;
      // The rounding happens in the smaller of the two units, so moving to a
      // bigger one never throws away precision the page wrote: 1500 g rounded
      // as kilos is 2, and rounded as grams it is the 1,5 kg a scale shows.
      const rounded =
        ratio < 1 ? Number((roundMeasured(raw) * ratio).toPrecision(12)) : roundMeasured(exact);
      // At the bottom of a ladder, keep what precision is left rather than
      // deleting the ingredient.
      /* v8 ignore next -- a product of zero rounds to zero, so the two halves of
         this test cannot both be false at once. */
      const usable = rounded === 0 && exact > 0 ? Number(exact.toPrecision(2)) : rounded;
      // Rounding to a step of five grams above a hundred can round upwards, and
      // a recipe being made smaller must never come out asking for more than
      // the page published.
      const ceiling = factor < 1 ? published * ratio : Number.POSITIVE_INFINITY;
      return { amount: Math.min(usable, ceiling), clamped: false, raw, ratio };
    }),
    unit: target,
  });

  if (unit !== null && unit.kind === "measured") {
    const chosen = chooseReadableUnit(unit, reference);
    return inUnit(chosen.unit, chosen.ratio);
  }

  if (unit !== null && isSpoonMeasure(unit)) {
    const stepped = stepDownSpoon(unit, reference);
    // A share stated in the smaller spoon is a measurement, and keeps the
    // precision of one rather than being snapped to the fractions of a spoon it
    // no longer fills.
    if (stepped.ratio !== 1) {
      return inUnit(stepped.unit, stepped.ratio);
    }

    return {
      bounds: eachEnd(({ published, raw }) => {
        const rounded = roundSpoon(raw, factor < 1 ? published : Number.POSITIVE_INFINITY);
        return { amount: rounded.value, clamped: rounded.clamped, raw, ratio: 1 };
      }),
      unit,
    };
  }

  return {
    bounds: eachEnd(({ published, raw }) => {
      // Scaling down must never end up asking for more than the recipe did.
      const rounded = roundCountable(
        raw,
        divisibility,
        factor < 1 ? published : Number.POSITIVE_INFINITY,
      );
      return { amount: rounded.value, clamped: rounded.clamped, raw, ratio: 1 };
    }),
    unit,
  };
}

/* -------------------------------------------------------------------------- */
/* How far a counted thing divides                                             */
/* -------------------------------------------------------------------------- */

/**
 * Accents removed and the ligature spelled out, so "échalote" and "echalote"
 * hit one entry.
 *
 * A word boundary sits between an ASCII letter and a non-letter and nowhere
 * else, so a pattern opening on "é" never matches at the start of a word:
 * folding the item is what lets the lists below be written in plain letters.
 */
function foldItem(item: string): string {
  return item.normalize("NFD").replace(COMBINING_MARK, "").replace(LIGATURE_OE, "oe");
}

/**
 * Things a kitchen takes one of or none of.
 *
 * An oeuf comes out of its shell whole, and so does the jaune or the blanc a
 * recipe asks for on its own: half of one means beating it and weighing the
 * result, which no recipe asks for, and there is no way to keep the other half.
 *
 * The list is short on purpose, and a word joins it only when half of the thing
 * is genuinely not something a cook can measure out. A clou de girofle is a
 * dried flower bud, dropped into the pot and fished back out of it. A zeste is
 * what comes off one fruit in one go, and a share of one names no amount a cook
 * stops at.
 */
const WHOLE_ITEM = /\b(?:oeufs?|jaunes?\s+d['e]|clous?|zestes?)\b/iu;

/**
 * Foods already a portion on their own.
 *
 * A crevette, a moule, a noisette, a grain de poivre is what a recipe counts
 * five, twelve or twenty of, and a cook taking a share puts one fewer in the
 * pan. Cutting one in two is not a thing a kitchen does.
 */
const PORTION_SIZED_ITEM =
  /\b(?:crevettes?|gambas|moules?|noisettes?|grains?|genievres?|badianes?|anis)\b/iu;

/**
 * A jus, the one counted thing whose division stops at the half.
 *
 * Half the juice of a citron is taken by squeezing half the fruit, which is a
 * step a recipe writes. A quarter of one has to be poured out and measured
 * back, and no recipe asks for that. It reads before the fruit, which a knife
 * divides further on its own.
 */
const HALVED_ITEM = /\bjus\b/iu;

/**
 * A piece carved off a bird or off a joint, which stops at the half.
 *
 * The whole animal divides by the knife that portions it, and one of these is
 * already the portion that knife produced: a cuisse feeds one, and half of one
 * is the share a smaller recipe serves. Taking a quarter would name a piece no
 * one plates. It reads before the animal, and before the vegetable a line often
 * names beside the meat.
 */
const HALVED_CUT = /\b(?:cuisses?|ailes?|pilons?|escalopes?|magrets?|filets?\s+de)\b/iu;

/**
 * Produce a knife takes to quarters.
 *
 * A recipe asks for one or for two of these, and the share it wants out of one
 * is decided by a knife. A quarter of one is a piece someone serves, and what
 * is left keeps.
 */
const QUARTERED_ITEM =
  /\b(?:oignons?|echalotes?|pommes?\s+de\s+terre|carottes?|pommes?|poires?|citrons?|oranges?|tomates?|concombres?|courgettes?|aubergines?|potirons?|courges?|choux?|melons?|pasteques?|poivrons?|betteraves?|navets?|panais|poireaux?|bananes?|mangues?|avocats?|ananas|peches?|abricots?|gigots?|fromages?|chevres?|camemberts?|reblochons?|poulets?|pintades?|rotis?|baguettes?|buches?|chorizos?)\b/iu;

/**
 * How far a "blanc" divides, when a line names one.
 *
 * The word covers two foods that answer the question in opposite ways. The
 * blanc of an oeuf goes with the oeuf and the jaune: half of one would have to
 * be beaten and weighed. A blanc de poulet is a piece of meat, and half of one
 * is a portion a knife cuts and a fridge keeps.
 *
 * The noun is the one followed by what it is the blanc of. "vin blanc" uses the
 * same letters as a colour and counts as neither.
 */
const BLANC_OF = /\bblancs?\s+d(?:e\s|['’])/iu;
const BLANC_OF_EGG = /\bblancs?\s+d(?:e\s|['’])\s*oeufs?\b/iu;

function blancDivisibility(item: string): Divisibility | null {
  if (!BLANC_OF.test(item)) {
    return null;
  }
  return BLANC_OF_EGG.test(item) ? "whole" : "half";
}

/**
 * How finely a counted thing divides.
 *
 * The measure answers first when the line names one, because what is being
 * counted is then the measure rather than the food. Where the line counts bare
 * pieces, the food decides.
 */
function divisibilityOf(unit: UnitInfo | null, item: string): Divisibility {
  if (unit !== null) {
    return unitDivisibility(unit);
  }

  const key = foldItem(item);
  const blanc = blancDivisibility(key);
  if (blanc !== null) {
    return blanc;
  }
  if (WHOLE_ITEM.test(key) || PORTION_SIZED_ITEM.test(key)) {
    return "whole";
  }
  if (HALVED_ITEM.test(key) || HALVED_CUT.test(key)) {
    return "half";
  }
  if (QUARTERED_MEASURE.test(key) || QUARTERED_ITEM.test(key)) {
    return "quarter";
  }
  return "half";
}

/* -------------------------------------------------------------------------- */
/* Agreement between a number and the thing it counts                          */
/* -------------------------------------------------------------------------- */

/**
 * Names of food that read the same whatever the number.
 *
 * Some are mass nouns a recipe counts in spoons rather than in units, and some
 * carry their -s in the singular. An -s added to one of them names a thing no
 * shop sells.
 */
const INVARIABLE_ITEM = new Set([
  "ail",
  "ananas",
  "anis",
  "beurre",
  "cassis",
  "couscous",
  "creme",
  "eau",
  "farine",
  "huile",
  "jus",
  "lait",
  "mais",
  "miel",
  "pain",
  "persil",
  "poivre",
  "riz",
  "sel",
  "sucre",
  "thym",
  "vin",
  "vinaigre",
]);

/**
 * Adjectives a French recipe puts after the noun, and which take a plain -s.
 *
 * A French adjective agrees with the noun it qualifies, so "1 piment entier"
 * counted four times reads "4 piments entiers". Only this list is declined: an
 * unknown trailing word can be a brand, a proper noun or a phrase whose head
 * sits elsewhere, and a word left as the recipe wrote it reads as faithful
 * where an invented ending reads as wrong.
 */
const AGREEABLE_ADJECTIVES = new Set([
  "entier",
  "entiere",
  "moyen",
  "moyenne",
  "petit",
  "petite",
  "grand",
  "grande",
  "gros",
  "grosse",
  "mur",
  "mure",
  "vert",
  "verte",
  "rouge",
  "jaune",
  "noir",
  "noire",
  "blanc",
  "blanche",
  "rond",
  "ronde",
  "hache",
  "hachee",
  "coupe",
  "coupee",
  "rape",
  "rapee",
  "pele",
  "pelee",
  "epluche",
  "epluchee",
  "denoyaute",
  "denoyautee",
  "emince",
  "emincee",
  "frais",
  "fraiche",
  "sec",
  "seche",
]);

/** Lowercase and strip accents, so "entière" and "entiere" hit the same entry. */
function foldWord(word: string): string {
  return word.toLowerCase().normalize("NFD").replace(COMBINING_MARK, "");
}

/** The trailing adjective agreed with the count, or null when it is left alone. */
function agreeTrailingAdjective(word: string, wantsPlural: boolean): string | null {
  const folded = foldWord(word);
  const isPlural = folded.endsWith("s") && !AGREEABLE_ADJECTIVES.has(folded);
  const singular = isPlural ? word.slice(0, -1) : word;

  if (!AGREEABLE_ADJECTIVES.has(foldWord(singular)) || wantsPlural === isPlural) {
    return null;
  }
  return wantsPlural ? `${singular}s` : singular;
}

/**
 * The head of a noun phrase, put in the number its count asks for.
 *
 * The marks are not uniform: "morceau" and "chou" take -x where an ordinary
 * noun takes -s, "bocal" takes -aux, a word ending in -s, -x or -z takes no
 * mark at all, and "ananas" carries its -s in the singular. A head already in
 * the number wanted is left as written.
 */
function agreeHead(head: string, wantsPlural: boolean): string {
  const folded = foldWord(head);
  if (INVARIABLE_ITEM.has(folded) || ALREADY_SIBILANT.test(folded)) {
    return head;
  }

  const isPlural = PLURAL_ENDING.test(folded);
  if (wantsPlural === isPlural) {
    return head;
  }
  if (wantsPlural) {
    return OU_ENDING.test(folded) ? `${head}x` : frenchPlural(head);
  }
  return head.slice(0, -1);
}

/**
 * Agree the words of an item with the number counting them.
 *
 * The head takes the mark, and a trailing adjective from the closed list takes
 * it too. Everything between is left exactly as the recipe wrote it.
 */
export function agreeWithAmount(item: string, amount: number): string {
  if (item === "") {
    return "";
  }
  const wantsPlural = amount >= 2;
  const words = item.split(" ");
  /* v8 ignore next -- splitting a string always yields a first piece. */
  const head = words[0] ?? "";

  words[0] = agreeHead(head, wantsPlural);

  const last = words.length - 1;
  if (last > 0) {
    /* v8 ignore next -- the index is the last of the list it came from. */
    const adjective = agreeTrailingAdjective(words[last] ?? "", wantsPlural);
    if (adjective !== null) {
      words[last] = adjective;
    }
  }

  return words.join(" ");
}

/**
 * Put the item back after the measure, with the partitive French needs:
 * "6 cuillères à soupe **de** beurre".
 */
function joinItem(item: string): string {
  if (item === "") {
    return "";
  }
  const elides = VOWEL_OPENING.test(item) || MUTE_H_WORDS.test(item);
  return elides ? ` d'${item}` : ` de ${item}`;
}

/* -------------------------------------------------------------------------- */
/* Scaling one line                                                            */
/* -------------------------------------------------------------------------- */

const NO_QUANTITY_NOTE = "No quantity given; adjust to taste.";
const FURTHER_QUANTITY_NOTE =
  "This line carries a further quantity after the first one, and only the first was scaled. Read the rest as published.";
const BELOW_SCALE_NOTE =
  "This is smaller than a kitchen scale resolves. Make a larger batch, or measure it by eye.";
const DEGENERATE_RANGE_NOTE =
  "The page gave a range, and at this size both ends come to the same amount.";

/** Below this a kitchen scale shows nothing, whatever the arithmetic says. */
const BELOW_KITCHEN_SCALE = 0.05;

export interface ScaleOptions {
  /** Multiplier applied to the quantities. */
  factor: number;
}

/**
 * Scale one line.
 *
 * A factor of one short-circuits: nobody asked for the line to change, so
 * rewriting it and rounding it would move a quantity for no reason.
 */
export function scaleLine(line: string, options: ScaleOptions): ScaledIngredient {
  const original = line;
  const parsed = parseIngredient(line);

  if (parsed.amount === null) {
    return {
      text: original,
      original,
      scaling: "unscaled",
      amount: null,
      amount_max: null,
      unit: null,
      is_heading: false,
      note: NO_QUANTITY_NOTE,
    };
  }

  if (options.factor === 1) {
    return {
      text: original,
      original,
      scaling: "scaled",
      amount: parsed.amount,
      amount_max: parsed.amountMax,
      unit: parsed.unit === null ? null : parsed.unit.canonical,
      is_heading: false,
    };
  }

  return rewrite(original, parsed, options.factor);
}

/**
 * What a rewritten bound has to report: the value moved, or a floor was hit.
 *
 * A bound is judged on its own, because a range can round one way at one end
 * and the other way at the other, and one note for both would name the wrong
 * direction for half the quantity.
 */
function noteForBound(bound: ScaledBound): string | null {
  if (bound.clamped) {
    return `Clamped up to ${formatAmount(bound.amount)} from ${formatAmount(bound.raw, { fractions: false })}, the smallest amount worth measuring. This line no longer holds its share of the recipe.`;
  }
  if (boundLandedExactly(bound)) {
    return null;
  }
  const direction = bound.amount > bound.raw * bound.ratio ? "up" : "down";
  return `Rounded ${direction} from ${formatAmount(bound.raw * bound.ratio, { fractions: false })}.`;
}

/** What the reading of the line itself has to say, beside the arithmetic. */
function notesForReading(parsed: ParsedIngredient, amount: number): string[] {
  const notes: string[] = [];

  if (parsed.articleWord !== null) {
    notes.push(`"${parsed.articleWord}" read as ${formatAmount(amount)}.`);
  }

  if (parsed.unit !== null && parsed.unit.kind === "approximate") {
    const equivalence = approximateEquivalent(parsed.unit);
    notes.push(
      `A ${parsed.unit.canonical} is an approximate measure${equivalence === null ? "" : `, ${equivalence}`}. The count was scaled and the size of one is the cook's.`,
    );
  }

  if (hasEmbeddedMeasure(parsed.item)) {
    notes.push(FURTHER_QUANTITY_NOTE);
  }

  return notes;
}

function rewrite(original: string, parsed: ParsedIngredient, factor: number): ScaledIngredient {
  /* v8 ignore next -- a line whose amount is null never reaches this rewrite. */
  const amount = parsed.amount ?? 0;
  const divisibility = divisibilityOf(parsed.unit, parsed.item);
  const scaled = scaleMeasure(amount, parsed.amountMax, parsed.unit, factor, divisibility);

  const [low, ...rest] = scaled.bounds;
  const high = rest[0];

  // A range whose ends meet at this size is one amount, and printing it twice
  // would offer a choice the arithmetic has taken away.
  const collapsed = high !== undefined && high.amount === low.amount;
  const judged = collapsed ? [low] : scaled.bounds;

  const arithmetic = judged.map(noteForBound).filter((note): note is string => note !== null);
  const notes = [
    ...arithmetic,
    ...(collapsed ? [DEGENERATE_RANGE_NOTE] : []),
    ...notesForReading(parsed, amount),
    ...(scaled.unit !== null && scaled.unit.kind === "measured" && low.amount < BELOW_KITCHEN_SCALE
      ? [BELOW_SCALE_NOTE]
      : []),
  ];

  const upper = collapsed ? null : (high?.amount ?? null);

  return {
    text: render(scaled.unit, low.amount, upper, parsed),
    original,
    scaling: arithmetic.length > 0 ? "rounded" : "scaled",
    amount: low.amount,
    amount_max: upper,
    unit: scaled.unit === null ? null : scaled.unit.canonical,
    is_heading: false,
    ...(notes.length > 0 ? { note: notes.join(" ") } : {}),
  };
}

/**
 * Write the line back, with the number, the measure and the item each in the
 * form the count asks for.
 *
 * A mass or a volume is written in decimals, because that is how a kitchen
 * reads a scale. Anything a cook counts or spoons out takes the fractions a
 * measuring set carries.
 */
function render(
  unit: UnitInfo | null,
  low: number,
  high: number | null,
  parsed: ParsedIngredient,
): string {
  const asDecimal = unit !== null && unit.kind === "measured";
  const options = { fractions: !asDecimal };
  const figure =
    high === null
      ? formatAmount(low, options)
      : `${formatAmount(low, options)}${joinRange(parsed.rangeSeparator)}${formatAmount(high, options)}`;

  // The measure and the item each agree with the larger end, which is the
  // number a reader sees last.
  const counted = high ?? low;

  if (unit === null) {
    return `${figure} ${agreeWithAmount(parsed.item, counted)}`.trimEnd();
  }
  return `${figure} ${formatUnit(unit, counted)}${joinItem(parsed.item)}`;
}

/** A dash stays against the numbers, a word keeps the spaces the page gave it. */
function joinRange(separator: string | null): string {
  /* v8 ignore next -- a range that was read carries the wording it was read by,
     and this is called only for a range. */
  if (separator === null || separator === "") {
    return " à ";
  }
  return DASH_SEPARATOR.test(separator) ? separator : ` ${separator} `;
}

/**
 * Scale a whole list.
 *
 * A line the site prints as a heading names the part that follows and holds no
 * quantity, so it travels untouched and says so.
 */
export function scaleLines(
  lines: Array<{ text: string; is_heading: boolean }>,
  options: ScaleOptions,
): ScaledIngredient[] {
  return lines.map((line) => {
    if (line.is_heading) {
      return {
        text: line.text,
        original: line.text,
        scaling: "unscaled" as const,
        amount: null,
        amount_max: null,
        unit: null,
        is_heading: true,
      };
    }
    return scaleLine(line.text, options);
  });
}
