# mcp-supertoinette

[![CI](https://github.com/smeet666/mcp-supertoinette/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-supertoinette/actions/workflows/ci.yml)
[![npm](https://img.shields.io/npm/v/mcp-supertoinette)](https://www.npmjs.com/package/mcp-supertoinette)
[![licence MIT](https://img.shields.io/badge/licence-MIT-blue)](LICENSE)

An MCP server that reads recipes on [Supertoinette](https://www.supertoinette.com).
Read-only, no API key, no account.

_[Version française](#mcp-supertoinette-français)_

---

## Why it exists

Supertoinette has published French recipes since 2002, and a recipe page says
more than its structured block does. The difficulty, the cost and the resting
time are printed for a cook to read and appear nowhere in the machine-readable
part. Meanwhile the structured block says three things that are not so: it
repeats the last step of every recipe, it writes a time the page never displays
as zero, and on a listing page it calls a category a recipe.

A reader that took either source alone would drop what the page shows or repeat
what the block gets wrong. This server reads both and lets the page settle it.

## The tools

### `get_recipe`

Reads one recipe by the number in its address: 4210 in
`/recette/4210/veloute-de-gaverole.html`. The number is the whole of the
address, since the site redirects any spelling of the name to the right page.

| Argument   | Type              | Meaning                             |
| ---------- | ----------------- | ----------------------------------- |
| `id`       | string            | The number in the recipe's address  |
| `servings` | integer, optional | Rescale the quantities to this many |

```json
{
  "id": "4210",
  "title": "Velouté de gaverole au pravin",
  "title_as_published": "🥣Velouté de gaverole au pravin",
  "url": "https://www.supertoinette.com/recette/4210/veloute-de-gaverole.html",
  "yield": {
    "original_count": 6,
    "original_text": "6 personnes",
    "requested": 4,
    "unit": "personnes",
    "factor": 0.6667
  },
  "ingredients": [
    {
      "text": "533 g de tiges de gaverole",
      "original": "800 g de tiges de gaverole",
      "scaling": "scaled",
      "amount": 533,
      "amount_max": null,
      "unit": "g",
      "is_heading": false
    }
  ],
  "steps": ["Émincer les tiges de gaverole."],
  "prep_minutes": 15,
  "cook_minutes": 25,
  "total_minutes": 70,
  "rest_minutes": 30,
  "difficulty": { "label": "Recette facile" },
  "cost_level": { "label": "Economique", "level": 1, "scale": 3 },
  "rating": { "value": 4.2, "count": 9, "scale": 5 },
  "nutrition": null,
  "tags": [
    {
      "label": "Soupes & potages",
      "category": "91/recettes-soupes-potages",
      "url": "https://www.supertoinette.com/recettes/91/recettes-soupes-potages"
    }
  ],
  "ingredient_sheets": [
    {
      "line": "de tiges de gaverole",
      "sheet_id": "311",
      "slug": "gaverole",
      "url": "https://www.supertoinette.com/fiche-cuisine/311/gaverole.html"
    }
  ],
  "faq": [],
  "source": "Supertoinette",
  "notes": ["…"]
}
```

### `scale_ingredients`

Rescales a list a caller already holds. Offline: it reaches no site.

| Argument                                        | Type     | Meaning                             |
| ----------------------------------------------- | -------- | ----------------------------------- |
| `ingredients`                                   | string[] | The lines, as the recipe wrote them |
| `factor` **or** `from_servings` + `to_servings` | number   | What to multiply by                 |

```json
{
  "factor": 0.5,
  "ingredients": [
    {
      "text": "2 oeufs",
      "original": "3 oeufs",
      "scaling": "rounded",
      "amount": 2,
      "amount_max": null,
      "unit": null,
      "is_heading": false,
      "note": "Rounded up from 1,5."
    }
  ],
  "scaled_count": 0,
  "rounded_count": 1,
  "unscaled_count": 0,
  "notes": ["…"]
}
```

## What the answers refuse to overstate

Each of these comes from something the site actually does, measured over a
hundred recipes drawn across the whole catalogue.

**A step the site prints twice is rendered once.** The structured block of every
recipe repeats its last instruction. The steps are read from the list the page
prints, where the count is right.

**A time the site does not publish is `null`, never zero.** The block writes
`PT0M` for a time the page displays no badge for, and on the hundred recipes
measured the two coincide exactly. A cooking time of `null` therefore means the
site said nothing, rather than that the dish is not cooked.

**The resting time is published, and only on the page.** The site prints it as
`Pause`, and `total = preparation + cooking + rest` holds on every recipe
measured.

**The difficulty carries no scale.** The site prints a wording and never says how
many degrees its scale holds, so the answer carries the wording alone. The cost
carries its scale, because the page draws it: a level of 1 out of 3 is the number
of symbols the page lit out of the number it drew.

**An ingredient sheet is the site's own link.** On the corpus measured, 36 of 770
of those links point at a page naming a different ingredient from the line: a
line reading "de crème" links to the page for pineapple. The link travels as the
site's own rather than as the identity of the ingredient.

**A listing is refused rather than read as a dish.** A category page publishes a
structured block of type Recipe carrying the category's name and an image
borrowed from one of its recipes. Asking for such a page returns `parse_failure`.

**A rescaled line says what was done to it.** `scaled` means the number is the
product itself. `rounded` means the value moved, because a countable thing was
taken to the smallest share a cook can measure out or a floor was reached.
`unscaled` means the line carries nothing multipliable, and it comes back exactly
as published.

**Nothing is converted between unit systems**, and an approximate measure keeps
its own size: a pincée multiplied by four is four pincées, and how big one is
stays the cook's business.

**Rescaling is refused where the yield carries no number.** A recipe the site
serves "pour un grand plat" gives nothing to scale from, and inventing a
proportion would put a figure on every line of the answer.

## Install

```bash
npx mcp-supertoinette
```

### Claude Code

```bash
claude mcp add supertoinette -- npx -y mcp-supertoinette
```

### Any MCP client

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

### Container

```bash
docker build -t mcp-supertoinette .
docker run -i --rm mcp-supertoinette
```

The container needs to reach `www.supertoinette.com` and nothing else. It takes
no credentials, because there are none to take.

## Settings

Every setting is an environment variable, and none is required. A value outside
its range is refused with a line on stderr and the default stands: a setting that
cannot take effect says so rather than being quietly clamped.

| Variable                | Default | Range                                                                              |
| ----------------------- | ------- | ---------------------------------------------------------------------------------- |
| `STO_USER_AGENT`        | —       | Your own identifier. This project's stays appended, so the site can reach a human. |
| `STO_MIN_INTERVAL_MS`   | 3000    | 3000 to 60000                                                                      |
| `STO_TIMEOUT_MS`        | 20000   | 1000 to 120000                                                                     |
| `STO_MAX_RETRIES`       | 3       | 0 to 8                                                                             |
| `STO_CACHE_TTL_MS`      | 900000  | 0 to 86400000, 0 turns storage off                                                 |
| `STO_CACHE_MAX_ENTRIES` | 200     | 1 to 5000                                                                          |
| `STO_LOG_LEVEL`         | `error` | `silent`, `error`, `info`, `debug`                                                 |

The pacing floor cannot be lowered from outside. The site is free to read and
publishes no crawl delay, which is a reason to be careful rather than a licence
to be fast. Its `robots.txt` also lays a hundred one-word paths as traps for a
crawler that follows whatever it finds, so this server builds every address from
an identifier and follows no link it read on a page.

## As a library

The reading layer is published on its own, with its pacing, its storage and its
error vocabulary and no protocol attached. It returns quantities as the site
published them:

```ts
import { SupertoinetteClient } from "mcp-supertoinette/client";
```

## Errors

Six codes and no more. A caller branches on the code that opens the message.

| Code            | What it means                                                                           |
| --------------- | --------------------------------------------------------------------------------------- |
| `not_found`     | The site holds nothing at that address                                                  |
| `invalid_input` | The arguments could not produce a request                                               |
| `rate_limited`  | The site asked this client to slow down. It says nothing about whether anything matched |
| `parse_failure` | An answer arrived in a shape this server cannot read                                    |
| `network_error` | The request could not be completed                                                      |
| `timeout`       | No answer arrived within the deadline                                                   |

## Attribution

Recipes, titles and photographs belong to Supertoinette. Every answer carries the
source, and a recipe shown to a reader should credit the site and link the page.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md). Tests come first, coverage has a floor of
100%, and the rule everything follows is that the server never says anything the
data does not carry.

Licensed under [MIT](LICENSE).

---

# mcp-supertoinette (français)

Un serveur MCP qui lit les recettes de
[Supertoinette](https://www.supertoinette.com). En lecture seule, sans clé d'API
et sans compte.

## Pourquoi il existe

Supertoinette publie des recettes françaises depuis 2002, et sa page dit plus que
son bloc structuré. La difficulté, le coût et le temps de repos sont imprimés
pour une cuisinière et n'existent nulle part dans la partie lisible par une
machine. Pendant ce temps, le bloc structuré affirme trois choses fausses : il
répète la dernière étape de chaque recette, il écrit à zéro un temps que la page
n'affiche pas, et sur une page de liste il appelle recette une catégorie.

Un lecteur qui prendrait l'une des deux sources seule perdrait ce que la page
montre ou répéterait ce que le bloc se trompe. Ce serveur lit les deux et laisse
la page trancher.

## Les outils

### `get_recipe`

Lit une recette par le numéro de son adresse : 4210 dans
`/recette/4210/veloute-de-gaverole.html`. Le numéro est toute l'adresse, puisque
le site redirige n'importe quelle écriture du nom vers la bonne page.

| Argument   | Type               | Sens                                 |
| ---------- | ------------------ | ------------------------------------ |
| `id`       | chaîne             | Le numéro de l'adresse de la recette |
| `servings` | entier, facultatif | Remet les quantités pour ce nombre   |

### `scale_ingredients`

Remet à l'échelle une liste que l'appelant tient déjà. Hors ligne : aucun site
n'est interrogé.

| Argument                                        | Type     | Sens                          |
| ----------------------------------------------- | -------- | ----------------------------- |
| `ingredients`                                   | chaîne[] | Les lignes, telles qu'écrites |
| `factor` **ou** `from_servings` + `to_servings` | nombre   | Ce par quoi multiplier        |

## Ce que les réponses refusent d'affirmer

Chacun de ces points vient d'une mesure faite sur cent recettes tirées dans tout
le catalogue.

**Une étape que le site imprime deux fois est rendue une fois.** Le bloc
structuré de chaque recette répète sa dernière instruction. Les étapes se lisent
dans la liste que la page imprime, où le compte est juste.

**Un temps que le site ne publie pas vaut `null`, jamais zéro.** Le bloc écrit
`PT0M` pour un temps dont la page n'affiche aucun badge, et sur les cent recettes
mesurées les deux coïncident exactement.

**Le temps de repos est publié, et seulement sur la page.** Le site l'imprime
sous `Pause`, et `total = préparation + cuisson + repos` tient sur toutes les
recettes mesurées.

**La difficulté ne porte aucune échelle.** Le site imprime un libellé sans jamais
dire combien de degrés compte son échelle, donc la réponse porte le libellé seul.
Le coût porte la sienne, parce que la page la dessine.

**Une fiche d'ingrédient est le lien du site.** Sur le corpus mesuré, 36 liens
sur 770 pointent vers une page nommant un autre ingrédient que la ligne : une
ligne « de crème » mène à la page de l'ananas. Le lien voyage comme le lien du
site, jamais comme l'identité de l'ingrédient.

**Une page de liste est refusée plutôt que lue comme un plat.** Elle publie un
bloc structuré de type Recipe portant le nom de la catégorie. La demander rend
`parse_failure`.

**Une ligne remise à l'échelle dit ce qu'on lui a fait.** `scaled` : le nombre
rendu est le produit lui-même. `rounded` : la valeur a bougé, parce qu'un objet
comptable est tombé sur la plus petite part qu'une cuisine sait prélever, ou
qu'un plancher a été atteint. `unscaled` : la ligne ne porte rien de
multipliable, et elle repart telle que publiée.

**Rien n'est converti entre systèmes d'unités**, et une mesure approximative
garde sa taille : une pincée multipliée par quatre fait quatre pincées, et la
taille de l'une reste l'affaire de la cuisinière.

**La remise à l'échelle est refusée quand le rendement ne porte aucun nombre.**
Une recette servie « pour un grand plat » ne donne rien à multiplier, et inventer
une proportion mettrait un chiffre sur chaque ligne de la réponse.

## Installation

```bash
npx mcp-supertoinette
```

### Claude Code

```bash
claude mcp add supertoinette -- npx -y mcp-supertoinette
```

### N'importe quel client MCP

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

### Conteneur

```bash
docker build -t mcp-supertoinette .
docker run -i --rm mcp-supertoinette
```

Le conteneur doit joindre `www.supertoinette.com` et rien d'autre. Il ne prend
aucun identifiant, puisqu'il n'y en a aucun à prendre.

## Réglages

Chaque réglage est une variable d'environnement, et aucune n'est obligatoire. Une
valeur hors bornes est refusée par une ligne sur stderr et la valeur par défaut
tient : un réglage qui ne peut pas s'appliquer le dit plutôt que d'être ramené en
silence dans les bornes.

| Variable                | Défaut  | Bornes                                                                     |
| ----------------------- | ------- | -------------------------------------------------------------------------- |
| `STO_USER_AGENT`        | —       | Votre identifiant. Celui du projet reste ajouté, pour joindre une personne |
| `STO_MIN_INTERVAL_MS`   | 3000    | 3000 à 60000                                                               |
| `STO_TIMEOUT_MS`        | 20000   | 1000 à 120000                                                              |
| `STO_MAX_RETRIES`       | 3       | 0 à 8                                                                      |
| `STO_CACHE_TTL_MS`      | 900000  | 0 à 86400000, 0 coupe le stockage                                          |
| `STO_CACHE_MAX_ENTRIES` | 200     | 1 à 5000                                                                   |
| `STO_LOG_LEVEL`         | `error` | `silent`, `error`, `info`, `debug`                                         |

Le plancher de rythme ne s'abaisse pas depuis l'extérieur. Le site est gratuit et
ne publie aucun délai d'exploration, ce qui est une raison d'être prudent. Son
`robots.txt` pose en outre une centaine de chemins d'un seul mot comme pièges à
robots, donc ce serveur construit chaque adresse à partir d'un identifiant et ne
suit aucun lien lu dans une page.

## Comme bibliothèque

La couche de lecture est publiée seule, avec son rythme, son stockage et son
vocabulaire d'erreurs, sans protocole attaché. Elle rend les quantités telles que
le site les a publiées :

```ts
import { SupertoinetteClient } from "mcp-supertoinette/client";
```

## Erreurs

Six codes et pas un de plus. Un appelant branche sur le code qui ouvre le
message.

| Code            | Ce qu'il veut dire                                                     |
| --------------- | ---------------------------------------------------------------------- |
| `not_found`     | Le site ne porte rien à cette adresse                                  |
| `invalid_input` | Les arguments ne pouvaient pas produire une requête                    |
| `rate_limited`  | Le site a demandé de ralentir. Il ne dit rien sur ce qui correspondait |
| `parse_failure` | Une réponse est arrivée dans une forme que ce serveur ne sait pas lire |
| `network_error` | La requête n'a pas pu aboutir                                          |
| `timeout`       | Aucune réponse n'est arrivée dans le délai                             |

## Attribution

Les recettes, les titres et les photographies appartiennent à Supertoinette.
Chaque réponse porte la source, et une recette montrée à un lecteur doit créditer
le site et lier la page.

## Contribuer

Voir [CONTRIBUTING.md](CONTRIBUTING.md). Les tests d'abord, la couverture a un
plancher à 100 %, et la règle que tout suit est qu'un serveur ne dit jamais
quelque chose que la donnée ne porte pas.

Sous licence [MIT](LICENSE).
