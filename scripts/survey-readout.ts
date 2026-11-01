// composeSurveyReadout: the attendee-feedback readout, an internal deck of seven 1280x720 slides
// in the slide engine's look (title, at a glance, scores by dimension, risks, liked, improve,
// readout), as one standalone HTML page with the brand's tokens and faces inlined. The caller
// analyses its survey and passes the figures; this module owns how they are drawn, the score bands
// included, which the caller's readout reuses so a weak spot's marker matches its bar. A slide
// deck, not an A4 document: it sits on the document tokens and readout.css, never on document.css.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fill } from "./fill";
import { brandCss, brandFile } from "./render-pdf";

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

export interface SurveyReadout {
  customerName: string;
  training: string;
  /** The training's length in days, 0 where unknown. */
  days: number;
  dateRange: string;
  attendees: number;
  teams: number;
  counts: { all: number; completed: number };
  /** Overall satisfaction. */
  headline: ReadoutScale;
  scales: ReadoutScale[];
  risks: { label: string; n: number }[];
  /** The "no major risk" answer, kept off the ranked risks. */
  noRisk?: { label: string; n: number };
  /** The two open questions as the form asked them. */
  asked: { liked: string; improve: string };
  liked: string[];
  improve: string[];
  readout: { strengths: string[]; weak: string[]; weakColors: string[]; flags: string[] };
  /** Replaces any of the deck's own words, READOUT_TEXT; `{name}` marks a figure filled in. */
  text?: Partial<ReadoutText>;
}

/** Every word the deck prints itself, in English. */
export const READOUT_TEXT = {
  lang: "en",
  documentTitle: "Survey Readout — {customer}",
  eyebrow: "Attendee Feedback Readout · Internal",
  days: "{days}-day training",
  responses: "responses",
  attendees: "attendees",
  responseRate: "response rate",
  team: "team",
  teams: "teams",
  verbatim: "Questions and answers appear verbatim, as the form asked them.",
  kicker: "Attendee feedback · {customer}",
  glance: "At a glance",
  overall: "/ {end} overall satisfaction",
  distribution:
    "Distribution across {n} responses — small sample, read the spread not the decimal.",
  answersKey: "answers",
  ratingKey: "rating",
  completed: "completed",
  /** Submissions an attendee left before the end: they score nothing. */
  unfinished: "{n} unfinished, not scored",
  ofAttendees: "of {attendees} attendees",
  scores: "Scores by dimension",
  /** The scores slide's sections in order; the first takes a scale without a group. */
  groups: ["Content & format", "Trainer", "Confidence & application"],
  noDimension: "No dimension resolved for this form — see Flags on the readout slide.",
  barKey: "Bar = mean on {start}–{end}",
  bandFrom: "from {value}",
  bandBelow: "below",
  overallScale: "Overall satisfaction (page 2): {start}–{end}",
  stripKey: "Strip = share of answers per rating",
  risks: "Biggest perceived risk for applying agentic engineering",
  noRisk: "“{label}”: {n} ({share}%), not ranked as a risk",
  riskCaption: "Multi-select · {n} respondents · bar = share of respondents",
  liked: "What they liked",
  improve: "What to improve",
  asked: "Asked: “{question}”",
  noAnswers: "No free-text responses.",
  more: "Longest answers first. + {n} more in the raw snapshot.",
  readout: "Readout",
  strengths: "Strengths",
  weakSpots: "Weak spots",
  flags: "Flags",
  markerKey: "Marker = the score's band on page 3:",
  /** The four bands, strong to weak. */
  bands: ["strong", "good", "middling", "weak"],
  flagKey: "flag, not a score",
};
export type ReadoutText = typeof READOUT_TEXT;

const esc = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

/**
 * Where a mean sits on its own scale, 0 at the floor and 1 at the ceiling, because the matrix rows
 * run 1-4 and overall satisfaction 1-5. A zero-width scale scores 0: NaN would silently drop the
 * question from both columns.
 */
