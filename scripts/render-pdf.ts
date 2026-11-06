import { type ChildProcess, execFile, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { chromeArgs, chromeBinaryAsync, INSTALL_HINT } from "@hackersandwizards/scaffolding/chrome";
import { withElements } from "./elements";
import { ROOT } from "./root";
import { foreignStyles } from "./styles";

const execFileAsync = promisify(execFile);

/**
 * Runs in the printed copy. Chrome embeds every raster image at its source resolution: the 512px
 * header logo shown 22.5pt wide was 56 KB of a 129 KB quote (measured 2026-10-28). Each image is
 * redrawn at twice its displayed size, as the smaller of PNG and, where opaque, JPEG. The new src
 * is set from the image's own load event, which holds the window's load, so the print waits for
 * every redraw; work after load raced the print (measured). A document without a `<title>`
 * takes its first heading's.
 */
const PRINT_JS = `
if (!document.title) document.title = document.querySelector("h1")?.textContent?.trim() ?? "";
for (const img of document.images) {
  const shrink = () => {
    if ("printScaled" in img.dataset || !img.naturalWidth || /^data:image\\/svg|\\.svg($|[?#])/i.test(img.currentSrc)) return;
    img.dataset.printScaled = "";
    const { width, height } = img.getBoundingClientRect();
    const fit = getComputedStyle(img).objectFit === "contain" ? Math.min : Math.max;
    const scale = fit((2 * width) / img.naturalWidth, (2 * height) / img.naturalHeight);
    if (!(scale > 0 && scale < 1)) return;
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let alpha;
    // A file:// image taints the canvas; it prints at its source size.
    try { alpha = ctx.getImageData(0, 0, canvas.width, canvas.height).data; } catch { return; }
    let opaque = true;
    for (let i = 3; i < alpha.length; i += 4) if (alpha[i] < 255) { opaque = false; break; }
    const png = canvas.toDataURL("image/png");
    const jpeg = opaque ? canvas.toDataURL("image/jpeg", 0.9) : png;
    img.srcset = "";
    // A QR code is opaque, yet its hard edges took 18.5 KB as JPEG against 3.8 KB as PNG (measured).
    img.src = jpeg.length < png.length ? jpeg : png;
  };
  if (img.complete) shrink(); else img.addEventListener("load", shrink, { once: true });
}
`;
const PRINT_SCRIPT = `<script>${PRINT_JS}</script>`;
/** The same for a page served over HTTP, which the render cannot edit: run before the page's own
 * scripts, it waits for the parsed document, whose images then hold the window's load as above. */
const PRINT_ON_NEW_DOCUMENT = `document.addEventListener("DOMContentLoaded", () => {${PRINT_JS}}, { once: true });`;

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
 * `/ModDate` (42 PDF pairs, measured 06.11.2026): both are blanked, since a document's date is in
 * its text, never in its metadata. And Chrome names each table header cell in the structure tree
 * `node` plus Blink's DOM node id, a counter other nodes draw on first: in a cold Chrome the quote's
 * ids started at 51, 52 or 53 (20 renders, measured 06.11.2026; images, CSS, favicons and a wait
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
 * `document.fonts.ready` work in 2 of 8 runs (measured 02.11.2026), so no render uses it.
 */
const LAYOUT = "Promise.all(globalThis.hwLayout ?? []).then(() => true)";

type RenderOptions = { timeoutMs?: number; warm?: boolean };

/**
 * Prints an HTML file, or a page an `http:` or `https:` URL serves, to PDF. `warm` prints in a
 * Chrome kept running for the next call, for a long-running caller such as an app route: a cold
 * Chrome costs about 0.55 s a render, the kept one about 0.1 s (measured 2026-11-02). It quits
 * after a minute without a render, and with the caller.
 */
export async function renderPdf(
  htmlPath: string,
  pdfPath: string,
  options: RenderOptions = {},
): Promise<void> {
  const chrome = await chromeBinaryAsync();
  if (!chrome) throw new Error(INSTALL_HINT);
  const timeoutMs = options.timeoutMs ?? 60_000;
  if (/^https?:\/\//.test(htmlPath)) {
    rmSync(pdfPath, { force: true });
    const pdf = options.warm
      ? await keptChrome(chrome).print(htmlPath, timeoutMs, PRINT_ON_NEW_DOCUMENT)
      : await coldPrint(chrome, htmlPath, timeoutMs, PRINT_ON_NEW_DOCUMENT);
    writeFileSync(pdfPath, pdf);
    return;
  }
  const html = readFileSync(htmlPath, "utf-8");
  const end = html.lastIndexOf("</body>");
  // Beside the input, so relative resources resolve; the stored HTML stays free of the script. A
  // name per call, since a render that finishes deletes its file while another may still load it.
  const printPath = join(dirname(htmlPath), `.${basename(htmlPath)}.${randomUUID()}.print.html`);
  writeFileSync(
    printPath,
    end < 0 ? html + PRINT_SCRIPT : html.slice(0, end) + PRINT_SCRIPT + html.slice(end),
  );
  // A failed render must not leave a PDF from an earlier one in place.
  rmSync(pdfPath, { force: true });
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
 * passes it to DocHandout as props. `chapterLabel` is the eyebrow's word (DocHandout's
 * `labels.chapter`). Without poppler the first render stands: the contents unnumbered and every
 * chapter opening a page.
 */
export async function renderHandoutPdf(
  source: string | ((pass: HandoutPass) => Promise<string>),
  pdfPath: string,
  options: RenderOptions & { chapterLabel?: string } = {},
): Promise<HandoutResult> {
  const dir = typeof source === "string" ? undefined : mkdtempSync(join(tmpdir(), "hw-handout-"));
  let renders = 0;
  const render = async (pass: HandoutPass) => {
    renders++;
    if (typeof source === "string") {
      const url = new URL(source);
      if (pass.toc) url.searchParams.set("toc", pass.toc.join(","));
      if (pass.flow) url.searchParams.set("flow", pass.flow);
      if (pass.notes) url.searchParams.set("notes", pass.notes);
      return renderPdf(url.href, pdfPath, options);
    }
    const file = join(dir!, "handout.html");
    writeFileSync(file, await source(pass));
    return renderPdf(file, pdfPath, options);
  };
  const label = (options.chapterLabel ?? "Chapter").trim();
  const pagesOf = () => chapterPages(pdfPath, label);
  try {
    await render({});
    let toc = pagesOf();
    // A chapter that runs on changes where it ends, so the one after it is judged on the next pass.
    let flow: number[] = [];
    for (let pass = 0; toc && pass < 6; pass++) {
      const more = flowing(pdfPath, toc).filter((chapter) => !flow.includes(chapter));
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

/** The lowest text on `page` above the footer and the highest below the running header, in
 *  points, with the page height. */
function extent(
  pdf: string,
  page: number,
): { top: number; bottom: number; height: number } | undefined {
  const box = spawnSync("pdftotext", ["-bbox", "-f", `${page}`, "-l", `${page}`, pdf, "-"], {
    encoding: "utf8",
  });
  if (box.error || box.status !== 0) return undefined;
  const height = Number(/<page width="[\d.]+" height="([\d.]+)"/.exec(box.stdout)?.[1]);
  const words = [...box.stdout.matchAll(/yMin="([\d.]+)" xMax="[\d.]+" yMax="([\d.]+)"/g)]
    .map((m) => [Number(m[1]), Number(m[2])] as const)
    .filter(([min, max]) => min > 45 && max < height - 16 * (72 / 25.4));
  if (!words.length) return undefined;
  return {
    top: Math.min(...words.map(([min]) => min)),
    bottom: Math.max(...words.map(([, max]) => max)),
    height,
  };
}

/** The 1-based chapters, the first and last aside, that run on under the chapter before rather
 *  than open a page. A longer chapter runs on when the one before ends in the top half of its last
 *  page. A one-page chapter runs on when it fits whole there, with the 12 mm gap, or when the one
 *  before ends in its top third; otherwise it keeps its page, since running on would split it.
 *  Blind screen rounds, 28.10.2026: reviewers chose the top-third limit 6 to 0 over none, and
 *  disliked it at a half because chapters then opened low and ran over. */
function flowing(pdf: string, toc: number[]): number[] {
  const mm = 72 / 25.4;
  const gap = 12 * mm;
  return toc.flatMap((start, i) => {
    if (i === 0 || i === toc.length - 1) return [];
    const before = extent(pdf, start - 1);
    const own = extent(pdf, start);
    if (!before || !own) return [];
    const single = toc[i + 1] === start + 1;
    if (before.bottom < own.height * (single ? 1 / 3 : 1 / 2)) return [i + 1];
    const free = own.height - 16 * mm - before.bottom;
    return single && own.bottom - own.top + gap <= free ? [i + 1] : [];
  });
}

/** How many ruled lines fit under the text of the page before `last`, which the notes chapter
 *  fills alone, when at least half a page of them do (14); otherwise undefined. The notes then move
 *  up into that space, so the last chapter never ends above an empty page bottom. Points
 *  throughout: the bottom margin is 16 mm, the section gap and the chapter heading take 42 mm, a
 *  ruled line 8 mm. */
function notesFit(pdf: string, last: number): number | undefined {
  const box = spawnSync(
    "pdftotext",
    ["-bbox", "-f", `${last - 1}`, "-l", `${last - 1}`, pdf, "-"],
    {
      encoding: "utf8",
    },
  );
  if (box.error || box.status !== 0) return undefined;
  const height = Number(/<page width="[\d.]+" height="([\d.]+)"/.exec(box.stdout)?.[1]);
  const mm = 72 / 25.4;
  const bottom = height - 16 * mm;
  const ys = [...box.stdout.matchAll(/yMax="([\d.]+)"/g)]
    .map((m) => Number(m[1]))
    .filter((y) => y < bottom);
  // A page without text gives no measure, and Math.max of nothing would fit endless lines.
  if (!ys.length) return undefined;
  const used = Math.max(...ys);
  const lines = Math.floor((bottom - used - 42 * mm) / (8 * mm)) - 1;
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
  // once, a profile was left behind in 1 of 10 runs (measured 2026-11-03). The caller's `exit`
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

/** A Chrome driven over its own debugging pipe (fd 3 in, fd 4 out), which no other process can
 * reach, unlike a debugging port, in its own temporary profile, so a render never runs inside, or
 * locks, the user's own Chrome profile. */
function pipeChrome(chrome: string) {
  const profile = mkdtempSync(join(tmpdir(), "hw-chrome-"));
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
  const calls = new Map<number, { resolve(r: Result): void; reject(e: Error): void }>();
  const loads = new Map<string, () => void>();
  output?.setEncoding("utf8");
  output?.on("data", (chunk: string) => {
    buffer += chunk;
    for (let end = buffer.indexOf("\0"); end >= 0; end = buffer.indexOf("\0")) {
      const message = JSON.parse(buffer.slice(0, end));
      buffer = buffer.slice(end + 1);
      const call = calls.get(message.id);
      if (call) {
        calls.delete(message.id);
        if (message.error) call.reject(new Error(message.error.message));
        else call.resolve(message.result);
      } else if (message.method === "Page.loadEventFired") loads.get(message.sessionId)?.();
    }
  });
  const exited = new Promise<void>((resolve) => {
    const fail = (error?: Error) => {
      gone = true;
      for (const call of calls.values()) call.reject(error ?? new Error("Chrome exited"));
      calls.clear();
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
      calls.set(++id, { resolve, reject });
      input?.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    });
  const print = async (url: string, script?: string): Promise<Buffer> => {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    try {
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      await send("Page.enable", {}, sessionId);
      if (script)
        await send("Page.addScriptToEvaluateOnNewDocument", { source: script }, sessionId);
      const loaded = new Promise<void>((resolve) => loads.set(sessionId, resolve));
      const { errorText } = await send("Page.navigate", { url }, sessionId);
      if (errorText) {
        loads.delete(sessionId);
        throw new Error(`Chrome could not load ${url}: ${errorText}`);
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
  return { child, exited, print, cleanup: () => rmSync(profile, { recursive: true, force: true }) };
}

async function printWithin(
  print: Promise<Buffer>,
  url: string,
  timeoutMs: number,
  stop: () => void,
): Promise<Buffer> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      print,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          stop();
          reject(
            new Error(
              `Chrome did not print ${url} within ${timeoutMs} ms: Chrome hung, or a layout on globalThis.hwLayout never finished`,
            ),
          );
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
    return await printWithin(browser.print(url, script), url, timeoutMs, () =>
      browser.child.kill(),
    );
  } finally {
    browser.child.kill();
    await browser.exited;
    browser.cleanup();
  }
}

function keptChrome(chrome: string) {
  const entry = kept(chrome, (stop) => {
    const { child, print, cleanup } = pipeChrome(chrome);
    return { child, api: { print, stop }, cleanup };
  });
  return {
    async print(url: string, timeoutMs: number, script?: string): Promise<Buffer> {
      entry.busy(1);
      try {
        // A hung Chrome is replaced on the next call.
        return await printWithin(entry.api.print(url, script), url, timeoutMs, entry.api.stop);
      } finally {
        entry.busy(-1);
      }
    },
  };
}

/**
 * The document base `document.css` as one stylesheet: each `@import` inlined (the brand files from
 * `@hackersandwizards/brand`), `@theme` read as `:root`, and every face a data URI resolved beside the file
 * that names it, so the HTML it lands in renders anywhere.
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
    "tokens.css",
    "print.css",
    "document.css",
    "marker.css",
    "elements/kpi.css",
    "elements/rule.css",
    "elements/strip.css",
  ]
    .map((f) => inlineCss(brandFile(f)))
    .join("\n");
}

/** A file the brand package exports, such as `tokens.css`, as an absolute path. */
export const brandFile = (file: string) =>
  createRequire(import.meta.url).resolve(`@hackersandwizards/brand/${file}`);

/** A stylesheet with its `@import`s inlined and its comments dropped: a brand file's comment shows
 * sample markup, such as a figure, that a baked document must not carry. */
export function inlineCss(path: string): string {
  const dir = dirname(path);
  return readFileSync(path, "utf-8")
    .replace(/\/\*[\s\S]*?\*\/\s*/g, "")
    .replace(/@import "([^"]+)";/g, (_, file: string) =>
      inlineCss(file.startsWith("@") ? createRequire(path).resolve(file) : join(dir, file)),
    )
    .replace(/@theme\s*\{/g, ":root {")
    .replace(
      /url\("(fonts\/[^"]+)"\)/g,
      (_, file: string) =>
        `url(data:font/woff2;base64,${readFileSync(join(dir, file)).toString("base64")})`,
    );
}

const DOCUMENT_STYLE = /<style data-hw-document>[\s\S]*?<\/style>/;

/**
 * Fills a document's `<style data-hw-document>` with the current base, maps its elements onto the
 * brand's (withElements) and puts it on the print scale. HTML without the marker passes unchanged. A document carrying a style the engine did not write fails: it would print a
 * look no engine type owns (foreignStyles, the documents-styles command).
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
  return withElements(scaled).replace(
    DOCUMENT_STYLE,
    () => `<style data-hw-document>\n${css}\n</style>`,
  );
}

/**
 * A document component composed by `scripts/compose.ts` into a standalone, baked HTML string.
 * A child process, so no Vite server starts inside the caller, which may be the app's own; `cwd`
 * is the Astro project whose compiler it runs. `warm` keeps that process for the next call, for
 * a long-running caller: a fresh one costs about 0.5 s, the kept one a few ms (measured
 * 2026-11-02). It quits after a minute without a call, and with the caller.
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
  if (result.error || result.status !== 0) {
    throw new Error(
      `pdffonts (poppler) is required to check ${pdfPath}; without it no font is checked`,
    );
  }
  const fonts = result.stdout.split("\n").slice(2).filter(Boolean);
  if (fonts.length === 0) throw new Error(`${pdfPath} embeds no font`);
  const foreign = fonts.filter((line) => !/Inter|JetBrains|AppleColorEmoji/.test(line));
  if (foreign.length > 0) {
    throw new Error(`${pdfPath} fell back to a non-brand face:\n${foreign.join("\n")}`);
  }
  // Chrome embeds colour emoji as Type 3 bitmaps whatever the source, measured 2026-10-28.
  const type3 = fonts.filter((line) => / Type 3 /.test(line) && !/AppleColorEmoji/.test(line));
  if (type3.length > 0) {
    throw new Error(`${pdfPath} embeds Type 3 faces, from a variable font:\n${type3.join("\n")}`);
  }
}
