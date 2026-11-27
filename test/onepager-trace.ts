// Run in a separate Vitest process so cached modules or a reused composer cannot hide brand files read during composition.
// A fit only renders that page again in Chrome, which reads no brand file, since the page inlines them.
import fs, * as fsExports from "node:fs";
import fsp, * as fspExports from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defined } from "@hackersandwizards/scaffolding/defined";
import { expect, test, vi } from "vitest";

const read = new Set<string>();
const traced =
  <Args extends unknown[], Result>(f: (...args: Args) => Result) =>
  (...args: Args) => {
    const path: unknown = args[0];
    read.add(path instanceof URL ? fileURLToPath(path) : String(path));
    return f(...args);
  };
const traceTimeout = (60_000 * Number(process.env.SCAFFOLDING_TEST_TIMEOUT_MS || 5000)) / 5000;

const transpiler = new Bun.Transpiler({ loader: "ts" });
const importsBrand = (source: string) =>
  transpiler
    .scanImports(source.replace(/^#![^\n]*/, ""))
    .some(
      ({ path }) =>
        path === "@hackersandwizards/brand" || path.startsWith("@hackersandwizards/brand/"),
    );

test.each([
  'import "@hackersandwizards/brand/imprint.json";',
  'const imprint = import ("@hackersandwizards/brand/imprint.json");',
])("recognizes the brand import %s", (source) => {
  expect(importsBrand(source)).toBe(true);
});

// Bun's own loader reads an imported module without going through node:fs.
test("engine scripts load no brand modules outside the file trace", () => {
  const root = resolve(import.meta.dirname, "..");
  // The control finds the brand import Vite reads in DocHeader.
  const frontmatter = fs
    .readFileSync(join(root, "components", "DocHeader.astro"), "utf8")
    .split(/^---$/m)[1];
  expect(importsBrand(defined(frontmatter, "DocHeader frontmatter"))).toBe(true);
  const scripts = join(root, "scripts");
  const scriptFiles = fs
    .readdirSync(scripts, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"));
  expect(scriptFiles, "TypeScript files in scripts/").not.toHaveLength(0);
  expect(
    scriptFiles.filter((file) => importsBrand(fs.readFileSync(join(scripts, file), "utf8"))),
  ).toEqual([]);
});

test(
  "onepagerBrandFiles lists exactly the brand files a traced render reads",
  async () => {
    // External Vite reads through the real default objects, and Vitest loads the engine's
    // named imports through its module runner.
    const readFileSync = vi
      .spyOn(fs, "readFileSync")
      .mockImplementation(traced(fsExports.readFileSync));
    const readFile = vi.spyOn(fs, "readFile").mockImplementation(traced(fsExports.readFile));
    const openSync = vi.spyOn(fs, "openSync").mockImplementation(traced(fsExports.openSync));
    const open = vi.spyOn(fs, "open").mockImplementation(traced(fsExports.open));
    const createReadStream = vi
      .spyOn(fs, "createReadStream")
      .mockImplementation(traced(fsExports.createReadStream));
    const readFilePromise = vi
      .spyOn(fsp, "readFile")
      .mockImplementation(traced(fspExports.readFile));
    const openPromise = vi.spyOn(fsp, "open").mockImplementation(traced(fspExports.open));
    vi.doMock("node:fs", () => ({
      ...fsExports,
      readFileSync,
      readFile,
      openSync,
      open,
      createReadStream,
    }));
    vi.doMock("node:fs/promises", () => ({
      ...fspExports,
      readFile: readFilePromise,
      open: openPromise,
    }));
    // The samples read brand's imprint at load: imported first and the trace cleared, only the
    // render's own reads count.
    const { onepager } = await import("../scripts/samples");
    read.clear();
    const { openComposer } = await import("../scripts/compose");
    const { composeOnepager, onepagerBrandFiles } = await import("../scripts/onepager");
    const { brandFile } = await import("../scripts/render-pdf");
    const { ROOT } = await import("../scripts/root");
    const composer = await openComposer(ROOT);
    try {
      await composeOnepager(composer, onepager);
    } finally {
      await composer.close();
    }
    const brand = `${dirname(brandFile("package.json"))}/`;
    // Resolving a brand file reads brand's package.json, and vitefu's dependency crawl the
    // package.json of each dependency Bun nests under brand; the page carries none of them.
    const tracedFiles = [...read]
      .filter((path) => path.startsWith(brand))
      .filter(
        (path) =>
          !/^(?:node_modules\/(@[^/]+\/)?[^/]+\/)?package\.json$/.test(path.slice(brand.length)),
      )
      .sort();
    expect(tracedFiles.some((path) => path.endsWith("logos/lockup-screen.svg"))).toBe(true);
    expect(tracedFiles.some((path) => path.endsWith(".woff2"))).toBe(true);
    expect(onepagerBrandFiles()).toEqual(tracedFiles);
  },
  traceTimeout,
);
