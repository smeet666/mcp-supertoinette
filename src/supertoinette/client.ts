/**
 * The reading layer, publishable on its own.
 *
 * It owns the pacing, the store and the error vocabulary, and it knows nothing
 * about the protocol above it. A program can import it as an ordinary library
 * and get the same care the tools get.
 *
 * Quantities come back as the site wrote them. Rescaling belongs above this
 * layer, so a program reading through it reads what Supertoinette published.
 */

import type { Config, Logger } from "../config.js";
import { invalidInput } from "../errors.js";
import type { Read, RecipeCore } from "../types.js";
import { Cache } from "./cache.js";
import { fetchPage } from "./http.js";
import type { CategoryEntry, CategoryListing } from "./parseBrowse.js";
import { parseCategoryMenus, parseListingPage } from "./parseBrowse.js";
import type { PairingIndex, PairingSheet } from "./parsePairings.js";
import { parsePairingIndex, parsePairingSheet } from "./parsePairings.js";
import { parseRecipePage } from "./parseRecipe.js";
import type { Listing } from "./parseSearch.js";
import { parseSearchPage } from "./parseSearch.js";
import { RateLimiter } from "./rateLimiter.js";
import {
  categoryMenusUrl,
  categoryUrl,
  isCategoryToken,
  isId,
  pairingIndexUrl,
  pairingUrl,
  recipeUrl,
  searchUrl,
} from "./urls.js";

/** What one search asked for. */
export interface SearchRequest {
  query: string;
  page: number;
  /** A facet the site publishes, or null to search across every category. */
  category: string | null;
}

/**
 * What a search came back with, and what had to be given up to get it.
 *
 * The site answers a category it does not know exactly as it answers a search
 * that matched nothing: no row, no facet, and the words saying so. Nothing on
 * the page separates the two, so `dropped_category` is the only place a caller
 * learns that the filter is what produced the absence.
 */
export interface SearchOutcome {
  listing: Listing;
  /** The category that was set aside because keeping it found nothing. */
  dropped_category: string | null;
}

export interface ClientOptions {
  config: Config;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

/** A read held in the store, kept with what it had to set aside. */
interface Stored<T> {
  value: T;
  skipped: string[];
}

export class SupertoinetteClient {
  private readonly config: Config;
  private readonly logger: Logger;
  private readonly fetchImpl: typeof fetch | undefined;
  private readonly limiter: RateLimiter;
  private readonly recipes: Cache<Stored<RecipeCore>>;
  private readonly listings: Cache<Stored<Listing>>;
  private readonly pages: Cache<Stored<unknown>>;

  constructor(options: ClientOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl;
    this.limiter = new RateLimiter({ intervalMs: options.config.minIntervalMs });
    this.recipes = new Cache<Stored<RecipeCore>>(
      options.config.cacheTtlMs,
      options.config.cacheMaxEntries,
    );
    this.listings = new Cache<Stored<Listing>>(
      options.config.cacheTtlMs,
      options.config.cacheMaxEntries,
    );
    this.pages = new Cache<Stored<unknown>>(
      options.config.cacheTtlMs,
      options.config.cacheMaxEntries,
    );
  }

  /**
   * Read the categories the site lists on the page it serves.
   *
   * Both lists sit on every page, so this reads one page and takes both. What
   * they hold is what the site publishes as its categories, and it is not the
   * whole of what it files recipes under: that is said by the tool above rather
   * than left for a caller to discover.
   */
  listCategories(): Promise<Read<CategoryEntry[]>> {
    return this.readPage(categoryMenusUrl(), (body) => ({
      value: parseCategoryMenus(body),
      skipped: [],
    }));
  }

  /**
   * Read one page of a category's recipes.
   *
   * A token that cannot become an address is refused here rather than sent. The
   * site answers a number paired with the wrong name by a 404 rather than by a
   * redirect, so the two travel together and neither is assembled by hand.
   */
  // Kept async so a refused argument comes back as a rejected promise rather
  // than as a throw, which is what a caller holding only a `.catch` expects.
  async browseRecipes(category: string, page: number): Promise<Read<CategoryListing>> {
    const token = category.trim();
    if (!isCategoryToken(token)) {
      throw invalidInput(
        `"${token}" is not a Supertoinette category.`,
        "A category is a number and a name together, such as '107/recettes-desserts'. Take one from list_categories or from a recipe's tags.",
      );
    }

    const url = categoryUrl(token, page);
    return await this.readPage(url, (body, served) => {
      const parsed = parseListingPage(body, served);
      return { value: parsed.listing, skipped: parsed.skipped };
    });
  }

  /** Read the wines the site ranks for one dish. */
  // Async for the same reason browseRecipes is: a refusal rejects.
  async getPairings(id: string): Promise<Read<PairingSheet>> {
    const named = id.trim();
    if (!isId(named)) {
      throw invalidInput(
        `"${named}" is not a Supertoinette dish identifier.`,
        "An identifier is the number in a dish's address, such as 10 in /accords-mets-vins/10/. List the index to find one.",
      );
    }

    return await this.readPage(pairingUrl(named), (body, served) => {
      const parsed = parsePairingSheet(body, named, served);
      return { value: parsed.sheet, skipped: parsed.skipped };
    });
  }

