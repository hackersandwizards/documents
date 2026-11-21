import { fc, test, unicodeString } from "@hackersandwizards/scaffolding/property";
import { expect } from "vitest";
import { isRecord, stripComments, withoutImports } from "../scripts/root";

test.prop([fc.jsonValue(), unicodeString], {
  examples: [
    [null, ""],
    [[], "__proto__"],
    [false, "constructor"],
    [0, "toString"],
    ["", "é".repeat(1024)],
  ],
})("JSON records accept own keys and reject arrays and scalars", (value, key) => {
  expect(isRecord(JSON.parse(JSON.stringify({ [key]: value })))).toBe(true);
  expect(isRecord(value)).toBe(Object.prototype.toString.call(value) === "[object Object]");
  expect(isRecord(undefined)).toBe(false);
});

test.prop([unicodeString, fc.constantFrom('"', "'")], {
  examples: [
    ["", '"'],
    ["é;{}/* text */\\", "'"],
    ["🧙".repeat(1024), '"'],
  ],
})(
  "CSS comments between tokens disappear and comment delimiters inside strings stay",
  (text, quote) => {
    const literal = text
      .replace(/[\r\n\f]/g, " ")
      .replaceAll("\\", "\\\\")
      .replaceAll(quote, `\\${quote}`);
    const rule = `p { content: ${quote}${literal}/* literal */${quote}; }`;
    expect(stripComments(`/* header */\n${rule}\n/* footer */`)).toBe(`${rule}\n`);
  },
);

test.prop([fc.array(fc.stringMatching(/^[a-z-]{1,16}$/), { maxLength: 100 })], {
  examples: [[[]], [["tokens", "fonts"]], [Array.from({ length: 100 }, () => "print")]],
})("whole import lines disappear while rules that mention imports remain", (files) => {
  const rule = 'p { content: "@import"; display:block }\n';
  const imports = files.map((file) => `@import "${file}.css";\n`).join("");
  expect(withoutImports(`${imports}${rule}${imports}`)).toBe(rule);
});
