/**
 * Where a mean sits on its own scale, 0 at the floor and 1 at the ceiling, because the matrix rows
 * run 1-4 and overall satisfaction 1-5. A zero-width scale scores 0: NaN would silently drop the
 * question from both columns.
 */
export const scalePosition = (value: number, s: { start: number; end: number }): number =>
  s.end > s.start ? (value - s.start) / (s.end - s.start) : 0;

/** A strength's cutoff as a position on its own scale: 4.0 on 1-5, 3.25 on 1-4. */
export const STRENGTH_AT = 0.75;

// The bar colours of every h&w bar:
// teal for strong, teal at the ladder's 70 % for good, the context grey for middling, the design
// guide's Error Red for weak. A mean's figure takes its band's colour where the band is a full
// colour and ink on a tint, which reaches no 4.5:1 as text.
const RED = "var(--negative)";
const TEAL = "var(--accent)";
export const STEP = "var(--deck-bar-step)";
export const CONTEXT = "var(--deck-bar-context)";

/** Bands by position on the value's own scale, so a 1-4 row listed as a strength renders teal. */
export const BANDS: [number, string][] = [
  [STRENGTH_AT, TEAL], // 4.0 on 1-5, 3.25 on 1-4
  [0.5625, STEP], // 3.25 on 1-5, 2.6875 on 1-4
  [0.375, CONTEXT], // 2.5 on 1-5, 2.125 on 1-4
  [-Infinity, RED],
];

/** The band of the mean as printed, to one decimal, so a 2.66 shown as 2.7 is coloured as 2.7 and
 * the bar never contradicts the legend's "from 2.69". */
export function bandColor(value: number, scale: { start: number; end: number }): string {
  const at = scalePosition(Number(value.toFixed(1)), scale);
  return BANDS.find(([from]) => at >= from)![1];
}
