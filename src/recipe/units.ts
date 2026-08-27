/**
 * Cooking measures, and what scaling means for each.
 *
 * What matters about a measure is how far its number divides before it stops
 * naming something a cook can produce. Doubling "200 g" gives "400 g", to the
 * tenth of a gram. Doubling "1 pincée" gives "2 pincées", which is the whole of
 * what a pinch can say: the count carries the quantity, and the size of one
 * pinch is the hand's business.
 */

const AL_ENDING = /al$/i;
const AUX_ENDING = /aux$/i;
const EAUX_ENDING = /eaux$/i;
const EAU_ENDING = /eau$/i;
const HEAD_BEFORE_DE = /^\s*(\p{L}+)\s+(?=(?:de|du|des)\s|d')/u;
const SIBILANT_LETTER = /[sxz]$/i;
const TRAILING_S = /s$/i;
const VOWEL_THEN_S = /[aiou]s$/i;
const COMBINING_MARK = /[̀-ͯ]/g;
const BRACKETED_PLURAL = /\((?:s|x|es)\)/g;
const ABBREVIATION_DOT = /\./g;
const WHITESPACE = /\s+/g;
const SPOON_OR_CUP = /^(?:cuillère à soupe|cuillère à café|tasse)$/;

export type UnitKind =
  /** Mass or volume: scales continuously and cleanly. */
  | "measured"
  /** Spoons, cups, cloves, sachets: scales, but only to sensible fractions. */
  | "portioned"
  /**
   * Pincées, poignées, filets: a real amount, held to no better than the hand
   * that produces it. The count is multiplied and lands on a whole one, and the
   * line says the measure is approximate.
   */
  | "approximate";

export type UnitSystem = "metric" | "imperial" | "none";

export interface UnitInfo {
  /** Canonical singular form, used when rewriting the ingredient line. */
  canonical: string;
  kind: UnitKind;
  system: UnitSystem;
  /** Plural form when it is not simply the singular plus an "s". */
  plural?: string;
  /** A symbol such as "g" or "ml", which never takes a plural mark. */
  symbol?: true;
}

/**
 * The vocabulary, keyed lowercased and accent-stripped, so one entry covers
 * "cuillere", "cuillère" and "Cuillères".
 */
const UNITS: Record<string, UnitInfo> = {
  mg: { canonical: "mg", kind: "measured", system: "metric", symbol: true },
  g: { canonical: "g", kind: "measured", system: "metric", symbol: true },
  gr: { canonical: "g", kind: "measured", system: "metric", symbol: true },
  grs: { canonical: "g", kind: "measured", system: "metric", symbol: true },
  gramme: { canonical: "g", kind: "measured", system: "metric", symbol: true },
  grammes: { canonical: "g", kind: "measured", system: "metric", symbol: true },
  kg: { canonical: "kg", kind: "measured", system: "metric", symbol: true },
  kilo: { canonical: "kg", kind: "measured", system: "metric", symbol: true },
  kilos: { canonical: "kg", kind: "measured", system: "metric", symbol: true },
  kilogramme: { canonical: "kg", kind: "measured", system: "metric", symbol: true },
  kilogrammes: { canonical: "kg", kind: "measured", system: "metric", symbol: true },
  ml: { canonical: "ml", kind: "measured", system: "metric", symbol: true },
  millilitre: { canonical: "ml", kind: "measured", system: "metric", symbol: true },
  millilitres: { canonical: "ml", kind: "measured", system: "metric", symbol: true },
  cl: { canonical: "cl", kind: "measured", system: "metric", symbol: true },
  centilitre: { canonical: "cl", kind: "measured", system: "metric", symbol: true },
  centilitres: { canonical: "cl", kind: "measured", system: "metric", symbol: true },
  dl: { canonical: "dl", kind: "measured", system: "metric", symbol: true },
  l: { canonical: "l", kind: "measured", system: "metric", symbol: true },
  litre: { canonical: "l", kind: "measured", system: "metric", symbol: true },
  litres: { canonical: "l", kind: "measured", system: "metric", symbol: true },

  // A page glossing a metric weight names the pound, which French writes as a
  // livre. It keeps its own system, because restating it in grams would change
  // what the page said.
  livre: { canonical: "livre", kind: "measured", system: "imperial", plural: "livres" },
  livres: { canonical: "livre", kind: "measured", system: "imperial", plural: "livres" },

  // Spoons and cups: real measures, in sensible fractions.
  "cuillere a soupe": {
    canonical: "cuillère à soupe",
    kind: "portioned",
    system: "none",
    plural: "cuillères à soupe",
  },
  "cuilleres a soupe": {
    canonical: "cuillère à soupe",
    kind: "portioned",
    system: "none",
    plural: "cuillères à soupe",
  },
  "c a soupe": {
    canonical: "cuillère à soupe",
    kind: "portioned",
    system: "none",
    plural: "cuillères à soupe",
  },
  "c a s": {
    canonical: "cuillère à soupe",
    kind: "portioned",
    system: "none",
    plural: "cuillères à soupe",
  },
  cas: {
    canonical: "cuillère à soupe",
    kind: "portioned",
    system: "none",
    plural: "cuillères à soupe",
  },
  "cuillere a cafe": {
    canonical: "cuillère à café",
    kind: "portioned",
    system: "none",
    plural: "cuillères à café",
  },
  "cuilleres a cafe": {
    canonical: "cuillère à café",
    kind: "portioned",
    system: "none",
    plural: "cuillères à café",
  },
  "c a cafe": {
    canonical: "cuillère à café",
    kind: "portioned",
    system: "none",
    plural: "cuillères à café",
  },
  "c a c": {
    canonical: "cuillère à café",
    kind: "portioned",
    system: "none",
    plural: "cuillères à café",
  },
  cac: {
    canonical: "cuillère à café",
    kind: "portioned",
    system: "none",
    plural: "cuillères à café",
  },
  tasse: { canonical: "tasse", kind: "portioned", system: "none" },
  tasses: { canonical: "tasse", kind: "portioned", system: "none" },
  verre: { canonical: "verre", kind: "portioned", system: "none" },
  verres: { canonical: "verre", kind: "portioned", system: "none" },
  bol: { canonical: "bol", kind: "portioned", system: "none" },
  bols: { canonical: "bol", kind: "portioned", system: "none" },

  // Packaging and natural units: countable, so they land on shares of a whole.
  sachet: { canonical: "sachet", kind: "portioned", system: "none" },
  sachets: { canonical: "sachet", kind: "portioned", system: "none" },
  gousse: { canonical: "gousse", kind: "portioned", system: "none" },
  gousses: { canonical: "gousse", kind: "portioned", system: "none" },
  tranche: { canonical: "tranche", kind: "portioned", system: "none" },
  tranches: { canonical: "tranche", kind: "portioned", system: "none" },
  botte: { canonical: "botte", kind: "portioned", system: "none" },
  bottes: { canonical: "botte", kind: "portioned", system: "none" },
  boite: { canonical: "boîte", kind: "portioned", system: "none", plural: "boîtes" },
  boites: { canonical: "boîte", kind: "portioned", system: "none", plural: "boîtes" },
  bocal: { canonical: "bocal", kind: "portioned", system: "none", plural: "bocaux" },
  bocaux: { canonical: "bocal", kind: "portioned", system: "none", plural: "bocaux" },
  pot: { canonical: "pot", kind: "portioned", system: "none" },
  pots: { canonical: "pot", kind: "portioned", system: "none" },
  brique: { canonical: "brique", kind: "portioned", system: "none" },
  briques: { canonical: "brique", kind: "portioned", system: "none" },
  bouteille: { canonical: "bouteille", kind: "portioned", system: "none" },
  bouteilles: { canonical: "bouteille", kind: "portioned", system: "none" },
  feuille: { canonical: "feuille", kind: "portioned", system: "none" },
  feuilles: { canonical: "feuille", kind: "portioned", system: "none" },
  branche: { canonical: "branche", kind: "portioned", system: "none" },
  branches: { canonical: "branche", kind: "portioned", system: "none" },
  morceau: { canonical: "morceau", kind: "portioned", system: "none", plural: "morceaux" },
  morceaux: { canonical: "morceau", kind: "portioned", system: "none", plural: "morceaux" },

  // Held to no better than a hand: the count scales, the size of one does not.
  // `readPartitiveMeasure` explains what else lands here.
  pincee: { canonical: "pincée", kind: "approximate", system: "none", plural: "pincées" },
  pincees: { canonical: "pincée", kind: "approximate", system: "none", plural: "pincées" },
  poignee: { canonical: "poignée", kind: "approximate", system: "none", plural: "poignées" },
  poignees: { canonical: "poignée", kind: "approximate", system: "none", plural: "poignées" },
  bouchon: { canonical: "bouchon", kind: "approximate", system: "none" },
  bouchons: { canonical: "bouchon", kind: "approximate", system: "none" },
  filet: { canonical: "filet", kind: "approximate", system: "none" },
  filets: { canonical: "filet", kind: "approximate", system: "none" },
  trait: { canonical: "trait", kind: "approximate", system: "none" },
  traits: { canonical: "trait", kind: "approximate", system: "none" },
  goutte: { canonical: "goutte", kind: "approximate", system: "none", plural: "gouttes" },
  gouttes: { canonical: "goutte", kind: "approximate", system: "none", plural: "gouttes" },
  louche: { canonical: "louche", kind: "approximate", system: "none" },
  louches: { canonical: "louche", kind: "approximate", system: "none" },
  larme: { canonical: "larme", kind: "approximate", system: "none" },
  larmes: { canonical: "larme", kind: "approximate", system: "none" },
  lichette: { canonical: "lichette", kind: "approximate", system: "none" },
  lichettes: { canonical: "lichette", kind: "approximate", system: "none" },
  soupcon: { canonical: "soupçon", kind: "approximate", system: "none", plural: "soupçons" },
  soupcons: { canonical: "soupçon", kind: "approximate", system: "none", plural: "soupçons" },
  pointe: { canonical: "pointe", kind: "approximate", system: "none" },
  pointes: { canonical: "pointe", kind: "approximate", system: "none" },
  doigt: { canonical: "doigt", kind: "approximate", system: "none" },
  doigts: { canonical: "doigt", kind: "approximate", system: "none" },
  nuage: { canonical: "nuage", kind: "approximate", system: "none" },
  nuages: { canonical: "nuage", kind: "approximate", system: "none" },
  // "noix" carries its own plural mark already.
  noix: { canonical: "noix", kind: "approximate", system: "none", plural: "noix" },
};

/**
 * Lowercase, strip accents and drop abbreviation dots, so a lookup survives the
 * spellings a recipe actually uses.
 *
 * Recipes write "c. à soupe" as readily as the full words, and an unrecognised
 * measure is worse than a wrong one: the amount falls through to the countable
 * branch and gets rounded as though a spoonful were an indivisible object.
 *
 * A page that does not know how many it will be writes the plural mark in
 * brackets, as in "4 cuillère(s) à soupe". The measure is the word without it.
 */
export function normalizeUnitKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(COMBINING_MARK, "")
    .replace(ABBREVIATION_DOT, " ")
    .replace(BRACKETED_PLURAL, "")
    .replace(WHITESPACE, " ")
    .trim();
}

