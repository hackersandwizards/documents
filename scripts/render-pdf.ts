import { execFile, execFileSync, spawnSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { homedir, tmpdir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { foreignStyles } from "./styles";

const execFileAsync = promisify(execFile);
// A path, not `new URL(..., import.meta.url)`: under a DOM test environment such as happy-dom the
// global URL is the DOM's, which fileURLToPath rejects.
const HERE = dirname(fileURLToPath(import.meta.url));

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
 * is set from the image's own load event, which holds the window's load, so the CLI prints only
 * after every redraw; work after load raced the print (measured). A document without a `<title>`
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

export async function renderPdf(
  htmlPath: string,
  pdfPath: string,
  options: { timeoutMs?: number } = {},
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
  // Chrome can exit 0 without writing, so a PDF left from an earlier render must not pass the check below.
  rmSync(pdfPath, { force: true });
  // Its own profile, so a render never runs inside, or locks, the user's own Chrome profile.
  const profile = mkdtempSync(join(tmpdir(), "hw-chrome-"));
  try {
    await execFileAsync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        // Chrome otherwise asks the macOS keychain for "Chromium Safe Storage", a dialog per launch.
        "--use-mock-keychain",
        "--password-store=basic",
        `--user-data-dir=${profile}`,
        "--no-pdf-header-footer",
        "--print-background",
        // Chrome tags the PDF without a flag; only the outline needs one.
        "--generate-pdf-document-outline",
        `--print-to-pdf=${pdfPath}`,
        pathToFileURL(printPath).href,
      ],
      { timeout: options.timeoutMs ?? 60_000 },
    );
  } finally {
    rmSync(printPath, { force: true });
    rmSync(profile, { recursive: true, force: true });
  }
  if (!existsSync(pdfPath)) throw new Error(`Chrome produced no PDF at ${pdfPath}`);
}

/**
 * The document base `document.css` as one stylesheet: each `@import` inlined (the brand files from
 * `@hackersandwizards/brand`), `@theme` read as `:root`, and every face a data URI resolved beside the file
 * that names it, so the HTML it lands in renders anywhere.
 */
export function documentCss(): string {
  const css = inlineCss(join(HERE, "../document.css"));
  // The HTML parser ends a style element at this text even inside a CSS comment.
  if (/<\/style/i.test(css)) throw new Error("document.css must not contain </style");
  return css;
}

/** The brand files alone, tokens, print faces and the list marker, for a layout that is not a document page, such as the survey deck. */
export function brandCss(): string {
  return ["tokens.css", "print.css", "marker.css"].map((f) => inlineCss(brandFile(f))).join("\n");
}

/** A file the brand package exports, such as `tokens.css`, as an absolute path. */
export const brandFile = (file: string) =>
  createRequire(import.meta.url).resolve(`@hackersandwizards/brand/${file}`);

function inlineCss(path: string): string {
  const dir = dirname(path);
  return readFileSync(path, "utf-8")
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
 * Fills a document's `<style data-hw-document>` with the current base. HTML without the marker
 * passes unchanged. A document carrying a style the engine did not write fails: it would print a
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
  return html.replace(DOCUMENT_STYLE, () => `<style data-hw-document>\n${css}\n</style>`);
}

/**
 * A document component composed by `scripts/compose.ts` into a standalone, baked HTML string.
 * A child process, so no Vite server starts inside the caller, which may be the app's own; `cwd`
 * is the Astro project whose compiler it runs.
 */
export async function composeDocument(
  name: string,
  props: Record<string, unknown>,
  cwd = process.cwd(),
): Promise<string> {
  const dir = mkdtempSync(join(tmpdir(), "hw-compose-"));
  try {
    const input = join(dir, "props.json");
    const output = join(dir, "document.html");
    writeFileSync(input, JSON.stringify(props));
    try {
      await execFileAsync("bun", [join(HERE, "compose.ts"), name, input, output], { cwd });
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
