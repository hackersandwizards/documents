import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { composePage, openComposer } from "../scripts/compose";
import { composeOnepager } from "../scripts/onepager";
import { editStyles } from "../scripts/prune";
import { brandFile } from "../scripts/render-pdf";
import { ROOT } from "../scripts/root";
import { onepager, surveyReadout } from "../scripts/samples";
import { composeSurveyReadout } from "../scripts/survey-readout";

// Only a layer's first mention places it, so a page carries the brand's whole order once, ahead
// of every layer block.
const LAYER = /@layer\s+[\w.,\s-]+?\s*[;{]/g;
const brandOrder = readFileSync(brandFile("layers.css"), "utf8").match(LAYER)![0];
const layers = (html: string) => {
  const found: string[] = [];
  editStyles(html, (css) => (found.push(...(css.match(LAYER) ?? [])), css));
  return found;
};

let composer: Awaited<ReturnType<typeof openComposer>>;
beforeAll(async () => {
  composer = await openComposer(ROOT);
});
afterAll(() => composer?.close());

describe("a composed page declares the layer order once, the brand's, first", () => {
  const pages: [string, () => Promise<string> | string][] = [
    ["a document", () => composePage(composer, "DocMarkdown", { title: "T", html: "<p>x</p>" })],
    ["the onepager", () => composeOnepager(composer, onepager)],
    ["the survey readout", () => composeSurveyReadout(surveyReadout)],
  ];
  for (const [name, compose] of pages)
    it(name, async () => {
      const found = layers(await compose());
      expect(brandOrder).toEndWith(";");
      expect(found[0]).toBe(brandOrder);
      expect(found.filter((l) => l.endsWith(";"))).toEqual([brandOrder]);
    });

  it("the catalog's home, ahead of its bundle", () => {
    const html = readFileSync(join(ROOT, "dist/index.html"), "utf8");
    // The shell's ground layer comes first, brand's order right after it, both ahead of the first
    // stylesheet link.
    const ground = "@layer hw-catalog-ground;";
    expect(html.search(/@layer\b|<link\b[^>]*\brel="?stylesheet/)).toBe(html.indexOf(ground));
    const rest = html.slice(html.indexOf(ground) + ground.length);
    expect(rest.search(/@layer\b|<link\b[^>]*\brel="?stylesheet/)).toBe(rest.indexOf(brandOrder));
  });
});
