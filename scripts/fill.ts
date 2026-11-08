/** A component's own words with each `{name}` replaced by that field of `values`; a missing one fills nothing. */
export const fill = (text: string, values: object = {}) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) =>
    String((values as Record<string, unknown>)[key] ?? ""),
  );

/** `text` as a CSS string for a raw `<style>`: `<` escaped, so a caller's `</style>` cannot end the element. */
export const cssString = (text: string) => JSON.stringify(text).replace(/</g, "\\3C ");

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
export const wordsFor = <T>(lang: unknown, table: { en: T } & Partial<Record<string, T>>): T =>
  (typeof lang === "string" ? table[lang.split("-")[0]!.toLowerCase()] : undefined) ?? table.en;

/** An SVG as a data URI, percent-encoded only where a URL or an attribute needs it. Base64 grows
 *  the text by a third, and the PNG brand's lockup carries is base64 already: the lockup took
 *  67 KB as base64 against 50 KB this way (measured). */
export const svgUri = (svg: string) =>
  `data:image/svg+xml,${svg.replace(/[%#"<>&\n\r\t]/g, encodeURIComponent)}`;
