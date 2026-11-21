import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { compactStyles } from "../scripts/compact-styles";
import { composePage, openComposer } from "../scripts/compose";
import { composeOnepager } from "../scripts/onepager";
import { editStyles } from "../scripts/prune";
import { ROOT } from "../scripts/root";
import { onepager, surveyReadout } from "../scripts/samples";
import { composeSurveyReadout } from "../scripts/survey-readout";

import { brandOrder, LAYER } from "./layer-order";

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
      expect(brandOrder.endsWith(";")).toBe(true);
      expect(found[0]).toBe(brandOrder);
      expect(found.filter((l) => l.endsWith(";"))).toEqual([brandOrder]);
    });
});

it("a top-level layer does not place a same-named layer inside another layer", () => {
  const css =
    "@layer first;@layer outer{@layer first;@layer next{p{color:red}}@layer first{p{color:blue}}}";
  const html = `<style>${css}</style><p>x</p>`;
  expect(compactStyles(html)).toBe(html);
});

it("a layer name inside a string does not place that layer", () => {
  const css =
    'p{content:"@layer first;"}@layer first;@layer next{p{color:red}}@layer first{p{color:blue}}';
  const html = `<style>${css}</style><p>x</p>`;
  expect(compactStyles(html)).toBe(html);
});

it("a conditional style sheet does not place a layer in an unconditional sheet", () => {
  const html =
    '<style media="print">@layer first;</style><style>@layer first;@layer next{p{color:red}}@layer first{p{color:blue}}</style><p>x</p>';
  expect(compactStyles(html)).toBe(html);
});
