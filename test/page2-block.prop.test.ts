import { fc, test, unicodeString } from "@hackersandwizards/scaffolding/property";
import { expect } from "vitest";
import { flatBlock, page2Block } from "../scripts/page2-block";

test.prop([fc.stringMatching(/^[a-zé]{1,30}$/)], {
  examples: [["a"], ["é".repeat(1024)]],
})("HTML and extracted page text share normalized letters and digits", (word) => {
  const block = flatBlock(`<p>${word}-Stra&#223;e&nbsp;<b>１２</b></p>`);
  expect(block).toBe(`${word}strasse12`);
  expect(flatBlock(`<p>${word}&am</p><p>p;</p>`)).toBe(`${word}amp`);
  expect(page2Block([block], "", `  É  \n123\n${word.toUpperCase()} STRASSE 12`)).toBe(0);
});

test.prop([fc.integer({ min: 0, max: 24 }), fc.integer({ min: 0, max: 24 })], {
  examples: [
    [0, 0],
    [19, 19],
    [20, 20],
    [24, 24],
  ],
})(
  "a qualifying page-one block sets the cutoff and a repeated block does not",
  (length, padding) => {
    const firstLine = "opener";
    const anchor = "ä".repeat(length);
    const short = "é".repeat(19);
    const before = Array.from({ length: padding }, () => "other");
    const blocks = [...before, firstLine, anchor, firstLine, short];
    const page1 = `${firstLine}\n${anchor}\n${short}`;
    expect(page2Block(blocks, page1, firstLine)).toBe(padding + (length >= 20 ? 2 : 0));
    expect(page2Block(blocks, page1, `${firstLine}\n${anchor}`)).toBe(padding);
    expect(page2Block(blocks, page1, "!?\n  ")).toBe(-1);
    expect(page2Block(blocks, page1, "!?@#")).toBe(-1);
  },
);

test.prop([unicodeString], {
  examples: [[""], ["! @ #"], ["é".repeat(1024)]],
})("no block is selected when the first substantial line is absent", (word) => {
  const block = flatBlock(word);
  expect(page2Block([block], "", `Unmatched${block}ending`)).toBe(-1);
});