/** Longest keys first, so "cuillère à soupe" wins over "cuillère". */
const UNIT_KEYS: string[] = Object.keys(UNITS).sort(
  (a, b) => b.split(" ").length - a.split(" ").length || b.length - a.length,
);

export const unitKeys = (): string[] => UNIT_KEYS;

export function lookupUnit(text: string): UnitInfo | null {
  return UNITS[normalizeUnitKey(text)] ?? null;
}

/**
 * A number followed by a measure, anywhere in a piece of text.
 *
 * It spots a quantity the reader did not take, such as the second half of
 * "1 cuillère à soupe de sucre ou 1 cuillère à café de miel", which would
 * otherwise sit in a rewritten line still saying what the page said.
 *
 * A quantity keeps the same shape whether the measure stands against the figure
 * or behind the word introducing it: "3/4 tasse" and "3/4 de tasse" are one
 * quantity written twice. The digits and the whitespace are kept in pieces that
 * cannot both match a space, because letting them overlap makes the engine try
 * every way of splitting a run of spaces, which turns a long line into seconds
 * of work for an answer that was always going to be no.
 */
const EMBEDDED = new RegExp(
  `\\d[\\d.,/]*\\s*(?:(?:de|du|des|d)\\s+)?(?:${UNIT_KEYS.map((key) => key.replace(/ /g, "\\s+")).join("|")})\\b`,
  "i",
);

