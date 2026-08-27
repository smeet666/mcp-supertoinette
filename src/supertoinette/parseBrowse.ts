/**
 * Reading the categories the site browses by, and one category's recipes.
 *
 * The site prints two lists of categories on every page it serves: the kinds of
 * dish in its footer, and the ways of cooking with the seasons in its menu.
 * Neither is the whole of what it files recipes under, because a recipe's own
 * tags open onto hundreds of further listings the site publishes in no list at
 * all. What is read here is therefore named for where it was read.
 *
 * A category's own page carries a heading, its rows, and the block of page
 * numbers that says how far the listing runs.
 */

import { parseFailure } from "../errors.js";
import { firstBlock, textOf, withoutLeadingPictogram } from "./html.js";
import { absolute, categoryTokenFromHref, recipeIdFromHref } from "./urls.js";

/** The footer list, which holds the kinds of dish. */
const FOOTER_LIST = /<ul[^>]*id="nav-footer2"[^>]*>/;
/**
 * The menu entries, which hold the ways of cooking and the seasons.
 *
 * Read one by one rather than out of the block they sit in: the site draws a
 * dividing line inside that block, and the tag closing the line would close the
 * block for anything reading up to the first one.
 */
const MENU_ITEM = /<a[^>]*\bdropdown-item\b[^>]*>[\s\S]*?<\/a>/g;

const LIST_ITEM = /<li[^>]*>([\s\S]*?)<\/li>/g;
const ANCHOR = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;

