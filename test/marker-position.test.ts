import { afterAll, beforeAll, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";
import { chromeBinary } from "../scripts/render-pdf";

// Every marker on the specimen pages, measured on the pixels Chrome paints: a square's middle on
// the middle of the x-height of the first line beside it (on the caps' middle beside capitals), a
// step number's baseline on that line's baseline. Markers drifted 1.2 to 3.4 px off for months
// while every check passed, since only a render shows where they land. The line's first words
// become "xxxx", so its ink is the x-height band itself (the cap band under text-transform).
const TOLERANCE = 0.6; // CSS px; the fix measured within 0.6 px at 600 dpi (2026-11-01)
const SCALE = 4;
const SPECIMEN = resolve(import.meta.dir, "..", "specimen");
const pages = readdirSync(SPECIMEN).filter((f) => f.endsWith(".html") && f !== "index.html");

type Box = { x: number; y: number; width: number; height: number };
type Probe = { label: string; edge: "middle" | "bottom"; marker: Box; text: Box };

/** Runs in the page: rewrites the line beside each marker and returns the boxes to read. */
function collect(): Probe[] {
  const firstText = (el: Element) => {
    const list = el.closest("ul, ol");
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.parentElement!.closest("ul, ol") === list && n.textContent!.trim()
          ? NodeFilter.FILTER_ACCEPT
          : NodeFilter.FILTER_SKIP,
    });
    return walker.nextNode() as Text | null;
  };
  const label = (el: Element) =>
    `${el.tagName.toLowerCase()}.${el.className.toString().split(" ")[0]} "${el.textContent!.trim().slice(0, 30)}"`;
  const marked: { host: Element; text: Text; edge: Probe["edge"]; mark?: Element }[] = [];
  for (const host of document.querySelectorAll("body *")) {
    const before = getComputedStyle(host, "::before");
    const size = parseFloat(before.width);
    const square =
      before.content === '""' && size > 0 && size <= 16 && before.height === before.width;
    const counter = host.tagName === "LI" && /^counter\(/.test(before.content);
    if (!square && !counter) continue;
    const text = firstText(host);
    if (text) marked.push({ host, text, edge: square ? "middle" : "bottom" });
  }
  for (const mark of document.querySelectorAll(":is(li, h1, h2, h3, h4) *")) {
    if (mark.children.length || !/^\d{1,2}\.?$/.test(mark.textContent!.trim())) continue;
    let next = mark.nextSibling;
    while (next && !next.textContent!.trim()) next = next.nextSibling;
    const text = next && (next instanceof Text ? next : firstText(next as Element));
    if (text) marked.push({ host: mark.parentElement!, text, edge: "bottom", mark });
  }
  for (const m of marked) m.text.data = "xxxx " + m.text.data.trimStart();
  const rectOf = (node: Node, end?: number) => {
    const range = document.createRange();
    range.setStart(node, 0);
    range.setEnd(node, end ?? node.textContent!.length);
    return range.getClientRects()[0]!;
  };
  const box = (left: number, right: number, top: number, bottom: number): Box => ({
    x: left + scrollX,
    y: top + scrollY,
    width: right - left,
    height: bottom - top,
  });
  return marked.map(({ host, text, edge, mark }) => {
    const t = rectOf(text, 4);
    let marker: Box;
    if (mark) {
      const n = rectOf(mark.firstChild!);
      marker = box(n.left, n.right, n.top, n.bottom);
    } else {
      const before = getComputedStyle(host, "::before");
      const flex = getComputedStyle(host).display.endsWith("flex");
      const gap = flex ? parseFloat(getComputedStyle(host).columnGap) || 0 : 0;
      const right = t.left - (parseFloat(before.marginRight) || 0) - gap;
      const left =
        edge === "middle" ? right - parseFloat(before.width) : host.getBoundingClientRect().left;
      marker = box(left - 1, right + 1, t.top - 3, t.bottom + 3);
    }
    return { label: label(host), edge, marker, text: box(t.left, t.right, t.top, t.bottom) };
  });
}

