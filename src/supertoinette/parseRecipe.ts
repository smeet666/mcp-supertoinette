/**
 * Reading one recipe out of the page the site serves.
 *
 * Two sources sit on the page and neither answers on its own. The structured
 * block carries the machine-readable times, the rating and the words of every
 * step; the page around it carries the difficulty, the cost, the resting time
 * and the quantity kept apart from the ingredient it belongs to. Where the two
 * disagree the page settles it, because the page is what the site shows a cook.
 *
 * Three of the site's habits shape everything below:
 *
 * - the structured block repeats the last step, on every recipe it serves, so
 *   the steps are read from the list the page prints;
 * - a time the page displays no badge for is written as `PT0M` in the block, so
 *   a zero there is an absence rather than a measurement;
 * - a listing page publishes a block that calls itself a recipe and carries the
 *   name of a category, so a page is confirmed to be a recipe before its block
 *   is believed.
 */

import { parseFailure } from "../errors.js";
import type {
  CostLevel,
  Difficulty,
  FaqEntry,
  IngredientSheetLink,
  RawIngredient,
  Rating,
  RecipeCore,
  Tag,
} from "../types.js";
import { firstBlock, textOf, withoutLeadingPictogram } from "./html.js";
import { absolute, categoryTokenFromHref, sheetFromHref } from "./urls.js";

