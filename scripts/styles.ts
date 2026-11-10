#!/usr/bin/env bun
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { decodeHTMLAttribute } from "entities";

const USAGE = `Usage: bun run documents-styles <file.html | directory>...

Fails when a rendered document carries a style the document engine
(@hackersandwizards/documents) did not write: a <style> element without one of the engine's
markers (data-hw-*), a linked stylesheet other than the brand package's, or a style attribute that sets anything but a
custom property. A directory is searched for .html files. Every finding names the file and what
to do instead: compose the document from an engine type, or add the missing type or variant to
the engine.`;

/** The attribute each style element the engine writes carries; any other style element is foreign. */
export const ENGINE_STYLES = [
  "data-hw-document",
  "data-hw-components",
  "data-hw-page",
  "data-hw-onepager",
  "data-hw-readout",
  "data-hw-certificate",
] as const;

/** The custom properties a component sets inline from its props, for its own CSS to read. */
export const DATA_PROPERTIES = [
  "--col-width",
  "--share",
  "--count",
  "--band",
  "--mark",
  "--mark-scale",
  // A client mark's height in px, which a stored onepager may set instead of --mark-scale.
  "--mark-height",
];

const RAW: [string, RegExp][] = [
  [
    "length",
    /(?<![\w.#-])-?\d*\.?\d+(pt|mm|cm|in|pc|q|px|rem|em|ex|ch|r?lh|[dsl]?v(?:h|w|i|b|min|max)|cq(?:w|h|i|b|min|max))\b/gi,
  ],
  ["colour", /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi],
  [
    "named colour",
    /:\s*[^;{}]*\b(white|black|red|green|blue|gr[ae]y|teal|purple|orange|yellow|pink|brown|navy|silver|maroon|olive|lime|aqua|cyan|fuchsia|magenta|gold|indigo|violet|coral|salmon|tomato|crimson|beige|ivory|khaki|turquoise|tan)\b/gi,
  ],
  [
    "brand token",
    /var\(--((color|font|type|radius|print|text|spacing|shadow|logo-wizard)-|tracking-label\))/g,
  ],
  ["weight", /font-weight:\s*\d|font:\s*(?:[a-z-]+\s+)*\d/g],
  ["leading", /line-height:\s*[\d.]+/g],
];

/** Every raw value in a stylesheet, comments, strings and url() left out: a length, a colour, a
 *  brand token named past tokens.css, a numeric weight or line height. */
export function rawValues(css: string): string[] {
  // One pass, so a "/*" inside a string is no comment and a quote inside a comment no string.
  const code = css
    .replace(/"[^"\\\n]*(?:\\.[^"\\\n]*)*"|'[^'\\\n]*(?:\\.[^'\\\n]*)*'|\/\*[\s\S]*?\*\//g, (m) =>
      m[0] === "/" ? "" : '""',
    )
    .replace(/url\([^)]*\)/g, "url()");
  return RAW.flatMap(([kind, re]) => [...code.matchAll(re)].map((m) => `${kind}: ${m[0]}`));
}

/** The inline style declarations in markup or source that set anything but a custom property. */
export function rawInlineStyles(text: string): string[] {
  const markup = text.replace(/<(style|script)\b[^>]*>[\s\S]*?<\/\1>/g, "");
  // An Astro expression, style={...}, holds its declarations in its string literals. Spaces
  // around "=" only before a quoted value: `const style = getComputedStyle(el)` is script.
  const styles = [
    ...markup.matchAll(
      /\sstyle(?:\s*=\s*(?:"([^"]*)"|'([^']*)')|=(?:\{((?:[^{}]|\{[^{}]*\})*)\}|([^\s"'=<>`{}]+)))/gi,
    ),
  ].flatMap(([, double, single, expr, bare]) =>
    expr === undefined
      ? [double ?? single ?? bare]
      : [...expr.matchAll(/`([^`]*)`|"([^"]*)"|'([^']*)'/g)].map((m) => m[1] ?? m[2] ?? m[3]),
  );
  return styles
    .map((style) => style.trim())
    .filter((style) => style && !style.split(";").every((d) => !d.trim() || /^\s*--/.test(d)));
}

// The brand package's own files, linked relatively, are the one stylesheet a page may link, as the
// catalog's type pages do: no scheme or host, no climbing out of the package.
const BRAND_HREF =
  /^(?![a-z][\w+.-]*:|[\\/]{2})(?:[^?#]*\/)?@hackersandwizards\/brand\/(?![^?#]*\.\.)/i;

/** Whether a link's address is one of the brand's files, read as the browser reads it: entities
 *  decoded, trimmed, and percent-escapes decoded, so %2e%2e is the `..` it climbs out with. */
function brandHref(raw: string): boolean {
  try {
    return BRAND_HREF.test(decodeURIComponent(decodeHTMLAttribute(raw).trim()));
  } catch {
    return false;
  }
}

/** What in a rendered document the engine did not write, one line per finding. */
export function foreignStyles(html: string): string[] {
  const found: string[] = [];
  const openTag = (el: HTMLRewriterTypes.Element) =>
    `<${el.tagName}${[...el.attributes].map(([k, v]) => (v ? ` ${k}="${v}"` : ` ${k}`)).join("")}>`;
  // HTMLRewriter parses as the browser does: any quoting, spacing or case, a ">" inside a value.
  new HTMLRewriter()
    .on("style", {
      element(el) {
        if (!ENGINE_STYLES.some((attr) => el.hasAttribute(attr)))
          found.push(`a style element the engine did not write: ${openTag(el)}`);
      },
    })
    .on("link", {
      element(el) {
        const rel = (el.getAttribute("rel") ?? "").toLowerCase().split(/\s+/);
        if (rel.includes("stylesheet") && !brandHref(el.getAttribute("href") ?? ""))
          found.push(`a linked stylesheet: ${openTag(el)}`);
      },
    })
    .on("*", {
      element(el) {
        for (const [name, raw] of el.attributes) {
          if (name !== "style") continue;
          // Decoded as the browser reads it: &#59 is the ";" that ends a custom property.
          const style = decodeHTMLAttribute(raw);
          const set = style
            .split(";")
            .map((d) => d.split(":")[0].trim())
            .filter(Boolean);
          const foreign = set.filter((p) => !DATA_PROPERTIES.includes(p));
          if (foreign.length)
            found.push(`a style attribute setting ${foreign.join(", ")}: "${style}"`);
        }
      },
    })
    .transform(html);
  return found;
}

/** Every element's style attribute in `html`, read as the browser reads markup. */
export function styleAttributes(html: string): string[] {
  const styles: string[] = [];
  new HTMLRewriter()
    .on("*", {
      element(el) {
        for (const [name, style] of el.attributes)
          if (name === "style") styles.push(decodeHTMLAttribute(style));
      },
    })
    .transform(html);
  return styles;
}

function htmlFiles(path: string): string[] {
  if (!statSync(path).isDirectory()) return [path];
  return readdirSync(path, { recursive: true, encoding: "utf8" })
    .filter((f) => f.endsWith(".html"))
    .map((f) => join(path, f));
}

if (import.meta.main) {
  const args = process.argv.slice(2);
  if (args.length === 0 || args.includes("--help")) {
    console.log(USAGE);
    process.exit(args.length === 0 ? 1 : 0);
  }
  const files = args.flatMap((a) => htmlFiles(resolve(a)));
  // A path holding no document is a wrong path, never a pass.
  if (files.length === 0) {
    console.error(`documents-styles: no .html file under ${args.join(", ")}`);
    process.exit(1);
  }
  let failed = 0;
  for (const file of files) {
    const found = foreignStyles(readFileSync(file, "utf8"));
    if (found.length === 0) continue;
    failed++;
    console.error(`${file}\n${found.map((f) => `  ${f}`).join("\n")}`);
  }
  if (failed > 0) {
    console.error(
      `\n${failed} of ${files.length} documents carry styles outside the document engine. Compose each from an engine type (documents-compose, composeOnepager, composeSurveyReadout); where no type or variant fits, add it to @hackersandwizards/documents instead of styling the document.`,
    );
    process.exit(1);
  }
  console.log(`${files.length} documents, every style from the document engine.`);
}
