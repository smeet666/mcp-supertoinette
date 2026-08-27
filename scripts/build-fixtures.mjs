#!/usr/bin/env node
/**
 * Writes the corpus the unit suite reads.
 *
 * Every dish, ingredient and cook named here is invented. The shapes come from
 * what the site publishes, and none of its wording is stored in this
 * repository. A page the site has never served gets written just as easily,
 * which is the other reason the corpus is written rather than captured.
 */

import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "..", "test", "fixtures");
mkdirSync(out, { recursive: true });

/**
 * The two lists of categories the site prints on every page.
 *
 * The footer holds the kinds of dish, the menu holds the ways of cooking and
 * the seasons. Both are links of the very shape a listing row carries, so the
 * corpus puts them where the site puts them: a reader that took the whole
 * document would publish them as recipes.
 */
const categoryMenu = `
  <div class="dropdown-menu">
    <a class="dropdown-item" href="https://www.supertoinette.com/recettes-cuisine-photos">Recettes en photos</a>
    <div class="dropdown-divider"></div>
    <a class="dropdown-item" href="/recettes/137/recettes-au-micro-ondes">Au micro-ondes</a>
    <a class="dropdown-item" href="/recettes/136/recettes-recettes-rapides">Recettes rapides</a>
    <a class="dropdown-item" href="/quelque-part-ailleurs">Un lien hors des catégories</a>
  </div>`;

const categoryFooter = `
  <ul id="nav-footer2">
    <li><a href="https://www.supertoinette.com/recettes/91/recettes-soupes-potages" title="Soupes &amp; potages">Soupes &amp; potages</a></li>
    <li class="separator"></li>
    <li><a href="https://www.supertoinette.com/recettes/107/recettes-desserts" title="Desserts">Desserts</a></li>
    <li class="separator"></li>
    <li><a href="https://www.supertoinette.com/mentions" title="Pas une catégorie">Pas une catégorie</a></li>
  </ul>`;

/**
 * The navigation and the footer every page of the site carries.
 *
 * They sit outside the recipe and hold links of the very shape the parser
 * reads, so the corpus carries them: a page without them would let a parser
 * that reads the whole document pass.
 */
const chrome = `
<nav class="main-nav">
${categoryMenu}
  <a href="https://www.supertoinette.com/recettes/107/recettes-tourtes">Tourtes</a>
  <a href="https://www.supertoinette.com/recette/999/une-autre-recette.html">Une autre recette</a>
  <a href="https://www.supertoinette.com/fiche-cuisine/1/une-fiche.html">Une fiche</a>
</nav>`;

const footer = `
<footer>
  <a href="https://www.supertoinette.com/recettes/500/recettes-du-pied-de-page">Pied de page</a>
  <ul class="ingredientsList"><li>Une liste qui n'est pas celle de la recette</li></ul>
${categoryFooter}
</footer>`;

/** The block the site puts in the head of every recipe page. */
const structured = (recipe) =>
  `<script type="application/ld+json">${JSON.stringify(recipe)}</script>`;

/** The stars and the review count, as the page prints them above the picture. */
const stars = (rating, reviews) => `
<a href="#comments" class="recipe-stars">
  <div class="d-flex align-items-center mb-3">
    <div class="mr-2"><strong>${rating}</strong></div>
    <div class="stars"><i class="fas fa-star"></i></div>
    <small class="ml-2">${reviews}</small>
    <div class="recipe-stars-sep"></div>
    <small>Déposez le premier commentaire !</small>
  </div>
</a>`;

/**
 * The row of badges under the picture.
 *
 * The cost is drawn as a fixed number of symbols of which some are greyed, and
 * that is the only place the site states the scale its label sits on.
 */
