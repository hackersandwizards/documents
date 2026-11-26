import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, assert, describe, expect, it, vi } from "vitest";
import { rejection } from "@hackersandwizards/scaffolding/rejection";
import manifest from "../../package.json";
import type * as composer from "../../scripts/compose-document";
import type * as css from "../../scripts/document-css";
import type * as fonts from "../../scripts/font-faces";
import { isRecord } from "../../scripts/root";

// A consumer's server build (Astro's, for Company OS) bundles these modules into chunks of its own:
// Node strips no types under node_modules, so the package cannot stay external. The engine must
// then find its own files from the chunk, which sits where none of them is.
const REPO = resolve(import.meta.dirname, "../..");
mkdirSync(join(REPO, "node_modules/.cache"), { recursive: true });
const out = mkdtempSync(join(REPO, "node_modules/.cache/bundled-"));
afterAll(() => rmSync(out, { recursive: true, force: true }));

const exportTypes = {
  "./compose": { openComposer: "function", composePage: "function" },
  "./render-pdf": { renderPdf: "function" },
  "./compose-document": { composeDocument: "function", composeWarmDocument: "function" },
  "./document-css": { bakeDocumentCss: "function" },
  "./font-faces": { subsetFaces: "function" },
  "./assert-brand-fonts": { assertBrandFonts: "function" },
  "./inline-images": { inlineImages: "function" },
  "./render-handout-pdf": { renderHandoutPdf: "function" },
  "./onepager": { composeOnepager: "function", fitOnepager: "function" },
  "./handout": { HANDOUT_TEXT: "object" },
  "./survey-readout": { composeSurveyReadout: "function", bandColor: "function" },
};
const moduleExports = Object.entries(manifest.exports).filter(([, path]) => path.endsWith(".ts"));

const built = await Bun.build({
  entrypoints: moduleExports.map(([, path]) => join(REPO, path)),
  outdir: out,
  naming: "[name].[ext]",
  target: "node",
  packages: "external",
});
async function loadBundle(file: string): Promise<Record<string, unknown>> {
  const module: unknown = await import(join(out, file));
  if (!isRecord(module)) throw new Error(`Expected a bundled module: ${file}`);
  return module;
}

type RenderBundle = Pick<typeof composer, "composeDocument"> &
  Pick<typeof css, "documentCss"> &
  Pick<typeof fonts, "subsetFaces">;

function isRenderBundle(module: Record<string, unknown>): module is RenderBundle {
  return (
    typeof module.composeDocument === "function" &&
    typeof module.documentCss === "function" &&
    typeof module.subsetFaces === "function"
  );
}

async function loadRenderBundle(query = ""): Promise<RenderBundle> {
  const module = {
    ...(await loadBundle("compose-document.js")),
    ...(await loadBundle("document-css.js")),
    ...(await loadBundle(`font-faces.js${query}`)),
  };
  if (!isRenderBundle(module))
    throw new Error("Expected composition, CSS and font exports in the bundles");
  return module;
}

