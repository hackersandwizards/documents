// composeOnepager: DocOnepager as a standalone page on its own stylesheet: the document tokens
// (tokens.css with the brand's tokens.css and print.css), the brand's list marker, document.css's
// list indent and wordmark
// rule, the scoped styles of DocHeader and DocCard, then onepager.css. Every
// `<div class="card ...">` in the body opens with DocCard's tag. `brand` is the brand package's
// folder as the page reaches it: the page opens from disk beside the installed package.
// fitOnepager owns the page balance: it renders the page and picks the fit (tight, lift, air).
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { escapeHtml, type openComposer } from "./compose";
import { ELEMENT_MAP, withElements } from "./elements";
import { brandFile, inlineCss, renderPdf } from "./render-pdf";

const ROOT = join(import.meta.dir, "..");

function rule(css: string, pattern: RegExp, what: string) {
  const found = css.match(pattern)?.[0];
  if (!found) throw new Error(`document.css: no ${what}`);
  return found;
}

/** The stylesheet ahead of the components' styles; the brand files inlined unless `link`. */
function baseCss(brand: string, link: boolean) {
  const documentCss = readFileSync(join(ROOT, "document.css"), "utf8");
  return [
    ...(link
      ? []
      : [
          readFileSync(brandFile("tokens.css"), "utf8").replace(/@theme\s*\{/, ":root {"),
          readFileSync(brandFile("print.css"), "utf8").replaceAll(
            'url("fonts/',
            `url("${brand}/tokens/fonts/`,
          ),
        ]),
    readFileSync(join(ROOT, "tokens.css"), "utf8").replace(/^@import [^;]+;\n/gm, ""),
    // DocHeader's tag and DocCard are the brand's pill and card; the rest of the page keeps its own
    // forms (brand-elements.json, exception "onepager").
    inlineCss(brandFile("elements.css")),
    // Every h&w document draws the identical list marker: the brand's rule, switched on in
    // tokens.css above, and the base's list indent, never a copy.
    readFileSync(brandFile("marker.css"), "utf8"),
    rule(documentCss, /^ul li \{[\s\S]*?^\}/m, "`ul li` rule holding the list indent"),
    // DocHeader sets its wordmark as HTML, outside its scoped styles: the base's rule sizes it.
    rule(documentCss, /^\.brand \.brand-name \.wordmark \{[\s\S]*?^\}/m, "wordmark rule"),
  ].join("\n");
}

/** The brand's tokens, faces and favicon as links, as every specimen page carries them. */
const linked = (
  brand: string,
) => `<link rel="icon" href="${brand}/logos/favicon.ico" sizes="32x32" />
<link rel="icon" href="${brand}/logos/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="${brand}/generated/tokens.root.css" />
<link rel="stylesheet" href="${brand}/tokens/print.css" />
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

/** The onepager as a standalone HTML page. `link` links the brand's tokens, faces and favicon instead of
 * inlining them, as the specimen does, so a brand release leaves the page current. */
export async function composeOnepager(
  composer: Awaited<ReturnType<typeof openComposer>>,
  page: OnepagerPage,
  brand: string,
  link = false,
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
    baseCss(brand, link),
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
${link ? linked(brand) : ""}<style data-hw-onepager>
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
export function topLevelBlocks(html: string): string[] {
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

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', nbsp: " " };
const flat = (text: string) =>
  text
    .replace(/<[^>]*>/g, " ")
    .replace(/&(#\d+|\w+);/g, (e, n: string) =>
      n.startsWith("#") ? String.fromCharCode(Number(n.slice(1))) : (ENTITIES[n] ?? e),
    )
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const pdfPages = (pdf: string) =>
  Number(execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/^Pages:\s+(\d+)/m)?.[1]);
const pdfPageText = (pdf: string, page: number) =>
  execFileSync("pdftotext", ["-f", `${page}`, "-l", `${page}`, pdf, "-"], { encoding: "utf8" });

/**
 * The onepager composed with the page balance that fits it: rendered once as it is; over two pages,
 * again under `tight`, the fallback for copy not yet cut; on two pages, each page's free space
 * spent between its blocks, page 1's after the hero (lift) and page 2's after its first one (air),
 * each at the widest level that keeps two pages and leaves page 1's text as it was. `dir` is the
 * folder the page is rendered from, where `brand` resolves. Returns the page count: a caller that
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
  const html = join(dir, `.onepager-fit-${work.split("-").pop()}.html`);
  const pdf = join(work, "fit.pdf");
  const render = async (fit: OnepagerFit) => {
    writeFileSync(html, await composeOnepager(composer, { ...page, fit }, brand));
    // Headless Chrome on macOS sometimes exits non-zero after writing the PDF: one retry.
    await renderPdf(html, pdf).catch(() => renderPdf(html, pdf));
    return pdfPages(pdf);
  };
  try {
    let fit: OnepagerFit = {};
    let pages = await render(fit);
    if (pages > 2) pages = await render((fit = { tight: true }));
    if (pages === 2) {
      const line = flat(
        pdfPageText(pdf, 2)
          .split("\n")
          .find((l) => l.trim().length > 3) ?? "",
      );
      const index = topLevelBlocks(page.html).findIndex((block) => flat(block).includes(line));
      if (!line || index < 0)
        throw new Error(`fitOnepager: no block of "${page.title}" holds page 2's first line`);
      // The header is .page's first child, the first block its second.
      fit = { ...fit, page2Start: index + 2 };
      const first = flat(pdfPageText(pdf, 1));
      for (const kind of ["lift", "air"] as const)
        for (const level of LEVELS) {
          const fits = (await render({ ...fit, [kind]: level })) === 2;
          if (!fits || flat(pdfPageText(pdf, 1)) !== first) break;
          fit = { ...fit, [kind]: level };
        }
      pages = await render(fit);
    }
    return { html: await composeOnepager(composer, { ...page, fit }, brand), pages, fit };
  } finally {
    rmSync(html, { force: true });
    rmSync(work, { recursive: true, force: true });
  }
}