function badges({ difficulty, cost, costScale, total, prep, cook, pause }) {
  const items = [];
  if (difficulty !== null) {
    items.push(
      `<li class="list-inline-item"><i class="fas fa-utensils"></i> <span>${difficulty}</span></li>`,
    );
  }
  if (cost !== null) {
    const lit = '<i class="fas fa-euro-sign"></i>'.repeat(cost);
    const grey = '<i class="fas fa-euro-sign grey"></i>'.repeat(costScale - cost);
    items.push(`<li class="list-inline-item">${lit}${grey}<span>${costLabel(cost)}</span></li>`);
  }
  if (total !== null) {
    items.push(
      `<li class="list-inline-item"><i class="far fa-clock"></i><span class="hideMobile">Temps total:</span><span>${total}</span></li>`,
    );
  }
  if (prep !== null) {
    items.push(
      `<li class="list-inline-item"><i class="fas fa-utensil-spoon"></i><span>Préparation: ${prep}</span></li>`,
    );
  }
  if (cook !== null) {
    items.push(
      `<li class="list-inline-item"><i class="fas fa-burn"></i><span>Cuisson: ${cook}</span></li>`,
    );
  }
  if (pause !== null) {
    items.push(
      `<li class="list-inline-item"><i class="fas fa-hourglass"></i><span>Pause: ${pause}</span></li>`,
    );
  }
  return `<ul class="list-inline details mt-3 d-flex flex-wrap justify-content-center">${items.join("")}</ul>`;
}

const costLabel = (lit) => ["", "Economique", "Normal", "Cher"][lit] ?? "Normal";

const tags = (entries) =>
  `<p class="mb-1 mt-O my-md-2"><small><strong>Tags:</strong>${entries
    .map(([href, label]) => `<a href="${href}">${label}</a>`)
    .join("|")}</small></p>`;

/**
 * One line of the ingredient list.
 *
 * The site separates the quantity from the words it links, and it links the
 * words to an ingredient page it chooses itself. A line with no link is a
 * heading the site writes inside the list.
 */
function ingredient({ amount, label, sheet }) {
  const words = sheet === null ? label : `<a href="${sheet}">${label}</a>`;
  return `<li class="pb-1"><i class="fas fa-angle-right"></i>${amount === null ? "" : `${amount}`}${words}</li>`;
}

const ingredients = (servings, lines) => `
<div class="row ingredients">
  <div class="col-6"><h2>Ingrédients</h2></div>
  <div class="col-6"><p class="text-right"><span>Recette pour</span><strong>${servings}</strong></p></div>
</div>
<hr />
<ul class="ingredientsList mb-3">${lines.map(ingredient).join("")}</ul>`;

/** The steps, and whatever prose the site prints around them. */
const preparation = ({ intro, steps, after }) => `
<h2>Préparation</h2>
<hr/>
<div class="recipe-prepa">
${intro === null ? "" : `<p>${intro}</p>`}
<ol>
${steps.map((step) => `<li>${step}</li>`).join("\n")}
</ol>
${after ?? ""}
</div>`;

/**
 * The questions the site answers under the steps.
 *
 * It writes each question as a paragraph holding nothing but emphasis, and the
 * answer as the paragraph that follows, which is what tells one from the other.
 */
const faqBlock = (entries) => `
<h2>❓ FAQ - Questions fréquentes</h2>
${entries.map(([q, a]) => `<p><strong>${q}</strong></p>\n<p>👉${a}</p>`).join("\n")}`;

function page({ head, body }) {
  return `<!doctype html>
<html lang="fr">
<head><meta charset="utf-8"><title>Une recette | Supertoinette</title>${head ?? ""}</head>
<body>${chrome}
<div class="main-inner-col">
<div id="recipe">
${body}
</div>
</div>
${footer}
</body></html>
`;
}

/**
 * The recipe the whole suite reads.
 *
 * Its structured block repeats the last step, which is what the site does on
 * every recipe it serves, and its list of ingredients opens with a heading.
 */
const completeSteps = [
  "<strong>Émincer</strong> les tiges de gaverole.",
  "<strong>Faire revenir</strong> les tiges dans le beurre de pravin.",
  "<strong>Verser</strong> le bouillon et laisser mijoter.",
  "<strong>Servir</strong> tiède, saupoudré de <strong>mirette</strong>.",
];

