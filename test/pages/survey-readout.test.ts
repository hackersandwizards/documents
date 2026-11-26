import { assert, expect, test } from "vitest";
import { isRecord } from "../../scripts/root";
import { surveyReadout } from "../../scripts/sample-survey";
import { composeSurveyReadout } from "../../scripts/survey-readout";
import { probePage, limit } from "../probe";

const SLIDE = ["--window-size=1280,720"];

// The readout's markers follow its key, "the score's band on page 3": a weak spot's square takes the
// colour its caller passes, never the default teal, and a strength's the strong band.
test(
  "a weak spot's marker takes its band, a strength's the strong band",
  () => {
    const html = composeSurveyReadout({
      ...surveyReadout,
      readout: { ...surveyReadout.readout, weakColors: ["var(--negative)"] },
    });
    const marker = (list: string) =>
      `getComputedStyle(document.querySelector("ul.${list} li"), "::before").backgroundColor`;
    const probe = `const swatch = (v) => { const i = document.createElement("i"); i.style.background = v; document.body.append(i); return getComputedStyle(i).backgroundColor; };
    return JSON.stringify({ bad: ${marker("bad")}, good: ${marker("good")}, red: swatch("var(--negative)"), teal: swatch("var(--accent)") });`;
    const seen: unknown = JSON.parse(probePage(html, probe, SLIDE));
    assert(isRecord(seen), "Expected the marker and swatch colours");
    expect(seen.bad).toBe(seen.red);
    expect(seen.good).toBe(seen.teal);
  },
  limit(60_000),
);

// A free-text page a few pixels too full squeezed its kicker, a flex item of fixed height, and the
// title rose 3px on that slide alone (a real readout). Twelve invented answers of these
// lengths reproduce it in Chrome; every slide's title must sit at the same height.
test(
  "every slide's title sits at the same height",
  () => {
    const words = "the review loop on our own codebase made the difference and the exercises fit";
    const answer = (k: number) =>
      `An invented answer: ${Array.from({ length: k }, (_, i) => words.split(" ")[i % 14]).join(" ")}.`;
    const liked = Array.from({ length: 12 }, (_, i) => answer(6 + ((i * 7) % 23)));
    const tops = probePage(
      composeSurveyReadout({ ...surveyReadout, liked }),
      `return [...document.querySelectorAll(".slide h2")].map((h) => h.getBoundingClientRect().top - h.closest(".slide").getBoundingClientRect().top).join(" ");`,
      SLIDE,
    ).split(" ");
    expect(tops).toHaveLength(6);
    expect(new Set(tops).size).toBe(1);
  },
  limit(60_000),
);

// "N answers" over each bar overran its column on a seven-point scale; a longer scale prints the
// bare count and names the unit on its axis, and no count runs past its column.
test.each([
  { scale: "five-point scale", dist: [99, 98, 97, 96, 95], label: ">99 answers<" },
  {
    scale: "eleven-point scale",
    dist: [1, 2, 3, 5, 8, 13, 21, 34, 55, 9, 4],
    label: ">55<",
  },
])(
  "counts fit above the bars on a $scale",
  ({ dist, label }) => {
    const headline = { ...surveyReadout.headline, start: 1, end: dist.length, dist };
    const html = composeSurveyReadout({ ...surveyReadout, headline });
    expect(html).toContain(label);
    const result = probePage(
      html,
      `const counts = [...document.querySelectorAll(".dn")];
       return JSON.stringify({
         labels: counts.length,
         overflows: counts.filter((e) => e.scrollWidth > e.closest(".dcol").clientWidth + 1).length,
       });`,
      SLIDE,
    );
    expect(JSON.parse(result)).toEqual({ labels: dist.length, overflows: 0 });
  },
  limit(60_000),
);
