import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HANDOUT_TEXT } from "./handout";
import { inlineImages } from "./inline-images";
import { renderPdf } from "./render-pdf";
import { refused } from "./print-chrome";
import { brandFile } from "./root";

/** The measurements a handout pass passes on to the next: DocHandout's `toc`, `flow` and `notes`. */
export type HandoutPass = { toc?: number[]; flow?: string; notes?: string };

/** What renderHandoutPdf did: `numbered` is false where poppler's `pdftotext` is missing or no
 *  chapter eyebrow was found, and then `warning` says so and the contents prints without pages. */
export type HandoutResult = {
  numbered: boolean;
  flow: number[];
  notes?: number;
  renders: number;
  warning?: string;
};

type HandoutSource = string | ((pass: HandoutPass) => Promise<string>);
type RenderOptions = NonNullable<Parameters<typeof renderPdf>[2]>;

function passUrl(source: string, pass: HandoutPass): URL {
  const url = new URL(source);
  if (pass.toc) url.searchParams.set("toc", pass.toc.join(","));
  if (pass.flow) url.searchParams.set("flow", pass.flow);
  if (pass.notes) url.searchParams.set("notes", pass.notes);
  return url;
}

async function fetchChapterLabel(url: URL, timeoutMs: number): Promise<string> {
  const page = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) }).catch(
    (error: unknown) => {
      const reason =
        // Bun sets the code on the error, Node on its cause.
        [error, (error as Error).cause].some(
          (e) => (e as { code?: string } | undefined)?.code === "ECONNREFUSED",
        )
          ? refused(url.href)
          : `${url.href} could not be fetched: ${(error as Error).message}`;
      throw new Error(`renderHandoutPdf: ${reason}`, { cause: error });
    },
  );
  if (!page.ok) throw new Error(`renderHandoutPdf: ${url.href} answered ${page.status}`);
  return chapterLabelOf(await page.text());
}

class HandoutPrint {
  private readonly source: HandoutSource;
  readonly pdf: string;
  private readonly options: RenderOptions;
  private readonly dir: string | undefined;
  private label: string | undefined;
  renders = 0;

  constructor(source: HandoutSource, pdf: string, options: RenderOptions) {
    this.source = source;
    this.pdf = pdf;
    this.options = options;
    this.dir = typeof source === "string" ? undefined : mkdtempSync(join(tmpdir(), "hw-handout-"));
  }

  async render(pass: HandoutPass) {
    this.renders++;
    const source = this.source;
    if (typeof source === "string") {
      const url = passUrl(source, pass);
      this.label ??= await fetchChapterLabel(url, this.options.timeoutMs ?? 60_000);
      await renderPdf(url.href, this.pdf, this.options);
      return;
    }
    if (this.dir === undefined) throw new Error(`Handout work directory missing: ${this.pdf}`);
    const file = join(this.dir, "handout.html");
    const html = await source(pass);
    this.label ??= chapterLabelOf(html);
    // Resolve relative images before writing the page into the temporary folder.
    writeFileSync(file, inlineImages(html, process.cwd()));
    await renderPdf(file, this.pdf, this.options);
  }

  pages() {
    if (this.label === undefined) throw new Error(`Handout chapter label missing: ${this.pdf}`);
    return chapterPages(this.pdf, this.label.trim());
  }

  close() {
    if (this.dir) rmSync(this.dir, { recursive: true, force: true });
  }
}

// A chapter that runs on changes where it ends, so the one after it is judged on the next pass.
async function measureHandoutFlow(job: HandoutPrint) {
  let toc = job.pages();
  let flow: number[] = [];
  for (let pass = 0; toc && pass < 6; pass++) {
    const more = flowing(job.pdf, toc, flow).filter((chapter) => !flow.includes(chapter));
    const take = more.filter((chapter) => !more.includes(chapter - 1));
    if (!take.length) break;
    flow = [...flow, ...take].sort((a, b) => a - b);
    await job.render({ flow: flow.join(",") });
    toc = job.pages();
  }
  return { toc, flow };
}

