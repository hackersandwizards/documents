import { fc, test, unicodeString } from "@hackersandwizards/scaffolding/property";
import { escapeText } from "entities";
import { expect } from "vitest";
import { proseHtml } from "../scripts/prose";

test.prop([unicodeString, fc.integer({ min: 0, max: 101 })], {
  examples: [
    ["", 0],
    ["Grüße >", 1],
    ["🧙".repeat(1024), 101],
  ],
})("style attributes are removed without changing surrounding content", (text, count) => {
  const body = escapeText(text);
  const styles = [' STYLE = "--value: >"', " style='color:red'", " style=color:blue"];
  const attributes = Array.from({ length: count }, (_, i) => styles[i % styles.length]).join("");
  expect(proseHtml(`<p title="a>b"${attributes}>${body}</p>`)).toBe(`<p title="a>b">${body}</p>`);
});

const styledElement = fc.record({
  tag: fc.constantFrom("td", "th", "p", "td-label", "label-th"),
  align: fc.constantFrom("right", "center", "left"),
  own: fc.constantFrom("", "keep"),
  priority: fc.constantFrom("", " ! important", " !IMPORTANT"),
});

test.prop([styledElement], {
  examples: [
    [{ tag: "td", align: "right", own: "", priority: "" }],
    [{ tag: "th", align: "center", own: "keep", priority: " ! important" }],
    [{ tag: "p", align: "right", own: "keep", priority: "" }],
    [{ tag: "td", align: "left", own: "", priority: "" }],
    [{ tag: "label-th", align: "right", own: "keep", priority: "" }],
    [{ tag: "td-label", align: "right", own: "keep", priority: "" }],
  ],
})(
  "only right and center alignment on table cells become classes",
  ({ tag, align, own, priority }) => {
    const added =
      tag === "td" || tag === "th" ? { right: "num", center: "center", left: "" }[align] : "";
    const classes = [own, added].filter(Boolean).join(" ");
    expect(
      proseHtml(
        `<${tag}${own ? ` class="${own}"` : ""} style="TEXT-ALIGN : ${align}${priority}">x</${tag}>`,
      ),
    ).toBe(`<${tag}${classes ? ` class="${classes}"` : ""}>x</${tag}>`);
  },
);
