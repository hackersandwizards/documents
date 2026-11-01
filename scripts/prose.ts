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
  return html.replace(/<([a-z][\w-]*)\b([^>]*)>/gi, (tag, name: string, attrs: string) => {
    const style = attrs.match(/\sstyle=(?:"([^"]*)"|'([^']*)')/i);
    if (!style) return tag;
    const align = /text-align:\s*(right|center)/i.exec(style[1] ?? style[2] ?? "")?.[1];
    let rest = attrs.replace(style[0], "");
    if (align && /^t[hd]$/i.test(name)) {
      const cls = align.toLowerCase() === "right" ? "num" : "center";
      rest = /\sclass="/.test(rest)
        ? rest.replace(/\sclass="([^"]*)"/, (_, c: string) => ` class="${c} ${cls}"`)
        : ` class="${cls}"${rest}`;
    }
    return `<${name}${rest}>`;
  });
}
