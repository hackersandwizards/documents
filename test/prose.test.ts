import { expect, test } from "vitest";
import { proseHtml } from "../scripts/prose";

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

// The browser's reading of markup, not a pattern's: an attribute after a quote or a slash with no
// space, a namespaced tag, a style element named only inside a comment or a longer tag name.
test("the body is read as the browser reads it", () => {
  expect(proseHtml(`<p class="a"style="color:red">x</p>`)).toBe(`<p class="a">x</p>`);
  expect(proseHtml(`<p/style=color:red>x</p>`)).not.toContain("style");
  expect(proseHtml(`<o:p style="color:red">x</o:p>`)).toBe(`<o:p>x</o:p>`);
  expect(proseHtml(`<td class-x="y" class="a" style="text-align:right">1</td>`)).toBe(
    `<td class-x="y" class="a num">1</td>`,
  );
  expect(proseHtml(`<td style="vertical-text-align:right">1</td>`)).toBe(`<td>1</td>`);
  expect(proseHtml(`<!-- <style> --><style-guide>x</style-guide>`)).toBe(
    `<!-- <style> --><style-guide>x</style-guide>`,
  );
  expect(() => proseHtml(`<p>x</p><STYLE>p{}</STYLE>`)).toThrow(/the engine draws every style/);
  expect(() => proseHtml(`<link rel="stylesheet" href="x.css">`)).toThrow(
    /the engine draws every style/,
  );
});

test("a table cell with no style keeps its class", () => {
  expect(proseHtml('<td class="keep">1</td>')).toBe('<td class="keep">1</td>');
});

test("the error names the first element that would style the body", () => {
  expect(() => proseHtml('<p>x</p><link rel="stylesheet"><style>p{}</style>')).toThrow(
    /carries <link>/,
  );
});
