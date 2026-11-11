import { afterAll, beforeAll, expect, test } from "bun:test";
import { join, resolve } from "node:path";
import puppeteer, { type Browser } from "puppeteer-core";
import { chromeBinary, INSTALL_HINT, NO_KEYCHAIN } from "@hackersandwizards/scaffolding/chrome";
import { TYPES as TYPES_LISTED } from "../catalog/types";

// A list's items are spaced only between each other, by 2pt: nothing above the first or below the
// last, and every column of a multi-column list starts level. So a list in a table cell (the
// timesheet's activity) sets its first line where text would sit, on the baseline of the row's
// other cells in its size. Read in print media on the type pages
// (dist/types/, written by `bun run build`): each row already holding a list against its cells in
// the list's size, and in each table a body row copied with its last cell taking plain text, then
// a list whose first item wraps, then a one-line list, each list against the plain text. A
// baseline is where Chrome lays out a zero-size inline-block set before a cell's first text.
const TOLERANCE = 0.5; // CSS px
const TYPES = resolve(import.meta.dir, "..", "dist/types");
const GAP = (2 * 96) / 72; // 2pt in CSS px
const GAP_TOLERANCE = 0.05; // CSS px: Chrome lays out in 1/64 px
// Lists that pad their items themselves, which abut: the timeline (DocSteps', and the base's, which
// a page on the base gets as a probe) and the handout's contents. The survey readout does not sit
// on the document base.
const OWN_SPACING = ".timeline, .toc ol";
const OFF_BASE = ".readout ul";
const WRAP = "Ein Eintrag, der in seiner Zelle auf mehr als eine Zeile umbricht, ".repeat(3);

/** Runs in the page: how far each list's first line sits off its reference, and the tables. */
function offsets(wrap: string) {
  const baseline = (cell: Element) => {
    const walker = document.createTreeWalker(cell, NodeFilter.SHOW_TEXT, {
      acceptNode: (n) =>
        n.textContent!.trim() ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_SKIP,
    });
    const text = walker.nextNode();
    if (!text) return null;
    const style = getComputedStyle(text.parentElement!);
    const probe = document.createElement("span");
    probe.style.cssText = "display: inline-block; width: 0; height: 0";
    text.parentNode!.insertBefore(probe, text);
    const y =
      probe.getBoundingClientRect().bottom - cell.closest("tr")!.getBoundingClientRect().top;
    probe.remove();
    return { y, font: `${style.fontSize}/${style.lineHeight}` };
  };
  const readings: { label: string; off: number }[] = [];
  for (const row of document.querySelectorAll<HTMLTableRowElement>("tr")) {
    const cell = [...row.cells].find((c) => c.querySelector(":scope > :is(ul, ol)"));
    if (!cell) continue;
    const list = baseline(cell)!;
    const others = [...row.cells]
      .filter((c) => c !== cell)
      .map(baseline)
      .filter((b) => b?.font === list.font);
    const off = others.length ? Math.max(...others.map((b) => Math.abs(b!.y - list.y))) : NaN;
    readings.push({ label: `as shipped: ${row.textContent!.trim().slice(0, 30)}`, off });
  }
  let tables = 0;
  for (const table of document.querySelectorAll("table")) {
    const row = [...table.querySelectorAll<HTMLTableRowElement>("tbody tr")].find(
      (r) => r.cells.length > 1 && !r.className && [...r.cells].every((c) => c.colSpan === 1),
    );
    if (!row) continue;
    tables++;
    const copy = (html: string) => {
      const r = row.cloneNode(true) as HTMLTableRowElement;
      r.cells[r.cells.length - 1]!.innerHTML = html;
      row.after(r);
      return r.cells[r.cells.length - 1]!;
    };
    const plain = copy("Eins");
    for (const [label, html] of [
      ["first item wraps", `<ul><li>${wrap}</li><li>Zwei</li></ul>`],
      ["one line", "<ul><li>Eins</li><li>Zwei</li></ul>"],
    ] as const)
      readings.push({
        label: `list, ${label}: ${row.textContent!.trim().slice(0, 30)}`,
        off: Math.abs(baseline(copy(html))!.y - baseline(plain)!.y),
      });
  }
  return { readings, tables };
}

/** Runs in the page: each list's space above its first item, below its last and between two, and
 * how far apart the columns of a multi-column list start. */
