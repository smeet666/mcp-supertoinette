# mcp-supertoinette

Read Supertoinette from an MCP client. No API key, no account, read-only.

## What it does

**`get_recipe`** reads one recipe by the number in its address, and returns the
ingredients, the steps, the times, the difficulty and the cost the site
publishes, rescaled to a number of servings on request.

**`scale_ingredients`** rescales a French ingredient list offline, saying of each
line whether the result is the exact product, an amount it had to move to, or a
line carrying nothing that could be multiplied.

## What sets it apart

A recipe page says more than its structured block, and the block says three
things that are not so. It repeats the last step of every recipe, it writes a
time the page never displays as zero, and on a listing page it calls a category a
recipe. This server reads both and lets the page settle it: a step is rendered
once, a time the site does not publish comes back null rather than as no time at
all, and a listing served in place of a recipe is refused rather than rendered as
a dish.

The resting time and the cost exist only on the page, so they are read there. The
difficulty carries the site's own wording and no scale, because the site
publishes none. An ingredient sheet travels as the link the site chose, since on
a hundred recipes measured, 36 of 770 of those links name a different ingredient
from the line they sit on.

A rescaled line never overstates its own exactness. Nothing is converted between
unit systems, an approximate measure keeps the size the cook gives it, and a
yield the site stated with no number is refused rather than scaled from an
invented proportion.

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