/**
 * Runs in the page: the y in CSS px, from the top of the shot, of its ink's middle (weighted by
 * each pixel's distance from the background) or of its ink's bottom edge (the last row holding at
 * least half the fullest row's ink).
 */
async function inkEdge(png: string, scale: number, edge: Probe["edge"]): Promise<number> {
  const img = new Image();
  img.src = `data:image/png;base64,${png}`;
  await img.decode();
  const ctx = new OffscreenCanvas(img.width, img.height).getContext("2d")!;
  ctx.drawImage(img, 0, 0);
  const { data, width, height } = ctx.getImageData(0, 0, img.width, img.height);
  const counts = new Map<number, number>();
  for (let i = 0; i < data.length; i += 4) {
    const key = (data[i]! << 16) | (data[i + 1]! << 8) | data[i + 2]!;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const bg = [...counts].sort((a, b) => b[1] - a[1])[0]![0];
  const rows = Array.from({ length: height }, (_, y) => {
    let ink = 0;
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      ink += Math.hypot(
        data[i]! - (bg >> 16),
        data[i + 1]! - ((bg >> 8) & 255),
        data[i + 2]! - (bg & 255),
      );
    }
    return ink;
  });
  const total = rows.reduce((a, b) => a + b, 0);
  if (!total) throw new Error("no ink in the probed box");
  if (edge === "middle") return rows.reduce((a, ink, y) => a + ink * (y + 0.5), 0) / total / scale;
  const full = Math.max(...rows);
  return (rows.findLastIndex((ink) => ink >= full / 2) + 1) / scale;
}

let browser: Browser;
beforeAll(async () => {
  const executablePath = chromeBinary();
  if (!executablePath) throw new Error("Chrome for Testing is required; set CHROME_BINARY");
  browser = await puppeteer.launch({ executablePath, headless: true });
});
afterAll(() => browser?.close());

/** Each marker on a specimen page and how far it sits off its line in CSS px, after `css` is added. */
async function measure(file: string, css = "") {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1100, height: 1400, deviceScaleFactor: SCALE });
    await page.goto(`file://${join(SPECIMEN, file)}`, { waitUntil: "load" });
    if (css) await page.addStyleTag({ content: css });
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const read = async (clip: Box, edge: Probe["edge"]) =>
      clip.y +
      (await page.evaluate(
        inkEdge,
        await page.screenshot({ clip, encoding: "base64", captureBeyondViewport: true }),
        SCALE,
        edge,
      ));
    const offsets: { label: string; offset: number }[] = [];
    for (const p of await page.evaluate(collect))
      offsets.push({
        label: p.label,
        offset: (await read(p.marker, p.edge)) - (await read(p.text, p.edge)),
      });
    return offsets;
  } finally {
    await page.close();
  }
}

test.each(pages)(
  "%s: every marker sits on its line",
  async (file) => {
    const off = (await measure(file)).filter((m) => Math.abs(m.offset) > TOLERANCE);
    expect(off.map((m) => `${m.label}: ${m.offset.toFixed(2)} px`)).toEqual([]);
  },
  60_000,
);

// The control: Chrome paints a marker on whole CSS pixels, so a misplaced one sits a pixel or more
// off. The onepager's markers rest furthest below centre and the document's furthest above, so a
// pixel down there and up here is the move that must fail.
test.each([
  ["onepager.html", 1],
  ["dokument.html", -1],
])(
  "%s with every square marker moved by %d px fails",
  async (file, px) => {
    const moved = await measure(file, `li::before { position: relative; top: ${px}px }`);
    const squares = moved.filter((m) => m.label.startsWith("li."));
    expect(squares.length).toBeGreaterThan(0);
    for (const m of squares) expect(Math.abs(m.offset)).toBeGreaterThan(TOLERANCE);
  },
  60_000,
);
