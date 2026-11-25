// The caller analyses its survey and passes the figures; the score bands are exported so the
// caller's own readout colours a weak spot's marker as its bar.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { escapeHtml as esc, fill, languageTag, svgUri } from "./fill";
import { brandCss } from "./document-css";
import { compactStyles } from "./compact-styles";
import { readoutSlides, type SurveyReadout } from "./readout-slides";
import { READOUT_TEXT, type ReadoutText } from "./readout-text";
export { SLIDE_COUNT } from "./readout-slides";
import { brandFile, brandName, ROOT, withoutImports } from "./root";

export { bandColor, scalePosition, STRENGTH_AT } from "./score-bands";

export type { ReadoutScale } from "./readout-scales";
export type { SurveyReadout } from "./readout-slides";
export { READOUT_TEXT, type ReadoutText } from "./readout-text";

/** The readout deck as a standalone HTML page, seven 1280x720 slides with the brand inlined, or,
 * given `brand` (which turns a file brand exports into the link the page reaches it by), linked, as
 * the catalog does. */
export function composeSurveyReadout(d: SurveyReadout, brand?: (file: string) => string): string {
  const { customerName, readout } = d;
  if (readout.weakColors.length !== readout.weak.length)
    throw new Error("composeSurveyReadout: readout.weakColors needs one colour per weak spot");
  // A key the caller left undefined keeps today's word.
  const own = Object.entries(d.text ?? {}).filter(([, v]) => v !== undefined);
  const t: ReadoutText = { ...READOUT_TEXT, ...Object.fromEntries(own) };
  const slides = readoutSlides(d, t);
  const logo = (file: string) => svgUri(readFileSync(brandFile(`logos/${file}`), "utf8"));
  const lockup = logo("lockup.svg");
  const wordmark = `<img class="wordmark" src="${logo("wordmark.svg")}" alt="${ALT}" />`;
  const links = brand
    ? `<link rel="icon" href="${brand("logos/favicon.ico")}" sizes="32x32" />
<link rel="icon" href="${brand("logos/favicon.svg")}" type="image/svg+xml" />
<link rel="stylesheet" href="${brand("tokens.root.css")}" />
<link rel="stylesheet" href="${brand("print.css")}" />
<link rel="stylesheet" href="${brand("document.flat.css")}" />
<link rel="stylesheet" href="${brand("marker.css")}" />
<link rel="stylesheet" href="${brand("elements/kpi.css")}" />
<link rel="stylesheet" href="${brand("elements/rule.css")}" />
<link rel="stylesheet" href="${brand("elements/strip.css")}" />
`
    : "";
  // Replacer functions, since a replacement string reads $& and $$ out of attendee quotes. The
  // logo markers are HTML comments, which esc never lets attendee text carry.
  return compactStyles(
    PAGE.replace("__BRAND__", () => (brand ? "" : brandCss()))
      .replace("__STYLE__", () => STYLE)
      .replace("<style data-hw-readout>", () => `${links}<style data-hw-readout>`)
      .replace('lang="en"', () => `lang="${languageTag(t.lang)}"`)
      .replace("__TITLE__", () => esc(fill(t.documentTitle, { customer: customerName })))
      .replace("__SLIDES__", () =>
        slides
          .replace("<!--LOCKUP-->", () => `<img class="lockup" src="${lockup}" alt="${ALT}" />`)
          .replaceAll("<!--WORDMARK-->", () => wordmark),
      ),
  );
}

/** The lockup's and the wordmark's alt text. */
const ALT = esc(brandName().name);

/** The deck's stylesheet: the document tokens (the brand files apart, which brandCss inlines) and
 * readout.css. */
const STYLE = ["tokens.css", "readout.css"]
  .map((f) => withoutImports(readFileSync(join(ROOT, f), "utf8")))
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
