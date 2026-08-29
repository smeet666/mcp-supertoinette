<img src="assets/icon-128.png" alt="" width="96" align="right">

# mcp-supertoinette

[![npm](https://img.shields.io/npm/v/mcp-supertoinette.svg)](https://www.npmjs.com/package/mcp-supertoinette)
[![CI](https://github.com/smeet666/mcp-supertoinette/actions/workflows/ci.yml/badge.svg)](https://github.com/smeet666/mcp-supertoinette/actions/workflows/ci.yml)
[![license](https://img.shields.io/npm/l/mcp-supertoinette.svg)](./LICENSE)
[![MCP Registry](https://img.shields.io/badge/MCP_Registry-listed-6E56CF)](https://registry.modelcontextprotocol.io/v0/servers?search=io.github.smeet666/mcp-supertoinette)
[![Glama](https://glama.ai/mcp/servers/smeet666/mcp-supertoinette/badges/score.svg)](https://glama.ai/mcp/servers/smeet666/mcp-supertoinette)
[![M8ven](https://m8ven.ai/badge/mcp/smeet666-mcp-supertoinette-1wjyto?variant=verified)](https://m8ven.ai/mcp/smeet666-mcp-supertoinette-1wjyto)
[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=supertoinette&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1zdXBlcnRvaW5ldHRlIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=supertoinette&config=%7B%22name%22%3A%22supertoinette%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-supertoinette%22%5D%7D)

[Supertoinette](https://www.supertoinette.com) is a French cooking site, one of
the oldest still standing. Its recipes give their ingredients, their steps, their
preparation, cooking and resting times, the number of people they feed and the
photographs of the dish. Beside the recipes it keeps a set of pages of its own on
what to drink with a dish, matching a wine to it and saying which style it
belongs to.

This server connects a chat client to that site. You can search its recipes, read
one with its ingredients rescaled to the number of people at your table, walk its
categories, read a category page by page, and look up what it suggests drinking
with a dish. It needs no API key and no account.

_[Version française](#mcp-supertoinette-français)_

---

## Install

**One-click install**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=supertoinette&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1zdXBlcnRvaW5ldHRlIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=supertoinette&config=%7B%22name%22%3A%22supertoinette%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-supertoinette%22%5D%7D)

**Claude Code**

```bash
claude mcp add supertoinette -- npx -y mcp-supertoinette
```

**Claude Desktop, Cursor, and any client using the standard config format**

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

Node 24 or later is required, and no environment variable has to be set.

### With Docker

```json
{
  "mcpServers": {
    "supertoinette": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-supertoinette:1.0.1"]
    }
  }
}
```

`-i` keeps stdin open, which is where the protocol travels, and `-t` is left out
because a TTY rewrites the stream. The container needs outbound HTTPS to
`www.supertoinette.com`, and nothing else: no volume, no port, no credential.

### Bundle, without npm

Download `mcp-supertoinette-1.0.1.mcpb` from
[the latest release](https://github.com/smeet666/mcp-supertoinette/releases/latest)
and open it. A client that supports MCP bundles installs it on its own, with no
npm and no configuration file to edit. The bundle carries its dependencies, so
nothing is fetched at install time.

## What you can ask

- « Trouve-moi une recette de blanquette de veau. »
- "Read me that recipe for ten people."
- "What categories does the site file its recipes under?"
- "What wine goes with a beef bourguignon?"
- "Scale this ingredient list from my grandmother's notebook by three."

Supertoinette is a French site, so its recipes are found in French. The ordinary
path runs from a search to a recipe: a row carries an `id`, and `get_recipe`
takes that id.

## Tools

| Tool                | What it does                                                   |
| ------------------- | -------------------------------------------------------------- |
| `get_recipe`        | Reads one recipe, rescaled to a number of servings on request. |
| `search_recipes`    | Finds recipes by dish or by ingredient.                        |
| `list_categories`   | Reads the categories the site files its recipes under.         |
| `browse_recipes`    | Reads one category, page by page.                              |
| `get_wine_pairings` | Reads what the site suggests drinking with a dish.             |
| `scale_ingredients` | Rescales any ingredient list, with no request to the site.     |

### `get_recipe`

Reads one recipe in full, and rescales its ingredients when a number of servings
is given.

| Argument   | Type                       | Required | What it does                                           |
| ---------- | -------------------------- | -------- | ------------------------------------------------------ |
| `id`       | string, 1 to 10 characters | yes      | The number in a recipe's address, as a row carries it. |
| `servings` | integer, 1 to 1000         | no       | Rescale the ingredients to this many servings.         |

**In return:** `title` with the pictogram the site opens it with taken off, and
`title_as_published` exactly as the site wrote it; `url`; `description`;
`published_at`; `intro`, the prose printed above the method; `steps`;
`prep_minutes`, `cook_minutes`, `rest_minutes` and `total_minutes`; `category`;
`author`; and `rating`, each `null` where the page states nothing. `yield` says
what the recipe was written for and what it was rescaled to. `ingredients`
carries the lines with the headings the page groups them under, which is what
`ingredient_count` counts, and each line's `scaling` reads `scaled`, `rounded` or
`unscaled`.

### `search_recipes`

Searches the recipes for a dish or an ingredient, one page at a time.

| Argument   | Type                        | Required | What it does                                                      |
| ---------- | --------------------------- | -------- | ----------------------------------------------------------------- |
| `query`    | string, 1 to 120 characters | yes      | A dish or an ingredient, in French.                               |
| `limit`    | integer, 1 to 39            | no       | Rows to serve.                                                    |
| `page`     | integer, 1 to 1000          | no       | Which page of results to read, the first by default.              |
| `category` | string, 1 to 60 characters  | no       | One category, spelled as a previous answer's `facets` spelled it. |

**In return:** rows carrying `id`, which `get_recipe` takes, `title`,
`title_as_published` and `url`. Alongside come `page`, `last_page` for the
highest page the site links to from this one, `result_count`, `rows_published`
for the rows the page held before any were rendered, `total_available` and
`facets`, which publishes the category wordings a further search takes. Never
build a category wording by hand: the site answers one it does not know with a
page that reads as an absence.

### `list_categories`

Reads the categories the site files its recipes under. It takes no argument.

**In return:** `categories`, with `category_count` for the entries the site's two
lists hold, and the `url` they were read from. Pass a category on to
`browse_recipes`.

### `browse_recipes`

Reads one category, page by page.

| Argument   | Type                       | Required | What it does                                   |
| ---------- | -------------------------- | -------- | ---------------------------------------------- |
| `category` | string, 1 to 80 characters | yes      | A category, as `list_categories` published it. |
| `limit`    | integer, 1 to 30           | no       | Rows to serve.                                 |
| `page`     | integer, 1 to 1000         | no       | Which page to read, the first by default.      |

**In return:** the rows and the envelope `search_recipes` returns, with
`last_page` saying how far the listing runs.

### `get_wine_pairings`

Reads what the site suggests drinking with a dish, from the pages it wrote on the
subject.

| Argument | Type                       | Required   | What it does                                |
| -------- | -------------------------- | ---------- | ------------------------------------------- |
| `id`     | string, 1 to 10 characters | one of two | The number in a dish's address.             |
| `page`   | integer, 1 to 100          | one of two | A page of the site's own listing of dishes. |

**In return:** entries carrying the `id`, the `dish` under the site's own name
for it, and `style`, the style of wine the page opens with, which is `null` where
it wrote none.

### `scale_ingredients`

Applies the same arithmetic to any list of French ingredient lines, with no
request to the site.

| Argument        | Type                                           | Required   | What it does                                    |
| --------------- | ---------------------------------------------- | ---------- | ----------------------------------------------- |
| `ingredients`   | array of 1 to 200 strings, 1 to 300 characters | yes        | The lines to rescale, as the recipe wrote them. |
| `factor`        | number, above 0 and up to 100                  | one of two | What to multiply the quantities by.             |
| `from_servings` | integer, 1 to 1000                             | one of two | How many the list was written for.              |
| `to_servings`   | integer, 1 to 1000                             | one of two | How many it should feed.                        |

Pass `factor`, or the `from_servings` and `to_servings` pair.

**In return:** the rescaled lines in the shape `get_recipe` returns, each with
its `scaling`.

## Rescaling the quantities

A quantity is stated in the unit that suits it, so a line can come back in a
different unit from the one the recipe used: 200 g multiplied by twenty reads
`4 kg`.

How finely an ingredient can be divided depends on what it is. A baguette can be
cut in two, in three or in four; an egg cannot be shared out. A quantity landing
between the two is rounded, and the rescaled recipe then departs a little from
the proportions of the original. The line carries `rounded`, and its note says
what was done.

The figures are this server's arithmetic, so say they were recomputed when you
show them. A recipe whose page states no number of servings cannot be put to a
number of people, and the answer says so.

## Configuration

Every variable is optional. Set them in the `env` block of your client config.

| Variable                | Default              | What it does                                                                       |
| ----------------------- | -------------------- | ---------------------------------------------------------------------------------- |
| `STO_USER_AGENT`        | the project identity | Names your application to the site, with an address where a person can be reached. |
| `STO_MIN_INTERVAL_MS`   | `3000`               | Gap between two requests, from 3000 to 60000.                                      |
| `STO_TIMEOUT_MS`        | `20000`              | Deadline for one request, from 1000 to 120000.                                     |
| `STO_MAX_RETRIES`       | `3`                  | Attempts after a transient failure, from 0 to 8.                                   |
| `STO_CACHE_TTL_MS`      | `900000`             | How long a page stays in memory, from 0 to 86400000.                               |
| `STO_CACHE_MAX_ENTRIES` | `200`                | Pages held in memory at once, from 1 to 5000.                                      |
| `STO_LOG_LEVEL`         | `error`              | `silent`, `error`, `info` or `debug`, written to stderr.                           |

A value outside its range falls back to the default, and the reason is written to
stderr.

## Errors

Every failure carries one of six codes, a message, and where it helps a hint
naming the next move.

| Code            | What happened                                           | What to do                                                                                                   |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `not_found`     | The site answered, and holds no such recipe or page.    | Check the id with `search_recipes`.                                                                          |
| `invalid_input` | The arguments were refused before any request went out. | Read the message, which names the argument.                                                                  |
| `rate_limited`  | The site asked this client to slow down.                | Wait the number of seconds the hint names and call again with the same arguments. The recipe is still there. |
| `parse_failure` | The page loaded and the expected content was absent.    | Report it at [the issue tracker](https://github.com/smeet666/mcp-supertoinette/issues).                      |
| `network_error` | The request did not complete.                           | Try again shortly.                                                                                           |
| `timeout`       | The request passed its deadline.                        | Raise `STO_TIMEOUT_MS`, or ask for fewer rows.                                                               |

## As a library

The layer reading the site is published on its own, with its pacing, its cache
and its errors, and with no protocol attached.

```ts
import { SupertoinetteClient } from "mcp-supertoinette/client";

const client = new SupertoinetteClient();
const { data, cached } = await client.getRecipe({ id: "10" });
console.log(data.title, data.ingredients.length, cached);
```

`searchRecipes`, `browseRecipes`, `getRecipe` and `getPairings` each answer
`{ data, cached }`, and throw an error carrying one of the six codes. The
three-second floor between two requests holds here as well.

## Pacing and attribution

Requests go out one at a time with at least three seconds between them, and that
floor holds however the server is configured. The `User-Agent` always ends with
the project identity and an address where a person can be reached.

Every result carries the address of the page it was read from, and `source` names
the site. Recipes, titles and photographs belong to Supertoinette.

This MCP server is an unofficial project, with no affiliation to Supertoinette.

## Privacy

This server collects nothing about you and sends nothing to its author. It runs
on your machine, contacts `www.supertoinette.com` and nothing else, holds its answers in memory
while it runs, and writes nothing to disk.
[PRIVACY.md](PRIVACY.md) states what a request carries and which settings change
any of it.

## Development

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Tests run against generated fixtures and make no network request. The live suite,
`npm run test:live`, makes one request per route and runs nightly against the
site itself.

## Contributing

Bugs, questions and ideas belong in
[the issue tracker](https://github.com/smeet666/mcp-supertoinette/issues). Pull
requests are welcome; opening an issue first helps agree on the shape of the
change. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT, see [LICENSE](LICENSE). The recipes belong to Supertoinette and to their
authors.

---

<a name="mcp-supertoinette-français"></a>

# mcp-supertoinette (français)

_[English version](#mcp-supertoinette)_

[Supertoinette](https://www.supertoinette.com) est un site de cuisine français,
l'un des plus anciens encore debout. Ses recettes donnent leurs ingrédients,
leurs étapes, leurs temps de préparation, de cuisson et de repos, le nombre de
convives qu'elles nourrissent et les photographies du plat. À côté des recettes,
il tient un ensemble de pages sur ce qu'on boit avec un plat, qui lui associent
un vin et disent de quel style il relève.

Ce serveur relie un client de conversation à ce site. On peut y chercher des
recettes, en lire une avec ses ingrédients adaptés au nombre de convives,
parcourir ses catégories, lire une catégorie page par page, et consulter ce qu'il
propose de boire avec un plat. Aucune clé d'API, aucun compte.

## Installation

**Installation en un clic**

[![Install in Cursor](https://cursor.com/deeplink/mcp-install-dark.svg)](https://cursor.com/en/install-mcp?name=supertoinette&config=eyJjb21tYW5kIjoibnB4IiwiYXJncyI6WyIteSIsIm1jcC1zdXBlcnRvaW5ldHRlIl19)
[![Install in VS Code](https://img.shields.io/badge/VS_Code-Install-0098FF?style=flat&logo=visualstudiocode&logoColor=white)](https://insiders.vscode.dev/redirect/mcp/install?name=supertoinette&config=%7B%22name%22%3A%22supertoinette%22%2C%22command%22%3A%22npx%22%2C%22args%22%3A%5B%22-y%22%2C%22mcp-supertoinette%22%5D%7D)

**Claude Code**

```bash
claude mcp add supertoinette -- npx -y mcp-supertoinette
```

**Claude Desktop, Cursor, et tout client au format de configuration standard**

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

Node 24 ou plus récent est nécessaire, et aucune variable d'environnement n'est à
renseigner.

### Avec Docker

```json
{
  "mcpServers": {
    "supertoinette": {
      "command": "docker",
      "args": ["run", "-i", "--rm", "ghcr.io/smeet666/mcp-supertoinette:1.0.1"]
    }
  }
}
```

`-i` garde l'entrée standard ouverte, qui est le canal du protocole, et `-t` est
omis parce qu'un TTY réécrit le flux. Le conteneur a besoin d'un accès HTTPS
sortant vers `www.supertoinette.com`, et de rien d'autre : aucun volume, aucun
port, aucun identifiant.

### Bundle, sans npm

Téléchargez `mcp-supertoinette-1.0.1.mcpb` depuis
[la dernière publication](https://github.com/smeet666/mcp-supertoinette/releases/latest)
et ouvrez-le. Un client qui gère les bundles MCP l'installe seul, sans npm et
sans fichier de configuration à modifier. Le bundle emporte ses dépendances, donc
rien n'est téléchargé à l'installation.

## Ce qu'on peut demander

- « Trouve-moi une recette de blanquette de veau. »
- « Lis-moi cette recette pour dix personnes. »
- « Sous quelles catégories le site classe-t-il ses recettes ? »
- « Quel vin avec un boeuf bourguignon ? »
- « Multiplie par trois cette liste d'ingrédients du carnet de ma grand-mère. »

Supertoinette est un site français, donc ses recettes se trouvent en français. Le
chemin ordinaire va d'une recherche à une recette : une ligne porte un `id`, et
`get_recipe` reprend cet identifiant.

## Les outils

| Outil               | Ce qu'il fait                                                      |
| ------------------- | ------------------------------------------------------------------ |
| `get_recipe`        | Lit une recette, adaptée à un nombre de parts sur demande.         |
| `search_recipes`    | Trouve des recettes par plat ou par ingrédient.                    |
| `list_categories`   | Lit les catégories sous lesquelles le site classe ses recettes.    |
| `browse_recipes`    | Lit une catégorie, page par page.                                  |
| `get_wine_pairings` | Lit ce que le site propose de boire avec un plat.                  |
| `scale_ingredients` | Adapte n'importe quelle liste d'ingrédients, sans requête au site. |

### `get_recipe`

Lit une recette en entier, et adapte ses ingrédients quand un nombre de parts est
donné.

| Argument   | Type                      | Requis | Ce qu'il fait                                                |
| ---------- | ------------------------- | ------ | ------------------------------------------------------------ |
| `id`       | chaîne, 1 à 10 caractères | oui    | Le numéro dans l'adresse d'une recette, porté par une ligne. |
| `servings` | entier, 1 à 1000          | non    | Adapte les ingrédients à ce nombre de parts.                 |

**En retour :** `title` sans le pictogramme par lequel le site l'ouvre, et
`title_as_published` exactement comme le site l'a écrit ; `url` ; `description` ;
`published_at` ; `intro`, la prose imprimée au-dessus de la méthode ; `steps` ;
`prep_minutes`, `cook_minutes`, `rest_minutes` et `total_minutes` ; `category` ;
`author` ; et `rating`, chacun `null` là où la page n'indique rien. `yield` dit
pour quoi la recette est écrite et vers quoi elle a été adaptée. `ingredients`
porte les lignes avec les intertitres sous lesquels la page les groupe, ce que
compte `ingredient_count`, et le `scaling` de chaque ligne vaut `scaled`,
`rounded` ou `unscaled`.

### `search_recipes`

Cherche des recettes par plat ou par ingrédient, une page à la fois.

| Argument   | Type                       | Requis | Ce qu'il fait                                                             |
| ---------- | -------------------------- | ------ | ------------------------------------------------------------------------- |
| `query`    | chaîne, 1 à 120 caractères | oui    | Un plat ou un ingrédient, en français.                                    |
| `limit`    | entier, 1 à 39             | non    | Lignes à servir.                                                          |
| `page`     | entier, 1 à 1000           | non    | La page de résultats à lire, la première par défaut.                      |
| `category` | chaîne, 1 à 60 caractères  | non    | Une catégorie, orthographiée comme les `facets` d'une réponse précédente. |

**En retour :** des lignes portant `id`, que `get_recipe` reprend, `title`,
`title_as_published` et `url`. Viennent aussi `page`, `last_page` pour la page la
plus lointaine que le site relie depuis celle-ci, `result_count`,
`rows_published` pour les lignes que la page contenait avant tout rendu,
`total_available` et `facets`, qui publie les formulations de catégorie qu'une
recherche suivante reprend. Ne construisez jamais une formulation à la main : le
site répond à celle qu'il ne connaît pas par une page qui se lit comme une
absence.

### `list_categories`

Lit les catégories sous lesquelles le site classe ses recettes. Il ne prend aucun
argument.

**En retour :** `categories`, avec `category_count` pour les entrées que les deux
listes du site contiennent, et l'`url` d'où elles ont été lues. Une catégorie se
redonne à `browse_recipes`.

### `browse_recipes`

Lit une catégorie, page par page.

| Argument   | Type                      | Requis | Ce qu'il fait                                 |
| ---------- | ------------------------- | ------ | --------------------------------------------- |
| `category` | chaîne, 1 à 80 caractères | oui    | Une catégorie, publiée par `list_categories`. |
| `limit`    | entier, 1 à 30            | non    | Lignes à servir.                              |
| `page`     | entier, 1 à 1000          | non    | La page à lire, la première par défaut.       |

**En retour :** les lignes et l'enveloppe que rend `search_recipes`, avec
`last_page` qui dit jusqu'où va la liste.

### `get_wine_pairings`

Lit ce que le site propose de boire avec un plat, d'après les pages qu'il a
écrites sur le sujet.

| Argument | Type                      | Requis        | Ce qu'il fait                          |
| -------- | ------------------------- | ------------- | -------------------------------------- |
| `id`     | chaîne, 1 à 10 caractères | l'un des deux | Le numéro dans l'adresse d'un plat.    |
| `page`   | entier, 1 à 100           | l'un des deux | Une page de la liste de plats du site. |

**En retour :** des entrées portant l'`id`, le `dish` sous le nom que le site lui
donne, et `style`, le style de vin par lequel la page s'ouvre, `null` là où elle
n'en a écrit aucun.

### `scale_ingredients`

Applique la même arithmétique à n'importe quelle liste d'ingrédients en français,
sans requête au site.

| Argument        | Type                                           | Requis        | Ce qu'il fait                                         |
| --------------- | ---------------------------------------------- | ------------- | ----------------------------------------------------- |
| `ingredients`   | tableau de 1 à 200 chaînes, 1 à 300 caractères | oui           | Les lignes à adapter, comme la recette les a écrites. |
| `factor`        | nombre, au-delà de 0 jusqu'à 100               | l'un des deux | Ce par quoi multiplier les quantités.                 |
| `from_servings` | entier, 1 à 1000                               | l'un des deux | Le nombre de convives de la liste d'origine.          |
| `to_servings`   | entier, 1 à 1000                               | l'un des deux | Le nombre de convives voulu.                          |

Passez `factor`, ou le couple `from_servings` et `to_servings`.

**En retour :** les lignes adaptées dans la forme que rend `get_recipe`, chacune
avec son `scaling`.

## L'adaptation des quantités

Une quantité est exprimée dans l'unité qui lui convient. Après adaptation, une
ligne peut donc apparaître dans une autre unité que celle de la recette : 200 g
multipliés par vingt donnent `4 kg`.

La finesse à laquelle un ingrédient se coupe dépend de sa nature. Une baguette se
coupe en deux, en trois ou en quatre ; un oeuf ne se partage pas. Une quantité
qui tombe entre les deux est donc arrondie, et la recette adaptée s'écarte alors
un peu des proportions de l'originale. La ligne porte `rounded`, et sa note dit
ce qui a été fait.

Les chiffres sont l'arithmétique de ce serveur, donc dites qu'ils ont été
recalculés quand vous les montrez. Une recette dont la page n'indique aucun
nombre de parts ne peut pas être portée à un nombre de convives, et la réponse le
dit.

## Configuration

Chaque variable est facultative. Elles se posent dans le bloc `env` de la
configuration du client.

| Variable                | Défaut               | Ce qu'elle fait                                                                   |
| ----------------------- | -------------------- | --------------------------------------------------------------------------------- |
| `STO_USER_AGENT`        | l'identité du projet | Nomme votre application auprès du site, avec une adresse où joindre une personne. |
| `STO_MIN_INTERVAL_MS`   | `3000`               | Écart entre deux requêtes, de 3000 à 60000.                                       |
| `STO_TIMEOUT_MS`        | `20000`              | Délai d'une requête, de 1000 à 120000.                                            |
| `STO_MAX_RETRIES`       | `3`                  | Tentatives après un échec passager, de 0 à 8.                                     |
| `STO_CACHE_TTL_MS`      | `900000`             | Durée pendant laquelle une page reste en mémoire, de 0 à 86400000.                |
| `STO_CACHE_MAX_ENTRIES` | `200`                | Pages gardées en mémoire à la fois, de 1 à 5000.                                  |
| `STO_LOG_LEVEL`         | `error`              | `silent`, `error`, `info` ou `debug`, écrit sur la sortie d'erreur.               |

Une valeur hors de sa plage retombe sur le défaut, et la raison est écrite sur la
sortie d'erreur.

## Erreurs

Chaque échec porte un des six codes, un message, et quand cela aide une
indication du geste suivant.

| Code            | Ce qui s'est passé                                        | Que faire                                                                                         |
| --------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `not_found`     | Le site a répondu, et n'a ni cette recette ni cette page. | Vérifiez l'identifiant avec `search_recipes`.                                                     |
| `invalid_input` | Les arguments ont été refusés avant toute requête.        | Lisez le message, qui nomme l'argument.                                                           |
| `rate_limited`  | Le site demande à ce client de ralentir.                  | Attendez les secondes indiquées et rappelez avec les mêmes arguments. La recette est toujours là. |
| `parse_failure` | La page a chargé et le contenu attendu est absent.        | Signalez-le sur [le suivi d'incidents](https://github.com/smeet666/mcp-supertoinette/issues).     |
| `network_error` | La requête n'a pas abouti.                                | Réessayez sous peu.                                                                               |
| `timeout`       | La requête a dépassé son délai.                           | Augmentez `STO_TIMEOUT_MS`, ou demandez moins de lignes.                                          |

## Comme bibliothèque

La couche qui lit le site est publiée seule, avec son rythme, son cache et ses
erreurs, sans protocole attaché.

```ts
import { SupertoinetteClient } from "mcp-supertoinette/client";

const client = new SupertoinetteClient();
const { data, cached } = await client.getRecipe({ id: "10" });
console.log(data.title, data.ingredients.length, cached);
```

`searchRecipes`, `browseRecipes`, `getRecipe` et `getPairings` répondent chacun
`{ data, cached }`, et lèvent une erreur portant un des six codes. Le plancher de
trois secondes entre deux requêtes tient également ici.

## Rythme et attribution

Les requêtes partent une à une avec au moins trois secondes entre elles, et ce
plancher tient quelle que soit la configuration. Le `User-Agent` se termine
toujours par l'identité du projet et une adresse où joindre une personne.

Chaque résultat porte l'adresse de la page d'où il a été lu, et `source` nomme le
site. Les recettes, les titres et les photographies appartiennent à
Supertoinette.

Ce MCP est un projet non officiel, sans affiliation à Supertoinette.

## Confidentialité

Ce serveur ne collecte rien sur vous et n'envoie rien à son auteur. Il tourne sur
votre machine, ne joint que `www.supertoinette.com`, garde ses réponses en mémoire le temps qu'il
tourne, et n'écrit rien sur le disque. [PRIVACY.md](PRIVACY.md) dit ce qu'une
requête emporte et quels réglages changent cela.

## Développement

```bash
npm install
npm run build:fixtures
npm test
npm run check
```

Les tests s'exécutent sur des fixtures engendrées et n'émettent aucune requête.
La suite en direct, `npm run test:live`, émet une requête par route et tourne
chaque nuit contre le site lui-même.

## Contribuer

Les anomalies, les questions et les idées ont leur place dans
[le suivi d'incidents](https://github.com/smeet666/mcp-supertoinette/issues). Les
propositions de modification sont bienvenues ; ouvrir un ticket d'abord aide à
s'accorder sur la forme du changement. Voir [CONTRIBUTING.md](CONTRIBUTING.md).

## Licence

MIT, voir [LICENSE](LICENSE). Les recettes appartiennent à Supertoinette et à
leurs auteurs.
