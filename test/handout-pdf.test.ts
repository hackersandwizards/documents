import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { composePage, openComposer } from "../scripts/compose";
import { documentCss, type HandoutPass, renderHandoutPdf } from "../scripts/render-pdf";
import { handout } from "../scripts/samples";

const ROOT = resolve(import.meta.dir, "..");
const rules = readFileSync(join(ROOT, "handout.css"), "utf8").replace(/^@import [^;]+;\n/gm, "");
let composer: Awaited<ReturnType<typeof openComposer>>;
let dir: string;
beforeAll(async () => {
  composer = await openComposer(ROOT);
  dir = mkdtempSync(join(tmpdir(), "handout-pdf-"));
});
afterAll(async () => {
  await composer?.close();
  rmSync(dir, { recursive: true, force: true });
});

// A chapter over several pages, two short ones and the notes: the contents needs the pages the
// chapters land on, which only a first render tells. A later chapter's text names an earlier one at
// a line start, which is no eyebrow.
const [first, second, notes] = handout.chapters;
const props = {
  ...handout,
  toc: undefined,
  chapters: [
    { ...first!, html: first!.html.repeat(4) },
    second!,
    { ...second!, title: "Rules, Again", html: `<p>Chapter 1 set up the loop.</p>${second!.html}` },
    notes!,
  ],
};
const compose = (pass: HandoutPass, extra: object = {}) =>
  composePage(composer, "DocHandout", { ...props, ...extra, ...pass }, (page) =>
    page.replace(
      "<style data-hw-document></style>",
      () => `<style>${documentCss()}\n${rules}</style>`,
    ),
  );

/** The page each chapter's eyebrow prints on, and the page numbers the cover's contents prints. */
function read(pdf: string, eyebrow = "CHAPTER") {
  const pages = execFileSync("pdftotext", ["-raw", pdf, "-"], { encoding: "utf8" }).split("\f");
  const starts: number[] = [];
  pages.forEach((body, i) => {
    for (const m of body.matchAll(new RegExp(`^${eyebrow} (\\d{2,})$`, "gm")))
      starts[Number(m[1]) - 1] ??= i + 1;
  });
  const listed = props.chapters.map((c) =>
    Number(new RegExp(`${c.title}\\s+(\\d+)`).exec(pages[0]!)?.[1]),
  );
  return { starts, listed };
}

test("the contents numbers each chapter with the page it opens on, from composed HTML", async () => {
  const pdf = join(dir, "composed.pdf");
  const result = await renderHandoutPdf(compose, pdf);
  expect(result.numbered).toBe(true);
  expect(result.renders).toBeGreaterThan(1);
  const { starts, listed } = read(pdf);
  expect(starts.length).toBe(props.chapters.length);
  expect(listed).toEqual(starts);
}, 120_000);

// German, so the eyebrow's word the first fetch reads is the page's own, not the English default.
test("a URL gets each pass as its query, and its page names the eyebrow", async () => {
  const queries: string[] = [];
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const url = new URL(request.url);
      // Chrome asks for a favicon too.
      if (url.pathname !== "/print") return new Response(null, { status: 404 });
      const query = url.searchParams;
      queries.push(query.toString());
      const toc = query.get("toc")?.split(",").map(Number);
      const html = await compose(
        { toc, flow: query.get("flow") ?? undefined, notes: query.get("notes") ?? undefined },
        { lang: "de" },
      );
      return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
    },
  });
  try {
    const pdf = join(dir, "served.pdf");
    const result = await renderHandoutPdf(`http://127.0.0.1:${server.port}/print`, pdf);
    expect(result.numbered).toBe(true);
    // One more request than renders: the first pass is fetched for the eyebrow's word.
    expect(queries.length).toBe(result.renders + 1);
    expect(queries[0]).toBe("");
    expect(queries.at(-1)).toContain("toc=");
    const { starts, listed } = read(pdf, "KAPITEL");
    expect(starts.length).toBe(props.chapters.length);
    expect(listed).toEqual(starts);
  } finally {
    server.stop(true);
  }
}, 120_000);

test("without pdftotext the first render stands, unnumbered, and the result says so", async () => {
  const path = process.env.PATH;
  // Chrome is found by its absolute path; only poppler drops off the PATH.
  process.env.PATH = "/usr/bin:/bin";
  try {
    const pdf = join(dir, "plain.pdf");
    const result = await renderHandoutPdf(compose, pdf);
    expect(result).toMatchObject({ numbered: false, renders: 1, flow: [] });
    expect(result.warning).toContain("pdftotext");
  } finally {
    process.env.PATH = path;
  }
}, 120_000);
