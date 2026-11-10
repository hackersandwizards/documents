import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";
import { brandFile } from "../scripts/render-pdf";
import { rawInlineStyles, rawValues } from "../scripts/styles";

const ROOT = join(import.meta.dir, "..");
const STYLESHEETS = ["document.css", "onepager.css", "handout.css", "readout.css"];
const COMPONENTS = readdirSync(join(ROOT, "components")).filter((f) => f.endsWith(".astro"));

/** The CSS a source holds: a stylesheet whole, a component's style elements. */
function css(file: string): string {
  const text = readFileSync(join(ROOT, file), "utf8");
  if (!file.endsWith(".astro")) return text;
  return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
}

// @page reads no custom property: each named page box's top margin is brand's token, typed again.
it("the handout's page boxes take brand's top margin", () => {
  const brand = readFileSync(brandFile("document.css"), "utf8");
  const top = /--handout-margin-top:\s*([\d.]+mm);/.exec(brand)![1];
  const tokens = readFileSync(join(ROOT, "tokens.css"), "utf8");
  for (const box of ["handout", "opening"])
    expect(new RegExp(`@page ${box} \\{\\s*margin-top: ([\\d.]+mm);`).exec(tokens)?.[1]).toBe(top);
});

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
    // A "/*" or an escaped quote inside a string hides no value after it.
    expect(
      rawValues(`a { content: "/*"; width: 12pt; } b { content: "\\" /*"; width: 3mm; } /* c */`),
    ).toEqual(["length: 12pt", "length: 3mm"]);
    expect(rawInlineStyles(`<b style="--share: 4%"></b><i style="width: 4%"></i>`)).toEqual([
      "width: 4%",
    ]);
    // Viewport and root-line units, a weight inside the font shorthand, a named colour outside
    // the first few, and a single-quoted literal in an Astro expression.
    expect(
      rawValues(
        `a { height: 2dvh; width: 3vmin; margin: 1rlh; font: italic 600 var(--x); color: orange; }`,
      ),
    ).toEqual([
      "length: 2dvh",
      "length: 3vmin",
      "length: 1rlh",
      "named colour: : orange",
      "weight: font: italic 6",
    ]);
    expect(rawInlineStyles(`<b style={'width: 4%'}></b>`)).toEqual(["width: 4%"]);
  });
});
