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
// Each page runs twice: as composed, and with a newline and indent opening every list item, as
// hand-written HTML has it (30 of 43 os onepagers, 2026-11-01), where an inline-block marker kept
// the newline as a space and pushed the first line 3.5 px right of the wrapped ones.
const TOLERANCE = 0.6; // CSS px; the fix measured within 0.6 px at 600 dpi (2026-11-01)
// A list's square, cut to the exact half ex (document.css), measured within 0.1 px (2026-11-01);
// the lift rounded to whole pixels before sat up to 0.56 px off.
const LIST_TOLERANCE = 0.25;
const SCALE = 4;
const SPECIMEN = resolve(import.meta.dir, "..", "specimen");
const pages = readdirSync(SPECIMEN).filter((f) => f.endsWith(".html") && f !== "index.html");

type Box = { x: number; y: number; width: number; height: number };
type Probe = { label: string; edge: "middle" | "bottom"; marker: Box; text: Box; indent: number };

/** Runs in the page: rewrites the line beside each marker and returns the boxes to read, and for
 * a square marker how far its first line starts right of the item's content edge, where wrapped
 * lines start. `newline` first opens every list item with a newline and an indent. */
function collect(newline: boolean): Probe[] {
  if (newline)
    for (const li of document.querySelectorAll("li"))
      li.insertBefore(document.createTextNode("\n      "), li.firstChild);
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
  // A marker's side: an inline box's width is its padding (its clip-path cuts the square), an
  // inline-block's its size.
  const markerSize = (before: CSSStyleDeclaration) =>
    before.display === "inline"
      ? parseFloat(before.paddingLeft) + parseFloat(before.paddingRight)
      : before.height === before.width
        ? parseFloat(before.width)
        : 0;
  const label = (el: Element) =>
    `${el.tagName.toLowerCase()}.${el.className.toString().split(" ")[0]} "${el.textContent!.trim().slice(0, 30)}"`;
  const marked: { host: Element; text: Text; edge: Probe["edge"]; mark?: Element }[] = [];
  for (const host of document.querySelectorAll("body *")) {
    const before = getComputedStyle(host, "::before");
    const square = before.content === '""' && markerSize(before) > 0 && markerSize(before) <= 16;
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
    let indent = 0;
    if (mark) {
      const n = rectOf(mark.firstChild!);
      marker = box(n.left, n.right, n.top, n.bottom);
    } else {
      const before = getComputedStyle(host, "::before");
      const flex = getComputedStyle(host).display.endsWith("flex");
      const gap = flex ? parseFloat(getComputedStyle(host).columnGap) || 0 : 0;
      const right = t.left - (parseFloat(before.marginRight) || 0) - gap;
      const left =
        edge === "middle" ? right - markerSize(before) : host.getBoundingClientRect().left;
      marker = box(left - 1, right + 1, t.top - 3, t.bottom + 3);
      if (edge === "middle" && host.closest("li")) {
        const hostStyle = getComputedStyle(host);
        indent =
          t.left -
          host.getBoundingClientRect().left -
          parseFloat(hostStyle.borderLeftWidth) -
          parseFloat(hostStyle.paddingLeft);
      }
    }
    return {
      label: label(host),
      edge,
      marker,
      text: box(t.left, t.right, t.top, t.bottom),
      indent,
    };
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

/** A list square is held to its own tolerance, every other marker to the page-wide one. */
const tolerance = (label: string) => (/^(li|p)\./.test(label) ? LIST_TOLERANCE : TOLERANCE);

/** Each marker on a specimen page, how far it sits off its line in CSS px and how far its first
 * line starts right of the wrapped lines, after `css` is added. */
async function measure(file: string, newline: boolean, css = "") {
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
    const offsets: { label: string; offset: number; indent: number }[] = [];
    for (const p of await page.evaluate(collect, newline))
      offsets.push({
        label: p.label,
        offset: (await read(p.marker, p.edge)) - (await read(p.text, p.edge)),
        indent: p.indent,
      });
    return offsets;
  } finally {
    await page.close();
  }
}

// The survey readout writes its own markup, every item on one line, so it runs as composed only.
const cases = pages.flatMap((file) =>
  file === "survey-readout.html"
    ? [[file, false]]
    : [
        [file, false],
        [file, true],
      ],
) as [string, boolean][];

test.each(cases)(
  "%s (newline after <li>: %p): every marker sits on its line, first lines start on the wrapped ones",
  async (file, newline) => {
    const measured = await measure(file, newline);
    const off = measured.filter((m) => Math.abs(m.offset) > tolerance(m.label));
    expect(off.map((m) => `${m.label}: ${m.offset.toFixed(2)} px`)).toEqual([]);
    const indented = measured.filter((m) => Math.abs(m.indent) > TOLERANCE);
    expect(indented.map((m) => `${m.label}: first line ${m.indent.toFixed(2)} px in`)).toEqual([]);
  },
  60_000,
);

// The control: a marker moved a pixel down on one page and up on the other must fail.
test.each([
  ["onepager.html", 1],
  ["dokument.html", -1],
])(
  "%s with every square marker moved by %d px fails",
  async (file, px) => {
    const moved = await measure(file, false, `li::before { position: relative; top: ${px}px }`);
    const squares = moved.filter((m) => m.label.startsWith("li."));
    expect(squares.length).toBeGreaterThan(0);
    for (const m of squares) expect(Math.abs(m.offset)).toBeGreaterThan(TOLERANCE);
  },
  60_000,
);

// The control for the list checks: document.css's marker before 2026-11-01, an inline-block lifted
// by whole pixels, fails both on the onepager, off centre beyond the list tolerance as composed and
// its first lines indented once a newline opens the items.
const OLD_MARKER = `ul li::before, ul li > p:first-child::before { display: inline-block;
  float: none; margin: 0 6pt 0 -12pt; transform: none;
  vertical-align: round(calc(0.273em - var(--print-bullet) / 2), 1px) }`;

test("onepager.html with the old inline-block marker fails centring and first-line alignment", async () => {
  const composed = (await measure("onepager.html", false, OLD_MARKER)).filter((m) =>
    m.label.startsWith("li."),
  );
  expect(composed.length).toBeGreaterThan(0);
  for (const m of composed) expect(Math.abs(m.offset)).toBeGreaterThan(LIST_TOLERANCE);
  const newline = (await measure("onepager.html", true, OLD_MARKER)).filter((m) =>
    m.label.startsWith("li."),
  );
  expect(newline.length).toBeGreaterThan(0);
  for (const m of newline) expect(m.indent).toBeGreaterThan(TOLERANCE);
}, 60_000);
