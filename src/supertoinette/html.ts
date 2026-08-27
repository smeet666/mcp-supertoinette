/**
 * Reading words out of markup.
 *
 * The site serves HTML, so everything above this reads text that came out of a
 * page written for a browser. Resolving entities and dropping tags happens in
 * one place, because a title that reads correctly in one tool and carries
 * `&eacute;` in another is the same defect twice.
 */

const TAG = /<[^>]*>/g;
const WHITESPACE = /\s+/g;
/**
 * A gap this reader made in front of punctuation that never takes one.
 *
 * A tag becomes a space so two words either side of it stay apart, and the site
 * emphasises a word right up against the comma or full stop that follows it.
 * French sets a space before a semicolon, a colon and a question mark, so those
 * are left where they are: only the marks the language always writes tight are
 * closed up.
 */
const GAP_BEFORE_PUNCTUATION = / +(?=[,.)\]…%])/g;
/** What the site sets in front of a title before its first letter or digit. */
const LEADING_PICTOGRAM = /^[^\p{L}\p{N}(«"']+/u;
const ENTITY = /&(#\d+|#x[0-9a-fA-F]+|[a-zA-Z][a-zA-Z0-9]*);/g;

/**
 * The named entities this site writes.
 *
 * The list covers what a French page needs: the five that markup reserves, the
 * space that does not break, and the accented letters the site spells out
 * rather than writing directly.
 */
const NAMED: Readonly<Record<string, string>> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  eacute: "é",
  Eacute: "É",
  egrave: "è",
  Egrave: "È",
  ecirc: "ê",
  Ecirc: "Ê",
  euml: "ë",
  agrave: "à",
  Agrave: "À",
  acirc: "â",
  Acirc: "Â",
  ccedil: "ç",
  Ccedil: "Ç",
  ugrave: "ù",
  ucirc: "û",
  uuml: "ü",
  icirc: "î",
  iuml: "ï",
  ocirc: "ô",
  ouml: "ö",
  oelig: "œ",
  OElig: "Œ",
  aelig: "æ",
  deg: "°",
  laquo: "«",
  raquo: "»",
  rsquo: "’",
  lsquo: "‘",
  ldquo: "“",
  rdquo: "”",
  hellip: "…",
  ndash: "–",
  mdash: "—",
  euro: "€",
  times: "×",
  frac12: "½",
  frac14: "¼",
  frac34: "¾",
  zwj: "‍",
};

/**
 * Resolve the entities the site writes, so a line reads as it was published.
 *
 * An entity this does not know stays as it was written. Rendering it as
 * anything else would put a character on the page that the site never wrote.
 */
export function decode(value: string): string {
  return value.replace(ENTITY, (whole, name: string) => {
    const named = NAMED[name];
    if (named !== undefined) {
      return named;
    }
    if (!name.startsWith("#")) {
      return whole;
    }
    const code = name.startsWith("#x")
      ? Number.parseInt(name.slice(2), 16)
      : Number.parseInt(name.slice(1), 10);
    // Past the last code point Unicode defines there is no character to write,
    // so the entity stays as the site published it.
    return Number.isNaN(code) || code > 0x10ffff ? whole : String.fromCodePoint(code);
  });
}

/**
 * The words inside a fragment of markup.
 *
 * Tags go before entities are resolved, so a line carrying `&lt;` cannot turn
 * into markup this then strips.
 */
export function textOf(markup: string): string {
  return decode(markup.replace(TAG, " "))
    .replace(WHITESPACE, " ")
    .replace(GAP_BEFORE_PUNCTUATION, "")
    .trim();
}

/**
 * The words of a fragment, with the pictogram the site opens a heading with
 * taken off the front.
 *
 * The site writes a food pictogram directly against the first letter of many of
 * its titles, and a title read aloud or sorted alphabetically reads better
 * without it. What the site published is carried beside it, so nothing is lost.
 */
export function withoutLeadingPictogram(text: string): string {
  return text.replace(LEADING_PICTOGRAM, "").trim();
}

/** The contents of the first element of a kind, or null when there is none. */
export function firstBlock(html: string, open: RegExp, closeTag: string): string | null {
  const match = open.exec(html);
  if (match === null) {
    return null;
  }
  const after = html.slice(match.index + match[0].length);
  const end = after.indexOf(closeTag);
  return end === -1 ? after : after.slice(0, end);
}
