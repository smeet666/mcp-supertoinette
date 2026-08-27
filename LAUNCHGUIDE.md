# mcp-supertoinette

Read recipes from Supertoinette in an MCP client. No API key, no account,
read-only.

## What it does

Six tools:

- **`search_recipes`** — find recipes by dish or ingredient.
- **`get_recipe`** — read one, rescaled to any number of people on request.
- **`list_categories`** — the categories recipes are browsed by.
- **`browse_recipes`** — one category's recipes, page by page.
- **`get_wine_pairings`** — five wines for a dish, ranked by the site.
- **`scale_ingredients`** — rescale any French ingredient list, offline.

## What sets it apart

Supertoinette prints the difficulty, the cost and the resting time on the page
and puts none of them in its machine-readable block. This server reads both and
returns all of it.

Rescaling marks every line: exact, rounded to a measurable amount, or left alone
for want of a quantity. Half an egg is not an amount, so a count lands on a
whole one and says so. Units stay in the system the recipe used.

A time the site publishes no value for comes back as `null`. Searches and
listings come with no total, because the site prints none.

## Install

```bash
npx mcp-supertoinette
```

Or in an MCP client's configuration:

```json
{
  "mcpServers": {
    "supertoinette": {
      "command": "npx",
      "args": ["-y", "mcp-supertoinette"]
    }
  }
}
```

## Links

- Source: https://github.com/smeet666/mcp-supertoinette
- Package: https://www.npmjs.com/package/mcp-supertoinette
- Licence: MIT
