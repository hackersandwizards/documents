import { createRequire } from "node:module";
import { dirname, join } from "node:path";

/** This package's folder, found by its name rather than by this module's URL: a consumer's
 * bundler moves the module into a chunk of its own, where `import.meta.url` names the chunk. */
export const ROOT = join(
  dirname(createRequire(import.meta.url).resolve("@hackersandwizards/documents/compose")),
  "..",
);