/** The text is normalized first, because the vocabulary is keyed without accents. */
export function hasEmbeddedMeasure(text: string): boolean {
  return EMBEDDED.test(normalizeUnitKey(text));
}

/**
 * Words that stand where a measure would and name no container.
 *
 * "un peu de sel" states that there is some salt, and multiplying it says
 * nothing.
 */
const NOT_A_MEASURE = new Set([
  "peu",
  "beaucoup",
  "plus",
  "moins",
  "assez",
  "trop",
  "autant",
  "tant",
  "moitie",
  "quart",
  "tiers",
  "reste",
  "melange",
  "ensemble",
  // These name a part of the food rather than something that holds it. A line
  // asking for "1 jus de citron" counts citrons, and "1 blanc de poulet" counts
  // pieces of the bird: reading either as a measure would hand the question of
  // how far one divides to a word that names no vessel.
  "jus",
  "zeste",
  "zestes",
  "blanc",
  "blancs",
  "jaune",
  "jaunes",
]);

/**
 * Read a measure named with a container or a gesture the vocabulary has no
 * entry for.
 *
 * What makes a measure approximate is that its size belongs to whoever pours
 * it: a bouquet, a ramequin, a bouchon hold what they hold, and the recipe's
 * proportion lives in how many are asked for. French marks that grammatically,
 * by placing the noun between the amount and the partitive that introduces the
 * thing measured: "un bouquet de persil", "2 ramequins de crème". A noun in
 * that position measures whatever follows it, so a container nobody thought to
 * list is read by the same rule as the ones that are, and the vocabulary only
 * has to carry the words whose plural or spelling the rule would get wrong.
 *
 * The amount has to come first. A line opening on the noun, as in "beurre
 * pommade", carries no quantity, and inventing one from the grammar would put a
 * number where the recipe wrote none.
 */
