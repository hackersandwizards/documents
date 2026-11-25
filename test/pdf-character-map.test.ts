import { deflateSync } from "node:zlib";
import { expect, test } from "vitest";
import { codePointsInCmap, printedCharacters } from "../scripts/pdf-character-map";

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
