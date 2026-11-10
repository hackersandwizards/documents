/** A component's own words with each `{name}` replaced by that field of `values`; a missing one fills nothing. */
export const fill = (text: string, values: object = {}) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) =>
    String((values as Record<string, unknown>)[key] ?? ""),
  );

/** `text` as a CSS string for a raw `<style>`: a quote and a backslash escaped, a control character
 *  as CSS's hex escape (a JSON escape such as `\n` reads as the letter), and `<` too, so a caller's
 *  `</style>` cannot end the element. */
export const cssString = (text: string) =>
  `"${text.replace(/["\\]|[<\p{Cc}]/gu, (c) =>
    c === '"' || c === "\\" ? `\\${c}` : `\\${c.charCodeAt(0).toString(16).toUpperCase()} `,
  )}"`;

/** `lang` as a page's `lang` attribute: a language tag such as `de` or `en-GB`, else an error, so
 *  a tag such as `de_DE` never reaches a document. */
export function languageTag(lang: string): string {
  let valid = false;
  try {
    valid = typeof lang === "string" && Intl.getCanonicalLocales(lang).length === 1;
  } catch {}
  if (!valid)
    throw new Error(`lang must be a language tag such as de or en, not ${JSON.stringify(lang)}`);
  return lang;
}

/** A component's words for `lang` from its table per language, by the tag's language (`de-AT`
 *  takes `de`); a language the table lacks takes the English words. */
export function wordsFor<T>(lang: unknown, table: { en: T } & Partial<Record<string, T>>): T {
  const key = typeof lang === "string" ? lang.split("-")[0]!.toLowerCase() : "en";
  return (Object.hasOwn(table, key) ? table[key] : undefined) ?? table.en;
}

/** An SVG as a data URI, percent-encoded only where a URL or an attribute needs it. Base64 grows
 *  the text by a third, and the PNG brand's lockup carries is base64 already: the lockup took
 *  67 KB as base64 against 50 KB this way (measured). */
export const svgUri = (svg: string) =>
  `data:image/svg+xml,${svg.replace(/[%#"<>&\n\r\t]/g, encodeURIComponent)}`;

/** The escape for text and attribute values set into a page. */
export const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
