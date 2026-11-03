// One attribute: a name, then an optional value, double- or single-quoted or bare.
const ATTR = /\s+([^\s"'>/=]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s>"'][^\s>]*))?/g;
const TAG = new RegExp(`<([a-z][\\w-]*)((?:${ATTR.source})*)(\\s*/?>)`, "gi");
const unquote = (value = "") => value.replace(/^(["'])([\s\S]*)\1$/, "$2");

/**
 * A Markdown body as the engine sets it: no style of the caller's. Every style attribute goes,
 * so a body looks as the engine draws it; pandoc's column alignment, the one style a table
 * means, becomes the base's `num` (right) or `center` class first. A style or link element
 * fails: the body would restyle the document. A page break is the base's
 * `<div class="page-break"></div>`.
 */
export function proseHtml(html: string): string {
  const element = html.match(/<(style|link)\b[^>]*>/i);
  if (element)
    throw new Error(
      `A document body carries ${element[0]}: the engine draws every style. Use an engine type or variant, or the base's classes (page-break, callout, card-grid, signatures).`,
    );
  // Text cannot hold "<", so every match is a tag.
  return html.replace(TAG, (tag, name: string, attrs: string, _name, _value, close: string) => {
    const kept = [...attrs.matchAll(ATTR)];
    const styles = kept.filter((a) => a[1].toLowerCase() === "style");
    if (styles.length === 0) return tag;
    // The browser reads the first of duplicate attributes; every one goes.
    const align = /text-align:\s*(right|center)/i.exec(unquote(styles[0][2]))?.[1];
    let rest = kept.filter((a) => a[1].toLowerCase() !== "style").map((a) => a[0]);
    if (align && /^t[hd]$/i.test(name)) {
      const cls = align.toLowerCase() === "right" ? "num" : "center";
      const at = rest.findIndex((a) => /^\s+class\b/i.test(a));
      const value = at < 0 ? "" : unquote(kept.find((a) => a[1].toLowerCase() === "class")?.[2]);
      rest = rest.filter((_, i) => i !== at);
      rest.unshift(` class="${value ? `${value} ` : ""}${cls}"`);
    }
    return `<${name}${rest.join("")}${close}`;
  });
}