export const scalePosition = (value: number, s: { start: number; end: number }): number =>
  s.end > s.start ? (value - s.start) / (s.end - s.start) : 0;

/**
 * The old absolute cutoffs, 4.0 and 3.5, expressed as positions on the 1-5 scale they were written
 * for. A 1-5 question therefore keeps exactly the verdict it had, and only a narrower scale moves:
 * on 1-4 these land at 3.25 and 2.875.
 */
export const STRENGTH_AT = 0.75;

// Brand colours (@hackersandwizards/brand tokens.css), low to high along the brand gradient: the design guide's
// Error Red (--color-red) for weak, muted slate for middling (neither good nor bad, and 7:1 so the weakest mean
// stays readable), teal for good, purple, the gradient's end, for strong.
const RED = "var(--negative)";
const SLATE = "var(--muted)";
const TEAL = "var(--accent)";
const PURPLE = "var(--result)";

/** Bands by position on the value's own scale, so a 1-4 row listed as a strength renders purple. */
const BANDS: [number, string][] = [
  [STRENGTH_AT, PURPLE], // 4.0 on 1-5, 3.25 on 1-4
  [0.5625, TEAL], // 3.25 on 1-5, 2.6875 on 1-4
  [0.375, SLATE], // 2.5 on 1-5, 2.125 on 1-4
  [-Infinity, RED],
];

export function bandColor(value: number, scale: { start: number; end: number }): string {
  const at = scalePosition(value, scale);
  return BANDS.find(([from]) => at >= from)![1];
}

