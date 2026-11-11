import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** This package's folder, found by its name rather than by this module's URL: a consumer's
 * bundler moves the module into a chunk of its own, where `import.meta.url` names the chunk. */
export const ROOT = join(
  dirname(createRequire(import.meta.url).resolve("@hackersandwizards/documents/compose")),
  "..",
);

/** A file the brand package exports, such as `tokens.css`, as an absolute path. */
export const brandFile = (file: string) =>
  createRequire(import.meta.url).resolve(`@hackersandwizards/brand/${file}`);

/** The company's name and legal name from brand's `verbal.json` and its office address from `imprint.json`,
 * read through node:fs rather than imported: Bun's loader reads an import past node:fs, where
 * onepager-trace.ts cannot see it. A field brand drops or renames fails here rather than printing
 * "undefined". */
export function brandCompany(): Record<"name" | "legal" | "street" | "postcode" | "city", string> {
  const read = (file: string) => JSON.parse(readFileSync(brandFile(file), "utf8"));
  const { company: name, legal } = read("verbal.json").name ?? {};
  const company = { name, legal, ...read("imprint.json") };
  for (const field of ["name", "legal", "street", "postcode", "city"])
    if (typeof company[field] !== "string")
      throw new Error(`brand's company facts hold no ${field}`);
  return company;
}