  /** Read one page of the alphabetical index of dishes. */
  listPairings(page: number): Promise<Read<PairingIndex>> {
    return this.readPage(pairingIndexUrl(page), (body, served) => ({
      value: parsePairingIndex(body, served),
      skipped: [],
    }));
  }

  /**
   * Read one page, from the store when it is held there.
   *
   * Parsed before it is stored, so a page nobody could read is never served
   * back for the rest of the entry's lifetime.
   */
  private async readPage<T>(
    url: string,
    parse: (body: string, served: string) => Stored<T>,
  ): Promise<Read<T>> {
    const stored = this.pages.get(url) as Stored<T> | undefined;
    if (stored) {
      this.logger.debug(`served from the store: ${url}`);
      return withSkipped({ data: stored.value, cached: true }, stored.skipped);
    }

    const page = await this.limiter.schedule(() => this.get(url));
    const parsed = parse(page.body, page.url);
    if (parsed.skipped.length > 0) {
      this.logger.warn(`${parsed.skipped.length} thing(s) set aside on ${url}`);
    }
    this.pages.set(url, parsed);
    return withSkipped({ data: parsed.value, cached: false }, parsed.skipped);
  }

  /**
   * Search the recipes, on one page of results.
   *
   * A category that finds nothing is set aside and the search is asked again
   * without it. The site answers a category it does not know with the same page
   * it answers a genuine miss with, so a filter that was merely misspelled
   * would otherwise be reported as the site holding no such recipes.
   */
  async searchRecipes(request: SearchRequest): Promise<Read<SearchOutcome>> {
    const query = request.query.trim();
    if (query === "") {
      throw invalidInput(
        "A search needs something to look for.",
        "Give a dish or an ingredient as 'query'.",
      );
    }

    const first = await this.readListing(searchUrl(query, request.page, request.category));
    if (request.category === null || !first.data.matched_nothing) {
      return withSkipped(
        { data: { listing: first.data, dropped_category: null }, cached: first.cached },
        first.skipped ?? [],
      );
    }

    const again = await this.readListing(searchUrl(query, request.page, null));
    const dropped = again.data.results.length > 0 ? request.category : null;
    return withSkipped(
      { data: { listing: again.data, dropped_category: dropped }, cached: again.cached },
      again.skipped ?? [],
    );
  }

  /** Read one page of a listing, from the store when it is held there. */
  private async readListing(url: string): Promise<Read<Listing>> {
    const stored = this.listings.get(url);
    if (stored) {
      this.logger.debug(`served from the store: ${url}`);
      return withSkipped({ data: stored.value, cached: true }, stored.skipped);
    }

    const page = await this.limiter.schedule(() => this.get(url));
    const parsed = parseSearchPage(page.body, page.url);
    if (parsed.skipped.length > 0) {
      this.logger.warn(`${parsed.skipped.length} row(s) set aside on ${url}`);
    }
    this.listings.set(url, { value: parsed.listing, skipped: parsed.skipped });
    return withSkipped({ data: parsed.listing, cached: false }, parsed.skipped);
  }

  /** One read, paced and given the identity every request carries. */
  private get(url: string): Promise<{ body: string; url: string }> {
    return fetchPage({
      url,
      userAgent: this.config.userAgent,
      timeoutMs: this.config.timeoutMs,
      maxRetries: this.config.maxRetries,
      limiter: this.limiter,
      logger: this.logger,
      ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
    });
  }

  /**
   * Read one recipe by the identifier the site addresses it with.
   *
   * An identifier that cannot become an address is refused here rather than
   * sent. The site answers an address it does not hold with a 404, and
   * reporting that as an absence would state something about the catalogue that
   * a mistyped argument caused.
   */
  async getRecipe(id: string): Promise<Read<RecipeCore>> {
    const named = id.trim();
    if (!isId(named)) {
      throw invalidInput(
        `"${named}" is not a Supertoinette recipe identifier.`,
        "An identifier is the number in a recipe's address, such as 4210 in /recette/4210/. Search for a dish to find one.",
      );
    }

    const url = recipeUrl(named);

    const stored = this.recipes.get(url);
    if (stored) {
      this.logger.debug(`served from the store: ${url}`);
      return withSkipped({ data: stored.value, cached: true }, stored.skipped);
    }

    const page = await this.limiter.schedule(() => this.get(url));

    // Parsed before it is stored, so a page nobody could read is never served
    // back for the rest of the entry's lifetime. The address the answer came
    // from is the one carried out, because the site redirects any slug to the
    // canonical spelling of the recipe's own address.
    const parsed = parseRecipePage(page.body, named, page.url);
    if (parsed.skipped.length > 0) {
      this.logger.warn(`${parsed.skipped.length} thing(s) set aside on ${url}`);
    }
    this.recipes.set(url, { value: parsed.recipe, skipped: parsed.skipped });
    return withSkipped({ data: parsed.recipe, cached: false }, parsed.skipped);
  }

  /** The spacing in force, reported rather than guessed. */
  get currentIntervalMs(): number {
    return this.limiter.currentIntervalMs;
  }
}

/**
 * Attach what was set aside, and only when something was.
 *
 * An empty list beside every answer would read as a field the caller has to
 * check, where its absence says plainly that nothing was dropped.
 */
function withSkipped<T>(read: Read<T>, skipped: string[]): Read<T> {
  return skipped.length > 0 ? { ...read, skipped } : read;
}