/** The key under the scores title: what the bar, its colour and the strip mean, per scale present. */
function scoreLegend(
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

/** A rating's shade, light to dark ink along its scale: answer distributions carry no band colour,
 * which on 1-4 painted ratings 1 and 2 the same red and gave purple a second meaning. */
function rampColor(val: number, s: { start: number; end: number }): string {
  const pct = Math.round(30 + 65 * scalePosition(val, s));
  return `color-mix(in srgb, var(--ink) ${pct}%, var(--line-soft))`;
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

function scaleRow(s: ReadoutScale): string {
  // An unanswered row has no score: no band colour, no bar, a dash for the mean.
  const col = s.n ? bandColor(s.mean, s) : "inherit";
  const fill = s.n ? scalePosition(s.mean, s) * 100 : 0;
  return `
    <div class="srow">
      <div class="slabel">${esc(shortDim(s.title))}</div>
      <div class="strack">
        <div class="sfill" style="--share:${fill.toFixed(1)}%;--band:${col}"></div>
      </div>
      <div class="smean" style="--band:${col}">${s.n ? s.mean.toFixed(1) : "–"}</div>
      ${distBar(s)}
    </div>`;
}

function quoteCard(t: string): string {
  return `<blockquote class="quote">${esc(t)}</blockquote>`;
}

// Each answer stays under the question the attendee typed it into, praise and criticism alike: the
// slide quotes the question, so a critical answer under "liked" reads as the attendee's choice.
const askedLine = (t: ReadoutText, q: string) =>
  q ? `<div class="asked">${esc(fill(t.asked, { question: q }))}</div>` : "";

function quoteList(t: ReadoutText, texts: string[]): string {
  if (texts.length === 0) return `<div class="caption">${esc(t.noAnswers)}</div>`;
  // Longest first, the most specific answers, ties in submission order. Every answer goes in; the
  // page's fit script keeps as many as fit and counts the rest in the caption.
  const ordered = [...texts].sort((x, y) => y.length - x.length);
  return `${ordered.map(quoteCard).join("")}<div class="caption more" data-text="${esc(t.more)}" hidden></div>`;
}

// Title, at a glance, scores, risks, liked, improve, readout.
const SLIDE_COUNT = 7;
const pad2 = (n: number) => String(n).padStart(2, "0");

/** A content slide in the slide engine's frame: the brand strip, the kicker above the title, the
 *  page counter beside the corner wordmark. */
function slideShell(inner: string, kicker: string, page: number): string {
  return `<section class="slide">
    <div class="strip"></div>
    <div class="sbody"><div class="kicker label-caps">${esc(kicker)}</div>${inner}</div>
    <footer class="chrome"><span class="page">${pad2(page)} / ${pad2(SLIDE_COUNT)}</span><!--WORDMARK--></footer>
  </section>`;
}

/** The readout deck as a standalone HTML page, seven 1280x720 slides with the brand inlined, or,
 * given `brand` (the brand package's folder as the page reaches it), linked, as the specimen does. */
export function composeSurveyReadout(d: SurveyReadout, brand?: string): string {
  const { counts, headline, scales, risks, noRisk, asked, liked, improve, readout: r } = d;
  const t: ReadoutText = { ...READOUT_TEXT, ...d.text };
  const a = {
    counts,
    headline,
    scales,
    risks,
    noRisk,
    asked,
    liked,
    improve,
    training: d.training,
  };
  const m = { attendees: d.attendees, days: d.days, dateRange: d.dateRange, teams: d.teams };
  const customerName = d.customerName;
  const rate = m.attendees ? Math.round((a.counts.completed / m.attendees) * 100) : null;

  const s1 = `<section class="slide title">
    <div class="strip"></div>
    <div class="sbody center">
      <div class="eyebrow">${esc(t.eyebrow)}</div>
      <h1>${esc(customerName)}</h1>
      <div class="subtitle">${esc(
        [a.training, m.days ? fill(t.days, m) : ""].filter(Boolean).join(" · "),
      )}</div>
      <div class="dates">${esc(m.dateRange)}</div>
      <div class="metarow">
        <div class="metabig"><b>${a.counts.completed}</b><span>${esc(t.responses)}</span></div>
        <div class="metabig"><b>${m.attendees || "—"}</b><span>${esc(t.attendees)}</span></div>
        <div class="metabig"><b>${rate != null ? rate + "%" : "—"}</b><span>${esc(t.responseRate)}</span></div>
        <div class="metabig"><b>${m.teams}</b><span>${esc(m.teams === 1 ? t.team : t.teams)}</span></div>
      </div>
      <div class="rule"></div>
      <div class="langnote">${esc(t.verbatim)}</div>
    </div>
    <footer class="chrome"><!--LOCKUP--></footer>
  </section>`;

  const kicker = fill(t.kicker, { customer: customerName });
  const h = a.headline;
  const s2 = slideShell(
    `<h2>${esc(t.glance)}</h2>
     <div class="glance">
       <div class="bignum" style="--band:${h.n ? bandColor(h.mean, h) : "inherit"}">
         <b>${h.n ? h.mean.toFixed(1) : "—"}</b><span>${esc(fill(t.overall, { end: h.end }))}</span>
       </div>
       <div class="glancedist">
         ${distScale(t, h)}
         <div class="caption">${esc(fill(t.distribution, { n: h.n }))}</div>
       </div>
     </div>
     <div class="glancefoot">
       <div><b>${a.counts.completed}</b> ${esc(t.completed)}${a.counts.all > a.counts.completed ? ` · ${esc(fill(t.unfinished, { n: a.counts.all - a.counts.completed }))}` : ""}</div>
       <div><b>${rate != null ? rate + "%" : "—"}</b> ${esc(fill(t.ofAttendees, { attendees: m.attendees || "?" }))}</div>
       <div><b>${m.teams}</b> ${esc(m.teams === 1 ? t.team : t.teams)}</div>
     </div>`,
    kicker,
    2,
  );

  const groups = new Map<string, ReadoutScale[]>();
  for (const s of a.scales) {
    const g = s.group ?? t.groups[0]!;
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(s);
  }
  // The words' order first, then any group they do not name, so no scale drops off the slide.
  const groupsHtml = [...new Set([...t.groups, ...groups.keys()])]
    .filter((g) => groups.has(g))
    .map(
      (g) =>
        `<div class="sgroup"><div class="gtitle">${esc(g)}</div>${groups
          .get(g)!
          .map(scaleRow)
          .join("")}</div>`,
    )
    .join("");
  // Rows mix 1-4 and 1-5 scales, so the key lists the ranges present rather than a fixed one.
  const s3 = slideShell(
    `<h2>${esc(t.scores)}</h2>${a.scales.length ? scoreLegend(t, a.scales, a.headline) : ""}
     <div class="scols">${groupsHtml || `<div class="caption">${esc(t.noDimension)}</div>`}</div>`,
    kicker,
    3,
  );

  // Bars run on the share of respondents, the figure printed beside them, so a full track is 100%.
  const respondents = Math.max(1, a.counts.completed, ...a.risks.map((x) => x.n));
  const s4 = slideShell(
    `<h2>${esc(t.risks)}</h2>
     <div class="risks">
       ${a.risks
         .map(
           (x) => `<div class="risk">
             <div class="rlabel">${esc(x.label)}</div>
             <div class="rtrack"><div class="rfill${x.n === a.risks[0].n ? " top" : ""}" style="--share:${(x.n / respondents) * 100}%"></div></div>
             <div class="rn">${x.n}<span class="rpct">${Math.round((x.n / respondents) * 100)}%</span></div>
           </div>`,
         )
         .join("")}
     </div>
     ${a.noRisk ? `<div class="norisk">${esc(fill(t.noRisk, { ...a.noRisk, share: Math.round((a.noRisk.n / respondents) * 100) }))}</div>` : ""}
     <div class="caption">${esc(fill(t.riskCaption, { n: a.counts.completed }))}</div>`,
    kicker,
    4,
  );

  const s5 = slideShell(
    `<h2>${esc(t.liked)}</h2>${askedLine(t, a.asked.liked)}<div class="quotes">${quoteList(t, a.liked)}</div>`,
    kicker,
    5,
  );

  const s6 = slideShell(
    `<h2>${esc(t.improve)}</h2>${askedLine(t, a.asked.improve)}<div class="quotes">${quoteList(t, a.improve)}</div>`,
    kicker,
    6,
  );

  const list = (items: string[], cls: string, colors?: string[]) =>
    items.length
      ? `<ul class="${cls}">${items.map((i, k) => `<li${colors ? ` style="--mark:${esc(colors[k] ?? "")}"` : ""}>${esc(i)}</li>`).join("")}</ul>`
      : '<div class="caption">—</div>';
  // The markers' key: blind runs read the band colours and the hollow flag only with it (marker
  // score 4.75 without, 8.38 with, eight runs, os docs/tracking/2026-11-01-survey-readout-engine.md).
  const bands = BANDS.map(
    ([, col], i) =>
      `<span class="lkey"><i style="--band:${col}"></i>${esc(t.bands[i] ?? "")}</span>`,
  ).join("");
  const s7 = slideShell(
    `<h2>${esc(t.readout)}</h2>
     <div class="legend"><span class="lscale">${esc(t.markerKey)}</span>${bands}<span class="lsep"></span><span class="lkey"><i class="hollow"></i>${esc(t.flagKey)}</span></div>
     <div class="readout">
       <div class="rcol"><div class="rhead good">${esc(t.strengths)}</div>${list(r.strengths, "good")}</div>
       <div class="rcol"><div class="rhead bad">${esc(t.weakSpots)}</div>${list(r.weak, "bad", r.weakColors)}</div>
       <div class="rcol"><div class="rhead flag">${esc(t.flags)}</div>${list(r.flags, "flag")}</div>
     </div>`,
    kicker,
    7,
  );

  const slides = [s1, s2, s3, s4, s5, s6, s7].join("\n");
  const logo = (file: string) =>
    `data:image/svg+xml;base64,${readFileSync(brandFile(`logos/${file}`)).toString("base64")}`;
  const lockup = logo("lockup.svg");
  const wordmark = `<img class="wordmark" src="${logo("wordmark.svg")}" alt="hackers&amp;wizards" />`;
  // Replacer functions, since a replacement string reads $& and $$ out of attendee quotes. The
  // logo markers are HTML comments, which esc never lets attendee text carry.
  const links = brand
    ? `<link rel="icon" href="${brand}/logos/favicon.ico" sizes="32x32" />
<link rel="icon" href="${brand}/logos/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="${brand}/generated/tokens.root.css" />
<link rel="stylesheet" href="${brand}/tokens/print.css" />
<link rel="stylesheet" href="${brand}/tokens/marker.css" />
`
    : "";
  return PAGE.replace("__BRAND__", () => (brand ? "" : brandCss()))
    .replace("__STYLE__", () => STYLE)
    .replace("<style data-hw-readout>", () => `${links}<style data-hw-readout>`)
    .replace('lang="en"', () => `lang="${esc(t.lang)}"`)
    .replace("__TITLE__", () => esc(fill(t.documentTitle, { customer: customerName })))
    .replace("__SLIDES__", () =>
      slides
        .replace(
          "<!--LOCKUP-->",
          () => `<img class="lockup" src="${lockup}" alt="hackers&amp;wizards" />`,
        )
        .replaceAll("<!--WORDMARK-->", () => wordmark),
    );
}

function distScale(t: ReadoutText, s: ReadoutScale): string {
  // Bars scale to the most-chosen value, so the chart uses its height: scaled to the total, the
  // tallest bar stood at 40% and the chart read as a strip under an empty band.
  const total = Math.max(1, ...s.dist);
  const key = `<div class="dcol dkey"><div class="dbarwrap"></div><div class="dn">${esc(t.answersKey)}</div><div class="dv">${esc(t.ratingKey)}</div></div>`;
  return `<div class="dscale">${key}${s.dist
    .map((c, i) => {
      const val = s.start + i;
      const h = (c / total) * 100;
      // A value nobody chose draws no bar: the sliver a minimum height kept read as a response.
      const bar = c
        ? `<div class="dbar" style="--share:${h}%;--band:${rampColor(val, s)}"></div>`
        : "";
      return `<div class="dcol"><div class="dbarwrap">${bar}</div><div class="dn">${c}</div><div class="dv">${val}</div></div>`;
    })
    .join("")}</div>`;
}

/** The deck's stylesheet: the document tokens (the brand files apart, which brandCss inlines) and
 * readout.css. */
const STYLE = ["tokens.css", "readout.css"]
  .map((f) =>
    readFileSync(join(import.meta.dir, "..", f), "utf8").replace(/^@import [^;]+;\n/gm, ""),
  )
  .join("\n");

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>__TITLE__</title>
<style data-hw-readout>
__BRAND__
__STYLE__
</style></head>
<body>__SLIDES__
<script>
  // The engine's fit guard: a slide never clips. A body holding more than fits (a long free-text
  // answer) shrinks below its title until it fits, after the faces have loaded.
  addEventListener("load", () => {
    for (const body of document.querySelectorAll(".sbody")) {
      // Measured on the deepest boxes: a part that stretches to fill the body (flex: 1) always
      // reaches its bottom. The bottom padding clears the page counter.
      const limit = body.getBoundingClientRect().bottom - parseFloat(getComputedStyle(body).paddingBottom);
      const bottom = () => Math.max(...[...body.querySelectorAll("*")].map((el) => el.getBoundingClientRect().bottom));
      // A free-text page shows as many whole answers as fill it, at full size, and counts the rest.
      const more = body.querySelector(".caption.more");
      if (more) {
        const quotes = [...body.querySelectorAll(".quote")];
        let shown = quotes.length;
        while (bottom() > limit + 1 && shown > 1) {
          quotes[--shown].remove();
          more.hidden = false;
          more.textContent = more.dataset.text.replace("{n}", quotes.length - shown);
        }
      }
      const parts = [...body.children].filter((el) => !el.matches(".kicker, h2"));
      for (let step = 19; bottom() > limit + 1 && step >= 10; step--)
        for (const el of parts) el.style.zoom = String(step / 20);
    }
  });
</script>
</body></html>`;
