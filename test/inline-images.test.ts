import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, expect, test } from "vitest";
import { imageReference, localImage, packageImage } from "../scripts/image-sources";
import { brandFile } from "../scripts/root";

const root = realpathSync(mkdtempSync(join(tmpdir(), "document-file-tests-")));
const imageDir = join(root, "images");
const svg = "<svg xmlns='http://www.w3.org/2000/svg'/>";
const svgUri = "data:image/svg+xml;base64," + Buffer.from(svg).toString("base64");

beforeAll(() => {
  mkdirSync(imageDir);
  writeFileSync(join(imageDir, "image.svg"), svg);
  writeFileSync(join(imageDir, "pointer.svg"), "version https://git-lfs.github.com/spec/v1\n");
  writeFileSync(join(root, "outside.svg"), svg);
  symlinkSync(join(root, "outside.svg"), join(imageDir, "linked.svg"));
});
afterAll(() => rmSync(root, { recursive: true, force: true }));

test.each([
  [
    "marks/example%20image.SVG?q=1#ref",
    { file: "marks/example image.SVG", ext: "SVG", src: "marks/example%20image.SVG?q=1#ref" },
  ],
  ["bad%ZZ.svg", undefined],
  ["https://example.com/image.svg", undefined],
  ["/image.svg", undefined],
  ["attachment.pdf", undefined],
])("parses a relative image reference from %s", (source, expected) => {
  expect(imageReference(source)).toEqual(expected);
});

test.each([
  ["image.svg", imageDir, svgUri],
  ["pointer.svg", imageDir, undefined],
  ["linked.svg", imageDir, undefined],
  ["linked.svg", undefined, svgUri],
  ["missing.svg", imageDir, undefined],
])("resolves local %s inside root %s", (name, within, expected) => {
  expect(localImage(join(imageDir, name), "svg", within)).toBe(expected);
});

const brand = "@hackersandwizards/brand";
const wordmark = brand + "/logos/wordmark.svg";
const missing = brand + "/logos/no-such-icon.svg";
test.each([
  [
    wordmark,
    false,
    "data:image/svg+xml;base64," + readFileSync(brandFile("logos/wordmark.svg")).toString("base64"),
  ],
  [missing, true, undefined],
])("resolves the package image %s with keepMissing=%s", (src, keepMissing, expected) => {
  expect(packageImage({ file: src, ext: "svg", src }, brand, keepMissing)).toBe(expected);
});

test("fails a missing package export when missing images are disallowed", () => {
  expect(() => packageImage({ file: missing, ext: "svg", src: missing }, brand)).toThrow(
    "exports no image",
  );
});