describe("bundled into a consumer's chunk", () => {
  it("builds", () => expect(built.success).toBe(true));

  it("lists the exported API of every bundled entry point", () => {
    expect(Object.keys(exportTypes).sort()).toEqual(moduleExports.map(([key]) => key).sort());
  });

  it.each(Object.entries(exportTypes))("loads %s and exposes its API", async (key, expected) => {
    const module = await loadBundle(`${key.slice(2)}.js`);
    const types = Object.keys(expected).map((name) => [name, typeof module[name]]);
    expect(Object.fromEntries(types)).toEqual(expected);
  });

  it("reads the document base", async () => {
    expect((await loadRenderBundle()).documentCss()).toContain("@page");
  });

  it("composes a document", async () => {
    const { composeDocument } = await loadRenderBundle();
    const html = await composeDocument(
      "DocMarkdown",
      { title: "T", html: "<h1>Bundled</h1>" },
      REPO,
    );
    expect(html).toContain("<h1>Bundled</h1>");
  });

  const page = (css: string, text: string) =>
    `<html><head><style>${css}</style></head><body>${text}</body></html>`;

  it.skipIf(availableParallelism() < 2)(
    "encodes the cut faces on Workers started from the package's file, not the chunk",
    async () => {
      const Original = globalThis.Worker;
      const started: string[] = [];
      globalThis.Worker = class extends Original {
        constructor(url: string | URL, options?: WorkerOptions) {
          super(url, options);
          started.push(String(url));
        }
      };
      const warn = vi.spyOn(console, "warn");
      try {
        const { documentCss, subsetFaces } = await loadRenderBundle();
        await subsetFaces(page(documentCss(), "Ö"));
        expect(warn).not.toHaveBeenCalled();
      } finally {
        globalThis.Worker = Original;
        warn.mockRestore();
      }
      expect(started.length).toBeGreaterThan(1);
      expect(new Set(started)).toEqual(new Set([join(REPO, "scripts/encode-face.ts")]));
      // Missing from an installed package, the Worker fails and the faces encode in-process, slowly.
      expect(manifest.files).toContain("scripts/encode-face.ts");
    },
  );

  const exiting = join(out, "exiting-worker.js");
  writeFileSync(exiting, "self.onmessage = () => process.exit(1);");
  const Thread = globalThis.Worker;
  const failures: [string, typeof Worker][] = [
    [
      "cannot start",
      class extends Thread {
        constructor() {
          super(join(out, "no-such-worker.js"));
        }
      },
    ],
    [
      "exits during a job",
      class extends Thread {
        constructor() {
          super(exiting);
        }
      },
    ],
    [
      "throws on construction",
      class extends Thread {
        constructor() {
          super(exiting);
          throw new Error("no threads left");
        }
      },
    ],
  ];

  it.skipIf(availableParallelism() < 2).each(failures)(
    "writes the same page in-process where a Worker %s",
    async (name, Failing) => {
      const { documentCss, subsetFaces } = await loadRenderBundle();
      const html = page(documentCss(), "Ä");
      const threaded = await subsetFaces(html);
      globalThis.Worker = Failing;
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        // A second instance of the module: the first has its Workers.
        const { subsetFaces: inProcess } = await loadRenderBundle(`?${name.replace(/ /g, "-")}`);
        expect(await inProcess(html)).toBe(threaded);
        expect(warn).toHaveBeenCalledTimes(1);
      } finally {
        globalThis.Worker = Thread;
        warn.mockRestore();
      }
    },
  );

  it.skipIf(availableParallelism() < 2)(
    "encodes in-process a face a Worker refuses, keeping the Workers",
    async () => {
      const refusing = join(out, "refusing-worker.js");
      writeFileSync(refusing, "self.onmessage = () => postMessage(null);");
      const { documentCss, subsetFaces } = await loadRenderBundle();
      const html = page(documentCss(), "Ü");
      const threaded = await subsetFaces(html);
      globalThis.Worker = class extends Thread {
        constructor() {
          super(refusing);
        }
      };
      const warn = vi.spyOn(console, "warn");
      try {
        const { subsetFaces: refused } = await loadRenderBundle("?refusing");
        expect(await refused(html)).toBe(threaded);
        expect(warn).not.toHaveBeenCalled();
      } finally {
        globalThis.Worker = Thread;
        warn.mockRestore();
      }
    },
  );

  it.skipIf(availableParallelism() < 2)(
    "rejects a font job with an unexpected error sent from a Worker",
    async () => {
      const failed = join(out, "failed-worker.js");
      writeFileSync(
        failed,
        'self.onmessage = () => postMessage({ error: new TypeError("Worker encoder failed") });',
      );
      globalThis.Worker = class extends Thread {
        constructor() {
          super(failed);
        }
      };
      try {
        const { documentCss, subsetFaces } = await loadRenderBundle("?failed");
        expect(await rejection(subsetFaces(page(documentCss(), "A")))).toContain(
          "Worker encoder failed",
        );
      } finally {
        globalThis.Worker = Thread;
      }
    },
  );

  it("loads the survey readout, which reads its stylesheet on import", async () => {
    expect((await loadBundle("survey-readout.js")).composeSurveyReadout).toBeTypeOf("function");
  });

  it("loads the handout's words, which read the company's name from brand on import", async () => {
    const { HANDOUT_TEXT } = await loadBundle("handout.js");
    assert(isRecord(HANDOUT_TEXT), "Expected handout text in the bundle");
    assert(isRecord(HANDOUT_TEXT.de), "Expected German handout text in the bundle");
    expect(HANDOUT_TEXT.de.runningBrand).toBe("hackers&wizards");
  });
});
