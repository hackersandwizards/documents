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

type Present = {
  classes: Set<string>;
  ids: Set<string>;
  tags: Set<string>;
  attributes: Set<string>;
};

// Attributes an element gains on a page without a script of its own: `open` from the browser when
// a reader opens a `<details>`, the rest from renderPdf's print script on each image it redraws.
const SET_LATER = new Set(["open", "style", "width", "src", "srcset", "data-print-scaled"]);

// A class or id name after its sign: CSS takes any character past ASCII as a name character.
const NAME = "(-?[_a-zA-Z\\u{80}-\\u{10ffff}][\\w\\u{80}-\\u{10ffff}-]*)";
const CLASS_NAME = new RegExp(`\\.${NAME}`, "gu");
const ID_NAME = new RegExp(`#${NAME}`, "gu");

// An attribute test, its quoted value skipped over, and the attribute's name.
const ATTRIBUTE = /^\[(?:"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|[^\]"'])*\]?/;
const ATTRIBUTE_NAME = /^\[\s*([\w-]+)\s*(?:[~|^$*]?=|\])/;

/** Whether a selector can match the page: every class, id, element name and attribute name it
 * needs outside a functional pseudo-class is one the markup carries, and of an `:is()` or
 * `:where()` list one selector can match. Another functional pseudo-class, such as `:not()` or
 * `:has()`, needs nothing. An escaped selector counts as matching. */
function canMatch(selector: string, page: Present): boolean {
  if (selector.includes("\\")) return true;
  let bare = "";
  for (let i = 0; i < selector.length; i++) {
    const c = selector[i]!;
    if (c === "[") {
      const test = ATTRIBUTE.exec(selector.slice(i))![0];
      const name = ATTRIBUTE_NAME.exec(test)?.[1]?.toLowerCase();
      if (name && !page.attributes.has(name) && !SET_LATER.has(name)) return false;
      bare += " ";
      i += test.length - 1;
    } else if (c === "(") {
      let depth = 1;
      let j = i + 1;
      for (; j < selector.length && depth > 0; j++) {
        if (selector[j] === "[") j += ATTRIBUTE.exec(selector.slice(j))![0].length - 1;
        else if (selector[j] === "(") depth++;
        else if (selector[j] === ")") depth--;
      }
      if (
        /:(is|where)$/i.test(bare) &&
        !splitTop(selector.slice(i + 1, j - 1), ",").some((s) => canMatch(s.trim(), page))
      )
        return false;
      i = j - 1;
    } else bare += c;
  }
  bare = bare.replace(/::?[\w-]+/g, "");
  for (const [, cls] of bare.matchAll(CLASS_NAME)) if (!page.classes.has(cls!)) return false;
  for (const [, id] of bare.matchAll(ID_NAME)) if (!page.ids.has(id!)) return false;
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
 * A page whose style elements keep only what its markup can use: each rule needing a class, id,
 * element or attribute the page carries nowhere goes, then each custom property the page declares and never
 * reads (in a `var()`, a style query or a style attribute), until none is left to drop. On a page
 * holding a script or an event handler the styles stay whole, since either may add a class or read
 * a property. The CSS holds no comments: compactStyles strips them first.
 * The document base, brand's elements and every component's styles were about 87 KB of each
 * onepager, most of them for blocks it never holds (measured).
 */
export function pruneStyles(html: string): string {
  // The elements the parser adds where the markup leaves them out.
  const page: Present = {
    classes: new Set(),
    ids: new Set(),
    tags: new Set(["html", "head", "body", "tbody"]),
    attributes: new Set(),
  };
  let runs = false;
  // Read as the browser parses it: any quoting, spacing or case.
  new HTMLRewriter()
    .on("*", {
      element(el) {
        const tag = el.tagName.toLowerCase();
        page.tags.add(tag);
        // A script block counts as running unless its type names JSON data, the one data block
        // the engine's pages carry; an event handler runs too.
        if (tag === "script" && !/json/i.test(el.getAttribute("type") ?? "")) runs = true;
        for (const [name] of el.attributes) {
          page.attributes.add(name.toLowerCase());
          if (/^on/i.test(name)) runs = true;
        }
        for (const name of (el.getAttribute("class") ?? "").split(/\s+/).filter(Boolean))
          page.classes.add(name);
        const id = el.getAttribute("id");
        if (id) page.ids.add(id);
      },
    })
    .transform(html);
  if (runs) return html;
  if (page.tags.has("td") || page.tags.has("th")) page.tags.add("tr");
  if (page.tags.has("col")) page.tags.add("colgroup");
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
