import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { decodeHTMLStrict } from "entities";
import { escapeHtml, type openComposer } from "./compose";
import { CARD_AND_TAG, type Edit, withElements } from "./elements";
import { languageTag } from "./fill";
import {
  brandFile,
  compactStyles,
  cutFacesToPdf,
  inlineCss,
  renderPdf,
  subsetFaces,
} from "./render-pdf";
import { ROOT } from "./root";

function rule(css: string, pattern: RegExp, what: string) {
  const found = css.match(pattern)?.[0];
  if (!found) throw new Error(`document.css: no ${what}`);
  return found;
}

/** A brand file's text, its path added to `read`. */
function brandText(file: string, read?: Set<string>) {
  const path = brandFile(file);
  read?.add(path);
  return readFileSync(path, "utf8");
}

const brandBaseOf = (read?: Set<string>) =>
  [
    brandText("tokens.root.css", read),
    // The faces as data URIs, resolved beside brand's exported print.css, as the document base
    // carries them: the page reaches no brand path and renders anywhere.
    inlineCss(brandFile("print.css"), read),
    inlineCss(brandFile("document.flat.css"), read),
  ].join("\n");

// The brand's tokens, faces and document scale, read once a process: a fit composes up to 13
// times, and the faces alone are about 0.3 MB to encode. A `read` set reads them again to fill it.
let inlinedBrand: string | undefined;
const brandBase = (read?: Set<string>) =>
  read ? brandBaseOf(read) : (inlinedBrand ??= brandBaseOf());

/** The stylesheet ahead of the components' styles; the brand files inlined unless `link`. Each
 * brand file it reads goes into `read`. */
function baseCss(link: boolean, read?: Set<string>) {
  const documentCss = readFileSync(join(ROOT, "document.css"), "utf8");
  return [
    ...(link ? [] : [brandBase(read)]),
    readFileSync(join(ROOT, "tokens.css"), "utf8").replace(/^@import [^;]+;\n/gm, ""),
    // The brand's elements, which ONEPAGER_ELEMENTS puts on the page's blocks.
    inlineCss(brandFile("elements.flat.css"), read),
    // Every h&w document draws the identical list marker: the brand's rule, switched on in
    // tokens.css above, and the base's list indent, never a copy.
    brandText("marker.css", read),
    rule(documentCss, /^ul li \{[\s\S]*?^\}/m, "`ul li` rule holding the list indent"),
    // The page number every document carries bottom right, the base's margin box.
    `@page onepager { ${rule(documentCss, /^ {2}@bottom-right \{[\s\S]*?^ {2}\}/m, "@bottom-right page number")} }`,
  ].join("\n");
}

let brandFiles: string[] | undefined;

/** Every brand file a render of the standalone onepager (composeOnepager without `link`, and so
 * fitOnepager) reads, as absolute paths, sorted: those baseCss reads, the faces among them, and
 * the lockup DocHeader inlines. A consumer hashes this list to tell whether a brand raise changes
 * its onepagers. Read once a process, as the brand base is. */
export function onepagerBrandFiles(): string[] {
  if (brandFiles) return [...brandFiles];
  const read = new Set([brandFile("logos/lockup-screen.svg")]);
  baseCss(false, read);
  return [...(brandFiles = [...read].sort())];
}

/** The brand's tokens, faces and favicon as links, as every type page in the catalog carries them;
 * `href` turns a file brand exports into its link. */
const linked = (
  href: (file: string) => string,
) => `<link rel="icon" href="${href("logos/favicon.ico")}" sizes="32x32" />
<link rel="icon" href="${href("logos/favicon.svg")}" type="image/svg+xml" />
<link rel="stylesheet" href="${href("tokens.root.css")}" />
<link rel="stylesheet" href="${href("print.css")}" />
<link rel="stylesheet" href="${href("document.flat.css")}" />
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
  /** The header's tag, DocOnepager's `kind`. */
  kind?: string;
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
  const lang = languageTag(page.lang);
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
    await composer.render("DocOnepager", { lang, kind: page.kind, html: page.html })
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
  return subsetFaces(
    compactStyles(`<!doctype html>
