import { defined } from "@hackersandwizards/scaffolding/defined";
import { fc, test, unicodeString } from "@hackersandwizards/scaffolding/property";
import { decodeHTML } from "entities";
import { expect } from "vitest";
import { cssString, escapeHtml, fill, languageTag, svgUri, wordsFor } from "../scripts/fill";

test.prop([unicodeString], {
  examples: [[""], ["é<>&\"'\\\n\r\t%#"], ["🧙".repeat(1024)]],
})(
  "HTML escaping preserves text through entity decoding and leaves no markup delimiters",
  (text) => {
    const escaped = escapeHtml(text);
    expect(escaped).not.toMatch(/[<>"']/);
    expect(decodeHTML(escaped)).toBe(text);
  },
);

test.prop([unicodeString], {
  examples: [[""], ["é<>&\"'\\\n\r\t%#\x7f"], ["🧙".repeat(1024)]],
})(
  "CSS string escaping preserves text without raw control characters or a closing style tag",
  (text) => {
    const escaped = cssString(text);
    expect(escaped).toMatch(/^"(?:\\(?:[0-9a-f]{1,6} |["\\])|[^"\\<\p{Cc}])*"$/iu);
    const decoded = escaped
      .slice(1, -1)
      .replace(/\\(?:([0-9a-f]{1,6}) |(["\\]))/gi, (_, hex?: string, literal?: string) =>
        hex
          ? String.fromCodePoint(Number.parseInt(hex, 16))
          : defined(literal, "named character reference"),
      );
    expect(decoded).toBe(text);
    if (text.includes('"')) expect(escaped).toContain(String.raw`\"`);
    if (text.includes("\\")) expect(escaped).toContain("\\\\");
  },
);

test.prop([unicodeString], {
  examples: [[""], ["é<>&\"'\n\r\t%#"], ["🧙".repeat(1024)]],
})("SVG data URIs round-trip without raw fragment or HTML attribute delimiters", (text) => {
  const prefix = "data:image/svg+xml,";
  const uri = svgUri(text);
  expect(uri.startsWith(prefix)).toBe(true);
  expect(uri.slice(prefix.length)).not.toMatch(/[#"<>&\n\r\t]/);
  expect(decodeURIComponent(uri.slice(prefix.length))).toBe(text);
});

test.prop([unicodeString, fc.constantFrom("name", "constructor", "__proto__", "toString")], {
  examples: [
    ["", "name"],
    ["é{other}", "constructor"],
    ["長".repeat(1024), "__proto__"],
    ["é", "toString"],
  ],
})("placeholders use only own values and replacement text is inserted literally", (value, key) => {
  const template = `{${key}} / {${key}}`;
  expect(fill(template, { [key]: value })).toBe(`${value} / ${value}`);
  expect(fill(template)).toBe(" / ");
  expect(fill(template, { [key]: null })).toBe(" / ");
  expect(fill("{}", { "": value })).toBe("{}");
});

test.prop([unicodeString, fc.constantFrom("de", "constructor", "__proto__", "toString")], {
  examples: [
    ["", "de"],
    ["é", "__proto__"],
    ["長".repeat(1024), "constructor"],
    ["é", "toString"],
  ],
})("word lookup uses the lowercased primary subtag or English when absent", (value, key) => {
  const en = `English:${value}`;
  const primary = key.toLowerCase();
  const lang = `${primary.toUpperCase()}-AT`;
  expect(wordsFor(lang, { en, [primary]: value })).toBe(value);
  expect(wordsFor(lang, { en })).toBe(en);
  expect(wordsFor(null, { en, [primary]: value, "": value })).toBe(en);
});

test.prop([fc.constantFrom("en", "de", "tr", "ar"), fc.constantFrom("GB", "AT", "TR", "EG")])(
  "language tags keep their spelling and reject an underscore separator",
  (language, region) => {
    expect(languageTag(`${language}-${region}`)).toBe(`${language}-${region}`);
    expect(() => languageTag(`${language}_${region}`)).toThrow(/lang must be a language tag/);
    expect(() => {
      Reflect.apply(languageTag, undefined, [[language]]);
    }).toThrow(/lang must be a language tag/);
  },
);
