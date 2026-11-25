import { expect, test } from "vitest";
import {
  coverSlide,
  glanceSlide,
  quoteSlide,
  readoutSlide,
  readoutSlides,
  risksSlide,
  scoresSlide,
} from "../scripts/readout-slides";
import { READOUT_TEXT as text } from "../scripts/readout-text";
import { surveyReadout } from "../scripts/samples";

test.each([
  [{ attendees: 0, teams: 2 }, ">—</b><span>response rate</span>", ">2</b><span>teams</span>"],
  [{ attendees: 20, teams: 1 }, ">50%</b><span>response rate</span>", ">1</b><span>team</span>"],
])("renders cover counts for %j", ({ attendees, teams }, rate, team) => {
  const html = coverSlide({ ...surveyReadout, attendees, teams }, text);
  expect(html).toContain(rate);
  expect(html).toContain(team);
});

test.each([
  [0, "<b>—</b>"],
  [1, "From a single response, shown by the bar."],
  [2, "Mean of 2 responses. The bars show the spread behind it."],
])("labels the overall score based on %i responses", (n, expected) => {
  const headline = { ...surveyReadout.headline, n };
  expect(glanceSlide({ ...surveyReadout, headline }, text, "Kicker")).toContain(expected);
});

test.each([
  [[], text.noDimension],
  [[{ ...surveyReadout.headline, group: "Practice" }], '<div class="gtitle">Practice</div>'],
])("renders the score groups for %j", (scales, expected) => {
  expect(scoresSlide({ ...surveyReadout, scales }, text, "Kicker")).toContain(expected);
});

test.each([
  [
    {
      risks: [
        { label: "Risk A", n: 2 },
        { label: "Risk B", n: 2 },
      ],
      noRisk: undefined,
    },
    2,
    "",
  ],
  [
    {
      risks: [
        { label: "Risk A", n: 2 },
        { label: "Risk B", n: 1 },
      ],
      noRisk: { label: "None", n: 3 },
    },
    1,
    "30%",
  ],
])("marks tied leaders and reports unranked risks for %j", (choices, topCount, noRiskShare) => {
  const html = risksSlide(
    { ...surveyReadout, ...choices, counts: { all: 10, completed: 10 } },
    text,
    "Kicker",
  );
  expect(html.split('class="rfill top"').length - 1).toBe(topCount);
  expect(
    Array.from(html.matchAll(/class="norisk">[^<]*\((\d+%)\)/g), (match) => match[1]).join(""),
  ).toBe(noRiskShare);
});

test.each([
  [
    {
      title: "Feedback <",
      question: "Which & why?",
      answers: ["short", "longer < answer"],
      page: 5,
    },
    [
      "<h2>Feedback &lt;</h2>",
      "Which &amp; why?",
      'longer &lt; answer</blockquote><blockquote class="quote">short',
      "05 / 07",
    ],
  ],
  [
    { title: "Suggestions", question: "", answers: [], page: 6 },
    ["<h2>Suggestions</h2>", text.noAnswers, "06 / 07"],
  ],
])("renders and escapes quote slide %j", (slide, fragments) => {
  const html = quoteSlide(slide, text, "Kicker");
  expect(fragments.filter((fragment) => !html.includes(fragment))).toEqual([]);
});

test.each([
  [{ strengths: [], weak: [], weakColors: [], flags: [] }, ['<div class="caption">—</div>']],
  [
    { strengths: ["Progress"], weak: ["Repair"], weakColors: ["red"], flags: ["Check <first>"] },
    ['class="good"><li>Progress</li>', 'style="--mark:red">Repair</li>', "Check &lt;first&gt;"],
  ],
])("renders rollup lists and marks from %j", (readout, fragments) => {
  const html = readoutSlide(readout, text, "Kicker");
  expect(fragments.map((fragment) => html.includes(fragment))).not.toContain(false);
});

test("places the quote slides after risks and before the readout", () => {
  const headings = Array.from(
    readoutSlides(surveyReadout, text).matchAll(/<h2>([^<]+)<\/h2>/g),
    (match) => match[1],
  );
  expect(headings.slice(2)).toEqual([text.risks, text.liked, text.improve, text.readout]);
});
