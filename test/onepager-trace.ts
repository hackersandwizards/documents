// Run by onepager.test.ts as `bun test ./test/onepager-trace.ts` in its own process, so no module
// cache or composer of another test hides a read: the sample onepager composed with every file
// read through node:fs recorded, and its brand files held against onepagerBrandFiles. A fit only
// renders that page again in Chrome, which reads no brand file, since the page inlines them.
import * as fs from "node:fs";
import * as fsp from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, mock, test } from "bun:test";

const read = new Set<string>();
const traced =
  <F extends (...args: never[]) => unknown>(f: F) =>
  (...args: Parameters<F>) => {
    const path: unknown = args[0];
    read.add(path instanceof URL ? fileURLToPath(path) : String(path));
    return f(...args);
  };
const fsTraced = {
  readFileSync: traced(fs.readFileSync),
  readFile: traced(fs.readFile),
  openSync: traced(fs.openSync),
  open: traced(fs.open),
  createReadStream: traced(fs.createReadStream),
};
const promises = { ...fsp, readFile: traced(fsp.readFile), open: traced(fsp.open) };
// Vite reads through the modules' default objects, the engine through their named exports.
void mock.module("node:fs", () => ({
  ...fs,
  ...fsTraced,
  promises,
  default: { ...fs, ...fsTraced, promises },
}));
void mock.module("node:fs/promises", () => ({ ...promises, default: promises }));

test("onepagerBrandFiles lists exactly the brand files a traced render reads", async () => {
  const { openComposer } = await import("../scripts/compose");
  const { composeOnepager, onepagerBrandFiles } = await import("../scripts/onepager");
  const { brandFile } = await import("../scripts/render-pdf");
  const { ROOT } = await import("../scripts/root");
  const { onepager } = await import("../scripts/samples");
  const composer = await openComposer(ROOT);
  try {
    await composeOnepager(composer, onepager);
  } finally {
    await composer.close();
  }
  const brand = `${dirname(brandFile("package.json"))}/`;
  // Resolving a brand file reads brand's package.json; the page carries none of it.
  const traced = [...read]
    .filter((path) => path.startsWith(brand) && path !== `${brand}package.json`)
    .sort();
  // The control: the trace sees Vite's read of DocHeader's lockup and the engine's of a face.
  expect(traced.some((path) => path.endsWith("logos/lockup.svg"))).toBe(true);
  expect(traced.some((path) => path.endsWith(".woff2"))).toBe(true);
  expect(onepagerBrandFiles()).toEqual(traced);
  // Bun's own loader reads an imported module without node:fs: no script imports a brand module.
  // The control: the pattern finds the import Vite reads in DocHeader.
  const imports = /(from|import\()\s*["']@hackersandwizards\/brand/;
  expect(fs.readFileSync(join(ROOT, "components", "DocHeader.astro"), "utf8")).toMatch(imports);
  const scripts = join(ROOT, "scripts");
  for (const file of fs.readdirSync(scripts, { recursive: true, encoding: "utf8" }))
    if (file.endsWith(".ts"))
      expect(fs.readFileSync(join(scripts, file), "utf8")).not.toMatch(imports);
}, 60_000);
