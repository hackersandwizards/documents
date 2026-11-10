import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { surveyReadout } from "../scripts/samples";
import {
  bandColor,
  composeSurveyReadout,
  READOUT_TEXT,
  SLIDE_COUNT,
} from "../scripts/survey-readout";
import { probePage } from "./probe";

test("every slide draws brand's hw-strip, whose rule the inlined brand files carry", () => {
  const html = composeSurveyReadout(surveyReadout);
  expect(html.match(/class="strip hw-strip"/g)).toHaveLength(SLIDE_COUNT);
  expect(html).toMatch(/\.hw-strip\s*\{/);
  expect(html).not.toMatch(/\/\*/);
});

test("a mark colour cannot open an attribute", () => {
  const weak = surveyReadout.readout.weak;
  const html = composeSurveyReadout({
    ...surveyReadout,
    readout: { ...surveyReadout.readout, weakColors: weak.map(() => 'red" onmouseover="x') },
  });
  expect(html).not.toContain('" onmouseover=');
  expect(html).toContain("--mark:red&quot; onmouseover=&quot;x");
});

test("a text.lang that is no language tag is refused", () => {
  const text = { ...READOUT_TEXT, lang: "en_GB" };
  expect(() => composeSurveyReadout({ ...surveyReadout, text })).toThrow(/not "en_GB"/);
});

// A scale whose group the deck's words do not list still reaches the scores slide.
test("a scale in a group outside text.groups is shown, not dropped", () => {
  const html = composeSurveyReadout({
    ...surveyReadout,
    scales: [{ ...surveyReadout.scales[0], title: "[OWN-GROUP-ROW]", group: "[OWN-GROUP]" }],
  });
  expect(html).toContain("[OWN-GROUP]");
  expect(html).toContain("[OWN-GROUP-ROW]");
});

// A 1-4 mean of 2.66 printed "2,7" but took the band below "from 2.69": the
// bar is coloured by the printed one-decimal mean, and the legend keeps its exact thresholds.
test("a bar takes the band of its printed mean", () => {
  const row = { ...surveyReadout.scales[0], title: "[ROUNDED-ROW]", start: 1, end: 4, mean: 2.66 };
  const html = composeSurveyReadout({ ...surveyReadout, scales: [row] });
  const at = html.indexOf("[ROUNDED-ROW]");
  expect(html.slice(at, at + 600)).toContain("--band:var(--deck-bar-step)");
  expect(html.slice(at, at + 600)).toContain(">2.7<");
  expect(html).toContain("from 2.69");
});

// The readout's markers follow its key, "the score's band on page 3": a weak spot's square takes the
// colour its caller passes, a strength's the strong band, never the default teal or another colour.
test("a weak spot's marker takes its band, a strength's the strong band", () => {
  const html = composeSurveyReadout({
    ...surveyReadout,
    readout: { ...surveyReadout.readout, weakColors: ["var(--negative)"] },
  });
  const marker = (list: string) =>
    `getComputedStyle(document.querySelector("ul.${list} li"), "::before").backgroundColor`;
  const probe = `const swatch = (v) => { const i = document.createElement("i"); i.style.background = v; document.body.append(i); return getComputedStyle(i).backgroundColor; };
    return JSON.stringify({ bad: ${marker("bad")}, good: ${marker("good")}, red: swatch("var(--negative)"), teal: swatch("var(--accent)") });`;
  const seen = JSON.parse(probePage(html, probe, SLIDE));
  expect(seen.bad).toBe(seen.red);
  expect(seen.good).toBe(seen.teal);
}, 60_000);

test("the sample's weak spot carries its score's band", () => {
  const weak = surveyReadout.scales.find((s) => s.mean.toFixed(1) === "2.9")!;
  expect(surveyReadout.readout.weakColors).toEqual([bandColor(weak.mean, weak)]);
});

test("an undefined word keeps the default, and the largest risk is the top one", () => {
  const html = composeSurveyReadout({
    ...surveyReadout,
    text: { eyebrow: undefined } as Partial<typeof READOUT_TEXT>,
    risks: [
      { label: "[SMALL]", n: 1 },
      { label: "[BIG]", n: 5 },
    ],
  });
  expect(html).toContain(READOUT_TEXT.eyebrow);
  const at = html.indexOf("[BIG]");
  expect(html.slice(at, at + 200)).toContain("rfill top");
  expect(html.slice(html.indexOf("[SMALL]"), at)).not.toContain("rfill top");
});

/** The deck in Chrome at its slide size. */
const SLIDE = ["--window-size=1280,720"];

// A free-text page a few pixels too full squeezed its kicker, a flex item of fixed height, and the
// title rose 3px on that slide alone (a real readout). Twelve invented answers of these
// lengths reproduce it in Chrome; every slide's title must sit at the same height.
test("every slide's title sits at the same height", () => {
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
}, 60_000);

// "N answers" over each bar overran its column on a seven-point scale; a longer scale prints the
// bare count and names the unit on its axis, and no count runs past its column.
test("a count fits over its bar on a five- and an eleven-point scale", () => {
  for (const dist of [
    [99, 98, 97, 96, 95],
    [1, 2, 3, 5, 8, 13, 21, 34, 55, 9, 4],
  ]) {
    const headline = { ...surveyReadout.headline, start: 1, end: dist.length, dist };
    const html = composeSurveyReadout({ ...surveyReadout, headline });
    expect(html).toContain(dist.length > 5 ? ">55<" : ">99 answers<");
    const over = probePage(
      html,
      `return [...document.querySelectorAll(".dn")].filter((e) => e.scrollWidth > e.closest(".dcol").clientWidth + 1).length;`,
      SLIDE,
    );
    expect(over).toBe("0");
  }
}, 60_000);

// Submissions an attendee left unfinished score nothing, so the deck says so rather than printing a
// bare "total" beside the completed count; and every word it prints itself is replaceable.
test("the deck names unfinished submissions and takes its words from `text`", () => {
  const html = composeSurveyReadout(surveyReadout);
  expect(html).toContain("1 unfinished, not scored");
  expect(html).not.toContain(" total<");
  expect(html).toContain("flag, not a score");
  const german = composeSurveyReadout({ ...surveyReadout, text: { glance: "Auf einen Blick" } });
  expect(german).toContain("<h2>Auf einen Blick</h2>");
  expect(german).not.toContain("At a glance");
});

// A sliver of bar for a rating nobody chose read as a response: such a rating keeps only its count.
test("each rating says its count, an empty one without a bar", () => {
  const headline = { ...surveyReadout.headline, start: 1, end: 4, dist: [0, 1, 0, 2] };
  const html = composeSurveyReadout({ ...surveyReadout, headline });
  const chart = html.slice(
    html.indexOf('<div class="dscale">'),
    html.indexOf('<div class="caption axis">'),
  );
  expect(chart.match(/class="dbar"/g)).toHaveLength(2);
  expect(chart).toContain('<div class="dbarwrap"><div class="dn">0 answers</div></div>');
  expect(chart).toContain(">1 answer<");
  expect(chart).toContain(">2 answers<");
  expect(html).toContain("Rating, 1 (low) to 4 (high)");
});

test("a single response gets its own line under the overall score", () => {
  const one = { ...surveyReadout.headline, n: 1, dist: [0, 0, 0, 1, 0] };
  const html = composeSurveyReadout({ ...surveyReadout, headline: one });
  expect(html).toContain(READOUT_TEXT.distributionOne);
  expect(html).not.toContain("Mean of 1 responses");
  expect(composeSurveyReadout(surveyReadout)).toContain(
    `Mean of ${surveyReadout.headline.n} responses.`,
  );
});

// Words the engine prints itself reach clients: no dash sets off a clause, quotes are straight.
test("the engine's own words carry no em dash and no curly quote", () => {
  expect(JSON.stringify(READOUT_TEXT)).not.toMatch(/[—“”‘’]/);
  for (const file of readdirSync(join(import.meta.dir, "../components"))) {
    const code = readFileSync(join(import.meta.dir, "../components", file), "utf8")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*|<!--)/.test(line));
    expect({ file, hits: code.filter((line) => /[—“”‘’]/.test(line)) }).toEqual({ file, hits: [] });
  }
});
