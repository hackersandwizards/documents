// Run by onepager.test.ts in its own Vitest process, so no module
// cache or composer of another test hides a read: the sample onepager composed with every file
// read through node:fs recorded, and its brand files held against onepagerBrandFiles. A fit only
// renders that page again in Chrome, which reads no brand file, since the page inlines them.
import fs, * as fsExports from "node:fs";
import fsp, * as fspExports from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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

test("engine scripts load no brand modules outside the file trace", () => {
  const root = resolve(import.meta.dirname, "..");
  const imports = /(from|import\()\s*["']@hackersandwizards\/brand/;
  expect(fs.readFileSync(join(root, "components", "DocHeader.astro"), "utf8")).toMatch(imports);
  const scripts = join(root, "scripts");
  const scriptFiles = fs
    .readdirSync(scripts, { recursive: true, encoding: "utf8" })
    .filter((file) => file.endsWith(".ts"));
  expect(scriptFiles, "TypeScript files in scripts/").not.toHaveLength(0);
  expect(
    scriptFiles.filter((file) => imports.test(fs.readFileSync(join(scripts, file), "utf8"))),
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
    // The control: the trace sees Vite's read of DocHeader's lockup and the engine's of a face.
    expect(tracedFiles.some((path) => path.endsWith("logos/lockup-screen.svg"))).toBe(true);
    expect(tracedFiles.some((path) => path.endsWith(".woff2"))).toBe(true);
    expect(onepagerBrandFiles()).toEqual(tracedFiles);
  },
  traceTimeout,
);