const completeRecipe = {
  "@context": "http://schema.org/",
  "@type": "Recipe",
  name: "🥣Velouté de gaverole au pravin",
  datePublished: "2019-04-02T09:12:00Z",
  image: [
    "https://recette.supertoinette.com/new/2019-04/veloute-gaverole-1200.webp",
    "https://recette.supertoinette.com/new/2019-04/veloute-gaverole-800.webp",
  ],
  description: "Un velouté de gaverole doux, relevé d'une pointe de mirette.",
  prepTime: "PT15M",
  cookTime: "PT25M",
  totalTime: "PT1H10M",
  recipeYield: "6 personnes",
  recipeInstructions: [
    ...completeSteps.map((step) => ({ "@type": "HowToStep", text: strip(step) })),
    { "@type": "HowToStep", text: strip(completeSteps.at(-1)) },
  ],
  author: { "@type": "Person", name: "Aline du Verger" },
  aggregateRating: {
    "@type": "AggregateRating",
    ratingValue: "4.20",
    reviewCount: "9",
    bestRating: "5",
    worstRating: "1",
  },
  keywords: ["Soupes & potages", "Gaverole", "Pravin"],
  recipeCategory: "Soupes & potages",
  recipeIngredient: [
    "Pour le velouté :",
    "800 g de tiges de gaverole",
    "2 échalotes de Varne",
    "40 g de beurre de pravin",
    "1 pincée de mirette",
    "Pour servir",
    "Sel",
  ],
};

function strip(markup) {
  return markup.replace(/<[^>]*>/g, "");
}

writeFileSync(
  join(out, "recipe-complete.html"),
  page({
    head: structured(completeRecipe),
    body: `
<h1>🥣Velouté de gaverole au pravin</h1>
<p class="subtitle mb-3">Un velouté de gaverole doux, relevé d'une pointe de mirette.</p>
${stars("4,2/5", "9 avis")}
${badges({ difficulty: "Recette facile", cost: 1, costScale: 3, total: "1 h 10 min", prep: "15 min", cook: "25 min", pause: "30 min" })}
${tags([
  ["https://www.supertoinette.com/recettes/91/recettes-soupes-potages", "Soupes &amp; potages"],
  ["https://www.supertoinette.com/recettes/4210/recettes-gaverole", "Gaverole"],
  ["https://www.supertoinette.com/quelque-part-ailleurs", "Un lien hors des catégories"],
])}
${ingredients("6 personnes", [
  { amount: null, label: "Pour le velouté :", sheet: null },
  {
    amount: "800 g ",
    label: "de tiges de gaverole",
    sheet: "https://www.supertoinette.com/fiche-cuisine/311/gaverole.html",
  },
  {
    amount: "2 ",
    label: "échalotes de Varne",
    sheet: "https://www.supertoinette.com/fiche-cuisine/77/echalote.html",
  },
  {
    amount: "40 g ",
    label: "de beurre de pravin",
    sheet: "https://www.supertoinette.com/fiche-cuisine/487/beurre.html",
  },
  { amount: "1 pincée ", label: "de mirette", sheet: null },
  { amount: null, label: "Pour servir", sheet: null },
  { amount: null, label: "Sel", sheet: "https://www.supertoinette.com/fiche-cuisine/95/sel.html" },
])}
${preparation({
  intro: "Une soupe de fin d'hiver, à servir dans des bols tièdes.",
  steps: completeSteps,
  after: `<h2>Variantes</h2><ol><li><strong>Remplacer</strong> la mirette par du sarpel.</li></ol>${faqBlock(
    [
      ["Peut-on la préparer la veille ?", "Oui, elle se réchauffe doucement."],
      ["Par quoi remplacer le pravin ?", "Un beurre doux ordinaire convient."],
    ],
  )}`,
})}`,
  }),
);

/**
 * A recipe the site publishes without a difficulty badge, without a rest and
 * with its two times written as zero.
 *
 * The site writes `PT0M` for a time it does not display, so this page carries
 * the zero in its structured block and no badge for it.
 */
const bareRecipe = {
  ...completeRecipe,
  name: "Salade de fanes de tourbin",
  recipeYield: "2 personnes",
  prepTime: "PT10M",
  cookTime: "PT0M",
  totalTime: "PT10M",
  aggregateRating: undefined,
  recipeCuisine: "Fr",
  recipeInstructions: [
    { "@type": "HowToStep", text: "Laver les fanes de tourbin." },
    { "@type": "HowToStep", text: "Assaisonner et servir." },
    { "@type": "HowToStep", text: "Assaisonner et servir." },
  ],
  recipeIngredient: ["1 botte de fanes de tourbin", "Poivre"],
};
bareRecipe.aggregateRating = undefined;

writeFileSync(
  join(out, "recipe-bare.html"),
  page({
    head: structured(bareRecipe),
    body: `
<h1>Salade de fanes de tourbin</h1>
${badges({ difficulty: null, cost: 2, costScale: 3, total: "10 min", prep: "10 min", cook: null, pause: null })}
${ingredients("2 personnes", [
  { amount: "1 botte ", label: "de fanes de tourbin", sheet: null },
  { amount: null, label: "Poivre", sheet: null },
])}
${preparation({
  intro: null,
  steps: ["Laver les fanes de tourbin.", "Assaisonner et servir."],
  after: null,
})}`,
  }),
);

