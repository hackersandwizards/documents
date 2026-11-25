import { realpathSync } from "node:fs";
import { join } from "node:path";
import { decodeHTMLAttribute } from "entities";
import { imageReference, localImage, packageImage, PACKAGE_SRC } from "./image-sources";

/** How `inlineImages` takes a page: `within`, the folder a file beside the page must resolve into,
 * symlinks followed (a viewer of stored pages passes its root); `keepMissing` leaves a package src
 * its package does not export as it is instead of throwing, so a viewer shows its alt text. */
export type InlineImagesOptions = { within?: string; keepMissing?: boolean };

/** `html` with each `<img>` whose src is an image file beside it, or a file one of our packages
 * exports (`@hackersandwizards/testimonials/marks/...`, which the stored page names instead of
 * carrying), resolved from where this package is installed, as a data URI. The print and a consumer's
 * viewer of stored pages both call it: a file:// image taints the canvas PRINT_JS redraws it on, so
 * it printed at its source size, an SVG file's rasters are redrawn only from a data URI, and a
 * sandboxed iframe resolves neither path. A package src its package does not export, or exports as
 * a Git LFS pointer, throws, so a print fails rather than print without the image. A file beside
 * the page that cannot be read (missing, a folder, no permission) or is a Git LFS pointer stays as
 * it is, so the page shows its alt text. It parses with Bun's HTMLRewriter, so it runs under Bun
 * only: under Node it throws `HTMLRewriter is not defined`. */
export function inlineImages(html: string, dir: string, options: InlineImagesOptions = {}): string {
  const root = options.within === undefined ? undefined : realpathSync(options.within);
  // Read as the browser parses the page: any quoting or spacing, a `>` inside an attribute, a
  // tag only inside a comment or as text left alone.
  let failure: unknown;
  const out = new HTMLRewriter()
    .on("img[src]", {
      element(el) {
        if (failure !== undefined) return;
        try {
          const image = imageReference(decodeHTMLAttribute(el.getAttribute("src")!.trim()));
          if (!image) return;
          const pkg = PACKAGE_SRC.exec(image.file)?.[1];
          const uri =
            pkg === undefined
              ? localImage(join(dir, image.file), image.ext, root)
              : packageImage(image, pkg, options.keepMissing);
          if (uri !== undefined) el.setAttribute("src", uri);
        } catch (error) {
          failure = error;
        }
      },
    })
    .transform(html);
  if (failure !== undefined) throw failure;
  return out;
}