function spacing([own, offBase]: [string, string]) {
  if (document.querySelector("style[data-hw-document]"))
    document.body.insertAdjacentHTML(
      "beforeend",
      '<ol class="timeline"><li>Eins</li><li>Zwei</li></ol>',
    );
  // A list's own box and a base item by their content; an item that pads itself by its border.
  const content = (el: Element, padded = false) => {
    const r = el.getBoundingClientRect();
    const s = getComputedStyle(el);
    const px = (v: string) => (padded ? 0 : parseFloat(v) || 0);
    return {
      top: r.top + px(s.borderTopWidth) + px(s.paddingTop),
      bottom: r.bottom - px(s.borderBottomWidth) - px(s.paddingBottom),
      left: Math.round(r.left),
    };
  };
  const lists: {
    label: string;
    own: boolean;
    above: number;
    below: number;
    gaps: number[];
    columns: number;
  }[] = [];
  for (const list of document.querySelectorAll("ul, ol")) {
    if (list.matches(offBase)) continue;
    const padded = list.matches(own);
    const items = [...list.children]
      .filter((c) => c.tagName === "LI")
      .map((li) => content(li, padded));
    if (!items.length) continue;
    const box = content(list);
    const tops = new Map<number, number>();
    for (const item of items) if (!tops.has(item.left)) tops.set(item.left, item.top);
    lists.push({
      label: (list.textContent ?? "").trim().slice(0, 30),
      own: padded,
      above: items[0]!.top - box.top,
      below: box.bottom - Math.max(...items.map((item) => item.bottom)),
      gaps: items
        .slice(1)
        .flatMap((item, i) => (item.left === items[i]!.left ? [item.top - items[i]!.bottom] : [])),
      columns: Math.max(...tops.values()) - Math.min(...tops.values()),
    });
  }
  return lists;
}

let browser: Browser;
beforeAll(async () => {
  const executablePath = chromeBinary();
  if (!executablePath) throw new Error(INSTALL_HINT);
  browser = await puppeteer.launch({ executablePath, headless: true, args: NO_KEYCHAIN });
});
afterAll(() => browser?.close());

async function load(file: string, css: string) {
  const page = await browser.newPage();
  try {
    await page.emulateMediaType("print");
    await page.goto(`file://${join(TYPES, file, "index.html")}`, { waitUntil: "load" });
    if (css) await page.addStyleTag({ content: css });
    await page.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all((globalThis as { hwLayout?: Promise<unknown>[] }).hwLayout ?? []);
    });
    return page;
  } catch (error) {
    await page.close();
    throw error;
  }
}

async function measure(file: string, css = "") {
  const page = await load(file, css);
  try {
    return await page.evaluate(offsets, WRAP);
  } finally {
    await page.close();
  }
}

async function measureSpacing(file: string, css = "") {
  const page = await load(file, css);
  try {
    return await page.evaluate(spacing, [OWN_SPACING, OFF_BASE] as [string, string]);
  } finally {
    await page.close();
  }
}

/** Each way a list breaks the spacing, as one line per list. */
const spacingFaults = (lists: Awaited<ReturnType<typeof measureSpacing>>) =>
  lists.flatMap((l) =>
    [
      !l.own &&
        Math.abs(l.above) > GAP_TOLERANCE &&
        `${l.above.toFixed(2)} px above the first item`,
      !l.own && Math.abs(l.below) > GAP_TOLERANCE && `${l.below.toFixed(2)} px below the last item`,
      ...l.gaps
        .filter((g) => Math.abs(g - (l.own ? 0 : GAP)) > GAP_TOLERANCE)
        .map((g) => `${g.toFixed(2)} px between two items`),
      l.columns > GAP_TOLERANCE && `columns start ${l.columns.toFixed(2)} px apart`,
    ]
      .filter(Boolean)
      .map((fault) => `${l.label}: ${fault}`),
  );

test.each(TYPES_LISTED.map((t) => t.file))(
  "%s: a list in a table cell starts on its row's baseline",
  async (file) => {
    const { readings, tables } = await measure(file);
    // A page with a table measures it; a list with no cell in its size beside it reads NaN.
    expect(readings.length).toBeGreaterThanOrEqual(2 * tables);
    const off = readings.filter((r) => !(r.off <= TOLERANCE));
    expect(off.map((r) => `${r.label}: ${r.off.toFixed(2)} px`)).toEqual([]);
  },
  60_000,
);

test("the timesheet's lists with the item's top padding back fail", async () => {
  const { readings } = await measure(
    "leistungsnachweis-pauschal",
    "td li:first-child { padding-top: var(--space-hair) !important }",
  );
  expect(readings.filter((r) => r.label.startsWith("as shipped")).length).toBeGreaterThan(0);
  for (const r of readings) expect(r.off).toBeGreaterThan(TOLERANCE);
}, 60_000);

test.each(TYPES_LISTED.map((t) => t.file))(
  "%s: a list's items are spaced only between each other",
  async (file) => {
    expect(spacingFaults(await measureSpacing(file))).toEqual([]);
  },
  60_000,
);

// The controls: the items' hairs above and below, the 2pt between items as padding, which starts a
// multi-column list's later columns lower than its first, and the gap between a timeline's rows.
test.each([
  [
    "the items' hairs back",
    "geheimhaltungsvereinbarung",
    "ul li, ol li { padding-block: var(--space-hair) !important; margin-top: 0 !important }",
  ],
  [
    "the gap as padding",
    "angebot",
    "li + li { margin-top: 0 !important; padding-top: calc(2 * var(--space-hair)) !important }",
  ],
  [
    "the gap between a timeline's rows",
    "angebot",
    ".timeline li + li { margin-top: calc(2 * var(--space-hair)) !important }",
  ],
])(
  "with %s, a list fails",
  async (_, file, css) => {
    const lists = await measureSpacing(file);
    expect(lists.length).toBeGreaterThan(0);
    expect(spacingFaults(lists)).toEqual([]);
    expect(spacingFaults(await measureSpacing(file, css)).length).toBeGreaterThan(0);
  },
  60_000,
);
