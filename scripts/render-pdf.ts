import { randomUUID } from "node:crypto";
import { readFileSync, rmSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { pathToFileURL } from "node:url";
import { chromeBinaryAsync, INSTALL_HINT } from "@hackersandwizards/scaffolding/chrome";
import { inlineImages } from "./inline-images";
import { coldPrint, keptChrome, type PrintJob } from "./print-chrome";

export { compactStyles } from "./compact-styles";
export { brandFile } from "./root";

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
 * `globalThis.hwLayout`, which the print waits for; an SVG with a source or embedded image Chrome
 * cannot decode prints as it is. A
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
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  // A file:// image the render could not inline taints the canvas; it prints at its source size.
  try {
    const png = canvas.toDataURL("image/png");
    if (!/^data:image\\/jpeg|\\.jpe?g($|[?#])/i.test(src)) return png;
    const jpeg = canvas.toDataURL("image/jpeg", 0.9);
    return jpeg.length < png.length ? jpeg : png;
  } catch (error) {
    if (error instanceof DOMException && error.name === "SecurityError") return null;
    throw error;
  }
};
const keep = (img) => {
  if (getComputedStyle(img).aspectRatio.startsWith("auto"))
    img.style.aspectRatio = img.naturalWidth + " / " + img.naturalHeight;
  img.srcset = "";
};
const svgText = (src) => {
  const comma = src.indexOf(",");
  const data = src.slice(comma + 1);
  if (!/;base64/i.test(src.slice(0, comma))) {
    try {
      return decodeURIComponent(data);
    } catch (error) {
      if (error instanceof URIError) return;
      throw error;
    }
  }
  let binary;
  try {
    binary = atob(data);
  } catch (error) {
    if (error instanceof DOMException && error.name === "InvalidCharacterError") return;
    throw error;
  }
  return new TextDecoder().decode(Uint8Array.from(binary, (c) => c.charCodeAt(0)));
};
const decodedImage = async (img) => {
  try {
    await img.decode();
    return true;
  } catch (error) {
    if (error instanceof DOMException && error.name === "EncodingError") return false;
    throw error;
  }
};
const svgRasters = async (img, rect) => {
  const svg = svgText(img.currentSrc);
  if (svg === undefined) return;
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
  const box = doc.documentElement.viewBox?.baseVal;
  if (!box?.width || !box.height) return;
  const unit = Math.min(rect.width / box.width, rect.height / box.height);
  let changed = false;
  for (const image of doc.querySelectorAll("image")) {
    const href = image.getAttribute("href") ?? image.getAttribute("xlink:href") ?? "";
    if (!/^data:image\\/(png|jpeg|webp|gif)/i.test(href)) continue;
    const raster = new Image();
    raster.src = href;
    if (!(await decodedImage(raster)) || image.namespaceURI !== "http://www.w3.org/2000/svg") return;
    const url = redraw(raster, href, Math.max((3 * unit * image.width.baseVal.value) / raster.naturalWidth, (3 * unit * image.height.baseVal.value) / raster.naturalHeight));
    if (url === null) return;
    if (!url) continue;
    image.removeAttribute("xlink:href");
    image.setAttribute("href", url);
    changed = true;
  }
  if (!changed) return;
  img.srcset = "";
  img.src = "data:image/svg+xml," + encodeURIComponent(new XMLSerializer().serializeToString(doc));
  await decodedImage(img);
};
for (const img of document.images) {
  const shrink = () => {
    if ("printScaled" in img.dataset || !img.naturalWidth) return;
    img.dataset.printScaled = "";
    const rect = img.getBoundingClientRect();
    if (/^data:image\\/svg/i.test(img.currentSrc)) {
      (globalThis.hwLayout ??= []).push(svgRasters(img, rect));
      return;
    }
    if (/\\.svg($|[?#])/i.test(img.currentSrc)) return;
    const contain = getComputedStyle(img).objectFit === "contain";
    // A box object-fit fills or covers needs the larger side; contain the smaller.
    const fit = contain ? Math.min : Math.max;
    const scale = fit((3 * rect.width) / img.naturalWidth, (3 * rect.height) / img.naturalHeight);
    let url;
    try {
      url = redraw(img, img.currentSrc, scale);
    } catch (error) {
      (globalThis.hwLayout ??= []).push(Promise.reject(error));
      return;
    }
    if (!url) return;
    keep(img);
    img.src = url;
  };
  if (img.complete) shrink(); else img.addEventListener("load", shrink, { once: true });
}
}`;
const PRINT_SCRIPT = `<script>${PRINT_JS}</script>`;
/** The print copy's policy: a page draws on local files and data URIs and runs its inline scripts,
 *  but frames nothing and reaches no host, so a body naming a local file in a frame or a remote
 *  image prints neither. */
const PRINT_POLICY = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline' file: data:; img-src file: data: blob:; font-src file: data:; media-src file: data:">`;
/** The print script for a page served over HTTP, which the render cannot edit and so prints
 * without PRINT_POLICY: run before the page's own scripts, it waits for the parsed document,
 * whose images then hold the window's load as PRINT_JS describes. */
const PRINT_ON_NEW_DOCUMENT = `document.addEventListener("DOMContentLoaded", () => {${PRINT_JS}}, { once: true });`;

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
  const print = (job: PrintJob) =>
    options.warm ? keptChrome(chrome).print(job) : coldPrint(chrome, job);
  if (/^https?:\/\//.test(htmlPath)) {
    const pdf = await print({ url: htmlPath, timeoutMs, script: PRINT_ON_NEW_DOCUMENT });
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
    const pdf = await print({ url, timeoutMs });
    writeFileSync(pdfPath, pdf);
  } finally {
    rmSync(printPath, { force: true });
  }
}
