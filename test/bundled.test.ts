import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "bun:test";

// A consumer's server build (Astro's, for Company OS) bundles these modules into chunks of its own:
// Node strips no types under node_modules, so the package cannot stay external. The engine must
// then find its own files from the chunk, which sits where none of them is.
const REPO = resolve(import.meta.dir, "..");
mkdirSync(join(REPO, "node_modules/.cache"), { recursive: true });
const out = mkdtempSync(join(REPO, "node_modules/.cache/bundled-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

const built = await Bun.build({
  entrypoints: ["render-pdf", "survey-readout", "onepager", "compose"].map((m) =>
    join(REPO, `scripts/${m}.ts`),
  ),
  outdir: out,
  target: "node",
  packages: "external",
});
const load = (m: string) => import(join(out, `${m}.js`));

describe("bundled into a consumer's chunk", () => {
  it("builds", () => expect(built.success).toBe(true));

  it("reads the document base", async () => {
    expect((await load("render-pdf")).documentCss()).toContain("@page");
  });

  it("composes a document", async () => {
    const { composeDocument } = await load("render-pdf");
    const html = await composeDocument(
      "DocMarkdown",
      { title: "T", html: "<h1>Bundled</h1>" },
      REPO,
    );
    expect(html).toContain("<h1>Bundled</h1>");
  });

  it("loads the survey readout, which reads its stylesheet on import", async () => {
    expect((await load("survey-readout")).composeSurveyReadout).toBeFunction();
  });
});
