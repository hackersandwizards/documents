import { type ChildProcess, execFile, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { rm } from "node:fs/promises";
import type { Readable, Writable } from "node:stream";
import { createRequire } from "node:module";
import { availableParallelism, hostname, tmpdir } from "node:os";
import { basename, dirname, isAbsolute, join, relative, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { inflateSync } from "node:zlib";
import { chromeArgs, chromeBinaryAsync, INSTALL_HINT } from "@hackersandwizards/scaffolding/chrome";
import { decodeHTML, decodeHTMLAttribute } from "entities";
import { compress, decompress } from "woff2-encoder";
import { withElements } from "./elements";
import { HANDOUT_TEXT } from "./handout";
import { editStyles, pruneStyles } from "./prune";
import { ROOT } from "./root";
import { foreignStyles, styleAttributes } from "./styles";

const execFileAsync = promisify(execFile);

/**
 * Runs in the printed copy. Chrome embeds every raster image at its source resolution: a 512 px
 * logo shown 22.5pt wide was 56 KB of a 129 KB quote (measured). Each image is redrawn at
 * three times its displayed size as PNG, or as the smaller of PNG and JPEG where the source is a
 * JPEG, and so is each raster an SVG image carries as a data URI, such as the wizard in brand's
 * full lockup, which printed at 512 px for 37 px shown (measured). Twice the size, or JPEG for an
 * opaque image, leaves the onepager's small raster client marks visibly soft at 200% zoom and in
 * print. A vector SVG, such as a client mark, prints as paths, inlined from a file or not.
 * A redrawn raster keeps its source's proportions, and its source's size where the page left the
 * size to the image, so nothing moves; the page's own CSS, print rules included, still sizes it.
 * An SVG keeps its viewBox and size. A raster image's new src is set from its own load event,
 * which holds the window's load, so the print waits for every redraw; work after load raced the
 * print (measured). An SVG's rasters decode asynchronously, so that work goes on
 * `globalThis.hwLayout`, which the print waits for; an SVG it cannot read prints as it is. A
 * document without a `<title>` takes its first heading's. It runs in a block, so a page script
 * declaring one of its names stops neither.
 */
const PRINT_JS = `{
if (!document.title) document.title = document.querySelector("h1")?.textContent?.trim() ?? "";
const redraw = (source, src, scale) => {
  if (!(scale > 0 && scale < 1)) return;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
  canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
  const png = canvas.toDataURL("image/png");
  if (!/^data:image\\/jpeg|\\.jpe?g($|[?#])/i.test(src)) return png;
  const jpeg = canvas.toDataURL("image/jpeg", 0.9);
  return jpeg.length < png.length ? jpeg : png;
};
const keep = (img) => {
  if (getComputedStyle(img).aspectRatio.startsWith("auto"))
    img.style.aspectRatio = img.naturalWidth + " / " + img.naturalHeight;
  img.srcset = "";
};
const svgText = (src) => {
  const comma = src.indexOf(",");
  const data = src.slice(comma + 1);
  if (!/;base64/i.test(src.slice(0, comma))) return decodeURIComponent(data);
  return new TextDecoder().decode(Uint8Array.from(atob(data), (c) => c.charCodeAt(0)));
};
const svgRasters = async (img, rect) => {
  const doc = new DOMParser().parseFromString(svgText(img.currentSrc), "image/svg+xml");
  const box = doc.documentElement.viewBox?.baseVal;
  if (!box?.width || !box.height) return;
  const unit = Math.min(rect.width / box.width, rect.height / box.height);
  let changed = false;
  for (const image of doc.querySelectorAll("image")) {
    const href = image.getAttribute("href") ?? image.getAttribute("xlink:href") ?? "";
    if (!/^data:image\\/(png|jpeg|webp|gif)/i.test(href)) continue;
    const raster = new Image();
    raster.src = href;
    await raster.decode();
    const url = redraw(raster, href, Math.max((3 * unit * image.width.baseVal.value) / raster.naturalWidth, (3 * unit * image.height.baseVal.value) / raster.naturalHeight));
    if (!url) continue;
    image.removeAttribute("xlink:href");
    image.setAttribute("href", url);
    changed = true;
  }
  if (!changed) return;
  img.srcset = "";
  img.src = "data:image/svg+xml," + encodeURIComponent(new XMLSerializer().serializeToString(doc));
  await img.decode();
};
for (const img of document.images) {
  const shrink = () => {
    if ("printScaled" in img.dataset || !img.naturalWidth) return;
    img.dataset.printScaled = "";
    const rect = img.getBoundingClientRect();
    if (/^data:image\\/svg/i.test(img.currentSrc)) {
      (globalThis.hwLayout ??= []).push(svgRasters(img, rect).catch(() => {}));
      return;
    }
    if (/\\.svg($|[?#])/i.test(img.currentSrc)) return;
    const contain = getComputedStyle(img).objectFit === "contain";
    // A box object-fit fills or covers needs the larger side; contain the smaller.
    const fit = contain ? Math.min : Math.max;
    const scale = fit((3 * rect.width) / img.naturalWidth, (3 * rect.height) / img.naturalHeight);
    let url;
    // A file:// image the render could not inline taints the canvas; it prints at its source size.
    try { url = redraw(img, img.currentSrc, scale); } catch { return; }
    if (!url) return;
    keep(img);
    img.src = url;
  };
  if (img.complete) shrink(); else img.addEventListener("load", shrink, { once: true });
}
}`;
const PRINT_SCRIPT = `<script>${PRINT_JS}</script>`;
/** The print copy's policy: a page draws from its own folder, the package's files and data URIs,
 *  and runs its inline scripts, but frames nothing and reaches no host, so a body naming a local
 *  file in a frame or a remote image prints neither. */
const PRINT_POLICY = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' file: data:; img-src file: data: blob:; font-src file: data:; media-src file: data:">`;
/** The same for a page served over HTTP, which the render cannot edit: run before the page's own
 * scripts, it waits for the parsed document, whose images then hold the window's load as above. */
const PRINT_ON_NEW_DOCUMENT = `document.addEventListener("DOMContentLoaded", () => {${PRINT_JS}}, { once: true });`;

/** How `inlineImages` takes a page: `within`, the folder a file beside the page must resolve into,
 * symlinks followed (a viewer of stored pages passes its root); `keepMissing` leaves a package src
 * its package does not export as it is instead of throwing, so a viewer shows its alt text. */
export type InlineImagesOptions = { within?: string; keepMissing?: boolean };

/** Each package image as a data URI, read once: an installed package does not change while the
 * process runs, and a viewer inlines the same marks on every request. */
const packageImages = new Map<string, string>();
/** A src naming a file one of our packages exports, its package name captured. */
const PACKAGE_SRC = /^(@hackersandwizards\/[^/]+)\//;
/** Resolves a package path from where this package is installed. */
const packageRequire = createRequire(import.meta.url);
/** The MIME type by extension, the images `inlineImages` takes, so the export needs no Bun. */
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
};
/** A src naming a file: no scheme, no absolute path, a known image type; its query and fragment
 * aside, which a file:// load ignores. */
const IMAGE_FILE = new RegExp(
  `^([^:/#?][^:#?]*?\\.(${Object.keys(IMAGE_TYPES).join("|")}))(?:[?#][^:]*)?$`,
  "i",
);
/** A file Git LFS has not fetched holds this pointer instead of the image. */
const LFS_POINTER = Buffer.from("version https://git-lfs.github.com/spec/v1\n");
/** `bytes` as a data URI, or undefined for a Git LFS pointer. */
const dataUri = (ext: string, bytes: Buffer) =>
  bytes.subarray(0, LFS_POINTER.length).equals(LFS_POINTER)
    ? undefined
    : `data:${IMAGE_TYPES[ext.toLowerCase()]};base64,${bytes.toString("base64")}`;

/** `html` with each `<img>` whose src is an image file beside it, or a file one of our packages
 * exports (`@hackersandwizards/testimonials/marks/...`, which the stored page names instead of
 * carrying), resolved from where this package is installed, as a data URI. The print and a consumer's
 * viewer of stored pages both call it: a file:// image taints the canvas PRINT_JS redraws it on, so
 * it printed at its source size, an SVG file's rasters are redrawn only from a data URI, and a
 * sandboxed iframe resolves neither path. A package src its package does not export, or exports as
 * a Git LFS pointer, throws, so a print fails rather than print without the image. A file beside
 * the page that cannot be read (missing, a folder, no permission) or is a Git LFS pointer stays as
 * it is, so the page shows its alt text. */
export function inlineImages(html: string, dir: string, options: InlineImagesOptions = {}): string {
  const root = options.within === undefined ? undefined : realpathSync(options.within);
  /** The data URI for one src, or undefined to leave the tag as it is. */
  const inline = (src: string): string | undefined => {
    const [, name = "", ext = ""] = IMAGE_FILE.exec(src) ?? [];
    if (!name) return undefined;
    let file: string;
    try {
      file = decodeURIComponent(name);
    } catch {
      return undefined;
    }
    let uri = packageImages.get(file);
    const pkg = PACKAGE_SRC.exec(file)?.[1];
    if (uri === undefined && pkg !== undefined) {
      let cause: unknown;
      try {
        // A `..` segment would leave the package, so the package exports no such file.
        if (!file.split("/").includes(".."))
          uri = dataUri(ext, readFileSync(packageRequire.resolve(file)));
      } catch (error) {
        cause = error;
      }
      if (uri === undefined) {
        if (options.keepMissing) return undefined;
        throw new Error(
          `inlineImages: ${pkg} exports no image ${src}${cause ? "" : ", only its Git LFS pointer"}`,
          { cause },
        );
      }
      packageImages.set(file, uri);
      return uri;
    }
    if (uri !== undefined) return uri;
    const path = join(dir, file);
    try {
      if (root !== undefined) {
        const inside = relative(root, realpathSync(path));
        if (inside === ".." || inside.startsWith(`..${sep}`) || isAbsolute(inside))
          return undefined;
      }
      return dataUri(ext, readFileSync(path));
    } catch {
      return undefined;
    }
  };
  // Read as the browser parses the page: any quoting or spacing, a `>` inside an attribute, a
  // tag only inside a comment or as text left alone.
  let failure: unknown;
  const out = new HTMLRewriter()
    .on("img[src]", {
      element(el) {
        if (failure !== undefined) return;
        try {
          const uri = inline(decodeHTMLAttribute(el.getAttribute("src")!.trim()));
          if (uri !== undefined) el.setAttribute("src", uri);
        } catch (error) {
          failure = error;
        }
      },
    })
    .transform(html);
  if (failure !== undefined) throw failure;
  return out;
}

/** The print settings. Chrome tags the PDF without being asked; the outline needs the flag. */
const PRINT_PARAMS = {
  displayHeaderFooter: false,
  printBackground: true,
  generateDocumentOutline: true,
  generateTaggedPDF: true,
  preferCSSPageSize: true,
};

/**
 * Two renders of one input differ in two places, both rewritten here to the same length, which
 * keeps the cross-reference offsets. Chrome stamps the render time as `/CreationDate` and
 * `/ModDate` (42 PDF pairs, measured): both are blanked, since a document's date is in
 * its text, never in its metadata. And Chrome names each table header cell in the structure tree
 * `node` plus Blink's DOM node id, a counter other nodes draw on first: in a cold Chrome the quote's
 * ids started at 51, 52 or 53 (20 renders measured; images, CSS, favicons and a wait
 * before the print changed nothing, a warm Chrome printed one variant). Each id becomes its rank,
 * so the order the ID tree is sorted by stays.
 */
const stableBytes = (pdf: Buffer): Buffer => {
  const text = pdf.toString("latin1");
  const ids = [...text.matchAll(/\/ID \(node(\d+)\)/g)].map(([, id]) => +id!);
  const rank = new Map(ids.sort((a, b) => a - b).map((id, i) => [id, i + 1]));
  // Only where the structure tree names or cites a header cell: a heading reading "node22" stays.
  const renumber = (entry: string) =>
    entry.replace(
      /\(node(\d+)\)/g,
      (_, id: string) => `(node${String(rank.get(+id) ?? +id).padStart(id.length, "0")})`,
    );
  return Buffer.from(
    text
      .replace(/\/(?:CreationDate|ModDate) \(D:\d{14}[^)]{0,8}\)/g, (entry) =>
        " ".repeat(entry.length),
      )
      .replace(/\/ID \(node\d+\)|\/(?:Headers|Names|Limits) \[[^\]]*\]/g, renumber),
    "latin1",
  );
};

