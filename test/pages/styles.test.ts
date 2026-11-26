import { defined } from "@hackersandwizards/scaffolding/defined";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { TYPES as LISTED } from "../../catalog/types";
import { ROOT } from "../../scripts/root";
import { foreignStyles } from "../../scripts/styles";

const TYPES = join(ROOT, "dist/types");
// The listed pages only: a former address in dist/types/ is a redirect.
const pages = LISTED.map((t) => join(TYPES, t.file, "index.html"));

describe("foreignStyles", () => {
  for (const page of pages)
    it(`passes the engine's ${page.slice(TYPES.length + 1)}`, () => {
      expect(foreignStyles(readFileSync(page, "utf8"))).toEqual([]);
    });
});

// The catalog copies the brand files of LINKED_CSS (catalog/brand.ts) beside the type pages, while
// _Type.astro, the onepager's and the readout's composers each write their own links: a file one
// of them links that the copy leaves out loads nothing from disk or on Pages.
describe("type page links", () => {
  for (const page of pages)
    it(`${page.slice(TYPES.length + 1)} links only files in dist/`, () => {
      const hrefs = [...readFileSync(page, "utf8").matchAll(/<link\b[^>]*\bhref="([^"]+)"/g)]
        .map((m) => defined(m[1], "style tag attributes"))
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
});
