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
