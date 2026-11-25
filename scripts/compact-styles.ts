import { decodeHTML } from "entities";
import { canonicalLanguageTag } from "./fill";
import { cssItems, editStyles, pruneStyles } from "./prune";
import { stripComments } from "./root";

/** A code point from a CSS or JS escape; one past U+10FFFF is no character. */
const escaped = (match: string, hex: string) => {
  const point = parseInt(hex, 16);
  return point <= 0x10ffff ? String.fromCodePoint(point) : match;
};

/** Every character a page can print: its markup and scripts with entities, CSS and JS escapes
 * decoded, each in both cases of the page's `lang` for `text-transform` (Turkish prints i as İ), its base64
 * data URIs aside. A character a script builds from computed values is not seen: its face is
 * dropped and the PDF prints a fallback, which assertBrandFonts fails. */
export function printableCodePoints(html: string): Set<number> {
  const tag = /<html\b[^>]*?\slang\s*=\s*["']?([\w-]+)/i.exec(html)?.[1];
  // Case as English when the tag is invalid, since toLocaleUpperCase throws on tags like de_DE.
  const lang = (tag && canonicalLanguageTag(tag)) ?? "en";
  const text = decodeHTML(
    html.replace(
      /data:[\w.+-]+\/[\w.+-]+(?:;[\w.=-]+)*;base64,[\w+/=]+|data:image\/svg\+xml,[^"'\s)]*/g,
      "",
    ),
  )
    .replace(/\\([\da-f]{1,6})\s?/gi, escaped)
    .replace(/\\u(?:\{([\da-f]{1,6})\}|([\da-f]{4}))/gi, (match, braced?: string, four?: string) =>
      escaped(match, (braced ?? four)!),
    );
  const points = new Set<number>();
  for (const c of new Set(text))
    for (const form of [c, c.toLocaleUpperCase(lang), c.toLocaleLowerCase(lang)])
      for (const p of form) points.add(p.codePointAt(0)!);
  return points;
}

/** Each `@font-face` rule of a page's style elements, kept, rewritten or dropped ("") by `edit`. */
export const editFaces = (html: string, edit: (face: string) => string) =>
  editStyles(html, (css) => css.replace(/@font-face\s*\{[^}]*\}\s*/g, edit));

// Escaped and non-ASCII names are kept verbatim.
const LAYER_NAME = /^-?[_a-z][\w-]*(?:\.-?[_a-z][\w-]*)*$/i;

/** The layer names of a valid `@layer` statement or single-layer block, or undefined for any other item. */
function parseLayerItem({
  prelude,
  body,
}: {
  prelude: string;
  body?: string;
}): { statement: boolean; layers: string[] } | undefined {
  const statement = body === undefined;
  if (statement && !prelude.endsWith(";")) return undefined;
  const names = /^@layer\s+(.+)$/is.exec(statement ? prelude.slice(0, -1) : prelude)?.[1];
  if (!names) return undefined;
  const layers = names.split(",").map((name) => name.trim());
  if ((!statement && layers.length !== 1) || !layers.every((name) => LAYER_NAME.test(name)))
    return undefined;
  return { statement, layers };
}

/** Only an unconditional declaration in the same scope can make a layer order redundant. */
function layerOnce(html: string): string {
  const seen = new Set<string>();
  return editStyles(html, (css, open) => {
    if (!/@layer\s/i.test(css) || /\b(?:media|type|title|disabled)\b/i.test(open)) return css;
    let kept = "";
    let offset = 0;
    for (const item of cssItems(css)) {
      const parsed = parseLayerItem(item);
      if (!parsed) continue;
      if (parsed.statement && parsed.layers.every((name) => seen.has(name))) {
        kept += css.slice(offset, item.end - item.prelude.length);
        offset = item.end;
      }
      for (const name of parsed.layers) seen.add(name);
    }
    return kept + css.slice(offset);
  });
}

/**
 * A standalone page as it leaves the engine: its style elements without comments, which a reader
 * of the page never needs, without the rules and custom properties its markup cannot use
 * (pruneStyles), and without each face whose `unicode-range` holds no character of the page.
 */
export function compactStyles(html: string): string {
  const bare = pruneStyles(layerOnce(editStyles(html, stripComments)));
  const points = [...printableCodePoints(bare)];
  return editFaces(bare, (face) => {
    const range = /unicode-range:\s*([^;}]+)/.exec(face)?.[1];
    if (!range) return face;
    const spans = range.split(",").map((r): [number, number] => {
      const [lo = "", hi = lo] = r.trim().replace(/^U\+/i, "").split("-");
      return [parseInt(lo.replace(/\?/g, "0"), 16), parseInt(hi.replace(/\?/g, "f"), 16)];
    });
    return points.some((p) => spans.some(([lo, hi]) => p >= lo && p <= hi)) ? face : "";
  });
}
