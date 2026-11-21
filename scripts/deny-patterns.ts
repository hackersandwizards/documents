// A deny term as a whole word, its spaces also as a hyphen, an underscore, a line break or nothing
// (a slug, a wrapped line), its & also as an entity, its ß and umlauts also spelled out, in any case.
// An all-capitals term (with a letter) is an acronym and often an ordinary word in lower case: in text it hits in
// capitals, and in any case only beside a hyphen, underscore, slash or digit, as in a slug.
const SPELLED: Record<string, string> = { ß: "ss", ä: "ae", ö: "oe", ü: "ue" };
export function denyPatterns(term: string): { inPath: RegExp; inText: RegExp[] } {
  const body = [...term]
    .map((ch) => {
      if (/\s/.test(ch)) return "(?:\\s|&nbsp;|&#160;|[-_.])*";
      if (ch === "&") return "(?:&|&amp;|&#0*38;|&#x0*26;)";
      const lower = SPELLED[ch.toLowerCase()];
      // A capital is spelled in capitals, which the case-sensitive acronym pattern needs.
      const spelled = lower && ch !== ch.toLowerCase() ? lower.toUpperCase() : lower;
      return spelled ? `(?:${ch}|${spelled})` : ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("");
  const word = `(?<![\\p{L}\\p{N}])${body}(?![\\p{L}\\p{N}])`;
  const inPath = new RegExp(word, "giu");
  if (term !== term.toUpperCase() || !/\p{L}/u.test(term)) return { inPath, inText: [inPath] };
  const slug = `(?<![\\p{L}\\p{N}])${body}(?=[-_/\\d])|(?<=[-_/\\d])${body}(?![\\p{L}\\p{N}])`;
  return { inPath, inText: [new RegExp(word, "gu"), new RegExp(slug, "giu")] };
}
