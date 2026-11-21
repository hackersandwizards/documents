import { fc, test } from "@hackersandwizards/scaffolding/property";
import { expect } from "vitest";
import { bandColor, scalePosition } from "../scripts/score-bands";

test.prop(
  [
    fc.integer({ min: -64, max: 64 }),
    fc.integer({ min: 1, max: 64 }),
    fc.integer({ min: -16, max: 32 }),
  ],
  {
    examples: [
      [0, 1, 0],
      [0, 1, 16],
      [0, 1, -16],
      [0, 1, 32],
    ],
  },
)("scale position is affine and a nonpositive width always gives zero", (start, width, step) => {
  const value = start + (width * step) / 16;
  expect(scalePosition(value, { start, end: start + width })).toBe(step / 16);
  expect(scalePosition(value, { start, end: start })).toBe(0);
  expect(scalePosition(value, { start, end: start - width })).toBe(0);
});

test.prop([fc.constantFrom(4, 5), fc.integer({ min: 0, max: 600 })], {
  examples: [
    [4, 214],
    [4, 215],
    [4, 264],
    [4, 266],
    [4, 324],
    [4, 326],
    [5, 244],
    [5, 246],
    [5, 324],
    [5, 326],
    [5, 394],
    [5, 396],
  ],
})(
  "a displayed one-decimal score uses the band for that scale's printed thresholds",
  (end, hundredths) => {
    const value = hundredths / 100;
    const tenths = Number(value.toFixed(1)) * 10;
    const [middle, good, strong] = end === 4 ? [22, 27, 33] : [25, 33, 40];
    const expected =
      tenths >= strong
        ? "var(--accent)"
        : tenths >= good
          ? "var(--deck-bar-step)"
          : tenths >= middle
            ? "var(--deck-bar-context)"
            : "var(--negative)";
    expect(bandColor(value, { start: 1, end })).toBe(expected);
  },
);
