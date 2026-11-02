import { type ChildProcess, execFile, execFileSync, spawn, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import type { Readable, Writable } from "node:stream";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { withElements } from "./elements";
import { ROOT } from "./root";
import { foreignStyles } from "./styles";

const execFileAsync = promisify(execFile);

/** The one owner of the headless-Chrome flag set, browser discovery and the document base, for every h&w document PDF. */

// Only a found Chrome is kept: a failed install is tried again by the next call.
let resolvedChrome: string | undefined;
let installingChrome: Promise<string | undefined> | undefined;
const chromeCache = () => process.env.PUPPETEER_CACHE_DIR ?? join(homedir(), ".cache", "puppeteer");
const installArgs = (cache: string) => [
  // Pinned: bunx runs the newest published release of an unpinned package.
  "@puppeteer/browsers@3.2.6",
  "install",
  "chrome@stable",
  "--path",
  cache,
  "--format",
  "{{path}}",
];

/**
 * Chrome for Testing, the build puppeteer and playwright install, never the user's own Chrome: a
 * headless instance from `/Applications/Google Chrome.app` made macOS activate it instead of opening
 * the user's window (shown 2026-10-31). The newest build in puppeteer's cache, else installed there,
 * blocking: for a command. renderPdf installs without blocking, since it runs on the SSR request path.
 */
export function chromeBinary(): string | undefined {
  if (process.env.CHROME_BINARY) return process.env.CHROME_BINARY;
  resolvedChrome ??= cachedChrome(chromeCache());
  if (resolvedChrome) return resolvedChrome;
  try {
    const out = execFileSync("bunx", installArgs(chromeCache()), { encoding: "utf-8" }).trim();
    return (resolvedChrome = out || undefined);
  } catch {
    return undefined;
  }
}

async function chromeBinaryAsync(): Promise<string | undefined> {
  if (process.env.CHROME_BINARY) return process.env.CHROME_BINARY;
  resolvedChrome ??= cachedChrome(chromeCache());
  if (resolvedChrome) return resolvedChrome;
  installingChrome ??= execFileAsync("bunx", installArgs(chromeCache()), { encoding: "utf-8" })
    .then(
      ({ stdout }) => (resolvedChrome = stdout.trim() || undefined),
      () => undefined,
    )
    .finally(() => (installingChrome = undefined));
  return installingChrome;
}

function cachedChrome(cache: string): string | undefined {
  const builds = join(cache, "chrome");
  const exe =
    process.platform === "darwin"
      ? "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing"
      : "chrome";
  // @puppeteer/browsers 3 keeps a .metadata file beside the build folders.
  return (existsSync(builds) ? readdirSync(builds, { withFileTypes: true }) : [])
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort((a, b) => b.localeCompare(a, "en", { numeric: true }))
    .flatMap((build) =>
      readdirSync(join(builds, build))
        .filter((dir) => dir.startsWith("chrome-"))
        .map((dir) => join(builds, build, dir, exe)),
    )
    .find((path) => existsSync(path));
}

/**
 * Runs in the printed copy. Chrome embeds every raster image at its source resolution: the 512px
 * header logo shown 22.5pt wide was 56 KB of a 129 KB quote (measured 2026-10-28). Each image is
 * redrawn at twice its displayed size, as the smaller of PNG and, where opaque, JPEG. The new src
 * is set from the image's own load event, which holds the window's load, so the print waits for
 * every redraw; work after load raced the print (measured). A document without a `<title>`
 * takes its first heading's.
 */
const PRINT_SCRIPT = `<script>
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
</script>`;

/** The flags every Chrome here starts with. */
const CHROME_FLAGS = [
  "--headless",
  "--disable-gpu",
  // Chrome otherwise asks the macOS keychain for "Chromium Safe Storage", a dialog per launch.
  "--use-mock-keychain",
  "--password-store=basic",
];
/** The print settings. Chrome tags the PDF without being asked; the outline needs the flag. */
const PRINT_PARAMS = {
  displayHeaderFooter: false,
  printBackground: true,
  generateDocumentOutline: true,
  generateTaggedPDF: true,
  preferCSSPageSize: true,
};

/**
 * A page whose layout runs after load, such as a measurement once the faces are in, puts the
 * promise of that work on `globalThis.hwLayout`, an array the first such script creates. The print
 * waits for every one, and a layout still pending at the timeout fails the render instead of
 * printing it half done. Chrome's `--print-to-pdf` printed at load, before the handout's
 * `document.fonts.ready` work in 2 of 8 runs (measured 02.11.2026), so no render uses it.
 */
const LAYOUT = "Promise.all(globalThis.hwLayout ?? []).then(() => true)";

/**
 * Prints an HTML file to PDF. `warm` prints in a Chrome kept running for the next call, for a
 * long-running caller such as an app route: a cold Chrome costs about 0.55 s a render, the kept one
 * about 0.1 s (measured 2026-11-02). It quits after a minute without a render, and with the caller.
 */
export async function renderPdf(
  htmlPath: string,
  pdfPath: string,
  options: { timeoutMs?: number; warm?: boolean } = {},
): Promise<void> {
  const chrome = await chromeBinaryAsync();
  if (!chrome) {
    throw new Error(
      "Chrome for Testing is required to render PDFs: bunx @puppeteer/browsers@3.2.6 install chrome@stable --path ~/.cache/puppeteer, or set CHROME_BINARY.",
    );
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
  const timeoutMs = options.timeoutMs ?? 60_000;
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

/**
 * A child process kept for the next call: started on first use, holding the caller open only while
 * a call is in flight, stopped after a minute idle and when the caller exits. On globalThis, so a
 * dev server re-evaluating this module finds the running one instead of starting another.
 */
const IDLE_MS = 60_000;
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
  const stop = () => {
    if (store.get(key) !== entry) return;
    store.delete(key);
    clearTimeout(idle);
    process.off("exit", stop);
    child.kill();
    cleanup?.();
  };
  const { child, api, cleanup } = start(stop);
  const handles = () =>
    [child, ...child.stdio].filter(Boolean) as { ref?(): void; unref?(): void }[];
  child.on("exit", stop);
  process.on("exit", stop);
  const entry: Kept<T> = {
    api,
    busy(delta) {
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
  const child = spawn(
    chrome,
    [...CHROME_FLAGS, `--user-data-dir=${profile}`, "--remote-debugging-pipe", "about:blank"],
    { stdio: ["ignore", "ignore", "ignore", "pipe", "pipe"] },
  );
  const input = child.stdio[3] as Writable;
  const output = child.stdio[4] as Readable;
  let id = 0;
  let buffer = "";
  let gone = false;
  // A CDP result: each call below reads the fields its method returns.
  type Result = Record<string, string>;
  const calls = new Map<number, { resolve(r: Result): void; reject(e: Error): void }>();
  const loads = new Map<string, () => void>();
  output.setEncoding("utf8");
  output.on("data", (chunk: string) => {
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
    const fail = () => {
      gone = true;
      for (const call of calls.values()) call.reject(new Error("Chrome exited"));
      calls.clear();
      resolve();
    };
    child.on("exit", fail);
    child.on("error", fail);
  });
  // A write to a Chrome that has gone fails with EPIPE; its exit above rejects the call.
  input.on("error", () => {});
  const send = (method: string, params: object = {}, sessionId?: string): Promise<Result> =>
    new Promise((resolve, reject) => {
      if (gone) return reject(new Error("Chrome exited"));
      calls.set(++id, { resolve, reject });
      input.write(`${JSON.stringify({ id, method, params, sessionId })}\0`);
    });
  // Prints once the page has loaded, the print script's redraws included, and its layout is done.
  const print = async (url: string): Promise<Buffer> => {
    const { targetId } = await send("Target.createTarget", { url: "about:blank" });
    try {
      const { sessionId } = await send("Target.attachToTarget", { targetId, flatten: true });
      await send("Page.enable", {}, sessionId);
      const loaded = new Promise<void>((resolve) => loads.set(sessionId, resolve));
      await send("Page.navigate", { url }, sessionId);
      await loaded;
      loads.delete(sessionId);
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
      return Buffer.from(data, "base64");
    } finally {
      await send("Target.closeTarget", { targetId }).catch(() => {});
    }
  };
  return { child, exited, print, cleanup: () => rmSync(profile, { recursive: true, force: true }) };
}

/** A print that has not finished within `timeoutMs` fails, and `stop` ends its Chrome. */
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

/** One print in a Chrome of its own, which quits and takes its profile with it. */
async function coldPrint(chrome: string, url: string, timeoutMs: number): Promise<Buffer> {
  const browser = pipeChrome(chrome);
  try {
    return await printWithin(browser.print(url), url, timeoutMs, () => browser.child.kill());
  } finally {
    browser.child.kill();
    await browser.exited;
    browser.cleanup();
  }
}

/** The kept Chrome. */
function keptChrome(chrome: string) {
  const entry = kept(chrome, (stop) => {
    const { child, print, cleanup } = pipeChrome(chrome);
    return { child, api: { print, stop }, cleanup };
  });
  return {
    async print(url: string, timeoutMs: number): Promise<Buffer> {
      entry.busy(1);
      try {
        // A hung Chrome is replaced on the next call.
        return await printWithin(entry.api.print(url), url, timeoutMs, entry.api.stop);
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

/** The brand files alone, tokens, print faces, the document scale, the list marker and the key figure, for a layout that is not a document page, such as the survey deck. */
export function brandCss(): string {
  return ["tokens.css", "print.css", "document.css", "marker.css", "elements/kpi.css"]
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

/** `compose.ts --serve`, kept per project. */
function keptComposer(cwd: string) {
  const entry = kept(`compose:${cwd}`, () => {
    const child = spawn("bun", [join(ROOT, "scripts/compose.ts"), "--serve"], {
      cwd,
      stdio: ["pipe", "ignore", "inherit", "pipe"],
    });
    let id = 0;
    let buffer = "";
    const calls = new Map<number, { resolve(html: string): void; reject(e: Error): void }>();
    const output = child.stdio[3] as Readable;
    output.setEncoding("utf8");
    output.on("data", (chunk: string) => {
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
    child.on("exit", () => {
      for (const call of calls.values()) call.reject(new Error("The composer exited"));
    });
    const compose = (name: string, props: Record<string, unknown>) =>
      new Promise<string>((resolve, reject) => {
        calls.set(++id, { resolve, reject });
        child.stdin!.write(`${JSON.stringify({ id, name, props })}\n`);
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
