import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it, spyOn } from "bun:test";

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
      const warn = spyOn(console, "warn");
      try {
        const { documentCss, subsetFaces } = await load("render-pdf");
        await subsetFaces(page(documentCss(), "Ö"));
        expect(warn).not.toHaveBeenCalled();
      } finally {
        globalThis.Worker = Original;
        warn.mockRestore();
      }
      expect(started.length).toBeGreaterThan(1);
      expect(new Set(started)).toEqual(new Set([join(REPO, "scripts/encode-face.ts")]));
      // Missing from an installed package, the Worker fails and the faces encode in-process, slowly.
      expect((await Bun.file(join(REPO, "package.json")).json()).files).toContain(
        "scripts/encode-face.ts",
      );
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
      const { documentCss, subsetFaces } = await load("render-pdf");
      const html = page(documentCss(), "Ä");
      const threaded = await subsetFaces(html);
      globalThis.Worker = Failing;
      const warn = spyOn(console, "warn").mockImplementation(() => {});
      try {
        // A second instance of the module: the first has its Workers.
        const { subsetFaces: inProcess } = await import(
          join(out, `render-pdf.js?${name.replace(/ /g, "-")}`)
        );
        expect(await inProcess(html)).toBe(threaded);
        expect(warn).toHaveBeenCalledTimes(1);
      } finally {
        globalThis.Worker = Thread;
        warn.mockRestore();
      }
    },
  );

  it("answers null for bytes the encoder refuses", async () => {
    const worker = new Worker(join(REPO, "scripts/encode-face.ts"));
    const answer = await new Promise((resolve) => {
      worker.onmessage = ({ data }) => resolve(data);
      worker.postMessage(new Uint8Array([1, 2, 3]));
    });
    await worker.terminate();
    expect(answer).toBeNull();
  });

  it.skipIf(availableParallelism() < 2)(
    "encodes in-process a face a Worker refuses, keeping the Workers",
    async () => {
      const refusing = join(out, "refusing-worker.js");
      writeFileSync(refusing, "self.onmessage = () => postMessage(null);");
      const { documentCss, subsetFaces } = await load("render-pdf");
      const html = page(documentCss(), "Ü");
      const threaded = await subsetFaces(html);
      globalThis.Worker = class extends Thread {
        constructor() {
          super(refusing);
        }
      };
      const warn = spyOn(console, "warn");
      try {
        const { subsetFaces: refused } = await import(join(out, "render-pdf.js?refusing"));
        expect(await refused(html)).toBe(threaded);
        expect(warn).not.toHaveBeenCalled();
      } finally {
        globalThis.Worker = Thread;
        warn.mockRestore();
      }
    },
  );

  it("loads the survey readout, which reads its stylesheet on import", async () => {
    expect((await load("survey-readout")).composeSurveyReadout).toBeFunction();
  });
});
