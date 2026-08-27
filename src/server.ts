/**
 * MCP server wiring.
 *
 * One client, one rate limiter and one store are shared by every tool, so
 * pacing applies to the server as a whole rather than per tool. Tools are
 * registered in a fixed order, which is what lets a client cache the listing.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import type { Config, Logger } from "./config.js";
import { createLogger, loadConfig } from "./config.js";
import { SupertoinetteClient } from "./supertoinette/client.js";
import type { GetRecipeArgs } from "./tools/getRecipe.js";
import {
  getRecipeArgs,
  getRecipeDescription,
  getRecipeOutputShape,
  runGetRecipe,
} from "./tools/getRecipe.js";
import type { SearchRecipesArgs } from "./tools/searchRecipes.js";
import {
  runSearchRecipes,
  searchRecipesArgs,
  searchRecipesDescription,
  searchRecipesOutputShape,
} from "./tools/searchRecipes.js";
import type { ScaleIngredientsArgs } from "./tools/scaleIngredients.js";
import {
  runScaleIngredients,
  scaleIngredientsArgs,
  scaleIngredientsDescription,
  scaleIngredientsOutputShape,
} from "./tools/scaleIngredients.js";
import { toToolError } from "./tools/shared.js";
import { PKG_VERSION } from "./version.js";

export interface CreateServerOptions {
  config?: Config;
  logger?: Logger;
  fetchImpl?: typeof fetch;
}

/** This server only reads, so every tool is read-only. */
const READ_ONLY = {
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: true,
} as const;

export const INSTRUCTIONS = [
  "Tools for reading recipes on Supertoinette, a French recipe site. No API key and no account are needed.",
  "Start from search_recipes when you have a dish or an ingredient rather than an identifier.",
  "A recipe is addressed by the number in its address, such as 4210 in /recette/4210/veloute-de-gaverole.html, and that number is the whole of the address: the site redirects any spelling of the name to the right page.",
  "Times come back in minutes, and a time the site does not publish is null. The site writes zero for a time it does not display, so a null here means the site said nothing rather than that the step takes no time.",
  "The difficulty carries the site's own wording and no scale, because the site publishes none. The cost carries the scale the site draws, so a level of 1 out of 3 is what the page showed.",
  "Each ingredient line carries its quantity apart from the words naming the ingredient, and a line the site prints as a heading is marked as one.",
  "An ingredient sheet is a page the site links a line to, and the site sometimes links a line to a different ingredient than the line names. Treat it as the site's own link.",
  "Quantities come back as the site published them; pass 'servings' to get_recipe to rescale them, or use scale_ingredients on a list you already hold.",
  "Every rescaled line says what was done to it: 'scaled' when the arithmetic landed exactly, 'rounded' when the value had to move to stay an amount a kitchen can measure out, and 'unscaled' when the line carries no quantity.",
  "Nothing is converted between unit systems, and an approximate measure such as a pincée keeps the size the cook gives it.",
  "A search publishes no total, because the site prints none: 'last_page' says how far the results run. The categories counted beside a search are returned as 'facets', and a category is passed back exactly as the site spells it, never built by hand.",
  "This server paces itself, and a rate_limited error means the site asked it to slow down, never that nothing matched.",
  "When you show a recipe to a user, credit Supertoinette and link the page.",
].join(" ");

export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = options.config ?? loadConfig();
  const logger = options.logger ?? createLogger(config.logLevel);
  const client = new SupertoinetteClient({
    config,
    logger,
    ...(options.fetchImpl ? { fetchImpl: options.fetchImpl } : {}),
  });

  const server = new McpServer(
    { name: "mcp-supertoinette", version: PKG_VERSION },
    { instructions: INSTRUCTIONS },
  );

  server.registerTool(
    "get_recipe",
    {
      title: "Read one recipe",
      description: getRecipeDescription,
      inputSchema: getRecipeArgs,
      outputSchema: z.object(getRecipeOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return await runGetRecipe(client, args as GetRecipeArgs);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "search_recipes",
    {
      title: "Search the recipes",
      description: searchRecipesDescription,
      inputSchema: searchRecipesArgs,
      outputSchema: z.object(searchRecipesOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return await runSearchRecipes(client, args as SearchRecipesArgs);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  server.registerTool(
    "scale_ingredients",
    {
      title: "Rescale a list of ingredients",
      description: scaleIngredientsDescription,
      inputSchema: scaleIngredientsArgs,
      outputSchema: z.object(scaleIngredientsOutputShape),
      annotations: READ_ONLY,
    },
    async (args) => {
      try {
        return await runScaleIngredients(args as ScaleIngredientsArgs);
      } catch (error) {
        return toToolError(error);
      }
    },
  );

  logger.info(
    `ready: user-agent="${config.userAgent}", min interval ${config.minIntervalMs}ms, cache ${config.cacheTtlMs}ms`,
  );

  return server;
}
