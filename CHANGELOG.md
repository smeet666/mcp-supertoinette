# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the version numbers
follow [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2026-08-27

The tool surface is settled, which is what this number says. Nothing an
installed 0.1.0 relied on has moved.

### Added

- `list_categories` publishes the categories the site browses its recipes by,
  each with the token that opens its listing and where the site printed it.
- `browse_recipes` reads one category's recipes page by page, with the
  difficulty and the total time the site prints beside each.
- `get_wine_pairings` reads the five wines the site ranks for a dish, in its own
  words, or one page of its alphabetical index of dishes.

## [0.1.0] - 2026-08-27

First release.

### Added

- `search_recipes` searches by a dish or an ingredient, returning the categories
  the site counts beside the results and the identifier to read each recipe with.
- `get_recipe` reads one recipe by the number in its address, returning the
  ingredients, the steps, the times, the difficulty, the cost, the rating and the
  categories the site publishes, with the quantities rescaled to a number of
  servings on request.
- `scale_ingredients` rescales a French ingredient list offline, saying of each
  line whether the result is the exact product, an amount it had to move to, or a
  line carrying nothing that could be multiplied.
- The reading layer is published on its own under the `./client` subpath, with
  its pacing, its storage and its error vocabulary and no protocol attached.

[1.0.0]: https://github.com/smeet666/mcp-supertoinette/releases/tag/v1.0.0
[0.1.0]: https://github.com/smeet666/mcp-supertoinette/releases/tag/v0.1.0
