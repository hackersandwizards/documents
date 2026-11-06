import { spawnSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "bun:test";
import { foreignStyles, rawInlineStyles } from "../scripts/styles";

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

  it("control: a style attribute or link fails however it is quoted, spaced or cased", () => {
    for (const html of [
      "<p style='color:red'></p>",
      "<p style=color:red></p>",
      '<p style = "color:red"></p>',
      '<p title=">" style="color:red"></p>',
      '<p style="--share: 1" STYLE="color:red"></p>',
      '<link rel=" stylesheet" href="own.css">',
      '<link rel = "Stylesheet" href="own.css">',
      '<link rel="stylesheet" href="https://any.host/@hackersandwizards/brand/x.css">',
      '<link rel="stylesheet" href="//any.host/@hackersandwizards/brand/x.css">',
      '<link rel="stylesheet" href="../@hackersandwizards/brand/../../own.css">',
    ])
      expect(foreignStyles(html)).toHaveLength(1);
    expect(
      foreignStyles(
        `<link rel="stylesheet" href="${relative(TYPES, fileURLToPath(import.meta.resolve("@hackersandwizards/brand/print.css")))}">`,
      ),
    ).toEqual([]);
    for (const source of [
      "<i style='width: 4%'></i>",
      "<i style=width:4%></i>",
      '<i style = "width: 4%"></i>',
    ])
      expect(rawInlineStyles(source)).toHaveLength(1);
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
