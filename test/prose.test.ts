import { expect, test } from "bun:test";
import { proseHtml } from "../scripts/prose";

test("every style attribute goes, duplicates, any quoting and a '>' in a value included", () => {
  expect(proseHtml(`<p style="color:red" style="color:blue">x</p>`)).toBe("<p>x</p>");
  expect(proseHtml(`<p style = 'color:red' title="a>b" style=color:blue>x</p>`)).toBe(
    `<p title="a>b">x</p>`,
  );
  expect(proseHtml(`<td style="text-align: right;">1</td>`)).toBe(`<td class="num">1</td>`);
  expect(proseHtml(`<td class='x' style=text-align:center>1</td>`)).toBe(
    `<td class="x center">1</td>`,
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
