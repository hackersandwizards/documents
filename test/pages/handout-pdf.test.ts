import { defined } from "@hackersandwizards/scaffolding/defined";
import { afterAll, beforeAll, describe, expect, test, vi } from "vitest";
import { execFileSync } from "node:child_process";
import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { delimiter, join, resolve } from "node:path";
import { chromeBinary } from "@hackersandwizards/scaffolding/chrome";
import { composeUnbakedPage, openComposer } from "../../scripts/compose";
import { withoutImports } from "../../scripts/root";
import { subsetFaces } from "../../scripts/font-faces";
import { documentCss } from "../../scripts/document-css";
import {
  type HandoutPass,
  type HandoutResult,
  renderHandoutPdf,
} from "../../scripts/render-handout-pdf";
import { handout } from "../../scripts/samples";
import { probePage, limit } from "../probe";

const ROOT = resolve(import.meta.dirname, "../..");
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
const first = defined(handout.chapters[0], "first handout chapter");
const second = defined(handout.chapters[1], "second handout chapter");
const notes = defined(handout.chapters[2], "handout notes");
const props = {
  ...handout,
  toc: undefined,
  chapters: [
    { ...first, html: first.html.repeat(4) },
    second,
    {
      ...second,
      title: "Rules, Again",
      // A path longer than a margin note is wide.
      html: `<aside class="margin-note">See <code>/Users/participant/projects/beispielprojekt/.claude/settings.local.json</code>.</aside><p>Chapter 1 set up the loop.</p>${second.html}`,
    },
    notes,
  ],
};
const composeHandoutPage = async (props: Record<string, unknown>) =>
  subsetFaces(
    (await composeUnbakedPage(composer, "DocHandout", props)).replace(
      "<style data-hw-document></style>",
      () => `<style>${documentCss()}\n${rules}</style>`,
    ),
  );

const compose = (pass: HandoutPass, extra: object = {}) =>
  composeHandoutPage({ ...props, ...extra, ...pass });

/** The page each chapter's eyebrow prints on, and the page numbers the cover's contents prints. */
function read(pdf: string, eyebrow = "CHAPTER") {
  const pages = execFileSync("pdftotext", ["-raw", pdf, "-"], { encoding: "utf8" }).split("\f");
  const starts: number[] = [];
  pages.forEach((body, i) => {
    for (const m of body.matchAll(new RegExp(`^${eyebrow} (\\d{2,})$`, "gm")))
      starts[Number(m[1]) - 1] ??= i + 1;
  });
  const listed = props.chapters.map((c) =>
    Number(new RegExp(`${c.title}\\s+(\\d+)`).exec(defined(pages[0], "first handout page"))?.[1]),
  );
  return { starts, listed };
}

test(
  "the contents numbers each chapter with the page it opens on, from composed HTML",
  async () => {
    const pdf = join(dir, "composed.pdf");
    const result = await renderHandoutPdf(compose, pdf);
    expect(result.numbered).toBe(true);
    expect(result.renders).toBeGreaterThan(1);
    const { starts, listed } = read(pdf);
    expect(starts.length).toBe(props.chapters.length);
    expect(listed).toEqual(starts);
    // Check the right page edge because the long margin-note path can overflow there.
    const box = execFileSync("pdftotext", ["-bbox", pdf, "-"], { encoding: "utf8" });
    const width = Number(defined(/<page width="([\d.]+)"/.exec(box), "PDF page width")[1]);
    const off = [...box.matchAll(/xMax="([\d.]+)" yMax="[\d.]+">([^<]*)</g)].filter(
      ([, x]) => Number(x) > width,
    );
    expect(off.map(([, , word]) => word)).toEqual([]);
  },
  limit(120_000),
);

// A composed page has no folder of its own: an image it names by a relative path is read from the
// current folder.
test(
  "a composed handout prints an image named relative to the current folder",
  async () => {
    const here = process.cwd();
    const folder = mkdtempSync(join(dir, "caller-"));
    copyFileSync(
      Bun.resolveSync("@hackersandwizards/brand/logos/lockup.png", ROOT),
      join(folder, "fig.png"),
    );
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
    // Resolve the project's pinned Chrome before switching to the caller's directory.
    vi.stubEnv("CHROME_BINARY", chromeBinary());
    try {
      process.chdir(folder);
      expect(await widest("none.png")).toBe(112);
      expect(await widest("fig.png")).toBeGreaterThan(1000);
    } finally {
      process.chdir(here);
      vi.unstubAllEnvs();
    }
  },
  limit(120_000),
);

