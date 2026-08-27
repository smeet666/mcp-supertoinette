/**
 * The shapes every layer agrees on.
 *
 * A read carries whether it came from the store, so a caller can tell a fresh
 * answer from a repeated one without asking the site again.
 */

/** The envelope every read returns. */
export interface Read<T> {
  data: T;
  cached: boolean;
  /** Rows the server declined to render, and why, when any were dropped. */
  skipped?: string[];
}

/** What was done to a quantity, and how exact the result is. */
export type Scaling = "scaled" | "rounded" | "unscaled";

/**
 * One line of an ingredient list.
 *
 * `scaling` carries the whole honesty of the shape. `scaled` means the
 * arithmetic landed exactly. `rounded` means the value moved, because a
 * countable thing was taken to the smallest share a cook can measure out or a
 * measurement was demoted to a smaller unit to stay usable. `unscaled` means the
 * line carries nothing that can be multiplied, so it was left as published.
 */
export interface ScaledIngredient {
  /** The line as it now reads. */
  text: string;
  /** The line as the site published it. */
  original: string;
  scaling: Scaling;
  amount: number | null;
  /** The upper end of a published range, such as "2 to 3 apples". */
  amount_max: number | null;
  unit: string | null;
  /**
   * True for a line the site prints as a heading inside the list, such as
   * "Pour la garniture :". It names the part that follows and holds no
   * quantity of its own.
   */
  is_heading: boolean;
  /**
   * Why the line was rounded, clamped or left alone.
   *
   * Absent when the arithmetic landed exactly and there is nothing to qualify:
   * a note beside every line would read as decoration rather than as the
   * warning it is.
   */
  note?: string;
}

/** How many the recipe was written for, and how many were asked for. */
export interface RecipeYield {
  /** The number the site printed, when its wording carries one. */
  original_count: number | null;
  /** The site's own wording, which is the claim it actually made. */
  original_text: string;
  /** What the caller asked for, or null when they asked for nothing. */
  requested: number | null;
  /** The site's own word for what it counts, such as "personnes". */
  unit: string | null;
  /** What the quantities were multiplied by. 1 when nothing was asked. */
  factor: number;
}

/** The rating the site publishes, on the scale the site publishes it against. */
export interface Rating {
  value: number;
  /** Reviews counted, which is what the site prints beside the stars. */
  count: number;
  /** The top of the scale, as published, so a value is never read against a guess. */
  scale: number;
}

/**
 * How hard the site says a recipe is.
 *
 * The wording is carried and nothing else. The site prints a label without ever
 * publishing how many degrees its scale holds, so a level here would be a scale
 * this server invented.
 */
export interface Difficulty {
  label: string;
}

/**
 * What the site says a recipe costs.
 *
 * The scale is carried because the site displays it: the answer counts the
 * symbols it lit and the symbols it drew.
 */
export interface CostLevel {
  label: string;
  level: number;
  scale: number;
}

/** A category the site files a recipe under, with the token its listing is at. */
export interface Tag {
  label: string;
  /**
   * Pass this back to browse a category. Null when the link carries no token.
   *
   * It is a number and a slug together, because the site answers the number
   * with any other slug by a 404 rather than by a redirect.
   */
  category: string | null;
  url: string;
}

/**
 * The ingredient page the site links a line to.
 *
 * The site chooses this link itself, and it is often the page of a different
 * ingredient from the one the line names: a line reading "de crème" links to
 * the page for pineapple. Both are carried, and neither is called the identity
 * of the ingredient.
 */
export interface IngredientSheetLink {
  /** The words the site linked, as published. */
  line: string;
  sheet_id: string;
  slug: string;
  url: string;
}

/** A question and its answer, as the page prints them under the steps. */
export interface FaqEntry {
  question: string;
  answer: string;
}

/**
 * One line of an ingredient list, as the page publishes it.
 *
 * The site prints the quantity apart from the words it links, so the two arrive
 * separately rather than being cut out of one string. A line the site prints
 * with no link and no quantity is a heading naming the part that follows.
 */
export interface RawIngredient {
  /** The quantity as printed, such as "800 g". Null when the line carries none. */
  amount_text: string | null;
  /** The words the line names the ingredient with. */
  label: string;
  /** The whole line as published, quantity included. */
  raw: string;
  /** The ingredient page the site linked these words to, when it linked one. */
  sheet: IngredientSheetLink | null;
  is_heading: boolean;
}

/**
 * One recipe, as the reading layer establishes it.
 *
 * Quantities are carried as published. Rescaling belongs above the seam, so a
 * program importing this layer as a library reads what the site wrote.
 */
export interface RecipeCore {
  id: string;
  /** The title with any leading pictogram removed, which is what reads well. */
  title: string;
  /** The title exactly as the site published it, pictogram included. */
  title_as_published: string;
  url: string;
  description: string | null;
  published_at: string | null;

  /** The site's own wording for how many it serves, such as "6 personnes". */
  yield_text: string | null;
  ingredients: RawIngredient[];
  steps: string[];
  /** The prose the page prints above the steps, when it prints any. */
  intro: string | null;

  /** Null when the page prints no such badge. The site writes zero for absent. */
  prep_minutes: number | null;
  cook_minutes: number | null;
  total_minutes: number | null;
  /** Resting time, which the page prints under "Pause". */
  rest_minutes: number | null;

  category: string | null;
  author: string | null;
  rating: Rating | null;
  /** This site publishes none, and the field is here so the shape stays comparable. */
  nutrition: null;

  difficulty: Difficulty | null;
  cost_level: CostLevel | null;
  images: string[];
  tags: Tag[];
  ingredient_sheets: IngredientSheetLink[];
  faq: FaqEntry[];
}

/** One recipe as a tool renders it, with quantities taken to what was asked. */
export interface Recipe extends Omit<RecipeCore, "ingredients" | "yield_text"> {
  yield: RecipeYield;
  ingredients: ScaledIngredient[];
}
