import { posix, relative } from "node:path";
import { brandFile, inlineCss } from "../scripts/render-pdf";
import { ROOT } from "../scripts/root";

/** A file brand exports, as a path from this repository's root: where the catalog's `copy` puts it
 * in dist/. */
export const brandPath = (file: string) => fromRoot(brandFile(file));

function fromRoot(absolute: string): string {
  const path = relative(ROOT, absolute);
  // A brand linked from outside the checkout would make copy write outside dist/.
  if (path.startsWith("..")) throw new Error(`brand resolves outside this repository: ${path}`);
  return path;
}

/** The brand stylesheets a type page links (_Type.astro, the onepager's and the readout's
 * composers). */
const LINKED_CSS = [
  "layers.css",
  "tokens.root.css",
  "print.css",
  "document.flat.css",
  "marker.css",
  "elements.flat.css",
  "elements/kpi.css",
  "elements/rule.css",
  "elements/strip.css",
];

/** A brand file as a type page (dist/types/<type>/index.html) links it: two folders up from the
 * page, computed so no path in this file reads as leaving the repository. */
export const brandHref = (file: string) => posix.relative("types/<type>", brandPath(file));

/** Every brand file the linked stylesheets read, imports from any folder and faces included, as
 * paths from this repository's root: what the catalog copies beside the type pages. */
export function linkedFiles(): string[] {
  const read = new Set<string>();
  for (const file of LINKED_CSS) inlineCss(brandFile(file), read);
  return [...read].map(fromRoot);
}
