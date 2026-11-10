export type Edit = [selector: string, cls?: string, attrs?: Record<string, string>];

/** DocCard and DocHeader's tag, which the onepager shares with the document base. */
const CARD_AND_TAG: Edit[] = [
  [".card, .panel, .prepared", "hw-card"],
  [".card.tint, .card.accent, .panel.soft, .prepared", undefined, { "data-variant": "tint" }],
  [".doc-tag", "hw-pill", { "data-caps": "" }],
];

// In order: a later entry's attribute wins where two match one element.
export const ELEMENT_MAP: Edit[] = [
  ...CARD_AND_TAG,
  // The proposal's community and terms panels and the timesheet's head panel.
  [".tint-panel", "hw-card", { "data-variant": "tint" }],
  [".callout, .note", "hw-callout"],
  [".outcome", undefined, { "data-hue": "purple" }],
  [".chip", "hw-pill"],
  [".eyebrow", "hw-label"],
  [".label", "hw-label", { "data-tone": "ink" }],
  [".note > .label, .callout > .label", undefined, { "data-tone": "muted" }],
  ["table", "hw-table"],
  ["blockquote", "hw-quote", { "data-tone": "muted" }],
  ["pre", "hw-code"],
  ["a:not([class])", "hw-link"],
  // An exception of the engine's own, listed with its reason in brand-elements.json.
  [".margin-note", undefined, { "data-hw-exception": "margin-note" }],
];

const BOXES = [".cover-box", ".goals-box", ".proof-box", ".scope-box"];

/** The brand's elements on the onepager's blocks: DocCard and DocHeader's tag, the labels, the boxes
 * as callouts, the testimonial as a quote, the figures' chips as pills and the call link as a
 * button. The hero is night, so its claim takes the label's night colour. */
export const ONEPAGER_ELEMENTS: Edit[] = [
  ...CARD_AND_TAG,
  [".hero", undefined, { "data-theme": "dark" }],
  [
    ".label, .hero > .claim, .price-label, .proof-label, .facts dt, .planning > h3, " +
      ".deliverable-banner > h3, .pricing-section > h3, .testimonial > cite, .references > strong, " +
      ".references-lead > strong",
    "hw-label",
  ],
  [".module > h3", "hw-label", { "data-hue": "purple" }],
  [".kpi-section > h3", "hw-label", { "data-tone": "ink" }],
  [
    [".facts .details dt", ".planning dt", ...BOXES.map((box) => `${box} > h3`)].join(", "),
    "hw-label",
    { "data-tone": "muted" },
  ],
  [BOXES.join(", "), "hw-callout"],
  [".testimonial", "hw-quote"],
  [".kpi-item", "hw-pill"],
  [".contact-footer a.button", "hw-button"],
  // An exception of the engine's own, listed with its reason in brand-elements.json.
  [".facts", undefined, { "data-hw-exception": "facts" }],
];

export function withElements(html: string, map = ELEMENT_MAP): string {
  const rewriter = new HTMLRewriter();
  for (const [selector, cls, attrs] of map)
    rewriter.on(selector, {
      element(el) {
        if (cls) {
          const have = (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean);
          if (!have.includes(cls)) el.setAttribute("class", [...have, cls].join(" "));
        }
        for (const [k, v] of Object.entries(attrs ?? {})) el.setAttribute(k, v);
      },
    });
  return rewriter.transform(html);
}
