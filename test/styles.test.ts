import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "bun:test";
import { foreignStyles } from "../scripts/styles";

const ROOT = resolve(import.meta.dir, "..");
// The type pages `bun run build` writes, each a document as the engine prints it.
const TYPES = join(ROOT, "dist/types");
const pages = readdirSync(TYPES).map((t) => join(TYPES, t, "index.html"));
const dir = mkdtempSync(join(tmpdir(), "documents-styles-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

const handBuilt = `<!doctype html><html><head><style data-hw-document></style>
<style>.preparation .card { padding: 3mm 4mm; }</style></head>
<body><div style="page-break-before: always"></div></body></html>`;

describe("foreignStyles", () => {
  for (const page of pages)
    it(`passes the engine's ${page.slice(TYPES.length + 1)}`, () => {
      expect(foreignStyles(readFileSync(page, "utf8"))).toEqual([]);
    });

  it("control: a hand-built document fails on its style element and its style attribute", () => {
    expect(foreignStyles(handBuilt)).toEqual([
      "a style element the engine did not write: <style>",
      'a style attribute setting page-break-before: "page-break-before: always"',
    ]);
    expect(foreignStyles('<link rel="stylesheet" href="own.css">')).toHaveLength(1);
    expect(foreignStyles('<b style="--share: 40%"></b>')).toEqual([]);
  });
});

describe("documents-styles", () => {
  const run = (...args: string[]) =>
    spawnSync("bun", [join(ROOT, "scripts/styles.ts"), ...args], { encoding: "utf8" });

  it("exits 0 on the type pages", () => {
    const result = run(...pages);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });

  it("exits 1 naming a hand-built document found in a directory", () => {
    writeFileSync(join(dir, "hand.html"), handBuilt);
    const result = run(dir);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain(join(dir, "hand.html"));
    expect(result.stderr).toContain("outside the document engine");
  });
});