/** A page served without the structured block the reader needs. */
writeFileSync(
  join(out, "recipe-no-structured.html"),
  page({
    head: "",
    body: `<h1>Une recette sans bloc structuré</h1>${ingredients("4 personnes", [
      { amount: "1 ", label: "chose", sheet: null },
    ])}${preparation({ intro: null, steps: ["Faire la chose."], after: null })}`,
  }),
);

/** A page whose structured block cannot be read at all. */
writeFileSync(
  join(out, "recipe-broken-structured.html"),
  page({
    head: '<script type="application/ld+json">{ "@type": "Recipe", </script>',
    body: "<h1>Une recette au bloc illisible</h1>",
  }),
);

/** A page carrying a structured block that describes something else. */
writeFileSync(
  join(out, "recipe-not-a-recipe.html"),
  page({
    head: structured({ "@context": "http://schema.org/", "@type": "WebPage", name: "Une page" }),
    body: `<h1>Une page qui n'est pas une recette</h1>`,
  }),
);

/**
 * A listing page, which publishes a block calling itself a Recipe and naming
 * the category. A reader that trusts the block would render the category as a
 * dish, so the corpus carries the trap.
 */
writeFileSync(
  join(out, "listing-category.html"),
  `<!doctype html>
<html lang="fr"><head><meta charset="utf-8">
${structured({
  "@context": "http://schema.org/",
  "@type": "Recipe",
  name: "Soupes & potages",
  description: "Une description empruntée à l'une des recettes de la liste.",
  author: "Supertoinette",
  datePublished: "2026-01-05T10:00:00Z",
  image: ["https://recette.supertoinette.com/new/2021-06/une-image-800.webp"],
})}
</head><body>${chrome}
<div id="recipeList">
  <h1>Soupes &amp; potages</h1>
  <div class="row mb-4">
    <div class="col-md-5"><a href="https://www.supertoinette.com/recette/4210/veloute-de-gaverole.html"><img data-src="https://recette.supertoinette.com/new/veloute-800.webp" alt="Velouté" /></a></div>
    <div class="col-md-7">
      <h3><a href="https://www.supertoinette.com/recette/4210/veloute-de-gaverole.html">🥣Velouté de gaverole</a></h3>
      <p class="mb-1">Un velouté doux relevé de mirette.</p>
      <ul class="list-inline recipeProp">
        <li class="list-inline-item p-0"><i class="fas fa-utensils"></i> Recette facile</li>
        <li class="list-inline-item p-0"><i class="far fa-clock"></i> Temps total : 1 h 10 min</li>
      </ul>
    </div>
  </div>
  <div class="row mb-4">
    <div class="col-md-7">
      <h3><a href="https://www.supertoinette.com/recette/4211/soupe-de-tourbin.html">Soupe de tourbin</a></h3>
      <p class="mb-1">Une soupe de fanes.</p>
      <ul class="list-inline recipeProp"><li class="list-inline-item p-0"><i class="fas fa-utensils"></i> Recette élaborée</li></ul>
    </div>
  </div>
  <div class="row mb-4">
    <div class="col-md-7"><h3>Une ligne sans lien</h3><p class="mb-1">Rien à ouvrir.</p></div>
  </div>
  <nav><a href="https://www.supertoinette.com/recettes/91/recettes-soupes-potages?page=2">2</a>
       <a href="https://www.supertoinette.com/recettes/91/recettes-soupes-potages?page=7">7</a></nav>
</div>
${footer}
</body></html>
`,
);

/** A listing page holding no row at all, which is what a page past the last one is. */
writeFileSync(
  join(out, "listing-empty.html"),
  `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"></head><body>${chrome}
<div id="recipeList"><h1>Soupes &amp; potages</h1></div>
${footer}
</body></html>
`,
);

/**
 * One row of a search listing.
 *
 * The heading carries the categories the site files the row under, in a small
 * tag inside the link, so the title has to be taken apart from them.
 */