describe("a handout served from a URL", () => {
  const queries: string[] = [];
  let result: HandoutResult;
  let pdf: string;

  beforeAll(async () => {
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      routes: {
        "/print": async (request) => {
          const query = new URL(request.url).searchParams;
          queries.push(query.toString());
          const toc = query.get("toc")?.split(",").map(Number);
          const [flow] = query.getAll("flow");
          const [notes] = query.getAll("notes");
          // German makes the first fetch read the rendered eyebrow instead of using the English default.
          const html = await compose({ toc, flow, notes }, { lang: "de" });
          return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
        },
      },
      // Chrome can also request a favicon, which does not count as a print request.
      fetch: () => new Response(null, { status: 404 }),
    });
    try {
      pdf = join(dir, "served.pdf");
      result = await renderHandoutPdf(`http://127.0.0.1:${server.port}/print`, pdf);
    } finally {
      await server.stop(true);
    }
  }, limit(120_000));

  test("fetches the original page and sends the contents as a query on the final pass", () => {
    // The fetch for the eyebrow label adds a request before the print renders.
    expect(queries.length).toBe(result.renders + 1);
    expect(queries[0]).toBe("");
    expect(queries.at(-1)).toContain("toc=");
  });

  test("numbers the contents using chapter pages read under the German eyebrow", () => {
    expect(result.numbered).toBe(true);
    const { starts, listed } = read(pdf, "KAPITEL");
    expect(starts.length).toBe(props.chapters.length);
    expect(listed).toEqual(starts);
  });
});

test(
  "without pdftotext the first render stands, unnumbered, and the result says so",
  async () => {
    const path = defined(process.env.PATH, "PATH");
    // Chrome is found by its absolute path; only the folders holding poppler drop off the PATH,
    // wherever it is installed (/opt/homebrew/bin on a Mac, /usr/bin on Linux).
    process.env.PATH = path
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
  },
  limit(120_000),
);

// A handout served at a URL keeps its images remote, and one can arrive after the faces: the
// opening page is measured with it in place.
test(
  "a chapter's opening page is measured with its late image in place",
  async () => {
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
      const port = defined((await server.stdout.getReader().read()).value, "handout server port");
      const html = await composeHandoutPage({
        title: "T",
        chapters: [
          {
            title: "C",
            html: `<p>first</p><p><img src="http://127.0.0.1:${new TextDecoder().decode(port).trim()}/t.png"></p><p>after</p>`,
          },
          { title: "D", html: "<p>x</p>" },
        ],
      });
      const opening = probePage(
        html,
        `return [...document.querySelector("section.chapter").querySelectorAll(".opening")].map((b) => b.textContent.trim()).join("|");`,
      );
      expect(opening).toBe("Cfirst");
    } finally {
      server.kill();
    }
  },
  limit(60_000),
);

// The note is moved down until an item starts a quarter, then three quarters, of the space under
// the note below the note's end: in the upper half its first line wraps beside the note, in the
// lower half it runs at full width.
test(
  "a line starting in the lower half of the space under a margin note runs at full width",
  async () => {
    const item = "Each turn the agent sees the files it opened and the commands it ran.";
    const html = await composeHandoutPage({
      title: "T",
      chapters: [
        {
          title: "C",
          html: `<h2>Notes</h2><aside class="margin-note">One line.</aside><ul><li>One</li><li>Two</li><li>Three</li><li id="probed">${item}</li></ul>`,
        },
      ],
    });
    const seen = probePage(
      html,
      `const note = document.querySelector(".margin-note");
      const item = document.getElementById("probed");
      const space = parseFloat(getComputedStyle(note).marginBottom);
      const edge = () => note.getBoundingClientRect().left - parseFloat(getComputedStyle(note).marginLeft);
      const fullWidth = (below) => {
        note.style.marginTop = "0px";
        const end = note.getBoundingClientRect().bottom;
        note.style.marginTop = item.getBoundingClientRect().top - below - end + "px";
        const range = document.createRange();
        range.selectNodeContents(item);
        return range.getClientRects()[0].right > edge();
      };
      return JSON.stringify([fullWidth(space / 4), fullWidth((3 * space) / 4)]);`,
    );
    expect(JSON.parse(seen)).toEqual([false, true]);
  },
  limit(60_000),
);
