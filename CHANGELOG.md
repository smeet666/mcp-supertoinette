# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the version numbers
follow [semantic versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2026-08-27

First release.

### Added

- `get_recipe` reads one recipe by the number in its address, returning the
  ingredients, the steps, the times, the difficulty, the cost, the rating and the
  categories the site publishes, with the quantities rescaled to a number of
  servings on request.
- `scale_ingredients` rescales a French ingredient list offline, saying of each
  line whether the result is the exact product, an amount it had to move to, or a
  line carrying nothing that could be multiplied.
- The reading layer is published on its own under the `./client` subpath, with
  its pacing, its storage and its error vocabulary and no protocol attached.

[0.1.0]: https://github.com/smeet666/mcp-supertoinette/releases/tag/v0.1.0