const hit = ({ href, title, categories, description, image }) => `
  <div class="hit row no-gutters">
    ${image === null ? "" : `<div class="col-md-4"><a href="${href}"><img data-src="${image}" class="b-lazy" alt="${title}" /></a></div>`}
    <div class="col-md-8">
      <h2>
        <a href="${href}">
          ${title}
          ${categories === null ? "" : `<small>| ${categories}</small>`}
        </a>
      </h2>
      <p class="link"><a href="${href}">${href}</a></p>
      ${description === null ? "" : `<p class="description"><a href="${href}">${description}</a></p>`}
    </div>
  </div>`;

/** The facets the site counts for one query, each with the rows it holds. */
const facets = (query, entries) => `
  <div class="facets">
  <ul class="list-inline">
    <li class="list-inline-item filters">Filtrer par catégories :</li>
${entries
  .map(
    ([label, count]) => `    <li class="list-inline-item">
      <a href="https://www.supertoinette.com/liste-recettes?q=${query}&amp;c=${encodeURIComponent(label)}">
        ${label}<span class="badge badge-info">${count}</span>
      </a>
    </li>
    <li class="list-inline-item"> | </li>`,
  )
  .join("\n")}
    <li class="list-inline-item"><span class="badge badge-info">7</span></li>
  </ul>
  </div>`;

/**
 * The block of page numbers.
 *
 * The site lists the last page even when it abridges the middle, and on a page
 * past the last it lists only the pages it holds, which is what tells a caller
 * they walked off the end.
 */
const pagination = (query, numbers, current) => `
  <ul class="pagination" role="navigation">
${numbers
  .map((number) =>
    number === current
      ? `    <li class="page-item active" aria-current="page"><span class="page-link">${number}</span></li>`
      : `    <li class="page-item"><a class="page-link" href="https://www.supertoinette.com/liste-recettes?q=${query}&amp;page=${number}">${number}</a></li>`,
  )
  .join("\n")}
  </ul>`;

const searchPage = (body) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>gaverole - Recherche Supertoinette</title></head>
<body>${chrome}
<div id="site-content">
  <h1>Recherche de recettes</h1>
${body}
</div>
${footer}
</body></html>
`;

/** A page of search results, with the facets the site counts beside them. */
writeFileSync(
  join(out, "search-results.html"),
  searchPage(`
${facets("gaverole", [
  ["Soupes & potages", 12],
  ["Légumes", 3],
])}
<hr />
${hit({
  href: "https://www.supertoinette.com/recette/4210/veloute-de-gaverole.html",
  title: "🥣Velouté de gaverole",
  categories: "Soupes &amp; potages, Légumes",
  description: "Un velouté doux relevé de mirette.",
  image: "https://recette.supertoinette.com/new/veloute-800.webp",
})}
${hit({
  href: "https://www.supertoinette.com/recette/4211/soupe-de-tourbin.html",
  title: "Soupe de tourbin",
  categories: "Soupes &amp; potages",
  description: null,
  image: null,
})}
${hit({
  href: "https://www.supertoinette.com/diaporama/12/dix-veloutes",
  title: "Dix veloutés",
  categories: "Diaporamas de recettes",
  description: "Une sélection qui n'est pas une recette.",
  image: null,
})}
${hit({
  href: "https://www.supertoinette.com/recette/4212/bouillon-de-tourbin.html",
  title: "Bouillon de tourbin",
  categories: null,
  description: null,
  image: null,
})}
${hit({
  href: "",
  title: "Une ligne sans adresse",
  categories: null,
  description: null,
  image: null,
})}
  <div class="hit row no-gutters"><div class="col-md-8"><p>Une ligne sans titre</p></div></div>
${pagination("gaverole", [1, 2, 3, 47], 1)}
`),
);

/** A search the site matched nothing for, which it says in so many words. */
writeFileSync(
  join(out, "search-empty.html"),
  searchPage("  <p>Aucun résultat pour cette recherche</p>"),
);

/**
 * A page past the last one.
 *
 * The site serves it with HTTP 200, no row, and a block of page numbers listing
 * only the pages it holds. Nothing on it says the search matched nothing.
 */
writeFileSync(
  join(out, "search-beyond-last.html"),
  searchPage(`
${facets("gaverole", [["Soupes & potages", 12]])}
<hr />
${pagination("gaverole", [1, 2], null)}
`),
);

/**
 * A listing the site served without counting a single category.
 *
 * It happens on a query narrow enough that the site prints rows and no facet at
 * all, and on a block of page numbers it drew empty.
 */
writeFileSync(
  join(out, "search-uncounted.html"),
  searchPage(`
