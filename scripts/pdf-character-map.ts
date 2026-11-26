import { inflateSync } from "node:zlib";

function unicodeStream(pdf: Buffer, text: string, id: string) {
  const head = new RegExp(`(?<![\\d])${id} 0 obj\\s*<<([\\s\\S]*?)>>\\s*stream\\r?\\n`).exec(text);
  // An indirect length (`/Length 12 0 R`) reads as none, so the stream fails.
  const length = Number(/\/Length (\d+)\b(?!\s+\d+\s+R)/.exec(head?.[1] ?? "")?.[1]);
  if (!head || !length)
    throw new Error(`printedCharacters: no stream ${id} with a direct length in the PDF`);
  const start = head.index + head[0].length;
  const body = pdf.subarray(start, start + length);
  // A stream without a filter is read as it stands; one other than Chrome's FlateDecode alone fails.
  const filter = /\/Filter\s*(\[[^\]]*\]|\/\w+)/.exec(head[1])?.[1].replace(/[[\]\s]/g, "");
  if (filter && filter !== "/FlateDecode")
    throw new Error(`printedCharacters: stream ${id} has the filter ${filter}`);
  return (filter ? inflateSync(body) : body).toString("latin1");
}

const cmapText = (hex: string) => Buffer.from(hex, "hex").swap16().toString("utf16le");

export function codePointsInCmap(cmap: string): Set<number> {
  const points = new Set<number>();
  for (const [, block] of cmap.matchAll(/beginbfchar([\s\S]*?)endbfchar/g))
    for (const [, dst] of block.matchAll(/<[\da-f]+>\s*<([\da-f]+)>/gi))
      for (const char of cmapText(dst)) {
        const point = char.codePointAt(0);
        if (point !== undefined) points.add(point);
      }
  for (const [, block] of cmap.matchAll(/beginbfrange([\s\S]*?)endbfrange/g))
    for (const [, lo, hi, dst] of block.matchAll(/<([\da-f]+)>\s*<([\da-f]+)>\s*<([\da-f]+)>/gi)) {
      const first = Number(cmapText(dst).codePointAt(0));
      for (let k = 0; k <= parseInt(hi, 16) - parseInt(lo, 16); k++) points.add(first + k);
    }
  return points;
}

/** The characters each font of a Chrome PDF prints, by PostScript name, from its ToUnicode map. */
export function printedCharacters(pdf: Buffer): Map<string, Set<number>> {
  const text = pdf.toString("latin1");
  const fonts = new Map<string, Set<number>>();
  for (const [dict] of text.matchAll(/<<[^<>]*\/Subtype \/Type0[^<>]*>>/g)) {
    const name = /\/BaseFont \/(?:[A-Z]{6}\+)?([^\s/]+)/.exec(dict)?.[1];
    const map = /\/ToUnicode (\d+) 0 R/.exec(dict)?.[1];
    if (!name || !map) throw new Error(`printedCharacters: a font without a name or ToUnicode`);
    const points = fonts.get(name) ?? new Set<number>();
    for (const point of codePointsInCmap(unicodeStream(pdf, text, map))) points.add(point);
    fonts.set(name, points);
  }
  return fonts;
}
