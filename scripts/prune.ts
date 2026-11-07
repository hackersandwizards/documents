/** A style sheet's top-level items: a statement ending in `;` or a block, its prelude and body.
 * Strings and parentheses are skipped over, so a `{`, `}` or `;` inside them ends nothing. */
function items(css: string): { prelude: string; body?: string }[] {
  const out: { prelude: string; body?: string }[] = [];
  let start = 0;
  let depth = 0;
  let open = -1;
  let parens = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === '"' || c === "'") {
      for (i++; i < css.length && css[i] !== c; i++) if (css[i] === "\\") i++;
    } else if (c === "(") parens++;
    else if (c === ")") parens--;
    else if (parens > 0) continue;
    else if (c === "{" && depth++ === 0) open = i;
    else if (c === "}" && --depth === 0) {
      out.push({ prelude: css.slice(start, open).trim(), body: css.slice(open + 1, i) });
      start = i + 1;
    } else if (c === ";" && depth === 0) {
      out.push({ prelude: css.slice(start, i + 1).trim() });
      start = i + 1;
    }
  }
  if (css.slice(start).trim()) out.push({ prelude: css.slice(start).trim() });
  return out;
}

/** `text` split at each top-level `sep`, outside parentheses, brackets and strings. */
function splitTop(text: string, sep: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"' || c === "'") {
      for (i++; i < text.length && text[i] !== c; i++) if (text[i] === "\\") i++;
    } else if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    else if (c === sep && depth === 0) {
      parts.push(text.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(text.slice(start));
  return parts;
}

type Present = { classes: Set<string>; ids: Set<string>; tags: Set<string> };

/** Whether a selector can match the page: every class, id and element name it needs outside a
 * functional pseudo-class or an attribute test is one the markup carries. An escaped selector
 * counts as matching. */
function canMatch(selector: string, page: Present): boolean {
  if (selector.includes("\\")) return true;
  let bare = selector.replace(/\[[^\]]*\]/g, " ");
  while (/\([^()]*\)/.test(bare)) bare = bare.replace(/\([^()]*\)/g, "");
  bare = bare.replace(/::?[\w-]+/g, "");
  for (const [, cls] of bare.matchAll(/\.(-?[_a-zA-Z][\w-]*)/g))
    if (!page.classes.has(cls!)) return false;
  for (const [, id] of bare.matchAll(/#(-?[_a-zA-Z][\w-]*)/g)) if (!page.ids.has(id!)) return false;
  for (const [, tag] of bare.matchAll(/(?:^|[\s>+~])([a-zA-Z][\w-]*)/g))
    if (!page.tags.has(tag!.toLowerCase())) return false;
  return true;
}

// Blocks whose body holds rules, which prune themselves; any other at-rule stays whole.
const GROUPING = /^@(media|supports|layer|container|scope|document)\b/i;

/** `css` with each plain rule passed through `rule`, which returns it rewritten or "", and each
 * grouping block walked alike, an emptied one dropped, except a `@layer` one, whose position orders
 * the layers. Any other at-rule stays whole. */
function walk(css: string, rule: (prelude: string, body: string) => string): string {
  return items(css)
    .map(({ prelude, body }) => {
      if (body === undefined) return prelude;
      if (GROUPING.test(prelude)) {
        const inner = walk(body, rule);
        return inner || /^@layer\b/i.test(prelude) ? `${prelude}{${inner}}` : "";
      }
      return prelude.startsWith("@") ? `${prelude}{${body}}` : rule(prelude, body);
    })
    .join("");
}

/** The rules of `css` that can match the page. */
const pruneRules = (css: string, page: Present) =>
  walk(css, (prelude, body) =>
    splitTop(prelude, ",").some((s) => canMatch(s.trim(), page)) ? `${prelude}{${body}}` : "",
  );

/** `css` without each custom property declaration whose name `read` lacks, and without a rule
 * left empty. A body holding nested rules stays as it is. */
const dropProperties = (css: string, read: Set<string>) =>
  walk(css, (prelude, body) => {
    if (body.includes("{")) return `${prelude}{${body}}`;
    const kept = splitTop(body, ";").filter((d) => {
      const name = /^\s*(--[\w-]+)\s*:/.exec(d)?.[1];
      return d.trim() && (!name || read.has(name));
    });
    return kept.length ? `${prelude}{${kept.join(";")}}` : "";
  });

/** Each style element's CSS, rewritten by `edit`. */
export const editStyles = (html: string, edit: (css: string) => string) =>
  html.replace(
    /(<style\b[^>]*>)([\s\S]*?)(?=<\/style>)/gi,
    (_, open: string, css: string) => open + edit(css),
  );

/**
 * A page whose style elements keep only what its markup can use: each rule needing a class, id or
 * element the page carries nowhere goes, then each custom property the page declares and never
 * reads (in a `var()`, a style query or a style attribute), until none is left to drop. On a page
 * holding a script the styles stay whole, since the script may add a class or read a property.
 * The document base, brand's elements and every component's styles were about 87 KB of each
 * onepager, most of them for blocks it never holds (measured).
 */
export function pruneStyles(html: string): string {
  if (/<script\b/i.test(html)) return html;
  // The elements the parser adds where the markup leaves them out.
  const page: Present = {
    classes: new Set(),
    ids: new Set(),
    tags: new Set(["html", "head", "body", "tbody"]),
  };
  // Read as the browser parses it: any quoting, spacing or case.
  new HTMLRewriter()
    .on("*", {
      element(el) {
        page.tags.add(el.tagName.toLowerCase());
        for (const name of (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean))
          page.classes.add(name);
        const id = el.getAttribute("id");
        if (id) page.ids.add(id);
      },
    })
    .transform(html);
  // The inlined data, most of the page, set aside while the styles are walked and scanned.
  const data: string[] = [];
  let out = html.replace(/;base64,[\w+/=]+/g, (d) => `;base64,@hw${data.push(d) - 1}@`);
  out = editStyles(out, (css) => pruneRules(css, page));
  for (;;) {
    // Every mention but a declaration's own name: a `var()`, a style query, a style attribute.
    const read = new Set(
      [...out.matchAll(/(?<![{;]\s*)(--[\w-]+)|(--[\w-]+)(?![\w-]|\s*:)/g)].map(
        ([, a, b]) => (a ?? b)!,
      ),
    );
    const next = editStyles(out, (css) => dropProperties(css, read));
    if (next === out) return out.replace(/;base64,@hw(\d+)@/g, (_, i: string) => data[+i]!);
    out = next;
  }
}