${hit({
  href: "https://www.supertoinette.com/recette/4210/veloute-de-gaverole.html",
  title: "Velouté de gaverole",
  categories: "Soupes &amp; potages",
  description: null,
  image: null,
})}
  <ul class="pagination" role="navigation"></ul>
`),
);

/** A page served without the heading that says it is a search at all. */
writeFileSync(
  join(out, "search-not-a-search.html"),
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>
<body>${chrome}<div id="site-content"><h1>Autre chose</h1></div>${footer}</body></html>
`,
);

/** One row of a category listing, which prints a difficulty and a total time. */
const browseRow = ({ href, title, description, image, properties }) => `
  <div class="row mb-4">
    ${image === null ? "" : `<div class="col-md-5"><a href="${href}"><img data-src="${image}" class="b-lazy" alt="${title}" /></a></div>`}
    <div class="col-md-7">
      <h3><a href="${href}">${title}</a></h3>
      ${description === null ? "" : `<p class="mb-1">${description}</p>`}
      ${
        properties === null
          ? ""
          : `<ul class="list-inline recipeProp">${properties
              .map(
                (property) =>
                  `<li class="list-inline-item p-0"><i class="fas fa-utensils"></i> ${property}</li>`,
              )
              .join("")}</ul>`
      }
    </div>
  </div>`;

const categoryPage = (heading, body) => `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>${heading} | Supertoinette</title></head>
<body>${chrome}
<div id="recipeList">
  <h1>${heading}</h1>
${body}
</div>
${footer}
</body></html>
`;

/** One page of a category's recipes. */
writeFileSync(
  join(out, "category-listing.html"),
  categoryPage(
    "Soupes &amp; potages",
    `
${browseRow({
  href: "https://www.supertoinette.com/recette/4210/veloute-de-gaverole.html",
  title: "🥣Velouté de gaverole",
  description: "Un velouté doux relevé de mirette.",
  image: "https://recette.supertoinette.com/new/veloute-800.webp",
  properties: ["Recette facile", "Temps total : 1 h 10 min"],
})}
${browseRow({
  href: "https://www.supertoinette.com/recette/4211/soupe-de-tourbin.html",
  title: "Soupe de tourbin",
  description: null,
  image: null,
  properties: ["Recette élaborée"],
})}
${browseRow({
  href: "https://www.supertoinette.com/diaporama/12/dix-veloutes",
  title: "Dix veloutés",
  description: null,
  image: null,
  properties: null,
})}
${browseRow({ href: "", title: "Une ligne sans adresse", description: null, image: null, properties: null })}
${pagination("gaverole", [1, 2, 117], 1)}
`,
  ),
);

/** A page past the last one, which the site serves with no row and its numbers. */
writeFileSync(
  join(out, "category-beyond-last.html"),
  categoryPage("Soupes &amp; potages", pagination("gaverole", [1, 2], null)),
);

/**
 * A category page stripped of everything the site usually prints.
 *
 * No heading, no block of page numbers, and rows the site published without the
 * properties it normally puts beside them.
 */
writeFileSync(
  join(out, "category-bare.html"),
  `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body>${chrome}
<div id="recipeList">
${browseRow({
  href: "https://www.supertoinette.com/recette/4210/veloute-de-gaverole.html",
  title: "Velouté de gaverole",
  description: null,
  image: null,
  properties: null,
})}
${browseRow({
  href: "https://www.supertoinette.com/recette/4211/soupe-de-tourbin.html",
  title: "Soupe de tourbin",
  description: null,
  image: null,
  properties: ["Temps total : à votre convenance", "Une propriété sans lecture"],
})}
${browseRow({
  href: "https://www.supertoinette.com/recette/4212/bouillon-de-tourbin.html",
  title: "Bouillon de tourbin",
  description: null,
  image: null,
  properties: ["Temps total : 2 h"],
})}
${browseRow({
  href: "https://www.supertoinette.com/recette/4213/consomme-de-mirette.html",
  title: "Consommé de mirette",
  description: null,
  image: null,
  properties: ["Recette facile", "Temps total : 45 min"],
})}
  <div class="row mb-4"><div class="col-md-7"><p>Une ligne sans titre</p></div></div>
  <ul class="pagination" role="navigation"></ul>
</div>
${footer}
</body></html>
`,
);

