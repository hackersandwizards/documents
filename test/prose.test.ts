import { expect, test } from "vitest";
import { cellAlignmentClass, proseHtml } from "../scripts/prose";

test("removes the 101st duplicate style attribute", () => {
  const many = Array.from({ length: 101 }, (_, i) => `style="--x:${i}"`).join(" ");
  expect(proseHtml(`<p ${many}>x</p>`)).toBe("<p>x</p>");
});

test("keeps a table cell's alignment with !important", () => {
  expect(proseHtml(`<td style="text-align: center !important">1</td>`)).toBe(
    `<td class="center">1</td>`,
  );
});

test("a bare value with an apostrophe still loses its style; a quoted value keeps its text", () => {
  expect(proseHtml(`<span title=don't style="color:red">x</span>`)).toBe(
    `<span title=don't>x</span>`,
  );
  expect(proseHtml(`<a title="x style=y" href="#">a</a>`)).toBe(
    `<a title="x style=y" href="#">a</a>`,
  );
});

test.each([
  {
    syntax: "an attribute immediately after a closing quote",
    input: '<p class="a"style="color:red">x</p>',
    expected: '<p class="a">x</p>',
  },
  {
    syntax: "a namespace",
    input: '<o:p style="color:red">x</o:p>',
    expected: "<o:p>x</o:p>",
  },
])("removes style attributes with $syntax", ({ input, expected }) => {
  expect(proseHtml(input)).toBe(expected);
});

test("removes the style attribute immediately after a slash", () => {
  expect(proseHtml("<p/style=color:red>x</p>")).not.toContain("style");
});

test.each([
  {
    declaration: "text-align on a cell with similarly named attributes",
    input: '<td class-x="y" class="a" style="text-align:right">1</td>',
    expected: '<td class-x="y" class="a num">1</td>',
  },
  {
    declaration: "a similarly named property",
    input: '<td style="vertical-text-align:right">1</td>',
    expected: "<td>1</td>",
  },
])("applies only table alignment classes for $declaration", ({ input, expected }) => {
  expect(proseHtml(input)).toBe(expected);
});

test("keeps a style name in a comment or a longer tag name", () => {
  const input = "<!-- <style> --><style-guide>x</style-guide>";
  expect(proseHtml(input)).toBe(input);
});

test.each([
  { element: "style", input: "<p>x</p><STYLE>p{}</STYLE>" },
  { element: "link", input: '<link rel="stylesheet" href="x.css">' },
])("rejects a $element element that would style the body", ({ input }) => {
  expect(() => proseHtml(input)).toThrow(/the engine draws every style/);
});

test("a table cell with no style keeps its class", () => {
  expect(proseHtml('<td class="keep">1</td>')).toBe('<td class="keep">1</td>');
});

test("the error names the first element that would style the body", () => {
  expect(() => proseHtml('<p>x</p><link rel="stylesheet"><style>p{}</style>')).toThrow(
    /carries <link>/,
  );
});

test.each([
  ["font-weight: bold; TEXT-ALIGN: Right !important", "num"],
  ["text-align: center", "center"],
  ["text-align: left; text-align: right", undefined],
  ["text-align: constructor", undefined],
  ["vertical-text-align: right", undefined],
])("reads table alignment from %s", (style, expected) => {
  expect(cellAlignmentClass(style)).toBe(expected);
});
