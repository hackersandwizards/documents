import { escapeHtml as esc, fill } from "./fill";
import { bandColor, BANDS, CONTEXT, scalePosition, STEP } from "./score-bands";
import type { ReadoutText } from "./readout-text";

/** One rated question or matrix row: its mean, its count per rating from `start` to `end`. */
export interface ReadoutScale {
  title: string;
  n: number;
  mean: number;
  start: number;
  end: number;
  /** index 0 is the rating `start` */
  dist: number[];
  /** The section on the scores slide: "Content & format" (the default), "Trainer" or
   * "Confidence & application". */
  group?: string;
}

/** A mean's figure: its band's colour, or ink where the band is a tint. */
export const figureColor = (band: string) =>
  band === STEP || band === CONTEXT ? "var(--ink)" : band;

/** The key under the scores title: what the bar, its colour and the strip mean, per scale present. */
export function scoreLegend(
  t: ReadoutText,
  scales: { start: number; end: number }[],
  overall?: { start: number; end: number },
): string {
  const ranges = [...new Map(scales.map((s) => [`${s.start}–${s.end}`, s])).values()];
  const cut = (from: number, s: { start: number; end: number }) =>
    (s.start + from * (s.end - s.start)).toFixed(2).replace(/0$/, "");
  const keys = ranges.map((s) => {
    const steps = BANDS.map(([from, col], i) => {
      const label = esc(
        i === BANDS.length - 1 ? t.bandBelow : fill(t.bandFrom, { value: cut(from, s) }),
      );
      return `<span class="lkey"><i style="--band:${col}"></i>${label}</span>`;
    }).join("");
    return `<span class="lscale">${esc(fill(t.barKey, s))}</span>${steps}`;
  });
  // Page 2's overall score may run on another scale; say so where the rows' scale differs.
  const other =
    overall && !ranges.some((s) => s.start === overall.start && s.end === overall.end)
      ? `<span class="lsep"></span><span class="lscale">${esc(fill(t.overallScale, overall))}</span>`
      : "";
  const strips = ranges.map((s) => {
    const steps = Array.from({ length: s.end - s.start + 1 }, (_, i) => s.start + i)
      .map((v) => `<span class="lkey"><i style="--band:${rampColor(v, s)}"></i>${v}</span>`)
      .join("");
    return `<span class="lscale">${esc(t.stripKey)}</span>${steps}`;
  });
  return `<div class="legend">${keys.join('<span class="lsep"></span>')}${other}</div><div class="legend">${strips.join('<span class="lsep"></span>')}</div>`;
}

function shortDim(title: string): string {
  return title.replace(/\.$/, "");
}

/** A rating's shade, ink on the opacity ladder, the top step for the top rating: answer
 * distributions carry no band colour, which on 1-4 would paint ratings 1 and 2 the same red. */
const LADDER = [15, 25, 40, 70, 100];
function rampColor(val: number, s: { start: number; end: number }): string {
  const steps = LADDER.slice(-Math.min(LADDER.length, s.end - s.start + 1));
  const pct = steps[Math.round(scalePosition(val, s) * (steps.length - 1))];
  return `color-mix(in srgb, var(--ink) ${pct}%, var(--tint))`;
}

function distBar(s: ReadoutScale): string {
  const segs = s.dist
    .map((c, i) => {
      const val = s.start + i;
      if (c === 0) return "";
      const col = rampColor(val, s);
      return `<span class="seg" style="--count:${c};--band:${col}" title="${val}: ${c}"></span>`;
    })
    .join("");
  return `<div class="dist">${segs}</div>`;
}

export function scaleRow(s: ReadoutScale): string {
  const col = s.n ? bandColor(s.mean, s) : "inherit";
  const fill = s.n ? scalePosition(s.mean, s) * 100 : 0;
  return `
    <div class="srow">
      <div class="slabel">${esc(shortDim(s.title))}</div>
      <div class="strack">
        <div class="sfill" style="--share:${fill.toFixed(1)}%;--band:${col}"></div>
      </div>
      <div class="smean" style="--band:${figureColor(col)}">${s.n ? s.mean.toFixed(1) : "–"}</div>
      ${distBar(s)}
    </div>`;
}

/** The most ratings whose bars each fit "99 answers": seven collided in Chrome. */
export const WORDED_BARS = 5;

export function distScale(t: ReadoutText, s: ReadoutScale): string {
  // Bars scale to the most-chosen value, so the chart uses its height: scaled to the total, the
  // tallest bar stood at 40% and the chart read as a strip under an empty band.
  const total = Math.max(1, ...s.dist);
  return `<div class="dscale">${s.dist
    .map((c, i) => {
      const val = s.start + i;
      // Each count says what it counts, over its bar, so no key column names the rows. A value
      // nobody chose draws no bar, only its count on the baseline: a sliver read as a response.
      const words = s.dist.length > WORDED_BARS ? "{n}" : c === 1 ? t.answer : t.answers;
      const n = `<div class="dn">${esc(fill(words, { n: c }))}</div>`;
      const bar = c
        ? `<div class="dbar" style="--share:${(c / total) * 100}%;--band:${rampColor(val, s)}">${n}</div>`
        : n;
      return `<div class="dcol"><div class="dbarwrap">${bar}</div><div class="dv">${val}</div></div>`;
    })
    .join("")}</div>`;
}