/**
 * Prints a DocHandout to PDF in as many passes as its layout needs. Chrome has no
 * `target-counter()`, so the contents cannot number its own pages: each render is read back with
 * `pdftotext` for the page each chapter eyebrow lands on, and the next passes those pages in `toc`.
 * The cover holds the contents and has room to spare, so the numbers move no chapter. The same
 * read-back picks the chapters that run on under the one before (`flow`) and whether the notes
 * share the last page (`notes`). `source` is a URL serving the handout, which gets the pass as the
 * query `toc`, `flow` and `notes`, or a function composing the handout's HTML for a pass, which
 * passes it to DocHandout as props; an image that HTML names by a relative path is read from the
 * current folder. The eyebrow's word comes from the first pass's page, the
 * `--chapter-label` DocHandout writes for its language and `labels.chapter`; a URL is fetched once
 * more for it. Without poppler the first render stands: the contents unnumbered and every chapter
 * opening a page.
 */
export async function renderHandoutPdf(
  source: string | ((pass: HandoutPass) => Promise<string>),
  pdfPath: string,
  options: RenderOptions = {},
): Promise<HandoutResult> {
  const job = new HandoutPrint(source, pdfPath, options);
  try {
    await job.render({});
    const { toc, flow } = await measureHandoutFlow(job);
    if (!toc)
      return {
        numbered: false,
        flow,
        renders: job.renders,
        warning:
          "pdftotext (poppler) missing or no chapter eyebrow found: the contents prints without page numbers and every chapter opens a page",
      };
    const flowed = flow.length ? flow.join(",") : undefined;
    const pages = toc.at(-1);
    if (pages === undefined) throw new Error("Handout contents pages missing: " + pdfPath);
    const lines = notesFit(pdfPath, pages);
    if (lines) {
      await job.render({ flow: flowed, toc: [...toc.slice(0, -1), pages - 1], notes: `${lines}` });
      // A notes block that did not fit would have taken a page of its own again.
      if (job.pages()?.at(-1) === pages - 1)
        return { numbered: true, flow, notes: lines, renders: job.renders };
    }
    await job.render({ flow: flowed, toc });
    return { numbered: true, flow, renders: job.renders };
  } finally {
    job.close();
  }
}

/** The chapter eyebrow's word in a DocHandout page: the `--chapter-label` of its `data-hw-page`
 *  style, a CSS string with its escapes read as Chrome reads them, or DocHandout's English one
 *  where the page has none. */
function chapterLabelOf(html: string): string {
  const value =
    /<style\b[^>]*\bdata-hw-page\b[^>]*>[^<]*?--chapter-label:\s*"((?:[^"\\]|\\.)*)"/.exec(
      html,
    )?.[1];
  if (value === undefined) return HANDOUT_TEXT.en.chapter;
  return value.replace(/\\(?:([\da-f]{1,6}) ?|(.))/gi, (match, hex?: string, char?: string) => {
    if (hex !== undefined) return String.fromCodePoint(parseInt(hex, 16));
    if (char === undefined) throw new Error(`Handout chapter label escape missing: ${match}`);
    return char;
  });
}

/** The 1-based page each chapter eyebrow ("CHAPTER 03") starts on, in chapter order, or undefined.
 *  The eyebrow is a line of its own with a two-digit number, so a text line opening "Chapter 2 …"
 *  is none; the first such line counts. The cover's contents prints titles, never the eyebrow. */
function chapterPages(pdf: string, label: string): number[] | undefined {
  const text = spawnSync("pdftotext", ["-raw", pdf, "-"], { encoding: "utf8" });
  if (text.error || text.status !== 0) return undefined;
  const eyebrow = new RegExp(
    `^\\s*${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")} ?(\\d{2,})\\s*$`,
    "gim",
  );
  const pages: number[] = [];
  text.stdout.split("\f").forEach((body, i) => {
    for (const m of body.matchAll(eyebrow)) pages[Number(m[1]) - 1] ??= i + 1;
  });
  return pages.length && !pages.includes(undefined as never) ? pages : undefined;
}

