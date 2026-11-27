import { readFileSync, realpathSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { isAbsolute, relative, sep } from "node:path";

/** Each package image as a data URI, read once: an installed package does not change while the
 * process runs, and a viewer inlines the same marks on every request. */
const packageImages = new Map<string, string>();
/** A src naming a file one of our packages exports, its package name captured. */
export const PACKAGE_SRC = /^(@hackersandwizards\/[^/]+)\//;
/** Resolves a package path from where this package is installed. */
const packageRequire = createRequire(import.meta.url);
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
  } catch (error) {
    if (error instanceof URIError) return undefined;
    throw error;
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

const UNREADABLE_IMAGE = new Set<unknown>([
  // The file can disappear between the stat check and the read.
  "ENOENT",
  "EACCES",
  "EPERM",
  "ELOOP",
  "ENAMETOOLONG",
]);

function statImage(path: string) {
  try {
    return statSync(path, { throwIfNoEntry: false });
  } catch (error) {
    // statSync reports a file in the middle of the path separately from a missing entry.
    if (error instanceof Error && "code" in error && error.code === "ENOTDIR") return undefined;
    throw error;
  }
}

function resolvesInside(path: string, root: string): boolean {
  const inside = relative(root, realpathSync(path));
  return inside !== ".." && !inside.startsWith(`..${sep}`) && !isAbsolute(inside);
}

export function localImage(path: string, ext: string, root?: string) {
  if (path.includes("\0")) return undefined;
  let bytes: Buffer;
  try {
    const stat = statImage(path);
    if (stat === undefined || stat.isDirectory()) return undefined;
    if (root !== undefined && !resolvesInside(path, root)) return undefined;
    bytes = readFileSync(path);
  } catch (error) {
    if (error instanceof Error && "code" in error && UNREADABLE_IMAGE.has(error.code))
      return undefined;
    throw error;
  }
  return dataUri(ext, bytes);
}
