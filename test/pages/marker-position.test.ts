import { afterAll, beforeAll, expect, test } from "vitest";
import { limit } from "../probe";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";
import { chromeBinary, INSTALL_HINT, NO_KEYCHAIN } from "@hackersandwizards/scaffolding/chrome";
import { TYPES as TYPES_LISTED } from "../../catalog/types";

// Load the brand scanner through Bun so its transitive imports have Bun's import.meta.dir.
const { CAP_SHARE, TOLERANCE: LIST_TOLERANCE } = createRequire(import.meta.url)(
  "@hackersandwizards/brand/markers",
) as typeof import("@hackersandwizards/brand/markers");

// The markers on the type pages (dist/types/, written by `bun run build`) that brand-markers leaves
// out, measured on the pixels Chrome paints. `check:markers` runs brand-markers on every type page
// holding a <ul>, which measures each list square and its item's first line; this test measures
// the rest: a step number's baseline on its line's baseline (a numbered item's counter, a numeral
// element in an item or heading), and a square outside a list (a section label's), whose middle
// sits CAP_SHARE of the way from the x-height middle of its line to the cap-height middle, as
// brand's --hw-marker-mid has it. The line's first words become "xxxxHHHH" beside a square, so the
// x's ink is the x-height band and the H's the cap-height band, and "xxxx" beside a step number.
const TOLERANCE = 0.6; // CSS px
const SCALE = 4;
const TYPES = resolve(import.meta.dirname, "../..", "dist/types");
// The listed pages only: a former address in dist/types/ is a redirect.
const pages = TYPES_LISTED.map((t) => t.file);

type Box = { x: number; y: number; width: number; height: number };
type Probe = { label: string; edge: "middle" | "bottom"; marker: Box; text: Box; caps: Box | null };
type Marker = { host: Element; text: Text; edge: Probe["edge"]; numeral?: Element };

/** Runs in the page: rewrites the line beside each marker brand-markers leaves out and returns the
 * boxes to read, with the count of list squares it left to brand-markers. */
function collect(): { probes: Probe[]; listSquares: number } {
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
  const classifyPseudo = (host: Element): "list-square" | "middle" | "bottom" | "none" => {
    const before = getComputedStyle(host, "::before");
    const size = markerSize(before);
    if (before.content === '""' && size > 0 && size <= 16) {
      return host.matches("li, li > p") ? "list-square" : "middle";
    }
    return host.tagName === "LI" && /^counter\(/.test(before.content) ? "bottom" : "none";
  };
  const pseudoMarkers = () => {
    const markers: Marker[] = [];
    let listSquares = 0;
    for (const host of document.querySelectorAll("body *")) {
      const kind = classifyPseudo(host);
      if (kind === "none") continue;
      if (kind === "list-square") {
        listSquares++;
        continue;
      }
      const text = firstText(host);
      if (text) markers.push({ host, text, edge: kind });
    }
    return { markers, listSquares };
  };
  const inlineNumerals = (): Marker[] => {
    const markers: Marker[] = [];
    for (const numeral of document.querySelectorAll(":is(li, h1, h2, h3, h4) *")) {
      if (numeral.children.length || !/^\d{1,2}\.?$/.test(numeral.textContent!.trim())) continue;
      let next = numeral.nextSibling;
      while (next && !next.textContent!.trim()) next = next.nextSibling;
      const text = next && (next instanceof Text ? next : firstText(next as Element));
      if (text) markers.push({ host: numeral.parentElement!, text, edge: "bottom", numeral });
    }
    return markers;
  };
  const prepareLine = ({ edge, text, host }: Marker) => {
    text.data = (edge === "middle" ? "xxxxHHHH " : "xxxx ") + text.data.trimStart();
    // An underline or shadow would add ink below the bands; an ancestor's decoration reaches
    // every descendant, so it goes on each element from the text up to the host.
    for (let el = text.parentElement; el && el !== host.parentElement; el = el.parentElement) {
      el.style.textDecorationLine = "none";
      el.style.textShadow = "none";
    }
  };
  const rectOf = (node: Node, end?: number, start = 0) => {
    const range = document.createRange();
    range.setStart(node, start);
    range.setEnd(node, end ?? node.textContent!.length);
    return range.getClientRects()[0]!;
  };
  const box = ({ left, right, top, bottom }: DOMRectReadOnly): Box => ({
    x: left + scrollX,
    y: top + scrollY,
    width: right - left,
    height: bottom - top,
  });
  const pseudoBox = ({ host, edge }: Marker, textRect: DOMRect): Box => {
    const before = getComputedStyle(host, "::before");
    const style = getComputedStyle(host);
    const gap = style.display.endsWith("flex") ? parseFloat(style.columnGap) || 0 : 0;
    const right = textRect.left - (parseFloat(before.marginRight) || 0) - gap;
    const left = edge === "middle" ? right - markerSize(before) : host.getBoundingClientRect().left;
    return box(
      DOMRect.fromRect({
        x: left - 1,
        y: textRect.top - 3,
        width: right - left + 2,
        height: textRect.height + 6,
      }),
    );
  };
  const readProbe = (marker: Marker): Probe => {
    const { host, text, edge, numeral } = marker;
    const textRect = rectOf(text, 4);
    return {
      label: label(host),
      edge,
      marker: numeral ? box(rectOf(numeral.firstChild!)) : pseudoBox(marker, textRect),
      text: box(textRect),
      caps: edge === "middle" ? box(rectOf(text, 8, 4)) : null,
    };
  };

  const { markers, listSquares } = pseudoMarkers();
  const measured = [...markers, ...inlineNumerals()];
  measured.forEach(prepareLine);
  return { probes: measured.map(readProbe), listSquares };
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
  if (!executablePath) throw new Error(INSTALL_HINT);
  browser = await puppeteer.launch({ executablePath, headless: true, args: NO_KEYCHAIN });
});
afterAll(() => browser?.close());

