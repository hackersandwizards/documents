import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { afterAll, describe, expect, it } from "bun:test";
import { TYPES as LISTED } from "../catalog/types";
import { foreignStyles, rawInlineStyles } from "../scripts/styles";

const ROOT = resolve(import.meta.dir, "..");
// The type pages `bun run build` writes, each a document as the engine prints it.
const TYPES = join(ROOT, "dist/types");
// The listed pages only: a former address in dist/types/ is a redirect.
const pages = LISTED.map((t) => join(TYPES, t.file, "index.html"));
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
      // The browser trims the address and decodes %2e as a dot; a numeric reference without its
      // semicolon still ends the custom property.
      '<link rel="stylesheet" href=" https://any.host/@hackersandwizards/brand/x.css">',
      '<link rel="stylesheet" href="../@hackersandwizards/brand/%2e%2e/%2e%2e/own.css">',
      '<p style="--band:x&#59color:red"></p>',
    ])
      expect(foreignStyles(html)).toHaveLength(1);
    expect(
      foreignStyles(
        `<link rel="stylesheet" href="${relative(TYPES, Bun.resolveSync("@hackersandwizards/brand/print.css", ROOT))}">`,
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

// The catalog copies the brand files of LINKED_CSS (catalog/brand.ts) beside the type pages, while
// _Type.astro, the onepager's and the readout's composers each write their own links: a file one
// of them links that the copy leaves out loads nothing from disk or on Pages.
describe("type page links", () => {
  for (const page of pages)
    it(`${page.slice(TYPES.length + 1)} links only files in dist/`, () => {
      const hrefs = [...readFileSync(page, "utf8").matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)]
        .map((m) => m[1]!)
        .filter((href) => !/^[a-z]+:|^\//.test(href));
      expect(hrefs.length).toBeGreaterThan(0);
      expect(hrefs.filter((href) => !existsSync(resolve(page, "..", href)))).toEqual([]);
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

  it("exits 1 on a folder holding no document", () => {
    const empty = mkdtempSync(join(dir, "empty-"));
    const result = run(empty);
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("no .html file");
  });
});