export function readPartitiveMeasure(text: string): { unit: UnitInfo; rest: string } | null {
  const match = HEAD_BEFORE_DE.exec(text);
  if (match === null) {
    return null;
  }

  /* v8 ignore next -- the pattern that matched carries its group. */
  const word = match[1] ?? "";
  if (word.length < 3 || NOT_A_MEASURE.has(normalizeUnitKey(word)) || lookupUnit(word) !== null) {
    return null;
  }

  const canonical = frenchSingular(word);
  return {
    unit: { canonical, kind: "approximate", system: "none", plural: frenchPlural(canonical) },
    rest: text.slice(match[0].length),
  };
}

/**
 * The singular of a noun a line wrote in the plural, so the rewrite can put it
 * back in either number.
 *
 * "ananas", "jus" and "anis" carry their -s in the singular, and "morceaux"
 * comes from "morceau", so the ending decides rather than the last letter
 * alone.
 */
export function frenchSingular(word: string): string {
  if (EAUX_ENDING.test(word)) {
    return word.slice(0, -1);
  }
  if (AUX_ENDING.test(word)) {
    return `${word.slice(0, -3)}al`;
  }
  if (VOWEL_THEN_S.test(word)) {
    return word;
  }
  if (TRAILING_S.test(word) && word.length > 3) {
    return word.slice(0, -1);
  }
  return word;
}

/** The plural French writes for a noun, or the noun itself when it takes no mark. */
export function frenchPlural(word: string): string {
  if (SIBILANT_LETTER.test(word)) {
    return word;
  }
  if (EAU_ENDING.test(word)) {
    return `${word}x`;
  }
  if (AL_ENDING.test(word)) {
    return `${word.slice(0, -2)}aux`;
  }
  return `${word}s`;
}

/**
 * What a kitchen usually takes each approximate measure to be.
 *
 * Offered as words for a note, never as the quantity: writing "2 cuillères à
 * café" where the page wrote "4 pincées" puts a figure on the page it never
 * claimed, and the cook is the one holding the pinch.
 */
