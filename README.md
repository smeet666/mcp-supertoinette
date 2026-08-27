# mcp-supertoinette

[![CI](https://github.com/smeet666/mcp-supertoinette/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-supertoinette/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-supertoinette)](https://www.npmjs.com/package/mcp-supertoinette)
[![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

Read recipes from [Supertoinette](https://www.supertoinette.com) in an MCP
client: search them, read one, rescale it for another number of people, browse
the categories, and look up wine pairings.

Read-only. No API key, no account.

_[Version française](#mcp-supertoinette-français)_

---

## Install

```bash
claude mcp add supertoinette -- npx -y mcp-supertoinette
```

Or in any MCP client's configuration:

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

With Docker:

```bash
docker build -t mcp-supertoinette .
docker run -i --rm mcp-supertoinette
```

The container only needs to reach `www.supertoinette.com`.

## Tools

| Tool                | Purpose                                       |
| ------------------- | --------------------------------------------- |
| `search_recipes`    | Find recipes by dish or ingredient            |
| `get_recipe`        | Read one recipe, rescaled on request          |
| `list_categories`   | The categories recipes are browsed by         |
| `browse_recipes`    | One category's recipes                        |
| `get_wine_pairings` | Five wines for a dish, or the index of dishes |
| `scale_ingredients` | Rescale any French ingredient list, offline   |

A recipe is identified by the number in its address: `4210` in
`/recette/4210/veloute-de-gaverole.html`. `search_recipes` and `browse_recipes`
return that number on every row.

### `search_recipes`

| Argument   | Type    | Default  | Notes                                 |
| ---------- | ------- | -------- | ------------------------------------- |
| `query`    | string  | required | A dish or an ingredient, in French    |
| `limit`    | integer | 20       | 1 to 39                               |
| `page`     | integer | 1        | 1 to 1000                             |
| `category` | string  | —        | A facet **label**, such as `Poissons` |

```json
{
  "query": "cabillaud",
  "page": 1,
  "last_page": 2,
  "results": [
    {
      "id": "702",
      "title": "Cabillaud aux champignons",
      "url": "https://www.supertoinette.com/recette/702/cabillaud-aux-champignons.html",
      "image_url": "https://recette.supertoinette.com/new/…-800.webp",
      "categories": ["Sauces", "Poissons"]
    }
  ],
  "result_count": 20,
  "rows_published": 39,
  "total_available": null,
  "facets": [{ "label": "Poissons", "count": 60 }]
}
```

`category` takes one of the `facets` labels, spelled as it came back. An unknown
label finds nothing, so the filter is dropped, the search runs again without it,
and a note says which label went. `total_available` is always `null`, since
Supertoinette publishes no total; use `last_page`. Facet counts overlap, so they
add up to more than the rows served. A search mixes recipes with the site's own
editorial selections; the selections are removed, which is why `result_count`
can fall short of `limit`.

### `get_recipe`

| Argument   | Type    | Default  | Notes                     |
| ---------- | ------- | -------- | ------------------------- |
| `id`       | string  | required | The number in the address |
| `servings` | integer | —        | 1 to 1000                 |

```json
{
  "id": "4210",
  "title": "Velouté de gaverole au pravin",
  "url": "https://www.supertoinette.com/recette/4210/veloute-de-gaverole.html",
  "yield": { "original_text": "6 personnes", "requested": 4, "factor": 0.6667 },
  "ingredients": [
    {
      "text": "533 g de tiges de gaverole",
      "original": "800 g de tiges de gaverole",
      "scaling": "scaled",
      "amount": 533,
      "unit": "g",
      "is_heading": false
    }
  ],
  "steps": ["Émincer les tiges de gaverole."],
  "prep_minutes": 15,
  "cook_minutes": 25,
  "rest_minutes": 30,
  "total_minutes": 70,
  "difficulty": { "label": "Recette facile" },
  "cost_level": { "label": "Economique", "level": 1, "scale": 3 },
  "rating": { "value": 4.2, "count": 9, "scale": 5 },
  "tags": [{ "label": "Soupes & potages", "category": "91/recettes-soupes-potages" }],
  "faq": []
}
```

Times are in minutes, and `null` where Supertoinette publishes no value.
`difficulty` has a label and no scale, because the site publishes no scale for
it; `cost_level` has one, because the site draws it. `ingredient_sheets` holds
the site's own links, and about one in twenty points at a different ingredient
from the line beside it.

Asking for `servings` on a recipe whose yield has no number in it — "pour un
grand plat" — returns `invalid_input`. Asking for the `id` of a category page
returns `parse_failure`.

### `list_categories` and `browse_recipes`

`list_categories` takes no argument and returns the forty categories
Supertoinette lists on its pages:

```json
{
  "categories": [
    {
      "label": "Soupes & potages",
      "category": "91/recettes-soupes-potages",
      "url": "https://www.supertoinette.com/recettes/91/recettes-soupes-potages",
      "listed_in": "footer"
    }
  ],
  "category_count": 40
}
```

`listed_in` is `footer` for the kinds of dish and `menu` for the ways of cooking
and the seasons. A recipe's own `tags` open onto hundreds of further categories
that neither list holds.

`browse_recipes` reads one of them:

| Argument   | Type    | Default  | Notes                                        |
| ---------- | ------- | -------- | -------------------------------------------- |
| `category` | string  | required | A **token**, such as `107/recettes-desserts` |
| `limit`    | integer | 20       | 1 to 30                                      |
| `page`     | integer | 1        | 1 to 1000                                    |

The token is a number and a name together. Take it from `list_categories` or
from a recipe's `tags`, and pass it back unchanged: any other spelling of the
name reaches a page that does not exist. Each row adds `difficulty` and
`total_minutes` to what a search row holds.

> The `category` of `search_recipes` and the `category` of `browse_recipes` are
> different things. The first is a facet label (`Poissons`), the second is a
> token (`95/recettes-poissons`).

A page past the last one comes back with no rows and no error; compare `page`
with `last_page`.

### `get_wine_pairings`

Give `id` for one dish, or `page` for the alphabetical index of dishes. `kind`
says which of the two came back, and the other field is `null`.

| Argument | Type    | Notes                          |
| -------- | ------- | ------------------------------ |
| `id`     | string  | The number in a dish's address |
| `page`   | integer | 1 to 100, for the index        |

```json
{
  "kind": "dish",
  "dish": {
    "dish": "Aligot",
    "style": "Un vin blanc sec assez puissant, fin et très légèrement boisé",
    "pairings": [
      { "rank": "Bon accord", "wine": "Premières côtes de bordeaux" },
      { "rank": "Accord parfait", "wine": "Mâcon blanc" }
    ],
    "recipes": [{ "id": "1081", "title": "Aligot" }]
  },
  "index": null
}
```

The five ranks are Supertoinette's own wording, in its own order.

### `scale_ingredients`

Rescales any French ingredient list without touching the network.

| Argument                          | Type     | Notes                          |
| --------------------------------- | -------- | ------------------------------ |
| `ingredients`                     | string[] | 1 to 200 lines                 |
| `factor`                          | number   | Above 0, up to 100             |
| `from_servings` and `to_servings` | integer  | 1 to 1000, instead of `factor` |

Every line comes back marked. `scaled` is exact arithmetic. `rounded` moved to
an amount a kitchen can measure out, with a `note` giving the exact figure it
moved from. `unscaled` had no quantity to multiply. Units stay in the system the
recipe used, and an approximate measure keeps its own size: four times one
pincée is four pincées.

`get_recipe` applies the same rules when given `servings`.

## Settings

Environment variables, all optional. A value outside its range is refused on
stderr and the default applies.

| Variable                | Default | Range                                        |
| ----------------------- | ------- | -------------------------------------------- |
| `STO_USER_AGENT`        | —       | Your identifier, prepended to this project's |
| `STO_MIN_INTERVAL_MS`   | 3000    | 3000 to 60000                                |
| `STO_TIMEOUT_MS`        | 20000   | 1000 to 120000                               |
| `STO_MAX_RETRIES`       | 3       | 0 to 8                                       |
| `STO_CACHE_TTL_MS`      | 900000  | 0 to 86400000, 0 disables the cache          |
| `STO_CACHE_MAX_ENTRIES` | 200     | 1 to 5000                                    |
| `STO_LOG_LEVEL`         | `error` | `silent`, `error`, `info`, `debug`           |

One request at a time. `STO_MIN_INTERVAL_MS` raises the gap between two of them
above its 3000 ms floor, and no setting lowers it.

## Errors

| Code            | Meaning                                             |
| --------------- | --------------------------------------------------- |
| `not_found`     | Nothing at that address                             |
| `invalid_input` | The arguments could not produce a request           |
| `rate_limited`  | The site asked to slow down; retry in a moment      |
| `parse_failure` | The page arrived in a shape this server cannot read |
| `network_error` | The request failed                                  |
| `timeout`       | No answer within the deadline                       |

Each message starts with its code in brackets.

## As a library

The reading layer ships on its own, with its pacing, its cache and its error
handling:

```ts
import { SupertoinetteClient } from "mcp-supertoinette/client";
```

Quantities come back as Supertoinette published them; rescaling lives in the
tools above it.

## Attribution

Recipes, titles and photographs belong to Supertoinette. Credit the site and
link the page when you show a recipe.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Licensed under [MIT](LICENSE).

---

# mcp-supertoinette (français)

Lire les recettes de [Supertoinette](https://www.supertoinette.com) depuis un
client MCP : les chercher, en lire une, la remettre à l'échelle pour un autre
nombre de personnes, parcourir les catégories, consulter les accords mets-vins.

En lecture seule. Sans clé d'API, sans compte.

## Installation

```bash
claude mcp add supertoinette -- npx -y mcp-supertoinette
```

Ou dans la configuration de n'importe quel client MCP :

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

Avec Docker :

```bash
docker build -t mcp-supertoinette .
docker run -i --rm mcp-supertoinette
```

Le conteneur a seulement besoin de joindre `www.supertoinette.com`.

## Les outils

| Outil               | Rôle                                                     |
| ------------------- | -------------------------------------------------------- |
| `search_recipes`    | Chercher des recettes par plat ou par ingrédient         |
| `get_recipe`        | Lire une recette, remise à l'échelle sur demande         |
| `list_categories`   | Les catégories par lesquelles parcourir les recettes     |
| `browse_recipes`    | Les recettes d'une catégorie                             |
| `get_wine_pairings` | Cinq vins pour un plat, ou l'index des plats             |
| `scale_ingredients` | Remettre à l'échelle une liste d'ingrédients, hors ligne |

Une recette s'identifie par le numéro de son adresse : `4210` dans
`/recette/4210/veloute-de-gaverole.html`. `search_recipes` et `browse_recipes`
rendent ce numéro sur chaque ligne.

### `search_recipes`

| Argument   | Type   | Défaut      | Notes                                 |
| ---------- | ------ | ----------- | ------------------------------------- |
| `query`    | chaîne | obligatoire | Un plat ou un ingrédient              |
| `limit`    | entier | 20          | 1 à 39                                |
| `page`     | entier | 1           | 1 à 1000                              |
| `category` | chaîne | —           | Un **libellé** de facette, `Poissons` |

`category` prend un des libellés rendus dans `facets`, écrit tel quel. Un
libellé inconnu ne trouve rien : le filtre est alors écarté, la recherche
rejouée sans lui, et une note dit lequel est parti. `total_available` vaut
toujours `null`, Supertoinette ne publiant aucun total ; utilisez `last_page`.
Les compteurs de facettes se recoupent et leur somme dépasse le nombre de
lignes. Une recherche mêle les recettes aux sélections éditoriales du site ;
celles-ci sont retirées, ce qui explique un `result_count` inférieur au `limit`
demandé.

### `get_recipe`

| Argument   | Type   | Défaut      | Notes                  |
| ---------- | ------ | ----------- | ---------------------- |
| `id`       | chaîne | obligatoire | Le numéro de l'adresse |
| `servings` | entier | —           | 1 à 1000               |

Les temps sont en minutes, et valent `null` quand Supertoinette n'en publie
aucun. `difficulty` porte un libellé sans échelle, le site n'en publiant aucune ;
`cost_level` porte la sienne, le site la dessinant. `ingredient_sheets` contient
les liens du site lui-même, dont environ un sur vingt pointe vers un autre
ingrédient que celui de la ligne.

Demander `servings` sur une recette dont le rendement ne porte aucun nombre
— « pour un grand plat » — rend `invalid_input`. Demander l'`id` d'une page de
catégorie rend `parse_failure`.

### `list_categories` et `browse_recipes`

`list_categories` ne prend aucun argument et rend les quarante catégories que
Supertoinette liste sur ses pages. `listed_in` vaut `footer` pour les sortes de
plats et `menu` pour les façons de cuisiner et les saisons. Les `tags` d'une
recette ouvrent sur des centaines d'autres catégories qu'aucune des deux listes
ne porte.

`browse_recipes` en lit une :

| Argument   | Type   | Défaut      | Notes                                       |
| ---------- | ------ | ----------- | ------------------------------------------- |
| `category` | chaîne | obligatoire | Un **jeton**, comme `107/recettes-desserts` |
| `limit`    | entier | 20          | 1 à 30                                      |
| `page`     | entier | 1           | 1 à 1000                                    |

Le jeton est un numéro et un nom ensemble. Prenez-le dans `list_categories` ou
dans les `tags` d'une recette et repassez-le inchangé : toute autre écriture du
nom atteint une page inexistante. Chaque ligne ajoute `difficulty` et
`total_minutes` à ce que porte une ligne de recherche.

> Le `category` de `search_recipes` et celui de `browse_recipes` sont deux
> choses différentes. Le premier est un libellé de facette (`Poissons`), le
> second un jeton (`95/recettes-poissons`).

Une page au-delà de la dernière revient sans ligne et sans erreur ; comparez
`page` et `last_page`.

### `get_wine_pairings`

Donnez `id` pour un plat, ou `page` pour l'index alphabétique des plats. `kind`
indique laquelle des deux réponses arrive, l'autre champ valant `null`.

| Argument | Type   | Notes                            |
| -------- | ------ | -------------------------------- |
| `id`     | chaîne | Le numéro de l'adresse d'un plat |
| `page`   | entier | 1 à 100, pour l'index            |

Les cinq rangs sont ceux de Supertoinette, dans son ordre.

### `scale_ingredients`

Remet à l'échelle une liste d'ingrédients française sans toucher au réseau.

| Argument                         | Type     | Notes                            |
| -------------------------------- | -------- | -------------------------------- |
| `ingredients`                    | chaîne[] | 1 à 200 lignes                   |
| `factor`                         | nombre   | Au-dessus de 0, jusqu'à 100      |
| `from_servings` et `to_servings` | entier   | 1 à 1000, à la place de `factor` |

Chaque ligne revient marquée. `scaled` pour un calcul exact. `rounded` pour une
valeur ramenée à une quantité mesurable en cuisine, avec une `note` donnant le
chiffre exact dont elle a bougé. `unscaled` pour une ligne sans quantité à
multiplier. Les unités restent dans le système de la recette, et une mesure
approximative garde sa taille : quatre fois une pincée font quatre pincées.

`get_recipe` applique les mêmes règles quand on lui donne `servings`.

## Réglages

Variables d'environnement, toutes facultatives. Une valeur hors bornes est
refusée sur stderr et la valeur par défaut s'applique.

| Variable                | Défaut  | Bornes                                          |
| ----------------------- | ------- | ----------------------------------------------- |
| `STO_USER_AGENT`        | —       | Votre identifiant, placé devant celui du projet |
| `STO_MIN_INTERVAL_MS`   | 3000    | 3000 à 60000                                    |
| `STO_TIMEOUT_MS`        | 20000   | 1000 à 120000                                   |
| `STO_MAX_RETRIES`       | 3       | 0 à 8                                           |
| `STO_CACHE_TTL_MS`      | 900000  | 0 à 86400000, 0 désactive le cache              |
| `STO_CACHE_MAX_ENTRIES` | 200     | 1 à 5000                                        |
| `STO_LOG_LEVEL`         | `error` | `silent`, `error`, `info`, `debug`              |

Une requête à la fois. `STO_MIN_INTERVAL_MS` allonge l'écart entre deux d'entre
elles au-delà de son plancher de 3000 ms, et aucun réglage ne l'abaisse.

## Erreurs

| Code            | Sens                                                         |
| --------------- | ------------------------------------------------------------ |
| `not_found`     | Rien à cette adresse                                         |
| `invalid_input` | Les arguments ne pouvaient pas produire une requête          |
| `rate_limited`  | Le site a demandé de ralentir ; réessayez dans un moment     |
| `parse_failure` | La page est arrivée dans une forme illisible pour ce serveur |
| `network_error` | La requête a échoué                                          |
| `timeout`       | Aucune réponse dans le délai                                 |

Chaque message commence par son code entre crochets.

## Comme bibliothèque

La couche de lecture est publiée seule, avec son rythme, son cache et sa gestion
des erreurs :

```ts
import { SupertoinetteClient } from "mcp-supertoinette/client";
```

Les quantités reviennent telles que Supertoinette les publie ; la remise à
l'échelle vit dans les outils au-dessus.

## Attribution

Les recettes, les titres et les photographies appartiennent à Supertoinette.
Créditez le site et liez la page quand vous montrez une recette.

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md). Sous licence [MIT](LICENSE).
