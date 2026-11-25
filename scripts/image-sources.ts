import { readFileSync, realpathSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, relative, sep } from "node:path";

/** Each package image as a data URI, read once: an installed package does not change while the
 * process runs, and a viewer inlines the same marks on every request. */
const packageImages = new Map<string, string>();
/** A src naming a file one of our packages exports, its package name captured. */
export const PACKAGE_SRC = /^(@hackersandwizards\/[^/]+)\//;
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

export function imageReference(src: string): ImageReference | undefined {
  const [, name = "", ext = ""] = IMAGE_FILE.exec(src) ?? [];
  if (!name) return undefined;
  try {
    return { file: decodeURIComponent(name), ext, src };
  } catch {
    return undefined;
  }
}

export function packageImage(
  { file, ext, src }: ImageReference,
  pkg: string,
  keepMissing?: boolean,
) {
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

export function localImage(path: string, ext: string, root?: string) {
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
