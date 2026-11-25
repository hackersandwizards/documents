import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, join, relative, sep } from "node:path";
import { decodeHTMLAttribute } from "entities";

/** How `inlineImages` takes a page: `within`, the folder a file beside the page must resolve into,
 * symlinks followed (a viewer of stored pages passes its root); `keepMissing` leaves a package src
 * its package does not export as it is instead of throwing, so a viewer shows its alt text. */
export type InlineImagesOptions = { within?: string; keepMissing?: boolean };

/** Each package image as a data URI, read once: an installed package does not change while the
 * process runs, and a viewer inlines the same marks on every request. */
const packageImages = new Map<string, string>();
/** A src naming a file one of our packages exports, its package name captured. */
const PACKAGE_SRC = /^(@hackersandwizards\/[^/]+)\//;
/** Resolves a package path from where this package is installed. */
const packageRequire = createRequire(import.meta.url);
/** The MIME type by extension, the images `inlineImages` takes. */
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};
/** A src naming a file: no scheme, no absolute path, a known image type; its query and fragment
 * aside, which a file:// load ignores. */
const IMAGE_FILE = new RegExp(
  `^([^:/#?][^:#?]*?\\.(${Object.keys(IMAGE_TYPES).join("|")}))(?:[?#][^:]*)?$`,
  "i",
);
/** A file Git LFS has not fetched holds this pointer instead of the image. */
const LFS_POINTER = Buffer.from("version https://git-lfs.github.com/spec/v1\n");
/** `bytes` as a data URI, or undefined for a Git LFS pointer. */
const dataUri = (ext: string, bytes: Buffer) =>
  bytes.subarray(0, LFS_POINTER.length).equals(LFS_POINTER)
    ? undefined
    : `data:${IMAGE_TYPES[ext.toLowerCase()]};base64,${bytes.toString("base64")}`;

type ImageReference = { file: string; ext: string; src: string };

function imageReference(src: string): ImageReference | undefined {
  const [, name = "", ext = ""] = IMAGE_FILE.exec(src) ?? [];
  if (!name) return undefined;
  try {
    return { file: decodeURIComponent(name), ext, src };
  } catch {
    return undefined;
  }
}

function packageImage({ file, ext, src }: ImageReference, pkg: string, keepMissing?: boolean) {
  const cached = packageImages.get(file);
  if (cached !== undefined) return cached;
  let uri: string | undefined;
  let cause: unknown;
  try {
    // A `..` segment would leave the package, so the package exports no such file.
    if (!file.split("/").includes(".."))
      uri = dataUri(ext, readFileSync(packageRequire.resolve(file)));
  } catch (error) {
    cause = error;
  }
  if (uri === undefined) {
    if (keepMissing) return undefined;
    throw new Error(
      `inlineImages: ${pkg} exports no image ${src}${cause ? "" : ", only its Git LFS pointer"}`,
      { cause },
    );
  }
  packageImages.set(file, uri);
  return uri;
}

function localImage(path: string, ext: string, root?: string) {
  try {
    if (root !== undefined) {
      const inside = relative(root, realpathSync(path));
      if (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside)) return undefined;
    }
    return dataUri(ext, readFileSync(path));
  } catch {
    return undefined;
  }
}

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