const MM = 72 / 25.4;
/** A length brand's print or document tokens set in mm, in points: the handout's measures follow
 *  brand rather than a copy of its values. */
const brandPts = new Map<string, number>();
function brandPt(name: string): number {
  const known = brandPts.get(name);
  if (known !== undefined) return known;
  for (const file of ["print.css", "document.css"]) {
    const value = new RegExp(`${name}:\\s*([\\d.]+)mm;`).exec(
      readFileSync(brandFile(file), "utf8"),
    );
    if (value) {
      brandPts.set(name, Number(value[1]) * MM);
      return Number(value[1]) * MM;
    }
  }
  throw new Error(`brand's tokens set no ${name} in mm`);
}

/** Each page's lowest text above the footer and highest below the running header, in points,
 *  with the page height, from one pdftotext run; a page without such text is missing. The running
 *  header sits in the top margin, its text above 6 pt short of the margin's end. */
function extents(pdf: string): Map<number, { top: number; bottom: number; height: number }> {
  const found = new Map<number, { top: number; bottom: number; height: number }>();
  const box = spawnSync("pdftotext", ["-bbox", pdf, "-"], { encoding: "utf8" });
  if (box.error || box.status !== 0) return found;
  const head = brandPt("--handout-margin-top") - 6;
  const foot = brandPt("--print-margin-bottom");
  box.stdout
    .split("<page ")
    .slice(1)
    .forEach((page, i) => {
      const height = Number(/^width="[\d.]+" height="([\d.]+)"/.exec(page)?.[1]);
      const words = [...page.matchAll(/yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)"/g)]
        .map((m) => [Number(m[1]), Number(m[2])] as const)
        .filter(([min, max]) => min > head && max < height - foot);
      if (words.length)
        found.set(i + 1, {
          top: Math.min(...words.map(([min]) => min)),
          bottom: Math.max(...words.map(([, max]) => max)),
          height,
        });
    });
  return found;
}

/** The 1-based chapters, the first and last aside, that run on under the chapter before rather
 *  than open a page. A longer chapter runs on when the one before ends in the top half of its last
 *  page. A one-page chapter runs on when it fits whole there, with the flow gap, or when the one
 *  before ends in its top third; otherwise it keeps its page, since running on would split it.
 *  Readers preferred the top-third limit to none; at a half, chapters open low and run over. */
function flowing(pdf: string, toc: number[], flow: number[]): number[] {
  const gap = brandPt("--handout-flow-space");
  const pages = extents(pdf);
  return toc.flatMap((start, i) => {
    if (i === 0 || i === toc.length - 1) return [];
    const before = pages.get(start - 1);
    const own = pages.get(start);
    if (!before || !own) return [];
    // A chapter ends on the page before the next one's start, or on that page where the next one
    // already runs on under it.
    const single = toc[i + 1] - (flow.includes(i + 2) ? 0 : 1) === start;
    if (before.bottom < own.height * (single ? 1 / 3 : 1 / 2)) return [i + 1];
    const free = own.height - brandPt("--print-margin-bottom") - before.bottom;
    return single && own.bottom - own.top + gap <= free ? [i + 1] : [];
  });
}

/** How many ruled lines fit under the text of the page before `last`, which the notes chapter
 *  fills alone, when at least half a page of them do (14); otherwise undefined. The notes then move
 *  up into that space, so the last chapter never ends above an empty page bottom. Points
 *  throughout: the section gap and the chapter heading take 42 mm. */
function notesFit(pdf: string, last: number): number | undefined {
  // A page without text gives no measure, and none would fit endless lines.
  const page = extents(pdf).get(last - 1);
  if (!page) return undefined;
  const bottom = page.height - brandPt("--print-margin-bottom");
  const lines = Math.floor((bottom - page.bottom - 42 * MM) / brandPt("--handout-note-line")) - 1;
  return lines >= 14 ? lines : undefined;
}
