// composeSurveyReadout: the attendee-feedback readout, an internal deck of seven 1280x720 slides
// in the slide engine's look (title, at a glance, scores by dimension, risks, liked, improve,
// readout), as one standalone HTML page with the brand's tokens and faces inlined. The caller
// analyses its survey and passes the figures; this module owns how they are drawn, the score bands
// included, which the caller's readout reuses so a weak spot's marker matches its bar. A slide
// deck, not an A4 document: it sits on the brand files alone, never on document.css.
import { readFileSync } from "node:fs";
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
}

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
const RED = "var(--color-red)";
const SLATE = "var(--color-muted)";
const TEAL = "var(--color-teal)";
const PURPLE = "var(--color-purple)";

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
  scales: { start: number; end: number }[],
  overall?: { start: number; end: number },
): string {
  const ranges = [...new Map(scales.map((s) => [`${s.start}–${s.end}`, s])).values()];
  const cut = (from: number, s: { start: number; end: number }) =>
    (s.start + from * (s.end - s.start)).toFixed(2).replace(/0$/, "");
  const keys = ranges.map((s) => {
    const steps = BANDS.map(([from, col], i) => {
      const label = i === BANDS.length - 1 ? "below" : `from ${cut(from, s)}`;
      return `<span class="lkey"><i style="background:${col}"></i>${label}</span>`;
    }).join("");
    return `<span class="lscale">Bar = mean on ${s.start}–${s.end}</span>${steps}`;
  });
  // Page 2's overall score may run on another scale; say so where the rows' scale differs.
  const other =
    overall && !ranges.some((s) => s.start === overall.start && s.end === overall.end)
      ? `<span class="lsep"></span><span class="lscale">Overall satisfaction (page 2): ${overall.start}–${overall.end}</span>`
      : "";
  const strips = ranges.map((s) => {
    const steps = Array.from({ length: s.end - s.start + 1 }, (_, i) => s.start + i)
      .map((v) => `<span class="lkey"><i style="background:${rampColor(v, s)}"></i>${v}</span>`)
      .join("");
    return `<span class="lscale">Strip = share of answers per rating</span>${steps}`;
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
  return `color-mix(in srgb, var(--color-ink) ${pct}%, var(--color-border))`;
}

function distBar(s: ReadoutScale): string {
  const segs = s.dist
    .map((c, i) => {
      const val = s.start + i;
      if (c === 0) return "";
      const col = rampColor(val, s);
      return `<span class="seg" style="flex:${c};background:${col}" title="${val}: ${c}"></span>`;
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
        <div class="sfill" style="width:${fill.toFixed(1)}%;background:${col}"></div>
      </div>
      <div class="smean" style="color:${col}">${s.n ? s.mean.toFixed(1) : "–"}</div>
      ${distBar(s)}
    </div>`;
}

function quoteCard(t: string): string {
  return `<blockquote class="quote">${esc(t)}</blockquote>`;
}

// Each answer stays under the question the attendee typed it into, praise and criticism alike: the
// slide quotes the question, so a critical answer under "liked" reads as the attendee's choice.
const askedLine = (q: string) => (q ? `<div class="asked">Asked: “${esc(q)}”</div>` : "");

function quoteList(texts: string[]): string {
  if (texts.length === 0) return '<div class="caption">No free-text responses.</div>';
  // Longest first, the most specific answers, ties in submission order. Every answer goes in; the
  // page's fit script keeps as many as fit and counts the rest in the caption.
  const ordered = [...texts].sort((x, y) => y.length - x.length);
  return `${ordered.map(quoteCard).join("")}<div class="caption more" hidden></div>`;
}

// Title, at a glance, scores, risks, liked, improve, readout.
const SLIDE_COUNT = 7;
const pad2 = (n: number) => String(n).padStart(2, "0");

/** A content slide in the slide engine's frame: the brand strip, the kicker above the title, the
 *  page counter beside the corner wordmark. */
function slideShell(inner: string, kicker: string, page: number): string {
  return `<section class="slide">
    <div class="strip"></div>
    <div class="sbody"><div class="kicker">${esc(kicker)}</div>${inner}</div>
    <footer class="chrome"><span class="page">${pad2(page)} / ${pad2(SLIDE_COUNT)}</span><!--WORDMARK--></footer>
  </section>`;
}

/** The readout deck as a standalone HTML page, seven 1280x720 slides with the brand inlined, or,
 * given `brand` (the brand package's folder as the page reaches it), linked, as the specimen does. */
export function composeSurveyReadout(d: SurveyReadout, brand?: string): string {
  const { counts, headline, scales, risks, noRisk, asked, liked, improve, readout: r } = d;
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
      <div class="eyebrow">Attendee Feedback Readout · Internal</div>
      <h1>${esc(customerName)}</h1>
      <div class="subtitle">${esc(
        [a.training, m.days ? `${m.days}-day training` : ""].filter(Boolean).join(" · "),
      )}</div>
      <div class="dates">${esc(m.dateRange)}</div>
      <div class="metarow">
        <div class="metabig"><b>${a.counts.completed}</b><span>responses</span></div>
        <div class="metabig"><b>${m.attendees || "—"}</b><span>attendees</span></div>
        <div class="metabig"><b>${rate != null ? rate + "%" : "—"}</b><span>response rate</span></div>
        <div class="metabig"><b>${m.teams}</b><span>${m.teams === 1 ? "team" : "teams"}</span></div>
      </div>
      <div class="rule"></div>
      <div class="langnote">Questions and answers appear verbatim, as the form asked them.</div>
    </div>
    <footer class="chrome"><!--LOCKUP--></footer>
  </section>`;

  const kicker = `Attendee feedback · ${customerName}`;
  const h = a.headline;
  const s2 = slideShell(
    `<h2>At a glance</h2>
     <div class="glance">
       <div class="bignum" style="color:${h.n ? bandColor(h.mean, h) : "inherit"}">
         <b>${h.n ? h.mean.toFixed(1) : "—"}</b><span>/ ${h.end} overall satisfaction</span>
       </div>
       <div class="glancedist">
         ${distScale(h)}
         <div class="caption">Distribution across ${h.n} responses — small sample, read the spread not the decimal.</div>
       </div>
     </div>
     <div class="glancefoot">
       <div><b>${a.counts.completed}</b> completed${a.counts.all !== a.counts.completed ? ` · ${a.counts.all} total` : ""}</div>
       <div><b>${rate != null ? rate + "%" : "—"}</b> of ${m.attendees || "?"} attendees</div>
       <div><b>${m.teams}</b> ${m.teams === 1 ? "team" : "teams"}</div>
     </div>`,
    kicker,
    2,
  );

  const groups = new Map<string, ReadoutScale[]>();
  for (const s of a.scales) {
    const g = s.group ?? "Content & format";
    if (!groups.has(g)) groups.set(g, []);
    groups.get(g)!.push(s);
  }
  const order = ["Content & format", "Trainer", "Confidence & application"];
  const groupsHtml = order
    .filter((g) => groups.has(g))
    .map(
      (g) =>
        `<div class="sgroup"><div class="gtitle">${g}</div>${groups
          .get(g)!
          .map(scaleRow)
          .join("")}</div>`,
    )
    .join("");
  // Rows mix 1-4 and 1-5 scales, so the key lists the ranges present rather than a fixed one.
  const s3 = slideShell(
    `<h2>Scores by dimension</h2>${a.scales.length ? scoreLegend(a.scales, a.headline) : ""}
     <div class="scols">${
       groupsHtml ||
       '<div class="caption">No dimension resolved for this form — see Flags on the readout slide.</div>'
     }</div>`,
    kicker,
    3,
  );

  // Bars run on the share of respondents, the figure printed beside them, so a full track is 100%.
  const respondents = Math.max(1, a.counts.completed, ...a.risks.map((x) => x.n));
  const s4 = slideShell(
    `<h2>Biggest perceived risk for applying agentic engineering</h2>
     <div class="risks">
       ${a.risks
         .map(
           (x) => `<div class="risk">
             <div class="rlabel">${esc(x.label)}</div>
             <div class="rtrack"><div class="rfill${x.n === a.risks[0].n ? " top" : ""}" style="width:${(x.n / respondents) * 100}%"></div></div>
             <div class="rn">${x.n}<span class="rpct">${Math.round((x.n / respondents) * 100)}%</span></div>
           </div>`,
         )
         .join("")}
     </div>
     ${a.noRisk ? `<div class="norisk">“${esc(a.noRisk.label)}”: ${a.noRisk.n} (${Math.round((a.noRisk.n / respondents) * 100)}%), not ranked as a risk</div>` : ""}
     <div class="caption">Multi-select · ${a.counts.completed} respondents · bar = share of respondents</div>`,
    kicker,
    4,
  );

  const s5 = slideShell(
    `<h2>What they liked</h2>${askedLine(a.asked.liked)}<div class="quotes">${quoteList(a.liked)}</div>`,
    kicker,
    5,
  );

  const s6 = slideShell(
    `<h2>What to improve</h2>${askedLine(a.asked.improve)}<div class="quotes">${quoteList(a.improve)}</div>`,
    kicker,
    6,
  );

  const list = (items: string[], cls: string, colors?: string[]) =>
    items.length
      ? `<ul class="${cls}">${items.map((i, k) => `<li${colors ? ` style="--mark:${esc(colors[k] ?? "")}"` : ""}>${esc(i)}</li>`).join("")}</ul>`
      : '<div class="caption">—</div>';
  const s7 = slideShell(
    `<h2>Readout</h2>
     <div class="readout">
       <div class="rcol"><div class="rhead good">Strengths</div>${list(r.strengths, "good")}</div>
       <div class="rcol"><div class="rhead bad">Weak spots</div>${list(r.weak, "bad", r.weakColors)}</div>
       <div class="rcol"><div class="rhead flag">Flags</div>${list(r.flags, "flag")}</div>
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
`
    : "";
  return PAGE.replace("__BRAND__", () => (brand ? "" : brandCss()))
    .replace("<style>", () => `${links}<style>`)
    .replace("__TITLE__", () => `Survey Readout — ${esc(customerName)}`)
    .replace("__SLIDES__", () =>
      slides
        .replace(
          "<!--LOCKUP-->",
          () => `<img class="lockup" src="${lockup}" alt="hackers&amp;wizards" />`,
        )
        .replaceAll("<!--WORDMARK-->", () => wordmark),
    );
}

function distScale(s: ReadoutScale): string {
  // Bars scale to the most-chosen value, so the chart uses its height: scaled to the total, the
  // tallest bar stood at 40% and the chart read as a strip under an empty band.
  const total = Math.max(1, ...s.dist);
  const key = `<div class="dcol dkey"><div class="dbarwrap"></div><div class="dn">answers</div><div class="dv">rating</div></div>`;
  return `<div class="dscale">${key}${s.dist
    .map((c, i) => {
      const val = s.start + i;
      const h = (c / total) * 100;
      // A value nobody chose draws no bar: the sliver a minimum height kept read as a response.
      const bar = c
        ? `<div class="dbar" style="height:${h}%;background:${rampColor(val, s)}"></div>`
        : "";
      return `<div class="dcol"><div class="dbarwrap">${bar}</div><div class="dn">${c}</div><div class="dv">${val}</div></div>`;
    })
    .join("")}</div>`;
}

const PAGE = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"/>
<title>__TITLE__</title>
<style>
__BRAND__
  /* The slide engine's look (talks styles/slides.css): its stage is 1440x810 with a rem of
     1/90 of the width, so this 1280px page takes a rem of 14.2222px and every engine length below
     is copied in rem, never as a pixel value. Colour, families, weights and label tracking come from
     the brand tokens and type roles above; the charts keep their own pixel geometry. */
  @page { size: 1280px 720px; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html { font-size: 14.2222px; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family:var(--font-sans); color:var(--color-ink); background:var(--color-night); font-synthesis-weight:none; }
  .slide {
    /* The engine's slide scale: hairline, brand corner, list marker. */
    --hairline: 0.09375rem; --corner: 1.875rem 0.46875rem;
    --marker: 0.5625rem;
    position:relative; width:1280px; height:720px; background:var(--color-bg);
    page-break-after:always; overflow:hidden; display:flex; flex-direction:column;
    margin:0 auto 24px;
  }
  .slide:last-child { page-break-after:auto; }
  /* The website's teal-to-purple strip, the one mark every slide shares. */
  .strip { position:absolute; inset:0 0 auto; height:0.75rem; background:linear-gradient(90deg,var(--color-teal),var(--color-purple)); }
  .chrome { position:absolute; right:1.5rem; bottom:1.5rem; display:flex; align-items:center; gap:1.25rem; }
  .chrome .page { font-family:var(--font-mono); font-size:1.625rem; font-weight:700; color:var(--color-muted); font-variant-numeric:tabular-nums; }
  /* The slide engine's corner: the lockup on the title slide, its letters at the wordmark's size (the
     wordmark is 952 of the lockup's 1489 units), and the wordmark alone on every other slide. */
  .chrome .wordmark { width:auto; height:1.63rem; }
  .chrome .lockup { width:auto; height:calc(1.63rem * 1489 / 952); }
  /* A titled slide: the 5% safe margin at the sides, the kicker hung above the title line. */
  .sbody { flex:1; padding:5.5rem 4.5rem 4.25rem; display:flex; flex-direction:column; min-height:0; }
  /* Never shrunk: a body a few pixels too full squeezed the kicker instead, and the title rose by 3px on that slide alone. */
  .kicker { flex-shrink:0; height:2.5rem; margin:-3rem 0 0.5rem; font-size:1.6875rem; line-height:1.25; font-weight:500; color:var(--color-teal); }
  h1 { font-family:var(--type-h1-family); font-weight:700; letter-spacing:-0.03em; font-size:6rem; line-height:1.02; color:var(--color-ink); }
  h2 { font-family:var(--type-h1-family); font-weight:var(--type-h1-weight); letter-spacing:var(--type-h1-tracking); font-size:3.375rem; line-height:1.1; color:var(--color-ink); margin-bottom:1.5rem; display:flex; align-items:baseline; gap:1rem; }
  .label-caps, .eyebrow, .gtitle { font-family:var(--type-label-family); font-weight:var(--type-label-weight); letter-spacing:var(--type-label-tracking); text-transform:var(--type-label-case); }
  /* The engine's title slide: centred, its subtitle, the short gradient rule below. */
  .center { align-items:center; justify-content:center; text-align:center; padding-bottom:5.5rem; }
  .eyebrow { font-size:1.125rem; color:var(--color-purple); margin-bottom:1.5rem; }
  .subtitle { font-size:1.875rem; font-weight:500; color:var(--color-muted); margin-top:2rem; }
  .dates { font-size:1.375rem; color:var(--color-muted); margin-top:0.75rem; }
  .langnote { font-size:1.125rem; color:var(--color-muted); margin-top:2rem; }
  .asked { font-size:1.25rem; color:var(--color-muted); margin:-0.75rem 0 1.25rem; }
  .norisk { font-size:1.25rem; color:var(--color-muted); margin-top:1.5rem; }
  .rule { width:10rem; height:0.375rem; margin-top:3rem; background:linear-gradient(90deg,var(--color-teal),var(--color-purple)); }
  .metarow { display:flex; gap:3.5rem; margin-top:3rem; }
  .metabig { display:flex; flex-direction:column; align-items:center; }
  .metabig b { font-family:var(--type-stat-family); font-weight:700; font-size:3rem; color:var(--color-ink); line-height:1; }
  .metabig span { font-size:1.125rem; color:var(--color-muted); margin-top:0.5rem; }

  .glance { display:flex; gap:48px; align-items:center; flex:1; }
  .bignum { display:flex; flex-direction:column; min-width:300px; }
  .bignum b { font-family:var(--type-stat-family); font-weight:700; font-size:140px; line-height:.9; }
  .bignum span { font-size:1.5rem; color:var(--color-muted); margin-top:0.75rem; }
  .glancedist { flex:1; }
  .dscale { display:flex; gap:18px; align-items:flex-end; height:24rem; }
  .dcol { flex:1; display:flex; flex-direction:column; align-items:center; height:100%; }
  .dbarwrap { flex:1; width:100%; display:flex; align-items:flex-end; }
  .dbar { width:100%; border-radius:0; min-height:3px; }
  .dn { font-family:var(--type-stat-family); font-weight:700; font-size:1.5rem; margin-top:8px; }
  .dv { font-size:1.125rem; color:var(--color-muted); }
  /* Names the two number rows under the bars, on the axis side, which read as interchangeable without it. */
  .dcol.dkey { flex:0 0 auto; align-items:flex-end; }
  .dkey .dn { font-family:var(--font-sans); font-weight:400; font-size:1.125rem; color:var(--color-muted); line-height:2rem; }
  .caption { font-size:1.125rem; color:var(--color-muted); margin-top:0.75rem; }
  .legend { display:flex; flex-wrap:wrap; align-items:center; gap:0.375rem 1rem; font-size:1.125rem; color:var(--color-muted); margin:-0.5rem 0 1rem; }
  .legend + .legend { margin-top:-0.5rem; }
  .legend .lkey { display:inline-flex; align-items:center; gap:0.375rem; }
  .legend i { width:var(--marker); height:var(--marker); }
  .legend .lsep { width:var(--hairline); height:1rem; background:var(--color-border); }
  .glancefoot { display:flex; gap:3rem; border-top:var(--hairline) solid var(--color-border); padding-top:1rem; }
  .glancefoot b { color:var(--color-ink); }
  .glancefoot div { font-size:1.25rem; color:var(--color-muted); }

  .scols { display:flex; flex-direction:column; gap:0.5rem; flex:1; }
  /* Group labels in muted ink: teal and purple are score bands on this page. */
  .gtitle { font-size:1.125rem; color:var(--color-muted); margin-bottom:0.25rem; }
  .srow { display:grid; grid-template-columns:30rem 1fr 3.5rem 180px; align-items:center; gap:14px; margin-bottom:0.25rem; }
  .slabel { font-size:1.125rem; line-height:1.3; color:var(--color-ink); }
  .strack { height:12px; background:var(--color-border); border-radius:var(--radius-pill); overflow:hidden; }
  .sfill { height:100%; border-radius:var(--radius-pill); }
  .smean { font-family:var(--type-stat-family); font-weight:700; font-size:1.5rem; text-align:right; }
  /* Segments grow by their count, so the 2px gaps parting neighbouring shades never clip the last. */
  .dist { display:flex; gap:2px; height:16px; border-radius:var(--radius-pill); overflow:hidden; }
  .dist:empty { background:var(--color-border); }
  .dist .seg { height:100%; }

  .risks { display:flex; flex-direction:column; gap:1rem; flex:1; justify-content:center; }
  /* Labels take a fixed column and the bars the rest, so no gutter opens between a label and its bar. */
  .risk { display:grid; grid-template-columns:minmax(0,28rem) 1fr 7rem; align-items:center; gap:16px; }
  .rlabel { font-size:1.5rem; line-height:1.3; color:var(--color-ink); }
  .rtrack { height:18px; background:var(--color-border); border-radius:var(--radius-pill); overflow:hidden; }
  /* In ink, not the brand gradient: teal and purple are score bands on page 3. */
  .rfill { height:100%; background:var(--color-muted); border-radius:var(--radius-pill); }
  .rfill.top { background:var(--color-ink); }
  .rn { font-family:var(--type-stat-family); font-weight:700; font-size:1.5rem; text-align:right; }
  /* The share of respondents beside the count, since a multi-select count alone has no base. */
  .rpct { font-family:var(--font-sans); font-weight:400; font-size:1.125rem; color:var(--color-muted); margin-left:0.5rem; display:inline-block; min-width:2.75rem; text-align:right; font-variant-numeric:tabular-nums; }

  /* Two columns keep a line near 65 characters; full width ran to 130. */
  .quotes { columns:2; column-gap:1.75rem; }
  .quotes .quote { break-inside:avoid; margin-bottom:0.75rem; }
  .quotes .caption { column-span:all; }
  /* Cards as the website draws them: white, a hairline, the brand corner. */
  .quote, .rcol { background:var(--color-white); border:var(--hairline) solid var(--color-border); border-radius:var(--corner); }
  .quote { font-size:1.25rem; line-height:1.4; color:var(--color-ink); padding:1rem 1.75rem; }

  /* Strengths on the left, weak spots and flags stacked on the right, each card ending with its
     content: three equal full-height cards left two of them mostly empty. */
  .readout { display:grid; grid-template-columns:repeat(2,1fr); grid-template-rows:auto 1fr; gap:1.75rem; align-items:start; }
  .readout .rcol:first-child { grid-row:span 2; }
  .rcol { padding:1.5rem 1.75rem; }
  /* Headings in ink on a hairline, as the engine's card titles: the band colours stay on the
     charts, where each band has one meaning. */
  .rhead { font-family:var(--type-h3-family); font-weight:var(--type-h3-weight); font-size:1.6875rem; color:var(--color-ink); margin-bottom:1rem; padding-bottom:0.5rem; border-bottom:var(--hairline) solid var(--color-border); }
  .readout ul { list-style:none; display:flex; flex-direction:column; gap:0.5rem; }
  .readout li { padding-left:calc(var(--marker) + 0.75rem); font-size:1.375rem; line-height:1.35; color:var(--color-muted); }
  /* The list marker: the website's small teal square on the middle of the first line's x-height,
     0.273em above the baseline for Inter, as in the document base: an inline box lifted by whole
     pixels, so Chrome rounds it together with the text. */
  .readout li::before { content:""; display:inline-block; width:var(--marker); height:var(--marker); margin:0 0.75rem 0 calc(-1 * (var(--marker) + 0.75rem)); vertical-align:round(calc(0.273em - var(--marker) / 2), 1px); background:var(--color-teal); }
  /* Markers carry the scores page's colours: a strength clears the purple band by definition, a
     weak spot takes its own band, and flags stay muted. */
  .readout ul.good li::before { background:var(--color-purple); }
  .readout ul.bad li::before { background:var(--mark); }
  /* Hollow, so a flag never reads as the slate band a weak spot can carry. */
  .readout ul.flag li::before { background:transparent; box-shadow:inset 0 0 0 0.125rem var(--color-muted); }
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
          more.textContent = "Longest answers first. + " + (quotes.length - shown) + " more in the raw snapshot.";
        }
      }
      const parts = [...body.children].filter((el) => !el.matches(".kicker, h2"));
      for (let step = 19; bottom() > limit + 1 && step >= 10; step--)
        for (const el of parts) el.style.zoom = String(step / 20);
    }
  });
</script>
</body></html>`;
