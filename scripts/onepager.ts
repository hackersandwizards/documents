import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeHTMLStrict } from "entities";
import { escapeHtml, type openComposer } from "./compose";
import { ELEMENT_MAP, withElements } from "./elements";
import { brandFile, inlineCss, renderPdf } from "./render-pdf";
import { ROOT } from "./root";

function rule(css: string, pattern: RegExp, what: string) {
  const found = css.match(pattern)?.[0];
  if (!found) throw new Error(`document.css: no ${what}`);
  return found;
}

// The brand's tokens, faces and document scale, read once a process: a fit composes up to 13
// times, and the faces alone are about 0.3 MB to encode.
let inlinedBrand: string | undefined;
const brandBase = () =>
  (inlinedBrand ??= [
    readFileSync(brandFile("tokens.css"), "utf8").replace(/@theme\s*\{/, ":root {"),
    // The faces as data URIs, resolved beside brand's exported print.css, as the document base
    // carries them: the page reaches no brand path and renders anywhere.
    inlineCss(brandFile("print.css")),
    inlineCss(brandFile("document.css")),
  ].join("\n"));

/** The stylesheet ahead of the components' styles; the brand files inlined unless `link`. */
function baseCss(link: boolean) {
  const documentCss = readFileSync(join(ROOT, "document.css"), "utf8");
  return [
    ...(link ? [] : [brandBase()]),
    readFileSync(join(ROOT, "tokens.css"), "utf8").replace(/^@import [^;]+;\n/gm, ""),
    // DocHeader's tag and DocCard are the brand's pill and card; the rest of the page keeps its own
    // forms (brand-elements.json, exception "onepager").
    inlineCss(brandFile("elements.css")),
    // Every h&w document draws the identical list marker: the brand's rule, switched on in
    // tokens.css above, and the base's list indent, never a copy.
    readFileSync(brandFile("marker.css"), "utf8"),
    rule(documentCss, /^ul li \{[\s\S]*?^\}/m, "`ul li` rule holding the list indent"),
  ].join("\n");
}

/** The brand's tokens, faces and favicon as links, as every type page in the catalog carries them;
 * `href` turns a file brand exports into its link. */
const linked = (
  href: (file: string) => string,
) => `<link rel="icon" href="${href("logos/favicon.ico")}" sizes="32x32" />
<link rel="icon" href="${href("logos/favicon.svg")}" type="image/svg+xml" />
<link rel="stylesheet" href="${href("tokens.root.css")}" />
<link rel="stylesheet" href="${href("print.css")}" />
<link rel="stylesheet" href="${href("document.css")}" />
`;

/** The page balance fitOnepager picks: `tight` for copy over two pages, then the widest gap level
 *  (0 to 4) between page 1's blocks after the hero (`lift`) and between page 2's blocks after its
 *  first one (`air`); `page2Start` is the position of the block that opens page 2 among the
 *  children of `.page` (1 is the header). */
export interface OnepagerFit {
  tight?: boolean;
  lift?: number;
  air?: number;
  page2Start?: number;
}

export interface OnepagerPage {
  lang: "de" | "en";
  title: string;
  /** The blocks after the header, as HTML, one top-level element per block. */
  html: string;
  fit?: OnepagerFit;
}

// A block under its heading or lead stays with it: no free space opens between them.
const KEPT = ".block-heading + *, .block-lead + *";
const LEVELS = [0, 1, 2, 3, 4];

/** The fit's classes on the html element, where the role shorthands read --density. */
function fitClasses(fit: OnepagerFit = {}): string {
  return [
    "onepager",
    fit.tight && "tight",
    fit.lift !== undefined && `lift${fit.lift}`,
    fit.air !== undefined && `air${fit.air}`,
  ]
    .filter(Boolean)
    .join(" ");
}

/** The margins the gap levels set, on the blocks around the one that opens page 2. */
function fitCss(fit: OnepagerFit = {}): string {
  const start = fit.page2Start;
  if (!start) return "";
  return `.page > :nth-child(n + 3):nth-child(-n + ${start - 1}):not(${KEPT}) { margin-top: var(--lift-gap, 0); }
.page > :nth-child(n + ${start + 1}):not(${KEPT}) { margin-top: var(--air-gap, 0); }`;
}

/** The onepager as a standalone HTML page, the brand files and faces inlined. Given `link`, which
 * turns a file brand exports into the link the page reaches it by, it links the brand's tokens,
 * faces and favicon instead, as the catalog does, so a brand release leaves the page current. */
export async function composeOnepager(
  composer: Awaited<ReturnType<typeof openComposer>>,
  page: OnepagerPage,
  link?: (file: string) => string,
): Promise<string> {
  const SLOT = "\u0001";
  const cardTag = async (tint: boolean) => {
    const [open, close] = (await composer.render("DocCard", { tint }, { default: SLOT })).split(
      SLOT,
    );
    if (!open?.startsWith("<div ") || close?.trim() !== "</div>")
      throw new Error(`DocCard no longer wraps its slot in one <div>: ${open}${SLOT}${close}`);
    return open.trim();
  };
  const cards = { card: await cardTag(false), tint: await cardTag(true) };
  const rendered = (
    await composer.render("DocOnepager", { lang: page.lang, html: page.html })
  ).replace(/<div class="([^"]*)"(?: data-astro-cid-\w+)?>/g, (tag, cls: string) => {
    const own = cls.split(" ");
    if (!own.includes("card")) return tag;
    const card = own.includes("tint") ? cards.tint : cards.card;
    const base = card.match(/class="([^"]*)"/)?.[1].split(" ") ?? [];
    const all = [...base, ...own.filter((c) => !base.includes(c))].join(" ");
    return card.replace(/class="[^"]*"/, `class="${all}"`);
  });
  const body = withElements(rendered, ONEPAGER_ELEMENTS);
  const style = [
    baseCss(link !== undefined),
    await composer.styles(),
    readFileSync(join(ROOT, "onepager.css"), "utf8"),
    fitCss(page.fit),
  ].join("\n");
  return `<!doctype html>
<html lang="${page.lang}" class="${fitClasses(page.fit)}" data-hw-scale="print">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${escapeHtml(page.title)}</title>
${link ? linked(link) : ""}<style data-hw-onepager>
${style}
</style>
</head>
<body>
${body.trim()}
</body>
</html>
`;
}

