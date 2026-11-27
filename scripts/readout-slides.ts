import { escapeHtml as esc, fill } from "./fill";
import { bandColor, BANDS } from "./score-bands";
import { distScale, figureColor, scaleRow, scoreLegend, WORDED_BARS } from "./readout-scales";
import type { ReadoutScale } from "./readout-scales";
import type { ReadoutText } from "./readout-text";

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

export const SLIDE_COUNT = 7;
const pad2 = (n: number) => String(n).padStart(2, "0");

function slideShell(inner: string, kicker: string, page: number): string {
  return `<section class="slide">
    <div class="strip hw-strip" aria-hidden="true"></div>
    <div class="sbody"><div class="kicker label-caps">${esc(kicker)}</div>${inner}</div>
    <footer class="chrome"><span class="page">${pad2(page)} / ${pad2(SLIDE_COUNT)}</span><!--WORDMARK--></footer>
  </section>`;
}

function rateLabel({ attendees, counts }: SurveyReadout): string {
  return attendees ? Math.round((counts.completed / attendees) * 100) + "%" : "—";
}

export function coverSlide(d: SurveyReadout, t: ReadoutText): string {
  const { attendees, days, dateRange, teams } = d;
  return `<section class="slide title">
    <div class="strip hw-strip" aria-hidden="true"></div>
    <div class="sbody center">
      <div class="eyebrow">${esc(t.eyebrow)}</div>
      <h1>${esc(d.customerName)}</h1>
      <div class="subtitle">${esc(
        [d.training, days ? fill(t.days, { attendees, days, dateRange, teams }) : ""]
          .filter(Boolean)
          .join(" · "),
      )}</div>
      <div class="dates">${esc(d.dateRange)}</div>
      <div class="metarow">
        <div class="hw-kpi metabig"><b class="hw-kpi-value">${d.counts.completed}</b><span>${esc(t.responses)}</span></div>
        <div class="hw-kpi metabig"><b class="hw-kpi-value">${d.attendees || "—"}</b><span>${esc(t.attendees)}</span></div>
        <div class="hw-kpi metabig"><b class="hw-kpi-value">${rateLabel(d)}</b><span>${esc(t.responseRate)}</span></div>
        <div class="hw-kpi metabig"><b class="hw-kpi-value">${d.teams}</b><span>${esc(d.teams === 1 ? t.team : t.teams)}</span></div>
      </div>
      <div class="hw-rule cover-rule" data-variant="bar" aria-hidden="true"></div>
      <div class="langnote">${esc(t.verbatim)}</div>
    </div>
    <footer class="chrome"><!--LOCKUP--></footer>
  </section>`;
}

export function glanceSlide(d: SurveyReadout, t: ReadoutText, kicker: string): string {
  const h = d.headline;
  return slideShell(
    `<h2>${esc(t.glance)}</h2>
     <div class="glance">
       <div class="bignum" style="--band:${h.n ? figureColor(bandColor(h.mean, h)) : "inherit"}">
         <b>${h.n ? h.mean.toFixed(1) : "—"}</b><span>${esc(fill(t.overall, { end: h.end }))}</span>
         ${h.n ? `<div class="caption">${esc(fill(h.n === 1 ? t.distributionOne : t.distribution, { n: h.n }))}</div>` : ""}
       </div>
       <div class="glancedist">
         ${distScale(t, h)}
         <div class="caption axis">${esc(fill(h.dist.length > WORDED_BARS ? t.axisCounts : t.axis, h))}</div>
       </div>
     </div>
     <div class="glancefoot">
       <div><b>${d.counts.completed}</b> ${esc(t.completed)}${d.counts.all > d.counts.completed ? ` · ${esc(fill(t.unfinished, { n: d.counts.all - d.counts.completed }))}` : ""}</div>
       <div><b>${rateLabel(d)}</b> ${esc(fill(t.ofAttendees, { attendees: d.attendees || "?" }))}</div>
       <div><b>${d.teams}</b> ${esc(d.teams === 1 ? t.team : t.teams)}</div>
     </div>`,
    kicker,
    2,
  );
}

