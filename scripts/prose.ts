/**
 * A Markdown body as the engine sets it: no style of the caller's. Every style attribute goes,
 * so a body looks as the engine draws it; pandoc's column alignment, the one style a table
 * means, becomes the base's `num` (right) or `center` class first. A style or link element
 * fails: the body would restyle the document. A page break is the base's
 * `<div class="page-break"></div>`. HTMLRewriter reads the markup as the browser does: any
 * quoting or spacing, a namespaced tag, a tag named only inside a comment.
 */
export function proseHtml(html: string): string {
  const refused: string[] = [];
  const body = new HTMLRewriter()
    .on("style, link", {
      element(el) {
        refused.push(`<${el.tagName}>`);
      },
    })
    .on("*", {
      element(el) {
        const style = el.getAttribute("style");
        if (style === null) return;
        // The browser reads the first of duplicate attributes, and removeAttribute takes one a
        // call: once per style the element lists.
        for (const [name] of [...el.attributes]) if (name === "style") el.removeAttribute("style");
        if (!/^t[hd]$/.test(el.tagName)) return;
        const align = style
          .split(";")
          .map((declaration) => declaration.split(":").map((part) => part.trim().toLowerCase()))
          .find(([property]) => property === "text-align")?.[1];
        const value = align?.replace(/!\s*important$/, "").trim();
        if (value !== "right" && value !== "center") return;
        const own = el.getAttribute("class");
        const cls = value === "right" ? "num" : "center";
        el.setAttribute("class", own ? `${own} ${cls}` : cls);
      },
    })
    .transform(html);
  if (refused.length)
    throw new Error(
      `A document body carries ${refused[0]}: the engine draws every style. Use an engine type or variant, or the base's classes (page-break, callout, card-grid, signatures).`,
    );
  return body;
}
