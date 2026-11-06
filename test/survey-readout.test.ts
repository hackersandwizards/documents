import { expect, test } from "bun:test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromeBinary } from "../scripts/render-pdf";
import { surveyReadout } from "../scripts/samples";
import { composeSurveyReadout, READOUT_TEXT } from "../scripts/survey-readout";

test("a mark colour cannot open an attribute", () => {
  const weak = surveyReadout.readout.weak;
  const html = composeSurveyReadout({
    ...surveyReadout,
    readout: { ...surveyReadout.readout, weakColors: weak.map(() => 'red" onmouseover="x') },
  });
  expect(html).not.toContain('" onmouseover=');
  expect(html).toContain("--mark:red&quot; onmouseover=&quot;x");
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

// A 1-4 mean of 2.66 printed "2,7" but took the band below "from 2.69" (os readout, 01.11.): the
// bar is coloured by the printed one-decimal mean, and the legend keeps its exact thresholds.
test("a bar takes the band of its printed mean", () => {
  const row = { ...surveyReadout.scales[0], title: "[ROUNDED-ROW]", start: 1, end: 4, mean: 2.66 };
  const html = composeSurveyReadout({ ...surveyReadout, scales: [row] });
  const at = html.indexOf("[ROUNDED-ROW]");
  expect(html.slice(at, at + 600)).toContain("--band:var(--deck-bar-step)");
  expect(html.slice(at, at + 600)).toContain(">2.7<");
  expect(html).toContain("from 2.69");
});

/** The deck rendered in Chrome, then `probe` (a script body run after the page's own fit guard,
 * the first load listener) returns the string the test reads. */
function probeDeck(html: string, probe: string): string {
  const chrome = chromeBinary();
  if (!chrome) throw new Error("Chrome for Testing is required; set CHROME_BINARY");
  const script = `<script>addEventListener("load", () => {
    const pre = document.createElement("pre");
    pre.id = "probe";
    pre.textContent = (() => { ${probe} })();
    document.body.append(pre);
  });</script>`;
  const dir = mkdtempSync(join(tmpdir(), "survey-readout-"));
  try {
    const page = join(dir, "readout.html");
    writeFileSync(page, html.replace("</body>", `${script}</body>`));
    const dom = execFileSync(
      chrome,
      [
        "--headless",
        "--disable-gpu",
        "--use-mock-keychain",
        "--password-store=basic",
        `--user-data-dir=${join(dir, "profile")}`,
        "--window-size=1280,720",
        "--virtual-time-budget=10000",
        "--dump-dom",
        `file://${page}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return dom.match(/<pre id="probe">([^<]*)<\/pre>/)![1]!;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// A free-text page a few pixels too full squeezed its kicker, a flex item of fixed height, and the
// title rose 3px on that slide alone (a real os readout, 01.11.). Twelve invented answers of these
// lengths reproduce it in Chrome; every slide's title must sit at the same height.
test("every slide's title sits at the same height", () => {
  const words = "the review loop on our own codebase made the difference and the exercises fit";
  const answer = (k: number) =>
    `An invented answer: ${Array.from({ length: k }, (_, i) => words.split(" ")[i % 14]).join(" ")}.`;
  const liked = Array.from({ length: 12 }, (_, i) => answer(6 + ((i * 7) % 23)));
  const tops = probeDeck(
    composeSurveyReadout({ ...surveyReadout, liked }),
    `return [...document.querySelectorAll(".slide h2")].map((h) => h.getBoundingClientRect().top - h.closest(".slide").getBoundingClientRect().top).join(" ");`,
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
    const over = probeDeck(
      html,
      `return [...document.querySelectorAll(".dn")].filter((e) => e.scrollWidth > e.closest(".dcol").clientWidth + 1).length;`,
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