export function scoresSlide(d: SurveyReadout, t: ReadoutText, kicker: string): string {
  const groups = new Map<string, ReadoutScale[]>();
  for (const s of d.scales) {
    const group = s.group ?? t.groups[0];
    if (group === undefined) throw new Error(`Readout group missing: ${s.title}`);
    const scales = groups.get(group);
    if (scales === undefined) groups.set(group, [s]);
    else scales.push(s);
  }
  // The words' order first, then any group they do not name, so no scale drops off the slide.
  const groupsHtml = [...new Set([...t.groups, ...groups.keys()])]
    .flatMap((group) => {
      const scales = groups.get(group);
      if (scales === undefined) return [];
      return `<div class="sgroup"><div class="gtitle">${esc(group)}</div>${scales
        .map(scaleRow)
        .join("")}</div>`;
    })
    .join("");
  return slideShell(
    `<h2>${esc(t.scores)}</h2>${d.scales.length ? scoreLegend(t, d.scales, d.headline) : ""}
     <div class="scols">${groupsHtml || `<div class="caption">${esc(t.noDimension)}</div>`}</div>`,
    kicker,
    3,
  );
}

export function risksSlide(d: SurveyReadout, t: ReadoutText, kicker: string): string {
  // Bars run on the share of respondents, the figure printed beside them, so a full track is 100%.
  const respondents = Math.max(1, d.counts.completed, ...d.risks.map((x) => x.n));
  const topRisk = Math.max(...d.risks.map((x) => x.n));
  return slideShell(
    `<h2>${esc(t.risks)}</h2>
     <div class="risks">
       ${d.risks
         .map(
           (x) => `<div class="risk">
             <div class="rlabel">${esc(x.label)}</div>
             <div class="rtrack"><div class="rfill${x.n === topRisk ? " top" : ""}" style="--share:${(x.n / respondents) * 100}%"></div></div>
             <div class="rn">${x.n}<span class="rpct">${Math.round((x.n / respondents) * 100)}%</span></div>
           </div>`,
         )
         .join("")}
     </div>
     ${d.noRisk ? `<div class="norisk">${esc(fill(t.noRisk, { ...d.noRisk, share: Math.round((d.noRisk.n / respondents) * 100) }))}</div>` : ""}
     <div class="caption">${esc(fill(t.riskCaption, { n: d.counts.completed }))}</div>`,
    kicker,
    4,
  );
}

type QuoteSlide = { title: string; question: string; answers: string[]; page: number };

export function quoteSlide(
  { title, question, answers, page }: QuoteSlide,
  t: ReadoutText,
  kicker: string,
) {
  return slideShell(
    `<h2>${esc(title)}</h2>${askedLine(t, question)}<div class="quotes">${quoteList(t, answers)}</div>`,
    kicker,
    page,
  );
}

export function readoutSlide(r: SurveyReadout["readout"], t: ReadoutText, kicker: string): string {
  const list = (items: string[], cls: string, colors?: string[]) =>
    items.length
      ? `<ul class="${cls}">${items.map((i, k) => `<li${colors ? ` style="--mark:${esc(colors[k] ?? "")}"` : ""}>${esc(i)}</li>`).join("")}</ul>`
      : '<div class="caption">—</div>';
  const bands = BANDS.map(
    ([, col], i) =>
      `<span class="lkey"><i style="--band:${col}"></i>${esc(t.bands[i] ?? "")}</span>`,
  ).join("");
  return slideShell(
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
}

export function readoutSlides(d: SurveyReadout, t: ReadoutText): string {
  const kicker = fill(t.kicker, { customer: d.customerName });
  return [
    coverSlide(d, t),
    glanceSlide(d, t, kicker),
    scoresSlide(d, t, kicker),
    risksSlide(d, t, kicker),
    quoteSlide({ title: t.liked, question: d.asked.liked, answers: d.liked, page: 5 }, t, kicker),
    quoteSlide(
      { title: t.improve, question: d.asked.improve, answers: d.improve, page: 6 },
      t,
      kicker,
    ),
    readoutSlide(d.readout, t, kicker),
  ].join("\n");
}