/** A page served without the container a category listing lives in. */
writeFileSync(
  join(out, "category-not-a-listing.html"),
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>
<body>${chrome}<div id="autre"><h1>Autre chose</h1></div>${footer}</body></html>
`,
);

/** One dish, with the five wines the site ranks for it. */
writeFileSync(
  join(out, "pairing-sheet.html"),
  `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Velouté de gaverole | Supertoinette</title></head>
<body>${chrome}
<div id="sheet">
  <h1>Velouté de gaverole</h1>
  <p>Un vin blanc sec assez puissant, au nez ouvert et à la bouche fraiche</p>
  <ul class="my-3" style="font-size: 1.1em;">
    <li><strong>Bon accord :</strong> Coteaux de Varne - blanc sec assez puissant et rond</li>
    <li><strong>Très bon accord :</strong> Clos du Tourbin - blanc sec assez puissant et rond</li>
    <li><strong>Excellent accord :</strong> Mirette blanc - blanc sec fin et léger</li>
    <li><strong>Accord quasi parfait :</strong> Pravin blanc - blanc sec fin et léger</li>
    <li><strong>Accord parfait :</strong> Gaverole blanc</li>
    <li>Une ligne sans rang</li>
  </ul>
  <h3>Recettes à découvrir</h3>
  <div class="row">
    <div class="col-sm-3 mb-3"><a href="https://www.supertoinette.com/recette/4210/veloute-de-gaverole.html">Velouté de gaverole</a></div>
    <div class="col-sm-3 mb-3"><a href="https://www.supertoinette.com/diaporama/12/dix-veloutes">Dix veloutés</a></div>
  </div>
</div>
${footer}
</body></html>
`,
);

/**
 * A dish stripped of everything but its wines.
 *
 * No heading, an empty opening paragraph, no recipes beside it and a block of
 * page numbers the site drew empty.
 */
writeFileSync(
  join(out, "pairing-bare.html"),
  `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body>${chrome}
<div id="sheet">
  <p> </p>
  <ul class="my-3">
    <li><strong>Accord parfait :</strong> Gaverole blanc</li>
  </ul>
  <ul class="pagination" role="navigation"></ul>
</div>
${footer}
</body></html>
`,
);

/** A dish page the site served without the ranked list. */
writeFileSync(
  join(out, "pairing-no-list.html"),
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>
<body>${chrome}<div id="sheet"><h1>Velouté de gaverole</h1><p>Rien de plus.</p></div>${footer}</body></html>
`,
);

/** A page served without the container a dish lives in. */
writeFileSync(
  join(out, "pairing-not-a-sheet.html"),
  `<!doctype html><html lang="fr"><head><meta charset="utf-8"></head>
<body>${chrome}<div id="autre"><h1>Autre chose</h1></div>${footer}</body></html>
`,
);

/** One page of the alphabetical index of dishes. */
writeFileSync(
  join(out, "pairing-index.html"),
  `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><title>Accords mets-vins | Supertoinette</title></head>
<body>${chrome}
<div id="tricklist">
  <h1>Tous nos accords mets-vins</h1>
  <div class="row my-3">
    <div class="col-md-6 mb-2">
      <a href="https://www.supertoinette.com/accords-mets-vins/1/aligot-de-varne.html" title="Aligot de Varne">
        <i class="fas fa-angle-right"></i>
        Aligot de Varne
      </a>
    </div>
    <div class="col-md-6 mb-2">
      <a href="https://www.supertoinette.com/accords-mets-vins/2/veloute-de-gaverole.html" title="Velouté de gaverole">
        <i class="fas fa-angle-right"></i>
        Velouté de gaverole
      </a>
    </div>
    <div class="col-md-6 mb-2">
      <a href="https://www.supertoinette.com/quelque-part-ailleurs">Un lien hors de l'index</a>
    </div>
  </div>
  ${pagination("gaverole", [1, 2, 42], 1)}
</div>
${footer}
</body></html>
`,
);

/** A page of the index the site served without a block of page numbers. */
writeFileSync(
  join(out, "pairing-index-bare.html"),
  `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body>${chrome}
<div id="tricklist">
  <h1>Tous nos accords mets-vins</h1>
  <a href="https://www.supertoinette.com/accords-mets-vins/3/tourbin.html">Tourbin</a>
</div>
${footer}
</body></html>
`,
);

process.stdout.write("fixtures written\n");
