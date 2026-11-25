import { deflateSync } from "node:zlib";
import { expect, test } from "vitest";
import { parseLayerItem } from "../scripts/compact-styles";
import { codePointsInCmap, printedCharacters } from "../scripts/pdf-character-map";
import { readProtocol } from "../scripts/process-protocol";
import { cellAlignmentClass } from "../scripts/prose";
import {
  attributeMatches,
  bareSelectorMatches,
  cssItemDelimiters,
  skipQuotedString,
} from "../scripts/prune";

test.each([
  ["font-weight: bold; TEXT-ALIGN: Right !important", "num"],
  ["text-align: center", "center"],
  ["text-align: left; text-align: right", undefined],
  ["text-align: constructor", undefined],
  ["vertical-text-align: right", undefined],
])("reads table alignment from %s", (style, expected) => {
  expect(cellAlignmentClass(style)).toBe(expected);
});

test.each([
  [{ prelude: "@layer base, doc.print;" }, { statement: true, layers: ["base", "doc.print"] }],
  [
    { prelude: "@layer doc", body: "" },
    { statement: false, layers: ["doc"] },
  ],
  [{ prelude: "@layer doc" }, undefined],
  [{ prelude: "@layer base, doc", body: "" }, undefined],
  [{ prelude: "@layer escaped\\2e name;" }, undefined],
  [{ prelude: "@import 'style.css';" }, undefined],
])("identifies named layer statements and blocks in %j", (item, expected) => {
  expect(parseLayerItem(item)).toEqual(expected);
});

test.each([
  ["'foo'", 0, 4],
  ['a"x\\"y"z', 1, 6],
  ["a'unclosed", 1, 10],
])("finds the closing quote in %j", (text, start, expected) => {
  expect(skipQuotedString(text, start)).toBe(expected);
});

test.each([
  [
    'p{";";}',
    [
      { char: "{", index: 1 },
      { char: ";", index: 5 },
      { char: "}", index: 6 },
    ],
  ],
  ["f(g(;));", [{ char: ";", index: 7 }]],
  ["a(unclosed;", []],
])("finds stylesheet delimiters outside strings and parentheses in %j", (css, expected) => {
  expect([...cssItemDelimiters(css)]).toEqual(expected);
});

const page = {
  attributes: new Set(["data-own"]),
  classes: new Set(["known"]),
  ids: new Set(["main"]),
  tags: new Set(["p"]),
};

test.each([
  ['[DATA-OWN="x"]', true],
  ["[open]", true],
  ["[data-absent]", false],
  ["[unknown\\2d name]", true],
])("checks whether an attribute selector can match %s", (selector, expected) => {
  expect(attributeMatches(selector, page)).toBe(expected);
});

test.each([
  ["P.known#main:hover", true],
  ["p::first-letter", true],
  ["p.missing", false],
  ["p#other", false],
  ["aside.known", false],
])("checks tag, ID, and class requirements in %s", (selector, expected) => {
  expect(bareSelectorMatches(selector, page)).toBe(expected);
});

const protocols = [
  {
    delimiter: "\n",
    chunks: ['{"id":', '1}\n{"id":2}\n{"id":3}'],
    expected: [{ id: 1 }, { id: 2 }],
  },
  { delimiter: "\0", chunks: ['{"id":1}\0{"id":', "2}\0"], expected: [{ id: 1 }, { id: 2 }] },
  { delimiter: "\n", chunks: ["null\n?\n[]\n"], expected: [undefined, undefined, undefined] },
] as const;

test.each(protocols)(
  "reads complete JSON records from $chunks",
  ({ delimiter, chunks, expected }) => {
    const records: unknown[] = [];
    const read = readProtocol(delimiter, (record) => {
      records.push(record);
      return true;
    });
    chunks.forEach(read);
    expect(records).toEqual(expected);
  },
);

test("stops dispatching a chunk when the receiver rejects a frame", () => {
  const records: unknown[] = [];
  const read = readProtocol("\n", (record) => {
    records.push(record);
    return false;
  });
  read('{"id":1}\n{"id":2}\n');
  expect(records).toEqual([{ id: 1 }]);
});

const characters = "beginbfchar\n<01> <0041D83DDE80>\nendbfchar";
const range = "beginbfrange\n<01> <03> <0061>\nendbfrange";
const pointSets = [
  [characters, new Set([0x41, 0x1f680])],
  [range, new Set([0x61, 0x62, 0x63])],
] as const;

test.each(pointSets)("decodes Unicode points from %s", (input, expected) => {
  expect(codePointsInCmap(input)).toEqual(expected);
});

function fontWithUnicodeMap(data: Buffer, filter: string): Buffer {
  return Buffer.concat([
    Buffer.from("<< /Subtype /Type0 /BaseFont /ABCDEF+Example /ToUnicode 7 0 R >>\n"),
    Buffer.from("7 0 obj << /Length " + data.length + filter + " >> stream\n"),
    data,
    Buffer.from("\nendstream\nendobj\n"),
  ]);
}

test.each([
  ["plain", fontWithUnicodeMap(Buffer.from(characters), ""), new Set([0x41, 0x1f680])],
  [
    "deflated",
    fontWithUnicodeMap(deflateSync(range), " /Filter /FlateDecode"),
    new Set([0x61, 0x62, 0x63]),
  ],
])("reads a %s map under the PDF font's PostScript name", (_name, pdf, expected) => {
  expect(printedCharacters(pdf)).toEqual(new Map([["Example", expected]]));
});
