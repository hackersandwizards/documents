import { dirname, posix, relative } from "node:path";
import { brandFile } from "../scripts/render-pdf";
import { ROOT } from "../scripts/root";

/** A file brand exports, as a path from this repository's root: where the catalog's `copy` puts it
 * in dist/. */
export const brandPath = (file: string) => relative(ROOT, brandFile(file));

/** A brand file as a type page (dist/types/<type>/index.html) links it. */
export const brandHref = (file: string) => posix.relative("types/<type>", brandPath(file));

/** Brand's folder as a type page reaches it, for the composers that link the brand files. */
export const BRAND_HREF = dirname(brandHref("package.json"));
