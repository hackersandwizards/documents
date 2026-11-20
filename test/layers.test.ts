import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
