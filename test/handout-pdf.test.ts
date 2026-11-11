import { afterAll, beforeAll, expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { rejection } from "@hackersandwizards/scaffolding/rejection";
import { composePage, openComposer } from "../scripts/compose";
import { withoutImports } from "../scripts/root";
import { documentCss, type HandoutPass, renderHandoutPdf } from "../scripts/render-pdf";
import { handout } from "../scripts/samples";
import { probePage } from "./probe";

const ROOT = resolve(import.meta.dir, "..");
const rules = withoutImports(readFileSync(join(ROOT, "handout.css"), "utf8"));
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
    {
      ...second!,
      title: "Rules, Again",
      // A path longer than a margin note is wide.
      html: `<aside class="margin-note">See <code>/Users/participant/projects/beispielprojekt/.claude/settings.local.json</code>.</aside><p>Chapter 1 set up the loop.</p>${second!.html}`,
    },
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
  // Every word stays on the paper, a long path in a margin note too.
  const box = execFileSync("pdftotext", ["-bbox", pdf, "-"], { encoding: "utf8" });
  const width = Number(/<page width="([\d.]+)"/.exec(box)![1]);
  const off = [...box.matchAll(/xMax="([\d.]+)" yMax="[\d.]+">([^<]*)</g)].filter(
    ([, x]) => Number(x) > width,
  );
  expect(off.map(([, , word]) => word)).toEqual([]);
}, 120_000);

// A composed page has no folder of its own: an image it names by a relative path is read from the
// current folder.
test("a composed handout prints an image named relative to the current folder", async () => {
  const here = process.cwd();
  const folder = mkdtempSync(join(dir, "caller-"));
  copyFileSync(
    Bun.resolveSync("@hackersandwizards/brand/logos/lockup.png", ROOT),
    join(folder, "fig.png"),
  );
  process.chdir(folder);
  // The widest image the PDF holds for a chapter naming `src`: a file it cannot read prints as
  // Chrome's broken-image icon, 14 px wide, beside the header's 112 px logo.
  const widest = async (src: string) => {
    const pdf = join(dir, "figure.pdf");
    await renderHandoutPdf(
      (pass) =>
        compose(pass, {
          chapters: [{ title: "C", html: `<p>x</p><p><img src="${src}" alt="fig"></p>` }],
        }),
      pdf,
    );
    const list = execFileSync("pdfimages", ["-list", pdf], { encoding: "utf8" });
    const rows = list.split("\n").filter((row) => /\simage\s/.test(row));
    return Math.max(...rows.map((row) => Number(row.trim().split(/\s+/)[3])));
  };
  try {
    expect(await widest("none.png")).toBe(112);
    expect(await widest("fig.png")).toBeGreaterThan(1000);
  } finally {
    process.chdir(here);
  }
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

test("a server that is not running is named in plain words, the way a bad status is", async () => {
  const server = Bun.serve({ port: 0, fetch: () => new Response(null) });
  const url = `http://127.0.0.1:${server.port}/print`;
  server.stop(true);
  const pdf = join(dir, "refused.pdf");
  const plain = `${url} refused the connection: is its server running?`;
  expect(await rejection(renderHandoutPdf(url, pdf))).toContain(`renderHandoutPdf: ${plain}`);
}, 60_000);

test("without pdftotext the first render stands, unnumbered, and the result says so", async () => {
  const path = process.env.PATH;
  // Chrome is found by its absolute path; only the folders holding poppler drop off the PATH,
  // wherever it is installed (/opt/homebrew/bin on a Mac, /usr/bin on Linux).
  process.env.PATH = path!
    .split(delimiter)
    .filter((folder) => !existsSync(join(folder, "pdftotext")))
    .join(delimiter);
  try {
    const pdf = join(dir, "plain.pdf");
    const result = await renderHandoutPdf(compose, pdf);
    expect(result).toMatchObject({ numbered: false, renders: 1, flow: [] });
    expect(result.warning).toContain("pdftotext");
  } finally {
    process.env.PATH = path;
  }
}, 120_000);

// A handout served at a URL keeps its images remote, and one can arrive after the faces: the
// opening page is measured with it in place.
test("a chapter's opening page is measured with its late image in place", async () => {
  const image = join(dir, "tall.png");
  execFileSync("sips", [
    "-z",
    "2400",
    "600",
    Bun.resolveSync("@hackersandwizards/brand/logos/lockup.png", ROOT),
    "--out",
    image,
  ]);
  // Its own process: probePage blocks this one while Chrome loads the page.
  const server = Bun.spawn(
    [
      "bun",
      "-e",
      `const s = Bun.serve({ port: 0, hostname: "127.0.0.1", async fetch() { await Bun.sleep(2500); return new Response(Bun.file(${JSON.stringify(image)})); } }); console.log(s.port);`,
    ],
    { stdout: "pipe" },
  );
  try {
    const port = (await server.stdout.getReader().read()).value!;
    const html = await composePage(
      composer,
      "DocHandout",
      {
        title: "T",
        chapters: [
          {
            title: "C",
            html: `<p>first</p><p><img src="http://127.0.0.1:${new TextDecoder().decode(port).trim()}/t.png"></p><p>after</p>`,
          },
          { title: "D", html: "<p>x</p>" },
        ],
      },
      (page) =>
        page.replace(
          "<style data-hw-document></style>",
          () => `<style>${documentCss()}\n${rules}</style>`,
        ),
    );
    const opening = probePage(
      html,
      `return [...document.querySelector("section.chapter").querySelectorAll(".opening")].map((b) => b.textContent.trim()).join("|");`,
    );
    expect(opening).toBe("Cfirst");
  } finally {
    server.kill();
  }
}, 60_000);