/**
 * A page whose layout runs after load, such as a measurement once the faces are in, puts the
 * promise of that work on `globalThis.hwLayout`, an array the first such script creates. The print
 * waits for every one, and a layout still pending at the timeout fails the render instead of
 * printing it half done. Chrome's `--print-to-pdf` printed at load, before the handout's
 * `document.fonts.ready` work in 2 of 8 runs (measured), so no render uses it. The
 * faces need no wait: inlined, they printed in 72 of 72 renders, 8 in parallel with every core
 * busy, a face first asked for after load included; a face taking 10 s over HTTP after load
 * printed the fallback, which assertBrandFonts fails (measured).
 */
const LAYOUT = "Promise.all(globalThis.hwLayout ?? []).then(() => true)";

/** The error message for a URL whose server refused the connection, worded like a bad status. */
const refused = (url: string) => `${url} refused the connection: is its server running?`;

type RenderOptions = { timeoutMs?: number; warm?: boolean };

/**
 * Prints an HTML file, or a page an `http:` or `https:` URL serves, to PDF. `warm` prints in a
 * Chrome kept running for the next call, for a long-running caller such as an app route: a cold
 * Chrome costs about 0.55 s a render, the kept one about 0.1 s (measured). It quits
 * after a minute without a render, and with the caller.
 */
