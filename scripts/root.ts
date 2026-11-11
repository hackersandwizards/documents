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

/** The office address in brand's `imprint.json`, read through node:fs rather than imported: Bun's
 * loader reads an import past node:fs, where onepager-trace.ts cannot see it. A field brand drops
 * or renames fails here rather than printing "undefined". */
export function brandImprint(): { street: string; postcode: string; city: string } {
  const imprint = JSON.parse(readFileSync(brandFile("imprint.json"), "utf8"));
  for (const field of ["street", "postcode", "city"])
    if (typeof imprint[field] !== "string")
      throw new Error(`brand's imprint.json holds no ${field}`);
  return imprint;
}
