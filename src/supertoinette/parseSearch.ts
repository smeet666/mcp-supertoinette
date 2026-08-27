/**
 * Reading a page of search results.
 *
 * The site answers three different questions with pages that look alike, and
 * telling them apart is what this reader exists for.
 *
 * - A search that matched nothing carries no row, no facet, and says so in
 *   words.
 * - A page past the last one carries no row either, keeps its facets, and says
 *   nothing at all. Its block of page numbers lists only the pages the site
 *   holds, which is what gives the answer away.
 * - A category the site does not know is answered exactly like a search that
 *   matched nothing, so nothing on the page separates the two. That one is
 *   settled above this layer, by asking again without the filter.
 */

import { parseFailure } from "../errors.js";
import { firstBlock, textOf, withoutLeadingPictogram } from "./html.js";
import { recipeIdFromHref } from "./urls.js";

/** The heading a search page carries, which is what says it is one. */
const SEARCH_HEADING = /<h1[^>]*>\s*Recherche de recettes\s*<\/h1>/;
/** The words the site writes where a search matched nothing. */
const MATCHED_NOTHING = /Aucun r[ée]sultat pour cette recherche/i;

const ROW = /<div[^>]*class="[^"]*\bhit\b[^"]*"[^>]*>/;
const ROW_HEADING = /<h2[^>]*>([\s\S]*?)<\/h2>/;
/** The categories the site prints inside the link, in a tag of their own. */
const ROW_CATEGORIES = /<small[^>]*>([\s\S]*?)<\/small>/;
const ANCHOR_HREF = /<a[^>]+href="([^"]*)"/;
const ROW_IMAGE = /<img[^>]+data-src="([^"]+)"/;
const ROW_DESCRIPTION = /<p[^>]*class="[^"]*\bdescription\b[^"]*"[^>]*>([\s\S]*?)<\/p>/;

/**
 * The block the site counts its categories in.
 *
 * The words announcing it sit inside the list rather than in front of it, so
 * the container is what this anchors on. The announcement carries no count and
 * is passed over with the separators.
 */
const FACET_LIST = /<div[^>]*class="[^"]*\bfacets\b[^"]*"[^>]*>[\s\S]*?<ul[^>]*>/;
const FACET_ITEM = /<li[^>]*>([\s\S]*?)<\/li>/g;
const FACET_COUNT = /<span[^>]*class="[^"]*\bbadge\b[^"]*"[^>]*>\s*[\d\s]+\s*<\/span>/;

const PAGINATION = /<ul[^>]*class="[^"]*\bpagination\b[^"]*"[^>]*>/;
const PAGE_NUMBER = /class="page-link"[^>]*>\s*(\d+)/g;
/** The site groups the thousands of a count with a space. */
const GROUPING_SPACE = /\s/g;
/** The bar the site prints in front of the categories it files a row under. */
const LEADING_BAR = /^\|\s*/;

/** One recipe a listing points at. */
export interface ListingRow {
  /** The number the site addresses the recipe by. Pass it to read the recipe. */
  id: string;
  /** The title with any leading pictogram removed, which is what reads well. */
  title: string;
  /** The title exactly as the site published it. */
  title_as_published: string;
  url: string;
  image_url: string | null;
  description: string | null;
  /** The categories the site files the row under, as it prints them. */
  categories: string[];
}

/** A category the site counts inside one search. */
export interface Facet {
  label: string;
  count: number;
}

/** One page of a listing, as the site served it. */
export interface Listing {
  results: ListingRow[];
  /** Rows the page held, before any were set aside or rendered. */
  rows_published: number;
  /**
   * How many the site says it holds.
   *
   * Always null: the site prints no total anywhere on a search page. The field
   * exists so a caller asking every source the same question finds it here too.
   */
  total_available: null;
  /** The highest page the site links to from this one. */
  last_page: number;
  facets: Facet[];
  /** True only where the site itself said the search matched nothing. */
  matched_nothing: boolean;
  url: string;
}

export interface ParsedSearchPage {
  listing: Listing;
  /** Rows the page held that could not be rendered, and why. */
  skipped: string[];
}

/** The facets the site counted, in the order it printed them. */
function readFacets(html: string): Facet[] {
  const block = firstBlock(html, FACET_LIST, "</ul>");
  if (block === null) {
    return [];
  }

  const facets: Facet[] = [];
  for (const [, inner = ""] of block.matchAll(FACET_ITEM)) {
    const counted = FACET_COUNT.exec(inner);
    if (counted === null) {
      continue;
    }
    const label = textOf(inner.replace(counted[0], " "));
    if (label !== "") {
      // The whole tag is read rather than its group, so no reading has to
      // account for a group the pattern that matched always carries.
      facets.push({ label, count: Number(textOf(counted[0]).replace(GROUPING_SPACE, "")) });
    }
  }
  return facets;
}

/**
 * The highest page the site links to.
 *
 * The site abridges the middle of a long listing and still lists its last page,
 * so the highest number printed is the last one. On a page past the last it
 * lists only the pages it holds, which is what lets a caller be told they
 * walked off the end rather than that nothing matched.
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
 * The categories a row is filed under, as the site prints them inside the link.
 *
 * The whole tag is read rather than its group, so no reading has to account for
 * a group the pattern that matched always carries.
 */
function filedUnder(tag: string): string[] {
  return textOf(tag)
    .replace(LEADING_BAR, "")
    .split(",")
    .map((part) => part.trim())
    .filter((part) => part !== "");
}

/** One row, or the reason it could not be rendered. */
function rowIn(markup: string): ListingRow | string {
  const heading = ROW_HEADING.exec(markup)?.[1];
  if (heading === undefined) {
    return "a row carries no heading, so there is nothing to name it by";
  }

  const categories = ROW_CATEGORIES.exec(heading);
  const published = textOf(categories === null ? heading : heading.replace(categories[0], " "));

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
    categories: categories === null ? [] : filedUnder(categories[0]),
  };
}

/**
 * Read one page of a listing.
 *
 * The heading is looked for before anything else, because a page served in
 * place of a search is a page this cannot read, which is a different statement
 * from a search holding nothing.
 */
export function parseSearchPage(html: string, url: string): ParsedSearchPage {
  if (!SEARCH_HEADING.test(html)) {
    throw parseFailure("Supertoinette served a page that is not a search listing.", { url });
  }

  const results: ListingRow[] = [];
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

  return {
    listing: {
      results,
      rows_published: published,
      total_available: null,
      last_page: readLastPage(html),
      facets: readFacets(html),
      matched_nothing: MATCHED_NOTHING.test(html),
      url,
    },
    skipped,
  };
}