const STRUCTURED = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g;
/** The container a recipe page puts its recipe in, matched whole so a listing's own id cannot pass. */
const RECIPE_CONTAINER = /<div[^>]+id="recipe"[\s>]/;
const HEADING = /<h1[^>]*>([\s\S]*?)<\/h1>/;
const SUBTITLE = /<p[^>]*class="[^"]*\bsubtitle\b[^"]*"[^>]*>([\s\S]*?)<\/p>/;
const BADGES = /<ul[^>]*class="[^"]*\bdetails\b[^"]*"[^>]*>/;
const LIST_ITEM = /<li[^>]*>([\s\S]*?)<\/li>/g;
const SERVINGS = /Recette pour<\/span>\s*<strong>([\s\S]*?)<\/strong>/;
const INGREDIENT_LIST = /<ul[^>]*class="[^"]*\bingredientsList\b[^"]*"[^>]*>/;
const TAGS = /<strong>Tags:<\/strong>([\s\S]*?)<\/small>/;
const ANCHOR = /<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
const PREPARATION = /<div[^>]*class="[^"]*\brecipe-prepa\b[^"]*"[^>]*>/;
const ORDERED_LIST = /<ol[^>]*>/;
const LEADING_PARAGRAPH = /^\s*<p[^>]*>([\s\S]*?)<\/p>/;
const FAQ_HEADING = /<h[23][^>]*>[^<]*FAQ[\s\S]*?<\/h[23]>/;
const PARAGRAPH = /<p[^>]*>([\s\S]*?)<\/p>/g;
/** A paragraph holding nothing but emphasis, which is how the site writes a question. */
const ONLY_EMPHASIS = /^\s*<strong>([\s\S]*?)<\/strong>\s*$/;
/** A figure anywhere in a line, which is what tells an ingredient from a heading. */
const CARRIES_A_FIGURE = /\d/;

/** A euro symbol the page drew, and the greyed ones that state the scale. */
const COST_SYMBOL = /fa-euro-sign/g;
const COST_SPENT = /fa-euro-sign\s+grey/g;

const ISO_DURATION = /^PT(?:(\d+)H)?(?:(\d+)M)?$/;
/** Each half of a duration the page prints, looked for on its own. */
const FRENCH_HOURS = /(\d+)\s*h/;
const FRENCH_MINUTES = /(\d+)\s*min/;

/** Minutes in a duration the structured block writes, or null when it writes none. */
export function isoMinutes(value: unknown): number | null {
  if (typeof value !== "string") {
    return null;
  }
  const match = ISO_DURATION.exec(value.trim());
  if (match === null) {
    return null;
  }
  const hours = Number(match[1] ?? 0);
  const minutes = Number(match[2] ?? 0);
  return hours * 60 + minutes;
}

/**
 * Minutes in a duration the page prints, such as "1 h 10 min" or "30 min".
 *
 * The two halves are looked for apart, because a pattern holding both optional
 * matches the empty string in front of any text and reports nothing found where
 * a number sits a few characters further on.
 */
export function frenchMinutes(value: string): number | null {
  const hours = FRENCH_HOURS.exec(value)?.[1];
  const minutes = FRENCH_MINUTES.exec(value)?.[1];
  if (hours === undefined && minutes === undefined) {
    return null;
  }
  return Number(hours ?? 0) * 60 + Number(minutes ?? 0);
}

/** What the row of badges under the picture states. */
interface Badges {
  difficulty: Difficulty | null;
  cost: CostLevel | null;
  /** Which times the page displays, which is what tells a zero from an absence. */
  shows: { prep: boolean; cook: boolean; total: boolean };
  rest_minutes: number | null;
}

function readBadges(html: string): Badges {
  const block = firstBlock(html, BADGES, "</ul>");
  const badges: Badges = {
    difficulty: null,
    cost: null,
    shows: { prep: false, cook: false, total: false },
    rest_minutes: null,
  };
  if (block === null) {
    return badges;
  }

  for (const [, inner = ""] of block.matchAll(LIST_ITEM)) {
    const text = textOf(inner);
    const symbols = inner.match(COST_SYMBOL)?.length ?? 0;
    if (symbols > 0) {
      /* v8 ignore next -- the pattern that found a symbol also finds the greyed
         ones, so the fallback is what the type of a match requires rather than a
         state a page can produce. */
      const spent = inner.match(COST_SPENT)?.length ?? 0;
      badges.cost = { label: text, level: symbols - spent, scale: symbols };
      continue;
    }
    if (text.startsWith("Recette ")) {
      badges.difficulty = { label: text };
      continue;
    }
    if (text.startsWith("Préparation")) {
      badges.shows.prep = true;
      continue;
    }
    if (text.startsWith("Cuisson")) {
      badges.shows.cook = true;
      continue;
    }
    if (text.startsWith("Temps total")) {
      badges.shows.total = true;
      continue;
    }
    if (text.startsWith("Pause")) {
      badges.rest_minutes = frenchMinutes(text);
    }
  }
  return badges;
}

/**
 * The lines of the ingredient list, with the quantity kept apart from the words.
 *
 * The site links the words to an ingredient page of its own choosing, and that
 * link is often the page of a different ingredient from the one the line names.
 * Both travel, and neither is called the identity of the ingredient.
 *
 * A line carrying no quantity and no link is a heading the site writes inside
 * the list, naming the part of the recipe that follows.
 */
function readIngredients(html: string): RawIngredient[] {
  const block = firstBlock(html, INGREDIENT_LIST, "</ul>");
  if (block === null) {
    return [];
  }

  const lines: RawIngredient[] = [];
  for (const [, inner = ""] of block.matchAll(LIST_ITEM)) {
    const anchors = [...inner.matchAll(ANCHOR)];
    const anchor = anchors[0];
    /* v8 ignore next -- an anchor that matched carries both its groups. */
    const label = anchor ? textOf(anchor[2] ?? "") : textOf(inner);
    const quantity = anchor ? textOf(inner.replace(anchor[0], " ")) : "";

    let sheet: IngredientSheetLink | null = null;
    const href = anchor?.[1];
    if (href !== undefined) {
      const found = sheetFromHref(href);
      if (found !== null) {
        sheet = { line: label, sheet_id: found.id, slug: found.slug, url: absolute(href) };
      }
    }

    const raw = textOf(inner);
    lines.push({
      amount_text: quantity === "" ? null : quantity,
      label,
      raw,
      sheet,
      // A heading is a line the site links to nothing and writes no figure in.
      // Testing only for the absence of a link would file "1 pincée de mirette"
      // as a heading, because the site links a gesture to no ingredient page.
      is_heading: anchor === undefined && !CARRIES_A_FIGURE.test(raw),
    });
  }
  return lines;
}

/** The categories the page files the recipe under, with the token to open each. */
function readTags(html: string): Tag[] {
  const block = TAGS.exec(html)?.[1];
  if (block === undefined) {
    return [];
  }
  const tags: Tag[] = [];
  for (const [, href = "", label = ""] of block.matchAll(ANCHOR)) {
    tags.push({ label: textOf(label), category: categoryTokenFromHref(href), url: absolute(href) });
  }
  return tags;
}

/** What the page prints as preparation: the prose above the steps, and the steps. */
interface Preparation {
  intro: string | null;
  steps: string[];
}

/**
 * The steps, read from the list the page prints rather than from the block.
 *
 * The site prints more prose under the same heading, variants and answers to
 * questions among it, so only the first ordered list is the recipe. What the
 * structured block holds is the same list with its last entry repeated.
 */
function readPreparation(html: string): Preparation | null {
  const block = firstBlock(html, PREPARATION, "</div>");
  if (block === null) {
    return null;
  }

  const leading = LEADING_PARAGRAPH.exec(block)?.[1];
  const intro = leading === undefined ? null : textOf(leading);

  const list = firstBlock(block, ORDERED_LIST, "</ol>");
  if (list === null) {
    return null;
  }

  const steps: string[] = [];
  for (const [, inner = ""] of list.matchAll(LIST_ITEM)) {
    const step = textOf(inner);
    if (step !== "") {
      steps.push(step);
    }
  }

  return { intro: intro === "" ? null : intro, steps };
}

/**
 * The questions the page answers under the steps.
 *
 * The site writes a question as a paragraph holding nothing but emphasis and
 * the answer as the paragraph after it, so a question with nothing following it
 * is left out rather than being given an empty answer.
 */
function readFaq(html: string): FaqEntry[] {
  const heading = FAQ_HEADING.exec(html);
  if (heading === null) {
    return [];
  }

  const after = html.slice(heading.index + heading[0].length);
  /* v8 ignore next -- a paragraph that matched carries its group. */
  const paragraphs = [...after.matchAll(PARAGRAPH)].map((match) => match[1] ?? "");

  const entries: FaqEntry[] = [];
  for (let index = 0; index < paragraphs.length; index += 1) {
    /* v8 ignore next -- the index comes from the length of the list it reads. */
    const emphasised = ONLY_EMPHASIS.exec(paragraphs[index] ?? "");
    const answer = paragraphs[index + 1];
    if (emphasised === null || answer === undefined || ONLY_EMPHASIS.test(answer)) {
      continue;
    }
    /* v8 ignore next -- the pattern that matched carries its group. */
    entries.push({ question: textOf(emphasised[1] ?? ""), answer: textOf(answer) });
  }
  return entries;
}

/** The rating, on the scale the block publishes it against. */
function readRating(block: Record<string, unknown>): Rating | null {
  const rating = block.aggregateRating;
  if (typeof rating !== "object" || rating === null) {
    return null;
  }
  const fields = rating as Record<string, unknown>;
  const value = Number(fields.ratingValue);
  const count = Number(fields.reviewCount ?? fields.ratingCount);
  const scale = Number(fields.bestRating);
  if (!(Number.isFinite(value) && Number.isFinite(count) && Number.isFinite(scale))) {
    return null;
  }
  return { value, count, scale };
}

/** The name of the person the block credits, when it credits one. */
function readAuthor(block: Record<string, unknown>): string | null {
  const author = block.author;
  if (typeof author === "string") {
    return author;
  }
  if (typeof author === "object" && author !== null) {
    const name = (author as Record<string, unknown>).name;
    return typeof name === "string" ? name : null;
  }
  return null;
}

/** The pictures the block lists, in the sizes it published them at. */
function readImages(block: Record<string, unknown>): string[] {
  const image = block.image;
  if (typeof image === "string") {
    return [image];
  }
  if (!Array.isArray(image)) {
    return [];
  }
  return image.filter((entry): entry is string => typeof entry === "string");
}

/**
 * The structured block describing a recipe, or the reason there is none.
 *
 * A block that cannot be read is a failure of this reader rather than a page
 * holding no recipe, and the two are reported apart so a caller never reads one
 * as the other.
 */
function readStructured(html: string, url: string): Record<string, unknown> {
  let unreadable = 0;
  for (const [, body = ""] of html.matchAll(STRUCTURED)) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      unreadable += 1;
      continue;
    }
    for (const candidate of Array.isArray(parsed) ? parsed : [parsed]) {
      if (
        typeof candidate === "object" &&
        candidate !== null &&
        (candidate as Record<string, unknown>)["@type"] === "Recipe"
      ) {
        return candidate as Record<string, unknown>;
      }
    }
  }

  throw parseFailure(
    unreadable > 0
      ? "Supertoinette served a recipe whose structured block could not be read."
      : "Supertoinette served a page carrying no recipe.",
    { url },
  );
}

