/**
 * Reading the wines the site ranks for a dish, and the index of dishes.
 *
 * The site puts five wines against each dish and names how well each one goes,
 * from a good match to a perfect one. That ranking is the site's own claim, in
 * its own words: nothing here scores a wine, orders one against another, or
 * carries a rank the site did not print.
 *
 * The index is alphabetical and runs to dozens of pages, which is what lets a
 * caller reach a dish by asking for the page its first letter falls on.
 */

import { parseFailure } from "../errors.js";
import { firstBlock, textOf, withoutLeadingPictogram } from "./html.js";
import { absolute, recipeIdFromHref } from "./urls.js";

/** The container one dish lives in. */
const SHEET_CONTAINER = /<div[^>]+id="sheet"[\s>]/;
/** The container the index of dishes lives in. */
const INDEX_CONTAINER = /<div[^>]+id="tricklist"[\s>]/;
const HEADING = /<h1[^>]*>([\s\S]*?)<\/h1>/;
/** The paragraph the site opens a dish with, describing the style of wine. */
const STYLE = /<p[^>]*>([\s\S]*?)<\/p>/;
/** The ranked list, which the site draws with an inline size of its own. */
const RANKED_LIST = /<ul[^>]*class="[^"]*\bmy-3\b[^"]*"[^>]*>/;
const LIST_ITEM = /<li[^>]*>([\s\S]*?)<\/li>/g;
/** A rank, which the site writes in emphasis and closes with a colon. */
const RANKED_ENTRY = /^\s*<strong>([\s\S]*?):\s*<\/strong>([\s\S]*)$/;
/** The recipes the site links beside a dish. */
const RECIPES_HEADING = /<h3[^>]*>\s*Recettes à découvrir\s*<\/h3>/;
const ANCHOR = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;

const PAGINATION = /<ul[^>]*class="[^"]*\bpagination\b[^"]*"[^>]*>/;
const PAGE_NUMBER = /class="page-link"[^>]*>\s*(\d+)/g;
const PAIRING_PATH = /^\/accords-mets-vins\/([1-9][0-9]{0,9})\/[a-z0-9-]+(?:\.html)?$/;

/** One wine, with the words the site ranks it by. */
export interface Pairing {
  /** The site's own wording for how well it goes, such as "Accord parfait". */
  rank: string;
  /** The wine and whatever the site writes about it, as published. */
  wine: string;
}

/** One recipe the site links beside a dish. */
export interface PairedRecipe {
  id: string;
  title: string;
  url: string;
}

/** One dish, with the wines the site puts against it. */
export interface PairingSheet {
  id: string;
  dish: string;
  /** The style of wine the site opens with. Null where it wrote none. */
  style: string | null;
  /** The wines, in the order the site ranked them. */
  pairings: Pairing[];
  /** The recipes the site links beside the dish. */
  recipes: PairedRecipe[];
  url: string;
}

export interface ParsedPairingSheet {
  sheet: PairingSheet;
  /** Lines the page held that could not be rendered, and why. */
  skipped: string[];
}

/** One dish the index points at. */
export interface IndexEntry {
  id: string;
  dish: string;
  url: string;
}

/** One page of the alphabetical index of dishes. */
export interface PairingIndex {
  entries: IndexEntry[];
  /** The highest page the site links to from this one. */
  last_page: number;
  url: string;
}

/** The highest page the site links to, or one where it draws no numbers. */
function readLastPage(html: string): number {
  const block = firstBlock(html, PAGINATION, "</ul>");
  if (block === null) {
    return 1;
  }
  const numbers = [...block.matchAll(PAGE_NUMBER)].map((match) => Number(match[1]));
  return numbers.length === 0 ? 1 : Math.max(...numbers);
}

/** The identifier in a pairing link the site printed, when it holds one. */
export function pairingIdFromHref(href: string): string | null {
  const path = new URL(href, "https://www.supertoinette.com").pathname;
  return PAIRING_PATH.exec(path)?.[1] ?? null;
}

/**
 * Read one dish.
 *
 * A line the site wrote without a rank is set aside rather than given one: the
 * rank is the whole of what the site claims about a wine, and supplying a
 * missing one would rank a bottle the site never placed.
 */
export function parsePairingSheet(html: string, id: string, url: string): ParsedPairingSheet {
  if (!SHEET_CONTAINER.test(html)) {
    throw parseFailure("Supertoinette served a page that is not a wine pairing.", { url });
  }

  const block = firstBlock(html, RANKED_LIST, "</ul>");
  if (block === null) {
    throw parseFailure("Supertoinette served a dish without the wines it ranks for it.", { url });
  }

  const pairings: Pairing[] = [];
  const skipped: string[] = [];
  for (const [, inner = ""] of block.matchAll(LIST_ITEM)) {
    const ranked = RANKED_ENTRY.exec(inner);
    if (ranked === null) {
      skipped.push(`"${textOf(inner)}" carries no rank, so there is nothing to place it by`);
      continue;
    }
    /* v8 ignore next -- the pattern that matched carries both its groups. */
    pairings.push({ rank: textOf(ranked[1] ?? ""), wine: textOf(ranked[2] ?? "") });
  }

  const heading = HEADING.exec(html)?.[1];
  const style = STYLE.exec(html)?.[1];

  return {
    sheet: {
      id,
      dish: heading === undefined ? "" : withoutLeadingPictogram(textOf(heading)),
      style: style === undefined || textOf(style) === "" ? null : textOf(style),
      pairings,
      recipes: readPairedRecipes(html),
      url,
    },
    skipped,
  };
}

/** The recipes the site links under its own heading, and nothing outside it. */
function readPairedRecipes(html: string): PairedRecipe[] {
  const heading = RECIPES_HEADING.exec(html);
  if (heading === null) {
    return [];
  }

  const after = html.slice(heading.index + heading[0].length);
  const recipes: PairedRecipe[] = [];
  for (const [, href = "", label = ""] of after.matchAll(ANCHOR)) {
    const id = recipeIdFromHref(href);
    const title = textOf(label);
    if (id !== null && title !== "") {
      recipes.push({ id, title: withoutLeadingPictogram(title), url: absolute(href) });
    }
  }
  return recipes;
}

/**
 * Read one page of the index of dishes.
 *
 * Only a link that opens onto a dish is published, because the page carries the
 * site's own navigation beside them and a caller handed one of those would ask
 * for a dish that does not exist.
 */
export function parsePairingIndex(html: string, url: string): PairingIndex {
  if (!INDEX_CONTAINER.test(html)) {
    throw parseFailure("Supertoinette served a page that is not the index of dishes.", { url });
  }

  /* v8 ignore next -- the container was found on the line above. */
  const block = firstBlock(html, INDEX_CONTAINER, "</body>") ?? "";
  const entries: IndexEntry[] = [];
  for (const [, href = "", label = ""] of block.matchAll(ANCHOR)) {
    const id = pairingIdFromHref(href);
    const dish = textOf(label);
    if (id !== null && dish !== "") {
      entries.push({ id, dish, url: absolute(href) });
    }
  }

  return { entries, last_page: readLastPage(html), url };
}