const APPROXIMATE_EQUIVALENT: Record<string, string> = {
  pincee: "commonly taken as about half a teaspoon",
  poignee: "commonly taken as about a quarter of a cup",
  bouchon: "commonly taken as about a tablespoon, the size of a bottle cap",
  goutte: "commonly taken as a single drop",
  filet: "commonly taken as about a teaspoon poured in a thin line",
  noix: "commonly taken as about a tablespoon of butter",
  louche: "commonly taken as about half a cup",
  soupcon: "commonly taken as the smallest amount a spoon tip carries",
  trait: "commonly taken as a short pour from the bottle",
};

/** The everyday equivalence for an approximate measure, when there is a settled one. */
export function approximateEquivalent(unit: UnitInfo): string | null {
  return APPROXIMATE_EQUIVALENT[normalizeUnitKey(unit.canonical)] ?? null;
}

/**
 * Ladders, used to keep a scaled amount at a human size.
 *
 * Multiplying a recipe by thirty is arithmetically fine and practically poor:
 * "8335 g de sucre" is correct, and nobody weighs eight thousand grams. Each
 * measured unit therefore knows the unit above and below it, so a large amount
 * climbs the ladder and a small one comes back down. Each system keeps its own
 * ladder, because converting between them changes what the recipe said.
 */
interface UnitStep {
  /** Unit to switch to, and how many of the current unit it holds. */
  to: string;
  per: number;
}

const PROMOTIONS: Record<string, UnitStep> = {
  mg: { to: "g", per: 1000 },
  g: { to: "kg", per: 1000 },
  ml: { to: "l", per: 1000 },
  cl: { to: "l", per: 100 },
  dl: { to: "l", per: 10 },
};

const DEMOTIONS: Record<string, UnitStep> = {
  // Spoons and cups hold a fixed volume, so a share of one is stated in the
  // smaller spoon rather than as a fraction no measuring set carries.
  tasse: { to: "cuillere a soupe", per: 16 },
  "cuillere a soupe": { to: "cuillere a cafe", per: 3 },

  kg: { to: "g", per: 1000 },
  g: { to: "mg", per: 1000 },
  l: { to: "cl", per: 100 },
  dl: { to: "cl", per: 10 },
  cl: { to: "ml", per: 10 },
};

/**
 * The unit one step down the ladder, with how many of it fit in one of the
 * current unit. Null at the bottom of a ladder, where there is nothing smaller
 * to express the amount in.
 */
export function demoteUnit(unit: UnitInfo): { unit: UnitInfo; per: number } | null {
  const step = DEMOTIONS[normalizeUnitKey(unit.canonical)];
  if (step === undefined) {
    return null;
  }
  const target = lookupUnit(step.to);
  /* v8 ignore next -- every ladder names a unit the vocabulary holds. */
  return target === null ? null : { unit: target, per: step.per };
}

/**
 * Spoons and cups: a portion, and at the same time a fixed volume. The volume
 * is what lets a share of one be restated in a smaller spoon.
 */
export function isSpoonMeasure(unit: UnitInfo): boolean {
  return SPOON_OR_CUP.test(unit.canonical);
}

/** How finely a kitchen can divide one of a counted thing. */
export type Divisibility =
  /** An oeuf: half of one is not something a cook takes out of the shell. */
  | "whole"
  /** A gousse, a boîte, a sachet: half of it is a quantity a kitchen can take. */
  | "half"
  /** An oignon, a pomme: a knife takes it to quarters. */
  | "quarter";

/**
 * Measures a cook takes a quarter of.
 *
 * The half is as far as the criterion goes on its own, because that is the
 * share most measures give up by eye. These answer the size question
 * differently. A pot de crème, a bouteille and a bocal hold enough that a
 * quarter is still a portion someone serves and the rest still keeps. A tranche
 * is already cut off something larger, and the board that produced one takes a
 * corner off it in the same gesture.
 *
 * The pattern is exported because any of these words can stand where the
 * measure goes or inside the name of what is counted, and both readings answer
 * to the same list.
 */
export const QUARTERED_MEASURE =
  /(?:^|[^\p{L}])(?:pots?|bouteilles?|bocaux|bocals?|blocs?|tranches?)(?![\p{L}])/iu;

