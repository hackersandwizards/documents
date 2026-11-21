import { decodeHTML } from "entities";
import { editStyles, pruneStyles } from "./prune";
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
  const tag = /<html\b[^>]*?\slang\s*=\s*["']?([\w-]+)/i.exec(html)?.[1] ?? "en";
  // An invalid tag such as de_DE, on which toLocaleUpperCase throws, cases as English.
  const lang = (() => {
    try {
      return Intl.getCanonicalLocales(tag)[0]!;
    } catch {}
    return "en";
  })();
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

/** A page's style elements with each `@layer` order statement dropped that names only layers
 * declared before it: only a layer's first mention places it, and a page joining several brand
 * files can repeat the order. */
function layerOnce(html: string): string {
  const seen = new Set<string>();
  return editStyles(html, (css) =>
    css.replace(/@layer\s+([\w.,\s-]+?)\s*([;{])/g, (at, names: string, end: string) => {
      const layers = names.split(",").map((n) => n.trim());
      const fresh = layers.some((n) => !seen.has(n));
      for (const n of layers) seen.add(n);
      return end === "{" || fresh ? at : "";
    }),
  );
}

/**
 * A standalone page as it leaves the engine: its style elements without comments, which a reader
 * of the page never needs, without the rules and custom properties its markup cannot use
 * (pruneStyles), and without each face whose `unicode-range` holds no character of the
 * page, which Chrome never loads there: brand's latin-ext, arrow and box-drawing faces were about
 * 260 KB of every page (measured).
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