export interface ParsedRecipePage {
  recipe: RecipeCore;
  /** What the page held that could not be rendered, and why. */
  skipped: string[];
}

/**
 * Read one recipe.
 *
 * The container is looked for before the block is believed, because a listing
 * publishes a block of type Recipe naming a category, and reading that block
 * alone would answer a request for a dish with the name of a section.
 */
export function parseRecipePage(html: string, id: string, url: string): ParsedRecipePage {
  if (!RECIPE_CONTAINER.test(html)) {
    throw parseFailure("Supertoinette served a page that is not a recipe.", {
      url,
      hint: "A listing publishes a structured block of its own that names a category rather than a dish.",
    });
  }

  const block = readStructured(html, url);
  const preparation = readPreparation(html);
  if (preparation === null) {
    throw parseFailure("Supertoinette served a recipe without the steps it prints.", { url });
  }

  const badges = readBadges(html);
  const ingredients = readIngredients(html);
  const skipped: string[] = [];
  if (ingredients.length === 0) {
    skipped.push("the page printed no ingredient list, so none is rendered");
  }

  const headingMarkup = HEADING.exec(html)?.[1];
  /* v8 ignore next -- a block without a name is a block this reader already refused. */
  const published =
    headingMarkup === undefined ? textOf(String(block.name ?? "")) : textOf(headingMarkup);
  const subtitle = SUBTITLE.exec(html)?.[1];
  const description =
    subtitle === undefined ? asText(block.description) : nullWhenEmpty(textOf(subtitle));
  const servings = SERVINGS.exec(html)?.[1];

  return {
    recipe: {
      id,
      title: withoutLeadingPictogram(published),
      title_as_published: published,
      url,
      description,
      published_at: asText(block.datePublished),

      yield_text:
        servings === undefined ? asText(block.recipeYield) : nullWhenEmpty(textOf(servings)),
      ingredients,
      steps: preparation.steps,
      intro: preparation.intro,

      // A time the page shows no badge for is one the site does not publish, and
      // the block writes zero for exactly those. The badge settles which it is.
      prep_minutes: badges.shows.prep ? isoMinutes(block.prepTime) : null,
      cook_minutes: badges.shows.cook ? isoMinutes(block.cookTime) : null,
      total_minutes: badges.shows.total ? isoMinutes(block.totalTime) : null,
      rest_minutes: badges.rest_minutes,

      category: asText(block.recipeCategory),
      author: readAuthor(block),
      rating: readRating(block),
      nutrition: null,

      difficulty: badges.difficulty,
      cost_level: badges.cost,
      images: readImages(block),
      tags: readTags(html),
      ingredient_sheets: ingredients
        .map((line) => line.sheet)
        .filter((sheet): sheet is IngredientSheetLink => sheet !== null),
      faq: readFaq(html),
    },
    skipped,
  };
}

const nullWhenEmpty = (value: string): string | null => (value === "" ? null : value);

const asText = (value: unknown): string | null =>
  typeof value === "string" && value.trim() !== "" ? textOf(value) : null;
