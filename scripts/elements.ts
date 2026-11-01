/**
 * The brand's shared elements (@hackersandwizards/brand elements.css) on a composed document: each
 * element the engine and a caller's HTML name by the engine's own class (card, callout, chip, label,
 * a table, a quote, a code block, a link in text) takes the brand's hw-* class and variant, so the
 * brand draws it and the base keeps only its layout. A body written before the brand had these
 * elements renders the same way, since the mapping runs on every composed page and on every
 * document bakeDocumentCss bakes, which also puts the page on the brand's print scale.
 */
type Edit = [selector: string, cls?: string, attrs?: Record<string, string>];

// In order: a later entry's attribute wins where two match one element.
export const ELEMENT_MAP: Edit[] = [
  [".card, .panel, .prepared", "hw-card"],
  [".card.tint, .card.accent, .panel.soft, .prepared", undefined, { "data-variant": "tint" }],
  [".callout, .note", "hw-callout"],
  [".outcome", undefined, { "data-hue": "purple" }],
  [".chip", "hw-pill"],
  [".doc-tag", "hw-pill", { "data-caps": "" }],
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