const ONEPAGER_ELEMENTS = ELEMENT_MAP.filter(([selector]) => /\.(card|doc-tag)\b/.test(selector));

const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;

/** The top-level elements of an HTML fragment, each as its text. */
function topLevelBlocks(html: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = 0;
  for (const m of html.matchAll(/<(\/?)([a-z][\w-]*)[^>]*?(\/?)>/gi)) {
    const [tag, closing, name, selfClosing] = m;
    if (closing) {
      if (--depth === 0) blocks.push(html.slice(start, m.index! + tag.length));
    } else if (!selfClosing && !VOID.test(name)) {
      if (depth++ === 0) start = m.index!;
    } else if (depth === 0) blocks.push(tag);
  }
  return blocks;
}

/** A page's extracted text as its words, lower case, on single spaces. */
const flatText = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
/** A block's markup as the words its PDF text shows: tags dropped, every entity decoded once,
 * and only where it ends in `;`, as copy writes it. */
const flatBlock = (html: string) => flatText(decodeHTMLStrict(html.replace(/<[^>]*>/g, " ")));

const pdfPages = (pdf: string) =>
  Number(execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/^Pages:\s+(\d+)/m)?.[1]);
const pdfPageText = (pdf: string, page: number) =>
  execFileSync("pdftotext", ["-f", `${page}`, "-l", `${page}`, pdf, "-"], { encoding: "utf8" });

