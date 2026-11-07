import { posix, relative } from "node:path";
import { brandFile } from "../scripts/render-pdf";
import { ROOT } from "../scripts/root";

/** A file brand exports, as a path from this repository's root: where the catalog's `copy` puts it
 * in dist/. */
export function brandPath(file: string): string {
  const path = relative(ROOT, brandFile(file));
  // A brand linked from outside the checkout would make copy write outside dist/.
  if (path.startsWith("..")) throw new Error(`brand resolves outside this repository: ${path}`);
  return path;
}

/** The brand stylesheets a type page links (_Type.astro, the onepager's and the readout's
 * composers); the catalog copies each one's folder, its faces and imports included. */
export const LINKED_CSS = [
  "tokens.root.css",
  "print.css",
  "document.css",
  "marker.css",
  "elements.css",
  "elements/kpi.css",
  "elements/rule.css",
  "elements/strip.css",
];

/** A brand file as a type page (dist/types/<type>/index.html) links it: two folders up from the
 * page, computed so no path in this file reads as leaving the repository. */
export const brandHref = (file: string) => posix.relative("types/<type>", brandPath(file));

/** The robots tag every catalog page carries. The catalog preset adds it to the Astro pages; the
 * onepager's and the readout's routes are endpoints it leaves alone, so they add it to their
 * composer's page, which a consumer's document receives without it. */
export const NOINDEX = '<meta name="robots" content="noindex">';
