import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { composePage, openComposer } from "../scripts/compose";
import { chromeBinary, documentCss, renderPdf } from "../scripts/render-pdf";
import { handout } from "../scripts/samples";

// The running header holds the document's title on one line. The longest title on record is the
// trainer hub's AE-DEV-TTT product (73 characters, 2026-11-01). Measured in Chrome on 2026-11-01:
// that title takes 361 pt; Chrome lets the right box grow into the room the brand name leaves, and
// the header wraps once a title needs more than about 417 pt (83 characters of the same mix).
const longest = "Agentic Engineering for Developers and QA, Train-the-Trainer (AE-DEV-TTT)";
// The control: past the measured limit, so the check below must see two lines.
const tooLong = `${longest}, Extended Edition`;

const ROOT = resolve(import.meta.dir, "..");
const rules = readFileSync(join(ROOT, "handout.css"), "utf8").replace(/^@import [^;]+;\n/gm, "");
let composer: Awaited<ReturnType<typeof openComposer>>;
let dir: string;
beforeAll(async () => {
  composer = await openComposer(ROOT);
  dir = mkdtempSync(join(tmpdir(), "running-heads-"));
});
afterAll(async () => {
  await composer?.close();
  rmSync(dir, { recursive: true, force: true });
});

/** The distinct baselines of the text in page 2's top margin. */
async function headerLines(title: string): Promise<number> {
  const html = await composePage(composer, "DocHandout", { ...handout, title }, (page) =>
    page.replace(
      "<style data-hw-document></style>",
      () => `<style>${documentCss()}\n${rules}</style>`,
    ),
  );
  writeFileSync(join(dir, "handout.html"), html);
  await renderPdf(join(dir, "handout.html"), join(dir, "handout.pdf"));
  const bbox = execFileSync(
    "pdftotext",
    ["-f", "2", "-l", "2", "-bbox", join(dir, "handout.pdf"), "-"],
    {
      encoding: "utf8",
    },
  );
  const tops = [...bbox.matchAll(/<word xMin="[\d.]+" yMin="([\d.]+)"/g)].map((m) => Number(m[1]));
  // The top margin is 18 mm (51 pt); the chapter eyebrow below it starts at 50.8 pt. A wrapped
  // title prints its two lines either side of the brand name, three baselines in all.
  return new Set(tops.filter((y) => y < 45).map((y) => y.toFixed(1))).size;
}

test.skipIf(!chromeBinary())(
  "the longest product title stays on one line in the handout's header",
  async () => {
    expect(await headerLines(longest)).toBe(1);
    expect(await headerLines(tooLong)).toBeGreaterThan(1);
  },
  120_000,
);
