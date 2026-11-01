import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { rawInlineStyles, rawValues } from "../scripts/styles";

// Every value a document draws is a named token in tokens.css: colour roles, type roles, spacing,
// rules, radii, page geometry. The stylesheets and the components' styles name tokens only, so
// a value changes in one place and no type carries a value of its own. Data a component draws
// from its props (a column's width, a bar's share) reaches its CSS as a custom property set
// inline, never as a declaration.
const ROOT = join(import.meta.dir, "..");
const STYLESHEETS = ["document.css", "onepager.css", "handout.css", "readout.css"];
const COMPONENTS = readdirSync(join(ROOT, "components")).filter((f) => f.endsWith(".astro"));

/** The CSS a source holds: a stylesheet whole, a component's style elements. */
function css(file: string): string {
  const text = readFileSync(join(ROOT, file), "utf8");
  if (!file.endsWith(".astro")) return text;
  return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
}

describe("tokens", () => {
  for (const file of [...STYLESHEETS, ...COMPONENTS.map((f) => `components/${f}`)])
    it(`${file} names tokens only`, () => {
      expect(rawValues(css(file))).toEqual([]);
    });

  for (const file of [...COMPONENTS.map((f) => `components/${f}`), "scripts/survey-readout.ts"])
    it(`${file} sets inline only custom properties`, () => {
      expect(rawInlineStyles(readFileSync(join(ROOT, file), "utf8"))).toEqual([]);
    });

  it("control: every kind of raw value is caught, a token and a comment are not", () => {
    expect(
      rawValues(
        `/* 4pt */ a { margin: 4pt 1.5mm; color: #fff; background: rgb(0 0 0); border: 0 solid white;
         font: var(--role-body); padding: var(--space-6); width: 100%; font-weight: 600;
         line-height: 1.5; color: var(--color-ink); content: "12pt"; }`,
      ),
    ).toEqual([
      "length: 4pt",
      "length: 1.5mm",
      "colour: #fff",
      "colour: rgb(",
      "named colour: : 0 solid white",
      "brand token: var(--color-",
      "weight: font-weight: 6",
      "leading: line-height: 1.5",
    ]);
    expect(rawInlineStyles(`<b style="--share: 4%"></b><i style="width: 4%"></i>`)).toEqual([
      "width: 4%",
    ]);
  });
});