/** The container a category's recipes live in. */
const LISTING_CONTAINER = /<div[^>]+id="recipeList"[\s>]/;
const HEADING = /<h1[^>]*>([\s\S]*?)<\/h1>/;
const ROW = /<div[^>]*class="[^"]*\brow mb-4\b[^"]*"[^>]*>/;
const ROW_HEADING = /<h3[^>]*>([\s\S]*?)<\/h3>/;
const ANCHOR_HREF = /<a[^>]+href="([^"]*)"/;
const ROW_IMAGE = /<img[^>]+data-src="([^"]+)"/;
const ROW_DESCRIPTION = /<p[^>]*class="[^"]*\bmb-1\b[^"]*"[^>]*>([\s\S]*?)<\/p>/;
/** What the site prints beside a row: how hard it is, and how long it takes. */
const ROW_PROPERTIES = /<ul[^>]*class="[^"]*\brecipeProp\b[^"]*"[^>]*>/;
const DIFFICULTY = /^Recette\s/;
/** What the site writes in front of the time it prints for a whole recipe. */
const TOTAL_TIME = "Temps total";
const FRENCH_HOURS = /(\d+)\s*h/;
const FRENCH_MINUTES = /(\d+)\s*min/;

const PAGINATION = /<ul[^>]*class="[^"]*\bpagination\b[^"]*"[^>]*>/;
const PAGE_NUMBER = /class="page-link"[^>]*>\s*(\d+)/g;

/** Where the site printed a category, which is all this claims about it. */
export type ListedIn = "footer" | "menu";

/** One category the site lists, with the token that opens its listing. */
export interface CategoryEntry {
  label: string;
  /** Pass this back to browse it. A number and a slug, never assembled by hand. */
  category: string;
  url: string;
  listed_in: ListedIn;
}

/** One recipe a category's page points at. */
export interface BrowseRow {
  id: string;
  title: string;
  title_as_published: string;
  url: string;
  image_url: string | null;
  description: string | null;
  /** The site's own wording, or null where it printed none. */
  difficulty: string | null;
  /** Minutes, or null where the site printed no total. */
  total_minutes: number | null;
}

/** One page of a category's recipes. */
export interface CategoryListing {
  /** The site's own heading for the category. */
  title: string | null;
  results: BrowseRow[];
  /** Rows the page held, before any were set aside or rendered. */
  rows_published: number;
  /** The highest page the site links to from this one. */
  last_page: number;
  url: string;
}

export interface ParsedListingPage {
  listing: CategoryListing;
  /** Rows the page held that could not be rendered, and why. */
  skipped: string[];
}

/** The categories one list holds, in the order the site printed them. */
function readList(block: string, listedIn: ListedIn): CategoryEntry[] {
  const entries: CategoryEntry[] = [];
  for (const [, href = "", label = ""] of block.matchAll(ANCHOR)) {
    const category = categoryTokenFromHref(href);
    const title = textOf(label);
    if (category !== null && title !== "") {
      entries.push({ label: title, category, url: absolute(href), listed_in: listedIn });
    }
  }
  return entries;
}

/**
 * The categories the site lists on the page it served.
 *
 * A link that opens onto no listing is left out rather than published as a
 * category with nothing to pass back: the two lists carry a few of those, and a
 * caller handed one would build a request the site answers with a 404.
 */
export function parseCategoryMenus(html: string): CategoryEntry[] {
  const footer = firstBlock(html, FOOTER_LIST, "</ul>");
  const menu = [...html.matchAll(MENU_ITEM)].map((match) => match[0]).join("");

  return [...(footer === null ? [] : readList(footer, "footer")), ...readList(menu, "menu")];
}

/** Minutes in a duration the page prints, such as "1 h 10 min". */
function minutesIn(text: string): number | null {
  const hours = FRENCH_HOURS.exec(text)?.[1];
  const minutes = FRENCH_MINUTES.exec(text)?.[1];
  if (hours === undefined && minutes === undefined) {
    return null;
  }
  return Number(hours ?? 0) * 60 + Number(minutes ?? 0);
}

/** What the site prints beside a row. */
function propertiesIn(markup: string): { difficulty: string | null; total_minutes: number | null } {
  const block = firstBlock(markup, ROW_PROPERTIES, "</ul>");
  const found: { difficulty: string | null; total_minutes: number | null } = {
    difficulty: null,
    total_minutes: null,
  };
  if (block === null) {
    return found;
  }

  for (const [, inner = ""] of block.matchAll(LIST_ITEM)) {
    const text = textOf(inner);
    if (DIFFICULTY.test(text)) {
      found.difficulty = text;
      continue;
    }
    if (text.startsWith(TOTAL_TIME)) {
      found.total_minutes = minutesIn(text);
    }
  }
  return found;
}

/** One row, or the reason it could not be rendered. */
function rowIn(markup: string): BrowseRow | string {
  const heading = ROW_HEADING.exec(markup)?.[1];
  if (heading === undefined) {
    return "a row carries no heading, so there is nothing to name it by";
  }

  const published = textOf(heading);
  const href = ANCHOR_HREF.exec(heading)?.[1];
  if (href === undefined || href === "") {
    return `"${published}" carries no address, so there is nothing to open`;
  }

  const id = recipeIdFromHref(href);
  if (id === null) {
    return `"${published}" opens onto something other than a recipe`;
  }

  const image = ROW_IMAGE.exec(markup)?.[1];
  const description = ROW_DESCRIPTION.exec(markup)?.[1];

  return {
    id,
    title: withoutLeadingPictogram(published),
    title_as_published: published,
    url: href,
    image_url: image ?? null,
    description: description === undefined ? null : textOf(description),
    ...propertiesIn(markup),
  };
}

/**
 * The highest page the site links to.
 *
 * The site abridges the middle of a long listing and still lists its last page.
 * On a page past the last it lists only the pages it holds, which is what lets
 * a caller be told they walked off the end rather than that the category is
 * empty.
 */
function readLastPage(html: string): number {
  const block = firstBlock(html, PAGINATION, "</ul>");
  if (block === null) {
    return 1;
  }
  const numbers = [...block.matchAll(PAGE_NUMBER)].map((match) => Number(match[1]));
  return numbers.length === 0 ? 1 : Math.max(...numbers);
}

/**
 * Read one page of a category's recipes.
 *
 * The container is looked for before anything else, because a page served in
 * place of a listing is a page this cannot read, which is a different statement
 * from a category holding nothing.
 */
export function parseListingPage(html: string, url: string): ParsedListingPage {
  if (!LISTING_CONTAINER.test(html)) {
    throw parseFailure("Supertoinette served a page that is not a category listing.", { url });
  }

  const results: BrowseRow[] = [];
  const skipped: string[] = [];
  let published = 0;

  // The first piece is whatever sits between the page and its first row.
  for (const chunk of html.split(ROW).slice(1)) {
    published += 1;
    const row = rowIn(chunk);
    if (typeof row === "string") {
      skipped.push(row);
    } else {
      results.push(row);
    }
  }

  const heading = HEADING.exec(html)?.[1];
  const title = heading === undefined ? "" : textOf(heading);

  return {
    listing: {
      title: title === "" ? null : title,
      results,
      rows_published: published,
      last_page: readLastPage(html),
      url,
    },
    skipped,
  };
}
