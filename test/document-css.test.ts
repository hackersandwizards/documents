import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

// The document base (document.css) shrinks toward the brand tokens and the page setup. A document
// building block is a component, components/Doc<Name>.astro with its own scoped style, shown on a
// specimen page (scripts/specimen.ts fails on one no page shows). This list is every class the base
// still styles, kept exact: a new class fails here and belongs in a component; a deleted class
// leaves the list in the same commit.
const REMAINING = [
  // A component owns these; the base keeps them until no uncomposed template or Markdown render
  // (proposals, timesheet, certificate, briefing, NDA, print-pdf, the hub handout) uses them.
  ...["doc-header", "brand", "brand-name", "wordmark", "legal", "company-meta", "doc-meta"],
  ...["doc-tag", "eyebrow", "subtitle", "lead-grid", "prepared", "label", "detail", "num", "card"],
  // Not yet a component.
  ...["accent", "callout", "card-grid", "center", "chip", "grid-2", "keep", "meta", "muted"],
  ...["next-step", "note", "offer", "outcome", "panel", "prompt", "section-label"],
  ...["signature-line", "signatures", "small", "soft", "strike", "subtotal", "timeline", "total"],
  ...["when", "wide"],
];

/** Every class named in a selector, comments and declaration values (data URIs) left out. */
function selectorClasses(css: string): string[] {
  const preludes = [...css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/([^{}]+)\{/g)].map(
    // A prelude starts after the last statement before it, such as an @import.
    (m) => m[1].split(";").pop() ?? "",
  );
  return [
    ...new Set(preludes.flatMap((p) => [...p.matchAll(/\.([a-z][\w-]*)/g)].map((m) => m[1]))),
  ];
}

describe("document base", () => {
  it("styles exactly the classes not yet moved out into components", () => {
    const css = readFileSync(join(import.meta.dir, "../document.css"), "utf8");
    expect(selectorClasses(css).sort()).toEqual([...REMAINING].sort());
  });

  it("control: a class added to a rule, not one in a comment or a value, is caught", () => {
    expect(
      selectorClasses(
        `@import "t.css"; /* .x */ .a, ul .b li { background: url('http://w3.org/a.svg'); }`,
      ),
    ).toEqual(["a", "b"]);
  });
});
