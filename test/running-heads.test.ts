import { afterAll, beforeAll, expect, test } from "bun:test";
import { limit } from "./probe";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { composePage, openComposer } from "../scripts/compose";
import { withoutImports } from "../scripts/root";
import { chromeBinary } from "@hackersandwizards/scaffolding/chrome";
import { documentCss, renderPdf } from "../scripts/render-pdf";
import { handout, leistungsnachweisMonth, proposalDe, rateCard } from "../scripts/samples";

// The running header holds the document's title on one line. The longest title on record is the
// trainer hub's AE-DEV-TTT product (73 characters). Measured in Chrome:
// that title takes 361 pt; Chrome lets the right box grow into the room the brand name leaves, and
// the header wraps once a title needs more than about 417 pt (83 characters of the same mix).
const longest = "Agentic Engineering for Developers and QA, Train-the-Trainer (AE-DEV-TTT)";
// The control: past the measured limit, so the check below must see two lines.
const tooLong = `${longest}, Extended Edition`;

const ROOT = resolve(import.meta.dir, "..");
const rules = withoutImports(readFileSync(join(ROOT, "handout.css"), "utf8"));
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
  warm = false,
) {
  const html = await composePage(composer, component, props, (page) =>
    page.replace(
      "<style data-hw-document></style>",
      () => `<style>${documentCss()}\n${component === "DocHandout" ? rules : ""}</style>`,
    ),
  );
  writeFileSync(join(dir, "doc.html"), edit(html));
  await renderPdf(join(dir, "doc.html"), join(dir, "doc.pdf"), { warm });
  return join(dir, "doc.pdf");
}

/** The number of distinct baselines of the text in a page's top margin, one count per page. */
function headerLinesPerPage(pdf: string): number[] {
  const bbox = execFileSync("pdftotext", ["-bbox", pdf, "-"], { encoding: "utf8" });
  return bbox
    .split("<page ")
    .slice(1)
    .map((page) => {
      const tops = [...page.matchAll(/<word xMin="[\d.]+" yMin="(-?[\d.]+)"/g)].map((m) =>
        Number(m[1]),
      );
      // The running head's words start at 14.1 pt, or clipped at 1.3 pt on a page 1 with no top
      // margin; page 1's document tag starts at 21.3 pt under the three-line imprint, a handout
      // chapter's eyebrow lower still. A wrapped title prints its two lines either side of the
      // brand name, three baselines in all (measured).
      return new Set(tops.filter((y) => y < 20).map((y) => y.toFixed(1))).size;
    });
}

// A chapter over three pages and a short one: the chapter's opening page ends mid-chapter.
const long = { ...handout.chapters[0]!, html: handout.chapters[0]!.html.repeat(6) };
const longHandout = { ...handout, chapters: [long, handout.chapters[1]!], toc: [] };

/** Every word below the running head with its position, page by page. */
function textBelowHead(pdf: string): string[] {
  const bbox = execFileSync("pdftotext", ["-bbox", pdf, "-"], { encoding: "utf8" });
  return bbox
    .split("<page ")
    .slice(1)
    .map((page) =>
      [...page.matchAll(/<word xMin="([\d.]+)" yMin="([\d.]+)"[^>]*>([^<]*)/g)]
        .filter((m) => Number(m[2]) >= 30)
        .map((m) => `${Number(m[1]).toFixed(1)},${Number(m[2]).toFixed(1)} ${m[3]}`)
        .join("|"),
    );
}

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
  limit(120_000),
);

// Page 1 carries the document header, so its running head would print clipped at the paper's top
// edge: invisible, but in the PDF's text, for copy, search and screen readers (measured).
test.skipIf(!chromeBinary())(
  "page 1 of a proposal and a rate card carries no running head, page 2 does",
  async () => {
    expect(headerLinesPerPage(await render("DocProposal", proposalDe)).slice(0, 2)).toEqual([0, 1]);
    expect(headerLinesPerPage(await render("DocRateCard", rateCard))[0]).toBe(0);
  },
  limit(120_000),
);

// A chapter's opening page shows its title and no running head; its later pages show the head, and
// naming the opening page moves no break, where the change of page name forces one.
test.skipIf(!chromeBinary())(
  "a chapter's opening page alone drops the running head, and no line moves",
  async () => {
    const pdf = await render("DocHandout", longHandout);
    const heads = headerLinesPerPage(pdf);
    const lines = textBelowHead(pdf);
    // The control names no block: every chapter page shows the head, and the text sits where
    // Chrome's own breaks put it.
    const plain = await render("DocHandout", longHandout, (html) =>
      html.replace("const named = sections.map(", "const named = [].map("),
    );
    const control = headerLinesPerPage(plain);
    expect(control.slice(1)).toEqual(control.slice(1).map(() => 1));
    expect(lines).toEqual(textBelowHead(plain));
    expect(heads[1]).toBe(0);
    expect(heads.slice(2, -1)).toEqual(heads.slice(2, -1).map(() => 1));
    expect(heads.at(-1)).toBe(0);
    expect(heads.length).toBeGreaterThan(4);
  },
  limit(120_000),
);

// The opening pages are named once the faces are in, which can come after the page's load: a render
// printing at load printed the opening page with its running head in 11 of 20 runs (measured).
// Held back a second past the faces, the naming must still reach the print.
test.skipIf(!chromeBinary()).each([false, true])(
  "the print waits for the chapter openings to be named, warm: %p",
  async (warm) => {
    const late = (html: string) => {
      const held = html.replace(
        "Promise.all([document.fonts.ready, loaded]).then(() => {",
        "Promise.all([document.fonts.ready, loaded]).then(() => new Promise((r) => setTimeout(r, 1000))).then(() => {",
      );
      expect(held).not.toBe(html);
      return held;
    };
    const heads = headerLinesPerPage(await render("DocHandout", longHandout, late, warm));
    expect(heads[1]).toBe(0);
    expect(heads.at(-1)).toBe(0);
    expect(heads.slice(2, -1)).toEqual(heads.slice(2, -1).map(() => 1));
  },
  limit(120_000),
);

// From page 2 the header's strip returns as a rail across the top boxes, also on a type that names
// no running head, such as a timesheet over two pages.
test.skipIf(!chromeBinary())(
  "a timesheet over two pages carries the rail on page 2",
  async () => {
    const rows = Array.from({ length: 4 }, () => leistungsnachweisMonth.rows).flat();
    const pdf = await render("DocLeistungsnachweis", { ...leistungsnachweisMonth, rows });
    /** The colour of the topmost pixel row at the middle of `page`, at 72 dpi. */
    const top = (page: number) => {
      const ppm = execFileSync("pdftoppm", [
        "-f",
        `${page}`,
        "-l",
        `${page}`,
        "-r",
        "72",
        "-x",
        "297",
        "-y",
        "0",
        "-W",
        "1",
        "-H",
        "1",
        pdf,
      ]);
      return [...ppm.subarray(ppm.length - 3)];
    };
    expect(top(2)).not.toEqual([255, 255, 255]);
  },
  limit(60_000),
);
