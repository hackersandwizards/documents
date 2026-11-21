import { fc, test } from "@hackersandwizards/scaffolding/property";
import { expect } from "vitest";
import { denyPatterns } from "../scripts/deny-patterns";

const words = fc.stringMatching(/^[a-zé]{1,24}$/);

test.prop(
  [
    words,
    words,
    fc.constantFrom("", "-", "_", ".", "\n", "&nbsp;", "&#160;"),
    fc.constantFrom("&", "&amp;", "&#00038;", "&#x026;"),
  ],
  {
    examples: [
      ["é", "ä", "\n", "&#x026;"],
      ["a".repeat(1024), "z", "", "&amp;"],
      ["a", "b", "_", "&#00038;"],
      ["a", "b", "&#160;", "&"],
      ["a", "b", "&nbsp;", "&"],
    ],
  },
)(
  "mixed-case terms match equivalent separators and entities on whole-word boundaries",
  (first, last, gap, amp) => {
    const { inText, inPath } = denyPatterns(`Re${first} & ${last}`);
    const match = `RE${first.toUpperCase()}${gap}${amp}${gap}${last.toUpperCase()}`;
    expect([`(${match})`.match(inPath), `(${match})`.match(inText[0])]).toEqual([[match], [match]]);
    expect(`a${match}`.match(inPath)).toBeNull();
    expect(`${match}1`.match(inPath)).toBeNull();
  },
);

test.prop([words, fc.constantFrom("-", "_", "/", "1")], {
  examples: [
    ["a", "-"],
    ["é".repeat(1024), "1"],
  ],
})("lowercased acronyms match in text only next to a slug separator", (word, separator) => {
  const acronym = `ZX${word.toUpperCase()}`;
  const { inText, inPath } = denyPatterns(acronym);
  const lower = acronym.toLowerCase();
  const count = (text: string) =>
    new Set(inText.flatMap((pattern) => [...text.matchAll(pattern)].map(({ index }) => index)))
      .size;
  expect(count(lower)).toBe(0);
  expect(count(acronym)).toBe(1);
  expect(count(`${lower}${separator}${separator}${lower}`)).toBe(2);
  expect(lower.match(inPath)).toEqual([lower]);
});

test.prop([fc.constantFrom("ä", "ö", "ü", "ß"), words], {
  examples: [
    ["ä", "é"],
    ["ö", "a"],
    ["ü", "b"],
    ["ß", "c"],
  ],
})("a spelled-out umlaut or sharp s matches the original term", (letter, word) => {
  const spelled = { ä: "ae", ö: "oe", ü: "ue", ß: "ss" }[letter];
  const mixed = denyPatterns(`X${letter}${word}`);
  const capital = denyPatterns(
    `X${letter === "ß" ? "ẞ" : letter.toUpperCase()}${word.toUpperCase()}`,
  );
  expect(`X${spelled}${word}`.match(mixed.inText[0])).toHaveLength(1);
  expect(`X${spelled.toUpperCase()}${word.toUpperCase()}`.match(capital.inText[0])).toHaveLength(1);
});

test.prop([fc.constantFrom(".", "*", "+", "?", "^", "$", "{", "}", "(", ")", "|", "[", "]", "\\")])(
  "regex punctuation in a deny term matches literally",
  (punctuation) => {
    const { inPath } = denyPatterns(`One${punctuation}Go`);
    expect(`One${punctuation}Go`.match(inPath)).toHaveLength(1);
    expect("OneXGo".match(inPath)).toBeNull();
    expect("OneGo".match(inPath)).toBeNull();
  },
);
