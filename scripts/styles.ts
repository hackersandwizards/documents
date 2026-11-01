#!/usr/bin/env bun
// The style boundary of the engine. Inside it, every value a document draws is a token of
// tokens.css (`rawValues`, held by test/tokens.test.ts over the engine's own stylesheets). At a
// consumer, a rendered document carries only the engine's styles (`foreignStyles`, the
// `documents-styles` command a consumer runs in its gate).
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve } from "node:path";

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
  "--mark-height",
];

const RAW: [string, RegExp][] = [
  ["length", /(?<![\w.#-])-?\d*\.?\d+(pt|mm|cm|in|pc|q|px|rem|em|ex|ch|lh|vh|vw)\b/gi],
  ["colour", /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/gi],
  ["named colour", /:\s*[^;{}]*\b(white|black|red|green|blue|gr[ae]y|teal|purple)\b/gi],
  [
    "brand token",
    /var\(--((color|font|type|radius|print|text|spacing|shadow|logo-wizard)-|tracking-label\))/g,
  ],
  ["weight", /font-weight:\s*\d/g],
  ["leading", /line-height:\s*[\d.]+/g],
];

/** Every raw value in a stylesheet, comments, strings and url() left out: a length, a colour, a
 *  brand token named past tokens.css, a numeric weight or line height. */
export function rawValues(css: string): string[] {
  const code = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/url\([^)]*\)/g, "url()")
    .replace(/"[^"\n]*"|'[^'\n]*'/g, '""');
  return RAW.flatMap(([kind, re]) => [...code.matchAll(re)].map((m) => `${kind}: ${m[0]}`));
}

/** The inline style declarations in markup or source that set anything but a custom property. */
export function rawInlineStyles(text: string): string[] {
  const markup = text.replace(/<style[^>]*>[\s\S]*?<\/style>/g, "");
  // An Astro expression, style={...}, holds its declarations in its string literals.
  const styles = [...markup.matchAll(/\sstyle=(?:"([^"]*)"|\{((?:[^{}]|\{[^{}]*\})*)\})/g)].flatMap(
    ([, attr, expr]) =>
      attr !== undefined
        ? [attr]
        : [...expr.matchAll(/`([^`]*)`|"([^"]*)"/g)].map((m) => m[1] ?? m[2]),
  );
  return styles
    .map((style) => style.trim())
    .filter((style) => style && !style.split(";").every((d) => !d.trim() || /^\s*--/.test(d)));
}

/** What in a rendered document the engine did not write, one line per finding. */
export function foreignStyles(html: string): string[] {
  const found: string[] = [];
  for (const [tag] of html.matchAll(/<style\b[^>]*>/gi))
    if (!ENGINE_STYLES.some((attr) => new RegExp(`\\s${attr}(?=[\\s=>])`).test(tag)))
      found.push(`a style element the engine did not write: ${tag}`);
  for (const [tag] of html.matchAll(/<link\b[^>]*>/gi))
    // The brand package's own files are the one stylesheet a page may link, as the specimen does.
    if (
      /\brel=["']?stylesheet/i.test(tag) &&
      !/href=["'][^"']*\/@hackersandwizards\/brand\//.test(tag)
    )
      found.push(`a linked stylesheet: ${tag}`);
  // Text cannot hold "<", so every match is inside a tag.
  for (const [, style] of html.matchAll(/<[a-z][^>]*?\sstyle=(?:"([^"]*)"|'([^']*)')/gi)) {
    const set = (style ?? "")
      .split(";")
      .map((d) => d.split(":")[0].trim())
      .filter(Boolean);
    const foreign = set.filter((p) => !DATA_PROPERTIES.includes(p));
    if (foreign.length) found.push(`a style attribute setting ${foreign.join(", ")}: "${style}"`);
  }
  return found;
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
