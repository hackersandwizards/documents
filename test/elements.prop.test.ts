import { fc, test, unicodeString } from "@hackersandwizards/scaffolding/property";
import { decodeHTMLAttribute } from "entities";
import { expect } from "vitest";
import { withElements } from "../scripts/elements";

test.prop([unicodeString, fc.constantFrom("", "extra", "extra existing")], {
  examples: [
    ["", ""],
    ['é<&quot;"', "extra"],
    ["🧙".repeat(1024), "extra existing"],
  ],
})("matching edits add each class once and the last assigned attribute wins", (value, classes) => {
  const html = `<div class="${classes}"></div><p>untouched</p>`;
  const map: Parameters<typeof withElements>[1] = [
    ["div", "existing", { "data-tone": "first" }],
    ["div", "existing"],
    ["div", undefined, { "data-tone": "last" }],
    ["div", undefined, { title: value }],
  ];
  const expectedClasses = classes.includes("existing")
    ? classes
    : [classes, "existing"].filter(Boolean).join(" ");
  const out = withElements(html, map);
  const expected = `<div class="${expectedClasses}" data-tone="last" title="([^"]*)"></div><p>untouched</p>`;
  const attribute = new RegExp(`^${expected}$`).exec(out)?.[1];
  expect(decodeHTMLAttribute(attribute ?? "")).toBe(value);
  expect(attribute).toBeDefined();
  expect(withElements(out, map)).toBe(out);
});
