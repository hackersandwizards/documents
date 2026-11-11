import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** This package's folder, found by its name rather than by this module's URL: a consumer's
 * bundler moves the module into a chunk of its own, where `import.meta.url` names the chunk. */
export const ROOT = join(
  dirname(createRequire(import.meta.url).resolve("@hackersandwizards/documents/compose")),
  "..",
);

/** CSS without comments, its strings untouched. The space after one goes only where a space,
 * brace or semicolon comes before it: elsewhere it may part two selectors. */
export const stripComments = (css: string) =>
  css.replace(
    /("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')|(^|[\s{};])\/\*[\s\S]*?\*\/\s*|\/\*[\s\S]*?\*\//g,
    (_, string?: string, before?: string) => string ?? before ?? "",
  );

/** One of the engine's stylesheets without its `@import` lines, whose brand files a page inlines or
 * links on its own. */
export const withoutImports = (css: string) => css.replace(/^@import [^;]+;\n/gm, "");

/** A file the brand package exports, such as `tokens.css`, as an absolute path. */
export const brandFile = (file: string) =>
  createRequire(import.meta.url).resolve(`@hackersandwizards/brand/${file}`);

// brand's JSON files are read through node:fs rather than imported: Bun's loader reads an import
// past node:fs, where onepager-trace.ts cannot see it. A field brand drops or renames fails here
// rather than printing "undefined".
const brandJson = (file: string) => JSON.parse(readFileSync(brandFile(file), "utf8"));
function checked<K extends string>(facts: Record<K, unknown>): Record<K, string> {
  for (const [field, value] of Object.entries(facts))
    if (typeof value !== "string") throw new Error(`brand's company facts hold no ${field}`);
  return facts as Record<K, string>;
}

/** The company's name and legal name, from brand's `verbal.json`. */
export function brandName(): Record<"name" | "legal", string> {
  const { company, legal } = brandJson("verbal.json").name ?? {};
  return checked({ name: company, legal });
}

/** brandName and the office address, from brand's `imprint.json`. */
export function brandCompany(): Record<"name" | "legal" | "street" | "postcode" | "city", string> {
  const { street, postcode, city } = brandJson("imprint.json");
  return { ...checked({ street, postcode, city }), ...brandName() };
}
