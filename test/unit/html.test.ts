/**
 * Reading words out of markup.
 *
 * The site spells its accented letters as entities on some pages and writes
 * them directly on others, so a title has to read the same either way. An
 * entity this reader does not know stays as the site wrote it: replacing it
 * with a guess would put a character on the page the site never published.
 */

import { describe, expect, it } from "vitest";
import {
  decode,
  firstBlock,
  textOf,
  withoutLeadingPictogram,
} from "../../src/supertoinette/html.js";

describe("decode", () => {
  it("resolves the entities markup reserves", () => {
    expect(decode("Entr&eacute;es &amp; salades")).toBe("Entrées & salades");
  });

  it("resolves an accented letter the site spells out", () => {
    expect(decode("p&acirc;tes &agrave; l'&oelig;uf")).toBe("pâtes à l'œuf");
  });

  it("resolves a numeric reference, in decimal and in hexadecimal", () => {
    expect(decode("&#233;&#x63;")).toBe("éc");
  });

  it("leaves a name it does not know exactly as the site wrote it", () => {
    expect(decode("&nosuchentity; &frac99;")).toBe("&nosuchentity; &frac99;");
  });

  it("leaves a code point past what Unicode defines", () => {
    expect(decode("&#x110000;")).toBe("&#x110000;");
  });

  it("leaves text carrying no entity untouched", () => {
    expect(decode("crème brûlée")).toBe("crème brûlée");
  });
});

describe("textOf", () => {
  it("keeps the words of a fragment and drops its markup", () => {
    expect(textOf("<p><strong>Verser</strong> le bouillon</p>")).toBe("Verser le bouillon");
  });

  it("closes the gap markup left in front of a comma or a full stop", () => {
    expect(textOf("saupoudré de <strong>mirette</strong>, puis <strong>servir</strong>.")).toBe(
      "saupoudré de mirette, puis servir.",
    );
  });

  it("leaves the space French sets before a question mark", () => {
    expect(textOf("<p>Quelles poires choisir ?</p>")).toBe("Quelles poires choisir ?");
  });

  it("cannot be talked into stripping markup a line only quotes", () => {
    expect(textOf("<p>&lt;strong&gt;pas du gras&lt;/strong&gt;</p>")).toBe(
      "<strong>pas du gras</strong>",
    );
  });
});

describe("withoutLeadingPictogram", () => {
  it("takes off the pictogram the site sets against the first letter", () => {
    expect(withoutLeadingPictogram("🥣Velouté de gaverole")).toBe("Velouté de gaverole");
  });

  it("leaves a title that opens on a letter", () => {
    expect(withoutLeadingPictogram("Velouté de gaverole")).toBe("Velouté de gaverole");
  });

  it("leaves a title that opens on a digit or a quotation mark", () => {
    expect(withoutLeadingPictogram("4 saisons")).toBe("4 saisons");
    expect(withoutLeadingPictogram("« Velouté »")).toBe("« Velouté »");
  });
});

describe("firstBlock", () => {
  it("returns what the first element of a kind holds", () => {
    expect(firstBlock("<ul><li>un</li></ul>", /<ul>/, "</ul>")).toBe("<li>un</li>");
  });

  it("returns nothing when the page holds no such element", () => {
    expect(firstBlock("<p>rien</p>", /<ul>/, "</ul>")).toBeNull();
  });

  it("returns everything after the opening when the closing tag never comes", () => {
    expect(firstBlock("<ul><li>un</li>", /<ul>/, "</ul>")).toBe("<li>un</li>");
  });
});
