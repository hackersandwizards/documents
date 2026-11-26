import { defined } from "@hackersandwizards/scaffolding/defined";
import { expect, test } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { surveyReadout } from "../scripts/sample-survey";
import {
  bandColor,
  composeSurveyReadout,
  READOUT_TEXT,
  SLIDE_COUNT,
} from "../scripts/survey-readout";

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

test("a scale in a group outside text.groups is shown, not dropped", () => {
  const html = composeSurveyReadout({
    ...surveyReadout,
    scales: [{ ...surveyReadout.scales[0], title: "[OWN-GROUP-ROW]", group: "[OWN-GROUP]" }],
  });
  expect(html).toContain("[OWN-GROUP]");
  expect(html).toContain("[OWN-GROUP-ROW]");
});

test("a bar takes the band of its printed mean", () => {
  const row = { ...surveyReadout.scales[0], title: "[ROUNDED-ROW]", start: 1, end: 4, mean: 2.66 };
  const html = composeSurveyReadout({ ...surveyReadout, scales: [row] });
  const at = html.indexOf("[ROUNDED-ROW]");
  expect(html.slice(at, at + 600)).toContain("--band:var(--deck-bar-step)");
  expect(html.slice(at, at + 600)).toContain(">2.7<");
  expect(html).toContain("from 2.69");
});

test("a weak spot without its colour is refused, not printed without a marker", () => {
  expect(() =>
    composeSurveyReadout({
      ...surveyReadout,
      readout: { ...surveyReadout.readout, weak: ["A (2.1)", "B (2.4)"], weakColors: ["red"] },
    }),
  ).toThrow("one colour per weak spot");
});

test("the sample's weak spot carries its score's band", () => {
  const weak = defined(
    surveyReadout.scales.find((s) => s.mean.toFixed(1) === "2.9"),
    "survey scale with mean 2.9",
  );
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

// Submissions an attendee left unfinished score nothing, so the deck says so rather than printing a
// bare "total" beside the completed count.
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
  for (const file of readdirSync(join(import.meta.dirname, "../components"))) {
    const code = readFileSync(join(import.meta.dirname, "../components", file), "utf8")
      .split("\n")
      .filter((line) => !/^\s*(\/\/|\*|\/\*|<!--)/.test(line));
    expect({ file, hits: code.filter((line) => /[—“”‘’]/.test(line)) }).toEqual({ file, hits: [] });
  }
});