export async function renderPdf(
  htmlPath: string,
  pdfPath: string,
  options: RenderOptions = {},
): Promise<void> {
  // A failed render must not leave a PDF from an earlier one in place.
  rmSync(pdfPath, { force: true });
  const chrome = await chromeBinaryAsync();
  if (!chrome) throw new Error(INSTALL_HINT);
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (/^https?:\/\//.test(htmlPath)) {
    const pdf = options.warm
      ? await keptChrome(chrome).print(htmlPath, timeoutMs, PRINT_ON_NEW_DOCUMENT)
      : await coldPrint(chrome, htmlPath, timeoutMs, PRINT_ON_NEW_DOCUMENT);
    writeFileSync(pdfPath, pdf);
    return;
  }
  const html = inlineImages(readFileSync(htmlPath, "utf-8"), dirname(htmlPath));
  // Beside the input, so relative resources resolve; the stored HTML stays free of the script. A
  // name per call, since a render that finishes deletes its file while another may still load it.
  const printPath = join(dirname(htmlPath), `.${basename(htmlPath)}.${randomUUID()}.print.html`);
  // The policy opens the head; on a page without one it follows the html tag or the doctype, since
  // anything ahead of the doctype switches Chrome into quirks mode.
  const at = [/<head\b[^>]*>/i, /<html\b[^>]*>/i, /<!doctype\b[^>]*>/i]
    .map((tag) => tag.exec(html))
    .find(Boolean);
  const end = at ? at.index + at[0].length : 0;
  const guarded = html.slice(0, end) + PRINT_POLICY + html.slice(end);
  const close = guarded.lastIndexOf("</body>");
  writeFileSync(
    printPath,
    close < 0
      ? guarded + PRINT_SCRIPT
      : guarded.slice(0, close) + PRINT_SCRIPT + guarded.slice(close),
  );
  const url = pathToFileURL(printPath).href;
  try {
    const pdf = options.warm
      ? await keptChrome(chrome).print(url, timeoutMs)
      : await coldPrint(chrome, url, timeoutMs);
    writeFileSync(pdfPath, pdf);
  } finally {
    rmSync(printPath, { force: true });
  }
}

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
  options: RenderOptions & {
    /** @deprecated The word is read from the page; a given one replaces that read. */
    chapterLabel?: string;
  } = {},
): Promise<HandoutResult> {
  const dir = typeof source === "string" ? undefined : mkdtempSync(join(tmpdir(), "hw-handout-"));
  let renders = 0;
  let label = options.chapterLabel;
  const render = async (pass: HandoutPass) => {
    renders++;
    if (typeof source === "string") {
      const url = new URL(source);
      if (pass.toc) url.searchParams.set("toc", pass.toc.join(","));
      if (pass.flow) url.searchParams.set("flow", pass.flow);
      if (pass.notes) url.searchParams.set("notes", pass.notes);
      if (label === undefined) {
        const page = await fetch(url, {
          signal: AbortSignal.timeout(options.timeoutMs ?? 60_000),
        }).catch((error: unknown) => {
          const reason =
            // Bun's fetch sets the code on the error, Node's on its cause.
            [error, (error as Error).cause].some(
              (e) => (e as { code?: string } | undefined)?.code === "ECONNREFUSED",
            )
              ? refused(url.href)
              : `${url.href} could not be fetched: ${(error as Error).message}`;
          throw new Error(`renderHandoutPdf: ${reason}`, { cause: error });
        });
        if (!page.ok) throw new Error(`renderHandoutPdf: ${url.href} answered ${page.status}`);
        label = chapterLabelOf(await page.text());
      }
      return renderPdf(url.href, pdfPath, options);
    }
    const file = join(dir!, "handout.html");
    const html = await source(pass);
    label ??= chapterLabelOf(html);
    // The page is written to a temp folder, so its relative images are read from here first.
    writeFileSync(file, inlineImages(html, process.cwd()));
    return renderPdf(file, pdfPath, options);
  };
  const pagesOf = () => chapterPages(pdfPath, label!.trim());
  try {
    await render({});
    let toc = pagesOf();
    // A chapter that runs on changes where it ends, so the one after it is judged on the next pass.
    let flow: number[] = [];
    for (let pass = 0; toc && pass < 6; pass++) {
      const more = flowing(pdfPath, toc, flow).filter((chapter) => !flow.includes(chapter));
      const take = more.filter((chapter) => !more.includes(chapter - 1));
      if (!take.length) break;
      flow = [...flow, ...take].sort((a, b) => a - b);
      await render({ flow: flow.join(",") });
      toc = pagesOf();
    }
    const flowed = flow.length ? flow.join(",") : undefined;
    if (!toc)
      return {
        numbered: false,
        flow,
        renders,
        warning:
          "pdftotext (poppler) missing or no chapter eyebrow found: the contents prints without page numbers and every chapter opens a page",
      };
    const pages = toc.at(-1)!;
    const lines = notesFit(pdfPath, pages);
    if (lines) {
      await render({ flow: flowed, toc: [...toc.slice(0, -1), pages - 1], notes: `${lines}` });
      // A notes block that did not fit would have taken a page of its own again.
      if (pagesOf()?.at(-1) === pages - 1) return { numbered: true, flow, notes: lines, renders };
    }
    await render({ flow: flowed, toc });
    return { numbered: true, flow, renders };
  } finally {
    if (dir) rmSync(dir, { recursive: true, force: true });
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
  return value.replace(/\\(?:([\da-f]{1,6}) ?|(.))/gi, (_, hex?: string, char?: string) =>
    hex ? String.fromCodePoint(parseInt(hex, 16)) : char!,
  );
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
    const single = toc[i + 1]! - (flow.includes(i + 2) ? 0 : 1) === start;
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

/**
 * A child process kept for the next call: started on first use, holding the caller open only while
 * a call is in flight, stopped after a minute idle and when the caller exits. On globalThis, so a
 * dev server re-evaluating this module finds the running one instead of starting another.
 */
const IDLE_MS = 60_000;
const STOP_MS = 2_000;
type Kept<T> = { api: T; busy(delta: number): void };
function kept<T>(
  key: string,
  start: (stop: () => void) => { child: ChildProcess; api: T; cleanup?: () => void },
): Kept<T> {
  const store = ((globalThis as Record<symbol, Map<string, Kept<unknown>>>)[
    Symbol.for("@hackersandwizards/documents/kept")
  ] ??= new Map());
  const found = store.get(key) as Kept<T> | undefined;
  if (found) return found;
  let inFlight = 0;
  let idle: ReturnType<typeof setTimeout> | undefined;
  // Chrome writes its profile while it shuts down, so the cleanup waits for the exit: removed at
  // once, a profile was left behind in 1 of 10 runs (measured). The caller's `exit`
  // cannot wait, so `beforeExit` stops the child first and holds the caller until it is gone;
  // `exit` remains for a caller ending by process.exit.
  const stop = () => {
    if (store.get(key) !== entry) return;
    store.delete(key);
    clearTimeout(idle);
    process.off("beforeExit", stop);
    process.off("exit", atExit);
    child.kill();
    if (child.pid === undefined || child.exitCode !== null || child.signalCode !== null)
      cleanup?.();
    else {
      // A child stuck on SIGTERM is killed outright; a caller exiting meanwhile still cleans up.
      const force = setTimeout(() => child.kill("SIGKILL"), STOP_MS);
      const onExit = () => cleanup?.();
      process.once("exit", onExit);
      child.ref();
      child.once("exit", () => {
        clearTimeout(force);
        process.off("exit", onExit);
        cleanup?.();
      });
    }
  };
  const { child, api, cleanup } = start(stop);
  const handles = () =>
    [child, ...child.stdio].filter(Boolean) as { ref?(): void; unref?(): void }[];
  child.on("exit", stop);
  // A child that never started emits only `error`.
  child.on("error", stop);
  const atExit = () => {
    stop();
    cleanup?.();
  };
  process.on("beforeExit", stop);
  process.on("exit", atExit);
  const entry: Kept<T> = {
    api,
    busy(delta) {
      if (store.get(key) !== entry) return;
      inFlight += delta;
      clearTimeout(idle);
      for (const h of handles()) (inFlight > 0 ? h.ref : h.unref)?.call(h);
      if (inFlight === 0) (idle = setTimeout(stop, IDLE_MS)).unref?.();
    },
  };
  store.set(key, entry);
  entry.busy(0);
  return entry;
}

// A caller whose exit runs no handler, as `bun test` does, leaves its kept Chrome's profile behind,
// and a Chrome killed outright leaves its SingletonLock in it too. A profile an hour old that no
// running Chrome holds is removed; a younger one may be starting and has no lock yet.
const PROFILE = "hw-chrome-";
const STALE_PROFILE_MS = 3_600_000;
let profilesSwept = 0;

/** Whether a running Chrome holds the profile: its SingletonLock names `<host>-<pid>`, and a lock
 * naming another host counts as held. */
function profileHeld(profile: string): boolean {
  let lock: string;
  try {
    lock = readlinkSync(join(profile, "SingletonLock"));
  } catch {
    return false;
  }
  const [, host, pid] = /^(.*)-(\d+)$/.exec(lock) ?? [];
  if (host !== hostname()) return true;
  try {
    process.kill(Number(pid), 0);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException).code === "EPERM";
  }
}

/** Removes, at most once an hour and without waiting, each of our profiles in the temporary
 * folder that no Chrome holds. A profile it cannot read is left. */
function removeLeftProfiles() {
  if (Date.now() - profilesSwept < STALE_PROFILE_MS) return;
  profilesSwept = Date.now();
  const root = tmpdir();
  for (const name of readdirSync(root).filter((n) => n.startsWith(PROFILE))) {
    const profile = join(root, name);
    try {
      const made = lstatSync(profile).mtimeMs;
      if (Date.now() - made > STALE_PROFILE_MS && !profileHeld(profile))
        rm(profile, { recursive: true, force: true }).catch(() => {});
    } catch {}
  }
}

/** A Chrome driven over its own debugging pipe (fd 3 in, fd 4 out), which no other process can
 * reach, unlike a debugging port, in its own temporary profile, so a render never runs inside, or
 * locks, the user's own Chrome profile. */
function pipeChrome(chrome: string, hung?: () => void) {
  removeLeftProfiles();
  const profile = mkdtempSync(join(tmpdir(), PROFILE));
  const child = spawn(chrome, [...chromeArgs(profile), "--remote-debugging-pipe", "about:blank"], {
    stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"],
  });
  // Both pipes are missing when Chrome did not start; its `error` below then rejects every call.
  const input = child.stdio[3] as Writable | undefined;
  const output = child.stdio[4] as Readable | undefined;
  let id = 0;
  let buffer = "";
  let gone = false;
  // A CDP result: each call below reads the fields its method returns.
  type Result = Record<string, string>;
  type Pending = { resolve(r: Result): void; reject(e: Error): void; sessionId?: string };
  const calls = new Map<number, Pending>();
  const loads = new Map<string, Omit<Pending, "sessionId">>();
  output?.setEncoding("utf8");
  output?.on("data", (chunk: string) => {
    buffer += chunk;
    // The buffer holds no end before this chunk, so a large PDF's chunks are scanned once each.
    if (!chunk.includes("\0")) return;
    for (let end = buffer.indexOf("\0"); end >= 0; end = buffer.indexOf("\0")) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      const call = calls.get(message.id);
      if (call) {
        calls.delete(message.id);
        if (message.error) call.reject(new Error(message.error.message));
        else call.resolve(message.result);
      } else if (message.method === "Page.loadEventFired")
        loads.get(message.sessionId)?.resolve({});
    }
  });
  const exited = new Promise<void>((resolve) => {
    const fail = (error?: Error) => {
      gone = true;
      for (const call of [...calls.values(), ...loads.values()])
        call.reject(error ?? new Error("Chrome exited"));
      calls.clear();
      loads.clear();
      resolve();
    };
    child.on("exit", () => fail());
    child.on("error", fail);
  });
  // A write to a Chrome that has gone fails with EPIPE; its exit above rejects the call.
  input?.on("error", () => {});
  const send = (method: string, params: object = {}, sessionId?: string): Promise<Result> =>
    new Promise((resolve, reject) => {
      if (gone) return reject(new Error("Chrome exited"));
      calls.set(++id, { resolve, reject, sessionId });
      input?.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    });
  // The page a print opened, so a timeout closes that page alone.
  type Page = { targetId?: string; sessionId?: string };
  const open = async (page: Page, url: string, script?: string): Promise<Buffer> => {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    page.targetId = targetId;
    try {
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      page.sessionId = sessionId;
      await send("Page.enable", {}, sessionId);
      if (script)
        await send("Page.addScriptToEvaluateOnNewDocument", { source: script }, sessionId);
      const loaded = new Promise<Result>((resolve, reject) =>
        loads.set(sessionId, { resolve, reject }),
      );
      // A navigate that fails first never reaches `await loaded`, which then rejects unawaited.
      loaded.catch(() => {});
      const { errorText } = await send("Page.navigate", { url }, sessionId);
      if (errorText) {
        loads.delete(sessionId);
        throw new Error(
          errorText === "net::ERR_CONNECTION_REFUSED"
            ? refused(url)
            : `Chrome could not load ${url}: ${errorText}`,
        );
      }
      await loaded;
      loads.delete(sessionId);
      // Chrome prints an error page the server sent as if it were the document.
      const { result } = (await send(
        "Runtime.evaluate",
        {
          expression: `performance.getEntriesByType("navigation")[0]?.responseStatus ?? 0`,
          returnByValue: true,
        },
        sessionId,
      )) as unknown as { result: { value: number } };
      if (result.value >= 400) throw new Error(`${url} answered HTTP ${result.value}`);
      const { exceptionDetails } = (await send(
        "Runtime.evaluate",
        { expression: LAYOUT, awaitPromise: true },
        sessionId,
      )) as unknown as {
        exceptionDetails?: { text: string; exception?: { description?: string } };
      };
      if (exceptionDetails)
        throw new Error(
          `The layout of ${url} failed: ${exceptionDetails.exception?.description ?? exceptionDetails.text}`,
        );
      const { data } = await send("Page.printToPDF", PRINT_PARAMS, sessionId);
      return stableBytes(Buffer.from(data, "base64"));
    } finally {
      await send("Target.closeTarget", { targetId }).catch(() => {});
    }
  };
  /** A timed-out print's page closed and its pending calls failed, the other pages left running;
   * a Chrome that does not close it within STOP_MS is hung and stopped (`hung`, else killed). */
  const abandon = async ({ targetId, sessionId }: Page, error: Error) => {
    for (const [key, call] of calls)
      if (sessionId !== undefined && call.sessionId === sessionId) {
        calls.delete(key);
        call.reject(error);
      }
    if (sessionId) loads.get(sessionId)?.reject(error);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const closed = targetId
      ? await Promise.race([
          send("Target.closeTarget", { targetId }).then(
            () => true,
            () => false,
          ),
          new Promise<boolean>((resolve) => (timer = setTimeout(resolve, STOP_MS, false))),
        ])
      : false;
    clearTimeout(timer);
    if (!closed) (hung ?? (() => child.kill()))();
  };
  const print = (url: string, timeoutMs: number, script?: string): Promise<Buffer> => {
    const page: Page = {};
    return printWithin(
      open(page, url, script),
      url,
      timeoutMs,
      (error) => void abandon(page, error),
    );
  };
  return { child, exited, print, cleanup: () => rmSync(profile, { recursive: true, force: true }) };
}

