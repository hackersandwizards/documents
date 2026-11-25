import { expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// A consumer's server build bundles what a component imports. The default import of brand's
// verbal.json carries the whole file, its retired lines included, and the consumer's brand-retired
// fails on them; a named import keeps only the names it takes.
const ROOT = resolve(import.meta.dirname, "..");
const SOURCE = /\.(astro|[cm]?[jt]sx?)$/;
const SPEC = String.raw`["']@hackersandwizards/brand/verbal\.json["']`;
const IMPORT = new RegExp(String.raw`import\s+([^;]*?)\s*from\s*${SPEC}`, "g");
const DYNAMIC = new RegExp(String.raw`import\(\s*${SPEC}`);

// Every file git tracks or would track, so a new file counts before its first commit.
const files = Bun.spawnSync(["git", "ls-files", "-co", "--exclude-standard"], { cwd: ROOT })
  .stdout.toString()
  .split("\n")
  .filter((f) => SOURCE.test(f) && !f.startsWith("."));

/** Each import of verbal.json in the file that takes more than named bindings. */
function wholeImports(source: string): string[] {
  const whole = [...source.matchAll(IMPORT)]
    .filter(([, clause]) => !/^\{[^}]*\}$/.test(clause.trim()))
    .map(([statement]) => statement);
  return DYNAMIC.test(source) ? [...whole, "import(...)"] : whole;
}

// The samples build the path from a variable, so this file's own source holds no such import.
const JSON_PATH = "@hackersandwizards/brand/verbal.json";

test("the scan includes document component sources", () => {
  expect(files.some((f) => f.startsWith("components/DocHeader"))).toBe(true);
});

test.each([
  { kind: "default", source: `import verbal from "${JSON_PATH}";` },
  { kind: "default and named", source: `import v, { name } from '${JSON_PATH}'` },
  { kind: "namespace", source: `import * as v from "${JSON_PATH}"` },
  { kind: "dynamic", source: `const v = await import("${JSON_PATH}")` },
])("the scan reports a $kind import of verbal.json", ({ source }) => {
  expect(wholeImports(source)).toHaveLength(1);
});

test("the scan accepts a named import of verbal.json", () => {
  expect(wholeImports(`import { mission, name } from "${JSON_PATH}";`)).toEqual([]);
});

test("every import of brand's verbal.json names what it takes", () => {
  const found = files.flatMap((f) =>
    wholeImports(readFileSync(join(ROOT, f), "utf8")).map((s) => `${f}: ${s}`),
  );
  expect(found).toEqual([]);
});
