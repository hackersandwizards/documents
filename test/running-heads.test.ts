import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { composePage, openComposer } from "../scripts/compose";
import { chromeBinary, documentCss, renderPdf } from "../scripts/render-pdf";
import { handout, proposalDe, rateCard } from "../scripts/samples";

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

/** A component's props rendered to a PDF in the test folder, the handout on its own stylesheet. */
async function render(
  component: string,
  props: Record<string, unknown>,
  edit = (html: string) => html,
) {
  const html = await composePage(composer, component, props, (page) =>
    page.replace(
      "<style data-hw-document></style>",
      () => `<style>${documentCss()}\n${component === "DocHandout" ? rules : ""}</style>`,
    ),
  );
  writeFileSync(join(dir, "doc.html"), edit(html));
  await renderPdf(join(dir, "doc.html"), join(dir, "doc.pdf"));
  return join(dir, "doc.pdf");
}

/** The distinct baselines of the text in a page's top margin, one list per page. */
function headerLinesPerPage(pdf: string): number[] {
  const bbox = execFileSync("pdftotext", ["-bbox", pdf, "-"], { encoding: "utf8" });
  return bbox
    .split("<page ")
    .slice(1)
    .map((page) => {
      const tops = [...page.matchAll(/<word xMin="[\d.]+" yMin="(-?[\d.]+)"/g)].map((m) =>
        Number(m[1]),
      );
      // The running head sits at 25.6 pt, or clipped at 1.3 pt on a page 1 with no top margin;
      // page 1's document tag starts at 35.8 pt, a handout chapter's eyebrow at 50.8 pt. A wrapped
      // title prints its two lines either side of the brand name, three baselines in all. A
      // handout's cover holds its document tag at 25.6 pt.
      return new Set(tops.filter((y) => y < 30).map((y) => y.toFixed(1))).size;
    });
}

// A chapter over three pages and a short one: the chapter's opening page ends mid-chapter.
const long = { ...handout.chapters[0]!, html: handout.chapters[0]!.html.repeat(6) };
const longHandout = { ...handout, chapters: [long, handout.chapters[1]!], toc: [] };

/** The header lines on the long chapter's second page, the first that carries a running head. */
async function headerLines(title: string): Promise<number> {
  return headerLinesPerPage(await render("DocHandout", { ...longHandout, title }))[2]!;
}

test.skipIf(!chromeBinary())(
  "the longest product title stays on one line in the handout's header",
  async () => {
    expect(await headerLines(longest)).toBe(1);
    expect(await headerLines(tooLong)).toBeGreaterThan(1);
  },
  120_000,
);

// Page 1 carries the document header, so its running head would print clipped at the paper's top
// edge: invisible, but in the PDF's text, for copy, search and screen readers (measured 01.11.2026).
test.skipIf(!chromeBinary())(
  "page 1 of a proposal and a rate card carries no running head, page 2 does",
  async () => {
    expect(headerLinesPerPage(await render("DocProposal", proposalDe)).slice(0, 2)).toEqual([0, 1]);
    expect(headerLinesPerPage(await render("DocRateCard", rateCard))[0]).toBe(0);
  },
  120_000,
);

// A chapter's opening page shows its title and no running head; its later pages show the head, and
// naming the opening page moves no break, where the change of page name forces one.
test.skipIf(!chromeBinary())(
  "a chapter's opening page alone drops the running head, and no page moves",
  async () => {
    const props = longHandout;
    const heads = headerLinesPerPage(await render("DocHandout", props));
    // The control: without the opening page's rule every chapter page shows the head.
    const control = headerLinesPerPage(
      await render("DocHandout", props, (html) => html.replace("@page opening", "@page unused")),
    );
    expect(control.slice(1)).toEqual(control.slice(1).map(() => 1));
    expect(heads.length).toBe(control.length);
    expect(heads[1]).toBe(0);
    expect(heads.slice(2, -1)).toEqual(heads.slice(2, -1).map(() => 1));
    expect(heads.at(-1)).toBe(0);
    expect(heads.length).toBeGreaterThan(4);
  },
  120_000,
);
