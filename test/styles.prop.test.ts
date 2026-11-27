import { fc, test, unicodeString } from "@hackersandwizards/scaffolding/property";
import { escapeAttribute } from "entities";
import { expect } from "vitest";
import { cssString } from "../scripts/fill";
import { foreignStyles, rawValues, styleAttributes } from "../scripts/styles";

test.prop([fc.array(unicodeString, { maxLength: 8 })], {
  examples: [
    [[]],
    [["", "--band: grüń&#59; border: 0", "🧙".repeat(1024)]],
    [["constructor", "__proto__", "toString"]],
  ],
})("style attributes decode exactly once, preserving empty values and document order", (values) => {
  const html = values
    .map((value) =>
      value === ""
        ? `<p title="style=no" STYLE></p>`
        : `<p title="style=no" STYLE="${escapeAttribute(value)}"></p>`,
    )
    .join("");
  expect(styleAttributes(html)).toEqual(values);
});

test.prop(
  [
    fc.constantFrom("color", "margin", "constructor", "__proto__", "toString"),
    fc.constantFrom(";", "&#59;", "&#x3b;"),
    fc.constantFrom(" ", "\t", "\n"),
  ],
  {
    examples: [
      ["color", ";", " "],
      ["margin", "&#59;", "\t"],
      ["__proto__", "&#x3b;", "\n"],
    ],
  },
)(
  "a rendered inline declaration after an engine property is reported even when the separator is encoded",
  (name, separator, space) => {
    const safe = `${space}--band: grüń`;
    expect(foreignStyles(`<i style="${safe}"></i>`)).toEqual([]);
    expect(foreignStyles(`<i style="${safe}${separator}${space}${name}: 0"></i>`)).toEqual([
      `The document sets unsupported inline properties ${name} in style="${safe};${space}${name}: 0". Keep only engine-supported custom properties in style and move the other declarations into the document type's engine stylesheet.`,
    ]);
  },
);

test.prop(
  [fc.integer({ min: 1, max: 9999 }), fc.constantFrom("px", "pt", "mm", "rem"), unicodeString],
  {
    examples: [
      [1, "px", ""],
      [9999, "mm", "é{};".repeat(1024)],
    ],
  },
)(
  "raw values in CSS comments and strings do not hide or add findings in adjacent declarations",
  (size, unit, text) => {
    const measure = `${size}${unit}`;
    const literal = cssString(`${text} ${measure}`);
    expect(rawValues(`/* ${measure} */p{content:${literal};margin:${measure}}`)).toEqual([
      `length: ${measure}`,
    ]);
  },
);
