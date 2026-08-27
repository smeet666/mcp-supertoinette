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
import { parseRecipePage } from "./parseRecipe.js";
import { RateLimiter } from "./rateLimiter.js";
import { isId, recipeUrl } from "./urls.js";

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

  constructor(options: ClientOptions) {
    this.config = options.config;
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl;
    this.limiter = new RateLimiter({ intervalMs: options.config.minIntervalMs });
    this.recipes = new Cache<Stored<RecipeCore>>(
      options.config.cacheTtlMs,
      options.config.cacheMaxEntries,
    );
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

    const page = await this.limiter.schedule(() =>
      fetchPage({
        url,
        userAgent: this.config.userAgent,
        timeoutMs: this.config.timeoutMs,
        maxRetries: this.config.maxRetries,
        limiter: this.limiter,
        logger: this.logger,
        ...(this.fetchImpl ? { fetchImpl: this.fetchImpl } : {}),
      }),
    );

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
