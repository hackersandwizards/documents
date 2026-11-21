import { fc, test } from "@hackersandwizards/scaffolding/property";
import { expect } from "vitest";
import { compactStyles, editFaces, printableCodePoints } from "../scripts/compact-styles";

test.prop(
  [
    fc.integer({ min: 0xe000, max: 0xf8ff }),
    fc.constantFrom("literal", "entity", "css", "js"),
    fc.integer({ min: 0, max: 8 }),
  ],
  {
    examples: [
      [0xe000, "literal", 0],
      [0xf8ff, "entity", 8],
      [0x10ffff, "js", 0],
      [0x10ffff, "css", 1],
      [0xe000, "css", 0],
      [0xe010, "js", 1],
    ],
  },
)("only faces spanning characters present in the page survive", (point, encoding, width) => {
  const hex = point.toString(16);
  const text = {
    literal: String.fromCodePoint(point),
    entity: `&#x${hex};`,
    css: `\\${hex} `,
    js: `\\u{${hex}}`,
  }[encoding];
  const lower = (point - width).toString(16);
  const outside = (point === 0x10ffff ? point - 1 : point + 1).toString(16);
  const face = (family: string, range: string) =>
    `@font-face{font-family:${family};unicode-range:${range}}`;
  const kept =
    "@font-face{font-family:Universal}" +
    face("Present", `U+${lower}-${hex}`) +
    face("Wildcard", `U+${hex.slice(0, -1)}?`) +
    face("Exact", `U+${hex}`) +
    face("Disjoint", `U+${outside}, U+${hex}`);
  const outsideBlock = Math.floor(point / 16) + 1;
  const absent =
    face("Outside", `U+${outside}`) +
    face("InvalidPrefix", `0U+${hex}`) +
    (outsideBlock <= 0x10fff ? face("OutsideRange", `U+${outsideBlock.toString(16)}?`) : "");
  const body = `<p>${text}</p>`;
  expect(compactStyles(`<style>${kept}${absent}</style>${body}`)).toBe(
    `<style>${kept}</style>${body}`,
  );
});

test.prop([fc.uniqueArray(fc.stringMatching(/^[a-z]{1,12}$/), { maxLength: 12 })], {
  examples: [[[]], [["constructor", "tostring", "print"]], [["a".repeat(1024)]]],
})("later layer order statements disappear when every named layer was already placed", (names) => {
  if (names.length === 0) {
    expect(compactStyles("<style></style>")).toBe("<style></style>");
    return;
  }
  const longest = names.reduce((a, b) => (a.length >= b.length ? a : b));
  const fresh = longest.repeat(2);
  const order = `@layer  ${names.join(", ")};`;
  const mixed = `@layer ${names[0]}, ${fresh};`;
  const repeat = `@layer ${[fresh, ...names.slice().reverse()].join(",")};`;
  const block = `@layer ${names[0]}{p{color:inherit}}`;
  const page = "<p>x</p>";
  expect(
    compactStyles(`<style>${order}</style><style>${mixed}${repeat}${block}</style>${page}`),
  ).toBe(`<style>${order}</style><style>${mixed}${block}</style>${page}`);
});

test.prop(
  [
    fc.constantFrom("tr", "az", "en", "de_DE", "x"),
    fc.constantFrom("", 'class="sample" ', 'class="sample" id="demo" '),
    fc.constantFrom("=", " = ", "  =  "),
    fc.boolean(),
  ],
  {
    examples: [
      ["tr", "", "=", false],
      ["tr", 'class="sample" id="demo" ', "  =  ", true],
      ["az", 'class="sample" ', " = ", false],
      ["de_DE", "", "=", false],
      ["x", "", "=", true],
      ["en", "", " = ", true],
    ],
  },
)(
  "printable characters include the page language's upper and lower case forms",
  (lang, attributes, equals, quoted) => {
    const page = `<html ${attributes}lang${equals}${quoted ? `"${lang}"` : lang}><p>i Ş</p></html>`;
    const points = printableCodePoints(page);
    expect(points.has(0x130)).toBe(lang === "tr" || lang === "az");
    expect(points.has(0x15e)).toBe(true);
    expect(points.has(0x15f)).toBe(true);
    expect(printableCodePoints("i")).toEqual(new Set([0x69, 0x49]));
  },
);

test.prop(
  [
    fc.stringMatching(/^[a-zA-Z0-9+/]{1,128}$/),
    fc.constantFrom("", ";charset=utf-8", ";charset=utf-8;name=foo", ";name=foo"),
    fc.constantFrom('"', "'", " ", ")"),
  ],
  {
    examples: [
      ["abcZ", "", '"'],
      ["ré", "", "'"],
      ["Z".repeat(1024), ";charset=utf-8;name=foo", " "],
      ["abcZ", ";name=foo", ")"],
    ],
  },
)(
  "inline asset bytes contribute no characters and stop at the URI delimiter",
  (payload, parameters, delimiter) => {
    const encoded = btoa(payload);
    expect(
      printableCodePoints(`data:image/png${parameters};base64,${encoded}${delimiter}é`),
    ).toEqual(printableCodePoints(`${delimiter}é`));
    expect(printableCodePoints(`data:image/svg+xml,%3Csvg%3E${encoded}${delimiter}é`)).toEqual(
      printableCodePoints(`${delimiter}é`),
    );
  },
);

test.prop([fc.integer({ min: 0xe000, max: 0xf8ff }), fc.constantFrom("", " ", "\t", "!")], {
  examples: [
    [0xe000, ""],
    [0xf8ff, " "],
    [0xe000, "!"],
    [0xf8ff, "\t"],
  ],
})(
  "CSS and short JS escapes contribute exactly one code point before the next token",
  (point, delimiter) => {
    const hex = point.toString(16);
    const cssRemainder = delimiter === "!" ? delimiter : "";
    expect(printableCodePoints(`\\${hex}${delimiter}`)).toEqual(
      printableCodePoints(String.fromCodePoint(point) + cssRemainder),
    );
    expect(printableCodePoints(`\\u${hex}${delimiter}`)).toEqual(
      printableCodePoints(String.fromCodePoint(point) + delimiter),
    );
  },
);

test.prop([fc.constantFrom(String.raw`\110000`, String.raw`\u{110000}`, String.raw`\ffffff`)], {
  examples: [[String.raw`\110000`], [String.raw`\u{110000}`]],
})("escapes outside Unicode leave their literal characters printable", (escape) => {
  expect(printableCodePoints(escape)).toContain(0x5c);
  expect(printableCodePoints(escape)).toContain(escape[1]!.codePointAt(0));
});

test.prop([fc.constantFrom("", " ", "\n"), fc.constantFrom("", " ", " \n ")], {
  examples: [
    ["", ""],
    ["\n", " \n "],
    [" ", ""],
  ],
})("editing faces stops at the next rule regardless of whitespace", (gap, after) => {
  const face = `@font-face${gap}{font-family:Example}${after}`;
  const other = "p{color:inherit}";
  const html = `<style>${face}${other}${face}</style>`;
  const found: string[] = [];
  expect(
    editFaces(html, (match) => {
      found.push(match);
      return "";
    }),
  ).toBe(`<style>${other}</style>`);
  expect(found).toEqual([face, face]);
});