/**
 * The onepager composed with the page balance that fits it: rendered once as it is; over two pages,
 * again under `tight`, the fallback for copy not yet cut; on two pages, each page's free space
 * spent between its blocks, page 1's after the hero (lift) and page 2's after its first one (air),
 * each at the widest level that keeps two pages and leaves page 1's text as it was. `dir` is the
 * folder the fits are rendered in; `brand` is unused, since the faces are inlined. Returns the page count: a caller that
 * holds two pages as a limit fails on more. Needs Chrome for Testing and poppler (pdfinfo,
 * pdftotext), as renderPdf and assertBrandFonts do.
 */
export async function fitOnepager(
  composer: Awaited<ReturnType<typeof openComposer>>,
  page: Omit<OnepagerPage, "fit">,
  brand: string,
  dir: string,
): Promise<{ html: string; pages: number; fit: OnepagerFit }> {
  const work = mkdtempSync(join(tmpdir(), "hw-onepager-"));
  const tag = work.split("-").pop();
  // Each fit renders once into its own files, so the levels of one kind render side by side and
  // the last step reads the chosen fit back instead of rendering it again.
  const renders = new Map<string, { html: string; pdf: string }>();
  const files = async (fit: OnepagerFit) => {
    const key = JSON.stringify(fit);
    let f = renders.get(key);
    if (!f) {
      f = {
        html: join(dir, `.onepager-fit-${tag}-${renders.size}.html`),
        pdf: join(work, `fit-${renders.size}.pdf`),
      };
      renders.set(key, f);
      writeFileSync(f.html, await composeOnepager(composer, { ...page, fit }));
    }
    return f;
  };
  const rendered = new Map<string, Promise<number>>();
  const render = async (fit: OnepagerFit) => {
    const { html, pdf } = await files(fit);
    const key = JSON.stringify(fit);
    let pages = rendered.get(key);
    if (!pages) {
      // In the kept Chrome: a fit renders up to a dozen times, and a fresh Chrome per render
      // cost about 0.4 s each. One retry, kept from the fresh-Chrome renders, which sometimes
      // exited non-zero on macOS; whether a kept-Chrome render still fails that way is not measured.
      pages = renderPdf(html, pdf, { warm: true })
        .catch(() => renderPdf(html, pdf, { warm: true }))
        .then(() => pdfPages(pdf));
      rendered.set(key, pages);
    }
    return { pages: await pages, pdf };
  };
  try {
    let fit: OnepagerFit = {};
    let { pages, pdf } = await render(fit);
    if (pages > 2) ({ pages, pdf } = await render((fit = { tight: true })));
    if (pages === 2) {
      const line = flatText(
        pdfPageText(pdf, 2)
          .split("\n")
          .find((l) => l.trim().length > 3) ?? "",
      );
      const index = topLevelBlocks(page.html).findIndex((block) => flatBlock(block).includes(line));
      if (!line || index < 0)
        throw new Error(`fitOnepager: no block of "${page.title}" holds page 2's first line`);
      // The header is .page's first child, the first block its second.
      fit = { ...fit, page2Start: index + 2 };
      const first = flatText(pdfPageText(pdf, 1));
      for (const kind of ["lift", "air"] as const) {
        const base = fit;
        for (const level of LEVELS) await files({ ...base, [kind]: level });
        const tries = await Promise.all(LEVELS.map((level) => render({ ...base, [kind]: level })));
        for (const [i, level] of LEVELS.entries()) {
          if (tries[i]!.pages !== 2 || flatText(pdfPageText(tries[i]!.pdf, 1)) !== first) break;
          fit = { ...fit, [kind]: level };
        }
      }
      ({ pages } = await render(fit));
    }
    return { html: readFileSync((await files(fit)).html, "utf8"), pages, fit };
  } finally {
    for (const { html } of renders.values()) rmSync(html, { force: true });
    rmSync(work, { recursive: true, force: true });
  }
}
