import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { compactStyles } from "./compact-styles";
import { withElements } from "./elements";
import { editStyles } from "./prune";
import { brandFile, ROOT, stripComments } from "./root";
import { foreignStyles, styleAttributes } from "./styles";

/**
 * The document base `document.css` as one stylesheet: each `@import` inlined (the brand files from
 * `@hackersandwizards/brand`, its `tokens.css` as its `:root` twin `tokens.root.css`), `@theme`
 * read as `:root`, and every face a data URI resolved beside the file that names it, so the HTML
 * it lands in renders anywhere.
 */
export function documentCss(): string {
  const css = inlineCss(join(ROOT, "document.css"));
  // The HTML parser ends a style element at this text even inside a CSS comment.
  if (/<\/style/i.test(css)) throw new Error("document.css must not contain </style");
  return css;
}

/** The brand files alone, tokens, print faces, the document scale, the list marker, the key figure, the rule and the strip, for a layout that is not a document page, such as the survey deck. */
export function brandCss(): string {
  return [
    "tokens.root.css",
    "print.css",
    "document.flat.css",
    "marker.css",
    "elements/kpi.css",
    "elements/rule.css",
    "elements/strip.css",
  ]
    .map((f) => inlineCss(brandFile(f)))
    .join("\n");
}

const BRAND = "@hackersandwizards/brand/";
// brand's tokens.css holds Tailwind's @theme forms (`static`, `--*: initial`), which a browser
// skips: a page without Tailwind takes brand's generated :root twin.
const BRAND_ROOT: Record<string, string> = { [`${BRAND}tokens.css`]: `${BRAND}tokens.root.css` };

/** A stylesheet with its `@import`s inlined and its comments dropped, as documentCss and brandCss
 * export it (compactStyles strips the pages these never reach). Each file it reads, the faces
 * included, goes into `read`. */
export function inlineCss(path: string, read?: Set<string>): string {
  const dir = dirname(path);
  read?.add(path);
  return stripComments(readFileSync(path, "utf-8"))
    .replace(/@import "([^"]+)";/g, (_, file: string) =>
      inlineCss(
        file.startsWith("@")
          ? createRequire(path).resolve(BRAND_ROOT[file] ?? file)
          : join(dir, file),
        read,
      ),
    )
    .replace(/@theme\s*\{/g, ":root {")
    .replace(/url\("(fonts\/[^"]+)"\)/g, (_, file: string) => {
      const face = join(dir, file);
      read?.add(face);
      return `url(data:font/woff2;base64,${readFileSync(face).toString("base64")})`;
    });
}

/** Each custom property the page's style elements and attributes read through `var()` without a
 * fallback and define nowhere. */
function unsetProperties(html: string): string[] {
  const sheets = [...html.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)].map(([, css]) => css);
  const css = [...sheets, ...styleAttributes(html)].join("\n");
  const names = (pattern: RegExp) => new Set([...css.matchAll(pattern)].map(([, name]) => name));
  // A declaration's name opens its block or follows a `;`, never a selector such as `.card--x:hover`.
  const defined = names(/(?:^|[{;\s])(--[\w-]+)\s*:/g);
  return [...names(/var\(\s*(--[\w-]+)\s*\)/g)].filter((name) => !defined.has(name));
}

// The marker however it is written: with an empty value, or beside another attribute.
const DOCUMENT_STYLE =
  /<style\b[^>]*?\sdata-hw-document(?:\s*=\s*(?:""|''))?(?=[\s>/])[^>]*>[\s\S]*?<\/style>/i;

/**
 * Fills a document's `<style data-hw-document>` with the current base, maps its elements onto the
 * brand's (withElements) and puts it on the print scale. HTML without the marker passes unchanged. A document carrying a style the engine did not write fails: it would print a
 * look no engine type owns (foreignStyles, the documents-styles command). So does one reading a
 * custom property through `var()` without a fallback that the baked page defines nowhere: a
 * document keeps the component styles it was composed with, so a token name the base drops would
 * otherwise empty their rules silently. The faces come back whole: a consumer storing the page
 * runs subsetFaces on it after.
 */
export function bakeDocumentCss(html: string): string {
  if (!DOCUMENT_STYLE.test(html)) return html;
  const foreign = foreignStyles(html);
  if (foreign.length > 0)
    throw new Error(
      `This document carries styles outside the document engine, so the engine will not bake it:\n${foreign.map((f) => `  ${f}`).join("\n")}\nCompose it from an engine type (documents-compose); where no type or variant fits, add it to @hackersandwizards/documents.`,
    );
  const css = documentCss();
  const scaled = /<html\b[^>]*\bdata-hw-scale=/.test(html)
    ? html
    : html.replace(/<html\b/, '<html data-hw-scale="print"');
  const full = withElements(scaled).replace(
    DOCUMENT_STYLE,
    () => `<style data-hw-document>\n${css}\n</style>`,
  );
  // Read before compactStyles prunes, so pruning changes no verdict: a property defined under a
  // rule the page cannot use still counts as defined.
  const unset = unsetProperties(editStyles(full, stripComments));
  if (unset.length > 0)
    throw new Error(
      `This document reads custom properties no stylesheet defines: ${unset.join(", ")}. Re-compose a stored document with the current engine; where a fresh compose fails too, report the names to @hackersandwizards/documents.`,
    );
  return compactStyles(full);
}