/**
 * How far one of a measure divides.
 *
 * A measure divides as far as half of what it holds stays a quantity a kitchen
 * can take out. Almost always it does: what a boîte, a bocal, a sachet or a
 * brique holds is poured, weighed or spooned, so half a boîte de tomates is
 * half a boîte de tomates and the rest keeps in the fridge. A feuille de
 * gélatine and a branche de thym are cut with a knife.
 *
 * What does not divide is what has no half a cook can measure out. An oeuf is
 * the case: half of one means beating it and weighing the result, which no
 * recipe asks for, and the same holds for a jaune and a blanc on their own.
 * That is a fact about the contents, so it is decided where the item is named
 * rather than here.
 *
 * A gesture keeps its own answer. A pincée is the amount a hand produces in one
 * go, and there is no half of a hand: the size of one is the cook's and the
 * count is the whole of what the measure can say, so the count lands on a whole
 * and the line reports that it moved.
 */
export function unitDivisibility(unit: UnitInfo): Divisibility {
  if (unit.kind === "approximate") {
    return "whole";
  }
  return QUARTERED_MEASURE.test(unit.canonical) ? "quarter" : "half";
}

export interface ChosenUnit {
  unit: UnitInfo;
  /** What to multiply an amount in the original unit by to express it in this one. */
  ratio: number;
}

/**
 * Choose the unit a cook would actually write a quantity in, and say how to get
 * there.
 *
 * A ratio rather than a converted number, because a range has two bounds and
 * they have to end up in the same unit: converting each on its own gives the
 * unreadable "450 g à 1 kg". The caller picks one bound to choose from, then
 * applies the ratio to both.
 *
 * Demotion repeats while the amount is under one, so a quantity divided a
 * thousandfold walks all the way down its ladder instead of rounding away.
 * Promotion takes one step, at a full unit of the step above, so 999 g stays
 * grams and 1000 g becomes a kilo.
 *
 * Both directions ask whether the unit can hold the figure. A kitchen reads two
 * decimals and no more, so 2468 g written in kilos is 2,47 and the eight grams
 * are gone. A quantity the bigger unit cannot state stays where the page wrote
 * it, and a quantity the page's own unit cannot state walks down to the one
 * that can, so the same mass comes out the same however the page spelled it.
 */
export function chooseReadableUnit(unit: UnitInfo, amount: number): ChosenUnit {
  if (unit.kind !== "measured" || !Number.isFinite(amount) || amount <= 0) {
    return { unit, ratio: 1 };
  }

  let current = unit;
  let ratio = 1;

  while (amount * ratio < 1) {
    const step = demoteUnit(current);
    if (step === null) {
      break;
    }
    ratio *= step.per;
    current = step.unit;
  }

  const up = PROMOTIONS[normalizeUnitKey(current.canonical)];
  if (up !== undefined && amount * ratio >= up.per && writesExactly((amount * ratio) / up.per)) {
    const target = lookupUnit(up.to);
    /* v8 ignore next -- every ladder names a unit the vocabulary holds. */
    if (target !== null) {
      ratio /= up.per;
      current = target;
    }
  }

  // Below ten, the step a kitchen rounds to is a tenth of the unit, so a value
  // the unit cannot write loses a real share of itself: 1,234 kg rounded where
  // it stands is 1,2 kg, and thirty-four grams are gone. From ten upwards the
  // step is one or five, which is what a scale shows anyway, so the value is
  // rounded rather than restated in a smaller unit nobody weighs in.
  while (amount * ratio < ROUND_RATHER_THAN_DEMOTE && !writesExactly(amount * ratio)) {
    const step = demoteUnit(current);
    if (step === null) {
      break;
    }
    ratio *= step.per;
    current = step.unit;
  }

  return { unit: current, ratio };
}

/** At and above this, rounding costs less than restating the value further down. */
const ROUND_RATHER_THAN_DEMOTE = 10;

/** Whether a figure survives being written with the two decimals a kitchen reads. */
function writesExactly(value: number): boolean {
  return Math.abs(value * 100 - Math.round(value * 100)) < 1e-9;
}

/**
 * Render a measure for a given amount, choosing singular or plural.
 *
 * French takes the plural from two onwards, so 1,5 stays singular: "1,5
 * cuillère à soupe".
 */
export function formatUnit(unit: UnitInfo, amount: number): string {
  if (unit.symbol === true || amount < 2) {
    return unit.canonical;
  }
  return unit.plural ?? `${unit.canonical}s`;
}