<html lang="${lang}" class="${fitClasses(page.fit)}" data-hw-scale="print">
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
`),
  );
}

const BOXES = [".cover-box", ".goals-box", ".proof-box", ".scope-box"];

/** The brand's elements on the onepager's blocks: DocCard and DocHeader's tag, the labels, the boxes
 * as callouts, the testimonial as a quote, the figures' chips as pills and the call link as a
 * button. The hero is night, so its claim takes the label's night colour. */
const ONEPAGER_ELEMENTS: Edit[] = [
  ...CARD_AND_TAG,
  [".hero", undefined, { "data-theme": "dark" }],
  [
    ".label, .hero > .claim, .price-label, .proof-label, .facts dt, .planning > h3, " +
      ".deliverable-banner > h3, .pricing-section > h3, .testimonial > cite, .references > strong, " +
      ".references-lead > strong",
    "hw-label",
  ],
  [".module > h3", "hw-label", { "data-hue": "purple" }],
  [".kpi-section > h3", "hw-label", { "data-tone": "ink" }],
  [
    [".facts .details dt", ".planning dt", ...BOXES.map((box) => `${box} > h3`)].join(", "),
    "hw-label",
    { "data-tone": "muted" },
  ],
  [BOXES.join(", "), "hw-callout"],
  [".testimonial", "hw-quote"],
  [".kpi-item", "hw-pill"],
  [".contact-footer a.button", "hw-button"],
  // An exception of the engine's own, listed with its reason in brand-elements.json.
  [".facts", undefined, { "data-hw-exception": "facts" }],
];

const VOID = /^(area|base|br|col|embed|hr|img|input|link|meta|source|track|wbr)$/i;

/** The top-level elements of an HTML fragment, each as its text, comments left out. Markup that
 * leaves an element open (an unclosed `<li>` or `<p>`) throws: its count would not be the page's. */
function topLevelBlocks(html: string): string[] {
  const blocks: string[] = [];
  let depth = 0;
  let start = 0;
  const markup = html.replace(/<!--[\s\S]*?-->/g, "");
  for (const m of markup.matchAll(/<(\/?)([a-z][\w-]*)[^>]*?(\/?)>/gi)) {
    const [tag, closing, name, selfClosing] = m;
    if (closing) {
      if (--depth === 0) blocks.push(markup.slice(start, m.index! + tag.length));
    } else if (!selfClosing && !VOID.test(name)) {
      if (depth++ === 0) start = m.index!;
    } else if (depth === 0) blocks.push(tag);
  }
  if (depth !== 0) throw new Error("fitOnepager: the copy leaves an element open; close every tag");
  return blocks;
}

/** A page's extracted text as its words, lower case, on single spaces. */
const flatText = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
/** Text as its letters and digits alone, case and ß folded: what a block's markup and its PDF text
 * share whatever spaces a tag leaves, or capitals and SS a label prints. */
const letters = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]/gu, "");
/** A block's markup as the letters its PDF text shows: tags dropped, every entity decoded once,
 * and only where it ends in `;`, as copy writes it. */
const flatBlock = (html: string) => letters(decodeHTMLStrict(html.replace(/<[^>]*>/g, " ")));

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
      // cost about 0.4 s each. One retry: a fresh-Chrome render sometimes exited non-zero on macOS,
      // and whether a kept one still does is not measured.
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
      const line = letters(
        pdfPageText(pdf, 2)
          .split("\n")
          .find((l) => l.trim().length > 3) ?? "",
      );
      // Page 2 opens on the first block holding its first line that page 1 does not hold whole: an
      // earlier block may hold the same words.
      const page1 = letters(pdfPageText(pdf, 1));
      const index = topLevelBlocks(page.html)
        .map(flatBlock)
        .findIndex((block) => block.includes(line) && !page1.includes(block));
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
      ({ pages, pdf } = await render(fit));
    }
    return {
      html: await cutFacesToPdf(readFileSync((await files(fit)).html, "utf8"), pdf),
      pages,
      fit,
    };
  } finally {
    for (const { html } of renders.values()) rmSync(html, { force: true });
    rmSync(work, { recursive: true, force: true });
  }
}
