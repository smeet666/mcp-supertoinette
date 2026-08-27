/**
 * Every address this server asks for, built in one place.
 *
 * The site's robots.txt disallows a hundred one-word paths that have nothing to
 * do with cooking, which are traps laid for crawlers that follow whatever they
 * find. Building every address here, from an identifier the caller supplies,
 * is what keeps this server on the routes it knows: a link read out of a page
 * is never followed, so a trap has no way in.
 */

export const SITE_ORIGIN = "https://www.supertoinette.com";

const RECIPE_PREFIX = "/recette/";
const SEARCH_PATH = "/liste-recettes";
const CATEGORY_PREFIX = "/recettes/";

/**
 * The identifier of a recipe: digits, and nothing else.
 *
 * The site addresses a recipe by a number followed by a slug it redirects to
 * the canonical spelling of, so the number is the whole of the address. Checking
 * the shape here means an argument the site would answer with a 404 is refused
 * before a request is spent, and refused as bad input rather than reported back
 * as an absence the site never stated.
 */
const NUMERIC_ID = /^[1-9][0-9]{0,9}$/;

export const isId = (value: string): boolean => NUMERIC_ID.test(value);

/**
 * The address of a recipe, built from its identifier alone.
 *
 * The site serves any slug and redirects to the canonical one, so a slug is
 * never an input. The slug written here is a placeholder the redirect replaces,
 * which is what keeps the request on the `.html` route: the address without a
 * slug redirects to plain http, and following that would drop the connection
 * out of TLS to fetch a page this could have asked for directly.
 */
export function recipeUrl(id: string): string {
  return new URL(`${RECIPE_PREFIX}${encodeURIComponent(id)}/recette.html`, SITE_ORIGIN).toString();
}

/** The address of one page of search results. */
export function searchUrl(query: string, page: number, category: string | null): string {
  const url = new URL(SEARCH_PATH, SITE_ORIGIN);
  url.searchParams.set("q", query);
  if (page > 1) {
    url.searchParams.set("page", String(page));
  }
  if (category !== null) {
    url.searchParams.set("c", category);
  }
  return url.toString();
}

/**
 * What a caller passes back to open a category listing.
 *
 * A category is addressed by a number and a slug together, and the site answers
 * the number with the wrong slug by a 404 rather than by a redirect. So the two
 * travel as one token, taken from a listing and never assembled by hand.
 */
const CATEGORY_TOKEN = /^[1-9][0-9]{0,9}\/[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const isCategoryToken = (value: string): boolean => CATEGORY_TOKEN.test(value);

/** The suffix the site writes on a page addressed as a file. */
const HTML_SUFFIX = /\.html$/;

/** The address of one page of a category's listing. */
export function categoryUrl(token: string, page: number): string {
  const [id = "", slug = ""] = token.split("/");
  const url = new URL(
    `${CATEGORY_PREFIX}${encodeURIComponent(id)}/${encodeURIComponent(slug)}`,
    SITE_ORIGIN,
  );
  if (page > 1) {
    url.searchParams.set("page", String(page));
  }
  return url.toString();
}

/** The token in a category link the site printed, when it holds one. */
export function categoryTokenFromHref(href: string): string | null {
  const path = new URL(href, SITE_ORIGIN).pathname;
  if (!path.startsWith(CATEGORY_PREFIX)) {
    return null;
  }
  const token = path.slice(CATEGORY_PREFIX.length).replace(HTML_SUFFIX, "");
  return isCategoryToken(token) ? token : null;
}

/** Turn a link the site printed into an address a caller can open. */
export const absolute = (href: string): string => new URL(href, SITE_ORIGIN).toString();

/** The identifier in a recipe link the site printed, when it holds one. */
export function recipeIdFromHref(href: string): string | null {
  const path = new URL(href, SITE_ORIGIN).pathname;
  if (!path.startsWith(RECIPE_PREFIX)) {
    return null;
  }
  /* v8 ignore next -- splitting a string always yields a first piece. */
  const id = path.slice(RECIPE_PREFIX.length).split("/")[0] ?? "";
  return isId(id) ? id : null;
}

/** The identifier and slug of an ingredient page the site linked to. */
export function sheetFromHref(href: string): { id: string; slug: string } | null {
  const path = new URL(href, SITE_ORIGIN).pathname;
  const [section, id, named] = path.split("/").filter((part) => part !== "");
  if (section !== "fiche-cuisine" || id === undefined || named === undefined) {
    return null;
  }
  const slug = named.replace(HTML_SUFFIX, "");
  return isId(id) && slug !== "" ? { id, slug } : null;
}