async function printWithin(
  print: Promise<Buffer>,
  url: string,
  timeoutMs: number,
  stop: (error: Error) => void,
): Promise<Buffer> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  // The print's own rejection, once the timeout has answered, is no unhandled one.
  print.catch(() => {});
  try {
    return await Promise.race([
      print,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          const error = new Error(
            `Chrome did not print ${url} within ${timeoutMs} ms: Chrome hung, or a layout on globalThis.hwLayout never finished`,
          );
          stop(error);
          reject(error);
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function coldPrint(
  chrome: string,
  url: string,
  timeoutMs: number,
  script?: string,
): Promise<Buffer> {
  const browser = pipeChrome(chrome);
  try {
    return await browser.print(url, timeoutMs, script);
  } finally {
    browser.child.kill();
    // A Chrome stuck on SIGTERM is killed outright, as the kept one is.
    const force = setTimeout(() => browser.child.kill("SIGKILL"), STOP_MS);
    await browser.exited;
    clearTimeout(force);
    browser.cleanup();
  }
}

function keptChrome(chrome: string) {
  const entry = kept(chrome, (stop) => {
    const { child, print, cleanup } = pipeChrome(chrome, stop);
    return { child, api: { print }, cleanup };
  });
  return {
    async print(url: string, timeoutMs: number, script?: string): Promise<Buffer> {
      entry.busy(1);
      try {
        // A hung Chrome is stopped and replaced on the next call.
        return await entry.api.print(url, timeoutMs, script);
      } finally {
        entry.busy(-1);
      }
    },
  };
}

/**
 * The document base `document.css` as one stylesheet: each `@import` inlined (the brand files from
 * `@hackersandwizards/brand`, its `tokens.css` as its `:root` twin `tokens.root.css`), `@theme`
 * read as `:root`, and every face a data URI resolved beside the file that names it, so the HTML
 * it lands in renders anywhere.
 */
export function documentCss(): string {
  const css = inlineCss(join(ROOT, "document.css"));
  // The HTML parser ends a style element at this text even inside a CSS comment.
  if (/<\/style/i.test(css)) throw new Error("document.css must not contain </style");
  return css;
}

/** The brand files alone, tokens, print faces, the document scale, the list marker, the key figure, the rule and the strip, for a layout that is not a document page, such as the survey deck. */
export function brandCss(): string {
  return [
    "tokens.root.css",
    "print.css",
    "document.flat.css",
    "marker.css",
    "elements/kpi.css",
    "elements/rule.css",
    "elements/strip.css",
  ]
    .map((f) => inlineCss(brandFile(f)))
    .join("\n");
}

const BRAND = "@hackersandwizards/brand/";
// brand's tokens.css holds Tailwind's @theme forms (`static`, `--*: initial`), which a browser
// skips: a page without Tailwind takes brand's generated :root twin.
const BRAND_ROOT: Record<string, string> = { [`${BRAND}tokens.css`]: `${BRAND}tokens.root.css` };

/** A file the brand package exports, such as `tokens.css`, as an absolute path. */
export const brandFile = (file: string) => packageRequire.resolve(BRAND + file);

/** CSS without comments, its strings untouched. The space after one goes only where a space,
 * brace or semicolon comes before it: elsewhere it may part two selectors. */
const stripComments = (css: string) =>
  css.replace(
    /("[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')|(^|[\s{};])\/\*[\s\S]*?\*\/\s*|\/\*[\s\S]*?\*\//g,
    (_, string?: string, before?: string) => string ?? before ?? "",
  );

/** A stylesheet with its `@import`s inlined and its comments dropped, as documentCss and brandCss
 * export it (compactStyles strips the pages these never reach). Each file it reads, the faces
 * included, goes into `read`. */
export function inlineCss(path: string, read?: Set<string>): string {
  const dir = dirname(path);
  read?.add(path);
  return stripComments(readFileSync(path, "utf-8"))
    .replace(/@import "([^"]+)";/g, (_, file: string) =>
      inlineCss(
        file.startsWith("@")
          ? createRequire(path).resolve(BRAND_ROOT[file] ?? file)
          : join(dir, file),
        read,
      ),
    )
    .replace(/@theme\s*\{/g, ":root {")
    .replace(/url\("(fonts\/[^"]+)"\)/g, (_, file: string) => {
      const face = join(dir, file);
      read?.add(face);
      return `url(data:font/woff2;base64,${readFileSync(face).toString("base64")})`;
    });
}

/** A code point from a CSS or JS escape; one past U+10FFFF is no character. */
const escaped = (match: string, hex: string) => {
  const point = parseInt(hex, 16);
  return point <= 0x10ffff ? String.fromCodePoint(point) : match;
};

/** Every character a page can print: its markup and scripts with entities, CSS and JS escapes
 * decoded, each in both cases of the page's `lang` for `text-transform` (Turkish prints i as İ), its base64
 * data URIs aside. A character a script builds from computed values is not seen: its face is
 * dropped and the PDF prints a fallback, which assertBrandFonts fails. */
function printableCodePoints(html: string): Set<number> {
  const tag = /<html\b[^>]*?\slang\s*=\s*["']?([\w-]+)/i.exec(html)?.[1] ?? "en";
  // An invalid tag such as de_DE, on which toLocaleUpperCase throws, cases as English.
  const lang = (() => {
    try {
      return Intl.getCanonicalLocales(tag)[0]!;
    } catch {
      return "en";
    }
  })();
  const text = decodeHTML(
    html.replace(
      /data:[\w.+-]+\/[\w.+-]+(?:;[\w.=-]+)*;base64,[\w+/=]+|data:image\/svg\+xml,[^"'\s)]*/g,
      "",
    ),
  )
    .replace(/\\([\da-f]{1,6})\s?/gi, escaped)
    .replace(/\\u(?:\{([\da-f]{1,6})\}|([\da-f]{4}))/gi, (match, braced?: string, four?: string) =>
      escaped(match, (braced ?? four)!),
    );
  const points = new Set<number>();
  for (const c of new Set(text))
    for (const form of [c, c.toLocaleUpperCase(lang), c.toLocaleLowerCase(lang)])
      for (const p of form) points.add(p.codePointAt(0)!);
  return points;
}

/** Each `@font-face` rule of a page's style elements, kept, rewritten or dropped ("") by `edit`. */
const editFaces = (html: string, edit: (face: string) => string) =>
  editStyles(html, (css) => css.replace(/@font-face\s*\{[^}]*\}\s*/g, edit));

/** A page's style elements with each `@layer` order statement dropped that names only layers
 * declared before it: only a layer's first mention places it, and a page joining several brand
 * files can repeat the order. */
function layerOnce(html: string): string {
  const seen = new Set<string>();
  return editStyles(html, (css) =>
    css.replace(/@layer\s+([\w.,\s-]+?)\s*([;{])/g, (at, names: string, end: string) => {
      const layers = names.split(",").map((n) => n.trim());
      const fresh = layers.some((n) => !seen.has(n));
      for (const n of layers) seen.add(n);
      return end === "{" || fresh ? at : "";
    }),
  );
}

/**
 * A standalone page as it leaves the engine: its style elements without comments, which a reader
 * of the page never needs, without the rules and custom properties its markup cannot use
 * (pruneStyles), and without each face whose `unicode-range` holds no character of the
 * page, which Chrome never loads there: brand's latin-ext, arrow and box-drawing faces were about
 * 260 KB of every page (measured).
 */
export function compactStyles(html: string): string {
  const bare = pruneStyles(layerOnce(editStyles(html, stripComments)));
  const points = [...printableCodePoints(bare)];
  return editFaces(bare, (face) => {
    const range = /unicode-range:\s*([^;}]+)/.exec(face)?.[1];
    if (!range) return face;
    const spans = range.split(",").map((r): [number, number] => {
      const [lo = "", hi = lo] = r.trim().replace(/^U\+/i, "").split("-");
      return [parseInt(lo.replace(/\?/g, "0"), 16), parseInt(hi.replace(/\?/g, "f"), 16)];
    });
    return points.some((p) => spans.some(([lo, hi]) => p >= lo && p <= hi)) ? face : "";
  });
}

/** subset-font (HarfBuzz) ships no types; this is the call subsetFaces makes. woff2-encoder, not
 * subset-font's wawoff2, decodes and encodes: wawoff2 drops the glyph overlap flag FreeType
 * anti-aliases by. */
const subsetFont = packageRequire("subset-font") as (
  font: Buffer,
  text: string,
  options: { targetFormat: "truetype" },
) => Promise<Uint8Array>;

/** Printable ASCII, which a page's counters, list numbers and hyphenation may print without its
 * text holding it, beside the hyphen, ellipsis and quotes Chrome may set in their place. */
const ALWAYS = String.fromCodePoint(
  ...Array.from({ length: 0x5f }, (_, i) => 0x20 + i),
  0xa0,
  0xad,
  0x2010,
  0x2011,
  0x2018,
  0x2019,
  0xab,
  0xbb,
  0x201a,
  0x201c,
  0x201d,
  0x201e,
  0x2026,
  0x2039,
  0x203a,
);

/** Every face a page inlines, its base64 as the group. */
const FACES = /data:font\/woff2;base64,([\w+/=]+)/g;

/** Each brand face decoded once a process; the cuts for the last page text, since fitOnepager
 * composes one onepager many times over. */
const decoded = new Map<string, Promise<Uint8Array>>();
let lastCut = { text: "", faces: new Map<string, Promise<string>>() };

/** A face's base64 decoded to TrueType, through the cache. */
const decodedFace = (data: string) => {
  let ttf = decoded.get(data);
  if (!ttf) {
    // A page whose faces were cut before brings faces of its own: the cache keeps the brand's.
    if (decoded.size >= 64) decoded.clear();
    decoded.set(data, (ttf = decompress(Buffer.from(data, "base64"))));
  }
  return ttf;
};

type EncodeJob = {
  font: Uint8Array;
  resolve: (woff2: Uint8Array | Promise<Uint8Array>) => void;
};

/** Encoding is nearly all of a cut's time. Node has no global Worker and strips no types under
 * node_modules, so only Bun spreads it. */
let encoderLimit = process.versions.bun ? Math.min(4, availableParallelism()) : 1;
const encodeQueue: EncodeJob[] = [];
let encoders = 0;

const encodeHere = ({ font, resolve }: EncodeJob) => resolve(compress(font));

/** A Worker taking queued faces until none is left. Its file is found through ROOT: a consumer's
 * bundle holds no copy of it beside the chunk `import.meta.url` would name. */
function startEncoder() {
  encoders++;
  let job: EncodeJob | undefined;
  // The page is the same either way, so a Worker that cannot run costs time and not the document.
  const encodeAllHere = (reason: unknown) => {
    if (encoderLimit > 1) console.warn(`Encoding font faces in-process: ${String(reason)}`);
    encoderLimit = 1;
    if (job) encodeHere(job);
    job = undefined;
    encodeQueue.splice(0).forEach(encodeHere);
  };
  let worker: Worker;
  try {
    worker = new Worker(join(ROOT, "scripts/encode-face.ts"));
  } catch (error) {
    return encodeAllHere(error);
  }
  const takeNext = () => {
    job = encodeQueue.shift();
    if (job) return worker.postMessage(job.font);
    encoders--;
    void worker.terminate();
  };
  worker.onmessage = ({ data }: MessageEvent<Uint8Array | null>) => {
    if (data) job!.resolve(data);
    else encodeHere(job!);
    takeNext();
  };
  worker.onerror = (event) => {
    encodeAllHere(event.message);
    void worker.terminate();
  };
  // A Worker that exits during a job posts nothing and fires no error.
  worker.addEventListener("close", () => {
    if (job) encodeAllHere("a Worker exited");
  });
  takeNext();
}

const encodeFace = (font: Uint8Array) =>
  new Promise<Uint8Array>((resolve) => {
    const job = { font, resolve };
    if (encoderLimit < 2) return encodeHere(job);
    encodeQueue.push(job);
    if (encoders < encoderLimit) startEncoder();
  });

/** A TrueType face cut to `text`, as WOFF2 base64. */
const cutTo = async (font: Uint8Array, text: string) =>
  Buffer.from(
    await encodeFace(await subsetFont(Buffer.from(font), text, { targetFormat: "truetype" })),
  ).toString("base64");

const cutFace = (data: string, text: string) => {
  if (lastCut.text !== text) lastCut = { text, faces: new Map() };
  let face = lastCut.faces.get(data);
  if (!face) {
    face = decodedFace(data).then((font) => cutTo(font, text));
    lastCut.faces.set(data, face);
  }
  return face;
};

/**
 * A standalone page with each inlined face cut to the characters the page can print (its text,
 * the style elements' `content` and printable ASCII), every OpenType feature kept, so tabular
 * figures and kerning print as before. The page as it is stored then carries a fraction of the
 * faces; a page baked again (bakeDocumentCss) gets the whole base back. A character a script adds
 * after load and the page holds nowhere prints a fallback, which assertBrandFonts fails.
 */
export async function subsetFaces(html: string): Promise<string> {
  // Sorted, so one page under another fit, which reorders its first appearances, cuts the same.
  const text =
    String.fromCodePoint(...[...printableCodePoints(html)].sort((a, b) => a - b)) + ALWAYS;
  const faces = [...new Set([...html.matchAll(FACES)].map(([, data]) => data!))];
  const cut = new Map(
    await Promise.all(faces.map(async (d) => [d, await cutFace(d, text)] as const)),
  );
  return html.replace(FACES, (_, data: string) => `data:font/woff2;base64,${cut.get(data)}`);
}

/** A font's PostScript name (name ID 6) from its sfnt tables. */
function postScriptName(font: Uint8Array): string | undefined {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  for (let i = 0; i < view.getUint16(4); i++) {
    const record = 12 + i * 16;
    if (String.fromCharCode(...font.subarray(record, record + 4)) !== "name") continue;
    const table = view.getUint32(record + 8);
    const strings = table + view.getUint16(table + 4);
    for (let n = 0; n < view.getUint16(table + 2); n++) {
      const r = table + 6 + n * 12;
      if (view.getUint16(r + 6) !== 6) continue;
      const bytes = font.subarray(
        strings + view.getUint16(r + 10),
        strings + view.getUint16(r + 10) + view.getUint16(r + 8),
      );
      // Unicode and Windows names are UTF-16BE, Macintosh ones single bytes.
      return view.getUint16(r) === 1
        ? Buffer.from(bytes).toString("latin1")
        : Buffer.from(bytes).swap16().toString("utf16le");
    }
  }
  return undefined;
}

/** The characters each font of a Chrome PDF prints, by PostScript name, from its ToUnicode map. */
function printedCharacters(pdf: Buffer): Map<string, Set<number>> {
  const text = pdf.toString("latin1");
  const stream = (id: string) => {
    const head = new RegExp(`(?<![\\d])${id} 0 obj\\s*<<([\\s\\S]*?)>>\\s*stream\\r?\\n`).exec(
      text,
    );
    // An indirect length (`/Length 12 0 R`) reads as none, so the stream fails.
    const length = Number(/\/Length (\d+)\b(?!\s+\d+\s+R)/.exec(head?.[1] ?? "")?.[1]);
    if (!head || !length)
      throw new Error(`printedCharacters: no stream ${id} with a direct length in the PDF`);
    const start = head.index + head[0].length;
    const body = pdf.subarray(start, start + length);
    // A stream without a filter is read as it stands; one other than Chrome's FlateDecode alone fails.
    const filter = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(head[1]!)?.[1].replace(/[[\]\s]/g, "");
    if (filter && filter !== "/FlateDecode")
      throw new Error(`printedCharacters: stream ${id} has the filter ${filter}`);
    return (filter ? inflateSync(body) : body).toString("latin1");
  };
  const utf16 = (hex: string) => Buffer.from(hex, "hex").swap16().toString("utf16le");
  const fonts = new Map<string, Set<number>>();
  for (const [dict] of text.matchAll(/<<[^<>]*\/Subtype \/Type0[^<>]*>>/g)) {
    const name = /\/BaseFont \/(?:[A-Z]{6}\+)?([^\s/]+)/.exec(dict)?.[1];
    const map = /\/ToUnicode (\d+) 0 R/.exec(dict)?.[1];
    if (!name || !map) throw new Error(`printedCharacters: a font without a name or ToUnicode`);
    const points = fonts.get(name) ?? new Set<number>();
    const cmap = stream(map);
    const add = (s: string) => {
      for (const c of s) points.add(c.codePointAt(0)!);
    };
    for (const [, block] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
      for (const [, dst] of block!.matchAll(/<[\da-f]+>\s*<([\da-f]+)>/gi)) add(utf16(dst!));
    for (const [, block] of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
      for (const [, lo, hi, dst] of block!.matchAll(
        /<([\da-f]+)>\s*<([\da-f]+)>\s*<([\da-f]+)>/gi,
      )) {
        const first = utf16(dst!).codePointAt(0)!;
        for (let k = 0; k <= parseInt(hi!, 16) - parseInt(lo!, 16); k++) points.add(first + k);
      }
    fonts.set(name, points);
  }
  return fonts;
}

/** The hyphens and spaces a screen may break or space a line with where the print did not. */
const BREAKS = "  ­-‐";

/**
 * The page `pdf` printed, each inlined face cut to the characters that face printed there, and
 * each face it never printed dropped: subsetFaces keeps every character of the page in every face,
 * though most faces print a few words. The onepager's faces were half of its HTML (measured). The
 * screen sets the same words in the same faces, the print styles holding no other face, and only
 * a hyphen or space its other line breaks may add, which every face keeps.
 */
export async function cutFacesToPdf(html: string, pdf: string): Promise<string> {
  const bytes = readFileSync(pdf);
  // A Type 3 face carries no name to match: the page stays as it is.
  if (bytes.includes("/Subtype /Type3")) return html;
  const printed = printedCharacters(bytes);
  // No font found means fonts written in a form this reader does not know, not a page without
  // text: nothing is cut.
  if (printed.size === 0) return html;
  const faces = await Promise.all(
    [...new Set([...html.matchAll(FACES)].map(([, data]) => data!))].map(async (data) => {
      // Not through `decoded`, which holds the brand's faces: these are this page's cuts.
      const font = await decompress(Buffer.from(data, "base64"));
      return { data, font, name: postScriptName(font) ?? "" };
    }),
  );
  // A printed font no face is named for may be one of them under another name: nothing is cut.
  if ([...printed.keys()].some((name) => !faces.some((face) => face.name === name))) return html;
  const cut = new Map(
    await Promise.all(
      faces.map(async ({ data, font, name }) => {
        const points = printed.get(name);
        if (!points) return [data, ""] as const;
        const text = String.fromCodePoint(...[...points].sort((a, b) => a - b)) + BREAKS;
        return [data, await cutTo(font, text)] as const;
      }),
    ),
  );
  return editFaces(html, (face) => {
    const data = new RegExp(FACES.source).exec(face)?.[1];
    if (!data) return face;
    return cut.get(data) ? face.replace(data, cut.get(data)!) : "";
  });
}

/** Each custom property the page's style elements and attributes read through `var()` without a
 * fallback and define nowhere. */
function unsetProperties(html: string): string[] {
  const sheets = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(([, css]) => css);
  const css = [...sheets, ...styleAttributes(html)].join("\n");
  const names = (pattern: RegExp) => new Set([...css.matchAll(pattern)].map(([, n]) => n!));
  // A declaration's name opens its block or follows a `;`, never a selector such as `.card--x:hover`.
  const defined = names(/(?:^|[{;\s])(--[\w-]+)\s*:/g);
  return [...names(/var\(\s*(--[\w-]+)\s*\)/g)].filter((name) => !defined.has(name));
}

// The marker however it is written: with an empty value, or beside another attribute.
const DOCUMENT_STYLE =
  /<style\b[^>]*?\sdata-hw-document(?:\s*=\s*(?:""|''))?(?=[\s>/])[^>]*>[\s\S]*?<\/style>/i;

/**
 * Fills a document's `<style data-hw-document>` with the current base, maps its elements onto the
 * brand's (withElements) and puts it on the print scale. HTML without the marker passes unchanged. A document carrying a style the engine did not write fails: it would print a
 * look no engine type owns (foreignStyles, the documents-styles command). So does one reading a
 * custom property through `var()` without a fallback that the baked page defines nowhere: a
 * document keeps the component styles it was composed with, so a token name the base drops would
 * otherwise empty their rules silently. The faces come back whole: a consumer storing the page
 * runs subsetFaces on it after.
 */
export function bakeDocumentCss(html: string): string {
  if (!DOCUMENT_STYLE.test(html)) return html;
  const foreign = foreignStyles(html);
  if (foreign.length > 0)
    throw new Error(
      `This document carries styles outside the document engine, so the engine will not bake it:\n${foreign.map((f) => `  ${f}`).join("\n")}\nCompose it from an engine type (documents-compose); where no type or variant fits, add it to @hackersandwizards/documents.`,
    );
  const css = documentCss();
  const scaled = /<html\b[^>]*\bdata-hw-scale=/.test(html)
    ? html
    : html.replace(/<html\b/, '<html data-hw-scale="print"');
  const full = withElements(scaled).replace(
    DOCUMENT_STYLE,
    () => `<style data-hw-document>\n${css}\n</style>`,
  );
  // Read before compactStyles prunes: a property defined under a rule the page cannot use still
  // counts as defined, as it did before pruning.
  const unset = unsetProperties(editStyles(full, stripComments));
  if (unset.length > 0)
    throw new Error(
      `This document reads custom properties no stylesheet defines: ${unset.join(", ")}. Re-compose a stored document with the current engine; where a fresh compose fails too, report the names to @hackersandwizards/documents.`,
    );
  return compactStyles(full);
}

/**
 * A document component composed by `scripts/compose.ts` into a standalone, baked HTML string.
 * A child process, so no Vite server starts inside the caller, which may be the app's own; `cwd`
 * is the Astro project whose compiler it runs. `warm` keeps that process for the next call, for
 * a long-running caller: a fresh one costs about 0.5 s, the kept one a few ms, plus 0.4 to 0.8 s
 * cutting the faces where the page's characters differ from the last call's (measured).
 * It quits after a minute without a call, and with the caller.
 */
export async function composeDocument(
  name: string,
  props: Record<string, unknown>,
  cwd = process.cwd(),
  options: { warm?: boolean } = {},
): Promise<string> {
  if (options.warm) return keptComposer(cwd).compose(name, props);
  const dir = mkdtempSync(join(tmpdir(), "hw-compose-"));
  try {
    const input = join(dir, "props.json");
    const output = join(dir, "document.html");
    writeFileSync(input, JSON.stringify(props));
    try {
      await execFileAsync("bun", [join(ROOT, "scripts/compose.ts"), name, input, output], { cwd });
    } catch (error) {
      const stderr = (error as { stderr?: string }).stderr;
      throw new Error(`Composing ${name} failed: ${stderr || (error as Error).message}`, {
        cause: error,
      });
    }
    return readFileSync(output, "utf-8");
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

function keptComposer(cwd: string) {
  const entry = kept(`compose:${cwd}`, () => {
    const child = spawn("bun", [join(ROOT, "scripts/compose.ts"), "--serve"], {
      cwd,
      stdio: ["pipe", "ignore", "inherit", "pipe"],
    });
    let id = 0;
    let buffer = "";
    const calls = new Map<number, { resolve(html: string): void; reject(e: Error): void }>();
    // Missing when bun did not start; its `error` below then rejects every call.
    const output = child.stdio[3] as Readable | undefined;
    output?.setEncoding("utf8");
    output?.on("data", (chunk: string) => {
      buffer += chunk;
      for (let end = buffer.indexOf("\n"); end >= 0; end = buffer.indexOf("\n")) {
        const answer = JSON.parse(buffer.slice(0, end));
        buffer = buffer.slice(end + 1);
        const call = calls.get(answer.id);
        calls.delete(answer.id);
        if (answer.error) call?.reject(new Error(answer.error));
        else call?.resolve(answer.html);
      }
    });
    const fail = (error?: Error) => {
      for (const call of calls.values()) call.reject(error ?? new Error("The composer exited"));
      calls.clear();
    };
    child.on("exit", () => fail());
    child.on("error", fail);
    // A write to a composer that has gone fails with EPIPE; its exit above rejects the call.
    child.stdin?.on("error", () => {});
    const compose = (name: string, props: Record<string, unknown>) =>
      new Promise<string>((resolve, reject) => {
        calls.set(++id, { resolve, reject });
        child.stdin?.write(`${JSON.stringify({ id, name, props })}\n`);
      });
    return { child, api: compose };
  });
  return {
    async compose(name: string, props: Record<string, unknown>): Promise<string> {
      entry.busy(1);
      try {
        return await entry.api(name, props);
      } catch (error) {
        throw new Error(`Composing ${name} failed: ${(error as Error).message}`, { cause: error });
      } finally {
        entry.busy(-1);
      }
    },
  };
}

/**
 * Fails when the PDF embeds any face but the brand's, or any Type 3 face. A renderer substitutes a
 * system font silently, and the PDF still looks deliberate; a variable font embeds as Type 3
 * glyphs, which some readers and print shops rasterize. A glyph outside the brand subsets pulls
 * AppleColorEmoji, which is the one benign foreign face and the one benign Type 3 face.
 */
export function assertBrandFonts(pdfPath: string): void {
  const result = spawnSync("pdffonts", [pdfPath], { encoding: "utf8" });
  if (result.error)
    throw new Error(
      `pdffonts (poppler) is required to check ${pdfPath}; without it no font is checked`,
    );
  if (result.status !== 0)
    throw new Error(`pdffonts could not read ${pdfPath}: ${result.stderr.trim()}`);
  const fonts = result.stdout.split("\n").slice(2).filter(Boolean);
  if (fonts.length === 0) throw new Error(`${pdfPath} embeds no font`);
  const foreign = fonts.filter((line) => !/Inter|JetBrains|AppleColorEmoji/.test(line));
  if (foreign.length > 0) {
    throw new Error(`${pdfPath} fell back to a non-brand face:\n${foreign.join("\n")}`);
  }
  // Chrome embeds colour emoji as Type 3 bitmaps whatever the source (measured).
  const type3 = fonts.filter((line) => / Type 3 /.test(line) && !/AppleColorEmoji/.test(line));
  if (type3.length > 0) {
    throw new Error(`${pdfPath} embeds Type 3 faces, from a variable font:\n${type3.join("\n")}`);
  }
}