const tolerance = (label: string) => (/^(li|p)\./.test(label) ? LIST_TOLERANCE : TOLERANCE);

/** Each marker on a type page that brand-markers leaves out, how far it sits off its line in CSS
 * px, after `css` is added, and how many list squares the page holds. */
async function measure(file: string, css = "") {
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1100, height: 1400, deviceScaleFactor: SCALE });
    await page.goto(`file://${join(TYPES, file, "index.html")}`, { waitUntil: "load" });
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
    const { probes, listSquares } = await page.evaluate(collect);
    for (const p of probes) {
      const x = await read(p.text, p.edge);
      const target = p.caps ? x + CAP_SHARE * ((await read(p.caps, p.edge)) - x) : x;
      offsets.push({ label: p.label, offset: (await read(p.marker, p.edge)) - target });
    }
    return { offsets, listSquares };
  } finally {
    await page.close();
  }
}

const baselineMeasurements = new Map<string, ReturnType<typeof measure>>();

function measureBaseline(file: string) {
  const existing = baselineMeasurements.get(file);
  if (existing) return existing;
  const measured = measure(file);
  baselineMeasurements.set(file, measured);
  return measured;
}

test.each(pages)(
  "%s: every step number and every square outside a list sits on its line",
  async (file) => {
    const { offsets } = await measureBaseline(file);
    const off = offsets.filter((m) => Math.abs(m.offset) > tolerance(m.label));
    expect(off.map((m) => `${m.label}: ${m.offset.toFixed(2)} px`)).toEqual([]);
  },
  limit(60_000),
);

// check:markers takes the pages holding a <ul>; a list square elsewhere would go unmeasured.
test(
  "every type page with a list square is included in check:markers",
  async () => {
    expect(pages.length).toBeGreaterThanOrEqual(20);
    const counts = [];
    for (const file of pages) {
      const { listSquares } = await measureBaseline(file);
      counts.push({ file, listSquares });
    }
    const withListSquares = counts
      .filter(({ listSquares }) => listSquares > 0)
      .map(({ file }) => file);
    expect(withListSquares, "Type pages with list squares").not.toHaveLength(0);
    for (const file of withListSquares)
      expect(await Bun.file(join(TYPES, file, "index.html")).text(), file).toContain("<ul");
  },
  limit(60_000),
);

// The controls: each kind of marker measured here, moved by a pixel, must fail.
test.each([
  ["angebot", "span.section-label", ".section-label::before { position: relative; top: 1px }"],
  ["vorbereitung", "h3.", ".step { position: relative; top: -1px }"],
  ["handout", "li.", "li::before { position: relative; top: 1px }"],
])(
  "%s with its %s marker moved by a pixel fails",
  async (file, label, css) => {
    const moved = (await measure(file, css)).offsets.filter((m) => m.label.startsWith(label));
    expect(moved.length).toBeGreaterThan(0);
    for (const m of moved) expect(Math.abs(m.offset)).toBeGreaterThan(tolerance(m.label));
  },
  limit(60_000),
);

// The control for the page guard: a square on the handout's <ol> items, a page with no <ul>, counts.
test(
  "a square on a list item is counted on a page without a <ul>",
  async () => {
    const css = `.toc li::before { content: ""; display: inline-block; width: 6px; height: 6px }`;
    expect((await measure("handout", css)).listSquares).toBeGreaterThan(0);
  },
  limit(60_000),
);
