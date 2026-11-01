/** A component's own words with each `{name}` replaced by that field of `values`; a missing one fills nothing. */
export const fill = (text: string, values: object = {}) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) =>
    String((values as Record<string, unknown>)[key] ?? ""),
  );

/** `text` as a CSS string for a raw `<style>`: `<` escaped, so a caller's `</style>` cannot end the element. */
export const cssString = (text: string) => JSON.stringify(text).replace(/</g, "\\3C ");
