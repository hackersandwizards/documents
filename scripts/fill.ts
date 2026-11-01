/** A component's own words with each `{name}` replaced by that field of `values`; a missing one fills nothing. */
export const fill = (text: string, values: object = {}) =>
  text.replace(/\{(\w+)\}/g, (_, key: string) =>
    String((values as Record<string, unknown>)[key] ?? ""),
  );
