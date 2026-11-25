import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { compress, decompress } from "woff2-encoder";
import { editFaces, printableCodePoints } from "./compact-styles";
import { printedCharacters } from "./pdf-character-map";
import { ROOT } from "./root";

const packageRequire = createRequire(import.meta.url);

/** subset-font (HarfBuzz) ships no types; this is the call subsetFaces makes. woff2-encoder, not
 * subset-font's wawoff2, decodes and encodes: wawoff2 drops the glyph overlap flag FreeType
 * anti-aliases by. */
const subsetFont = packageRequire("subset-font") as (
  font: Buffer,
  text: string,
  options: { targetFormat: "truetype" },
) => Promise<Uint8Array>;

/** Printable ASCII, which a page's counters, list numbers and hyphenation may print without its
 * text holding it, beside the hyphen, ellipsis and quotes Chrome may set in their place. */
const ALWAYS = String.fromCodePoint(
  ...Array.from({ length: 0x5f }, (_, i) => 0x20 + i),
  0xa0,
  0xad,
  0x2010,
  0x2011,
  0x2018,
  0x2019,
  0xab,
  0xbb,
  0x201a,
  0x201c,
  0x201d,
  0x201e,
  0x2026,
  0x2039,
  0x203a,
);

/** Every face a page inlines, its base64 as the group. */
const FACES = /data:font\/woff2;base64,([\w+/=]+)/g;

/** Each brand face decoded once a process; the cuts for the last page text, since fitOnepager
 * composes one onepager many times over. */
const decoded = new Map<string, Promise<Uint8Array>>();
let lastCut = { text: "", faces: new Map<string, Promise<string>>() };

/** A face's base64 decoded to TrueType, through the cache. */
const decodedFace = (data: string) => {
  let ttf = decoded.get(data);
  if (!ttf) {
    // A page whose faces were cut before brings faces of its own: the cache keeps the brand's.
    if (decoded.size >= 64) decoded.clear();
    decoded.set(data, (ttf = decompress(Buffer.from(data, "base64"))));
  }
  return ttf;
};

type EncodeJob = {
  font: Uint8Array;
  resolve: (woff2: Uint8Array | Promise<Uint8Array>) => void;
};

/** Encoding is nearly all of a cut's time. Node has no global Worker and strips no types under
 * node_modules, so only Bun spreads it. */
let encoderLimit = process.versions.bun ? Math.min(4, availableParallelism()) : 1;
const encodeQueue: EncodeJob[] = [];
let encoders = 0;

const encodeHere = ({ font, resolve }: EncodeJob) => resolve(compress(font));

/** A Worker taking queued faces until none is left. Its file is found through ROOT: a consumer's
 * bundle holds no copy of it beside the chunk `import.meta.url` would name. */
function startEncoder() {
  encoders++;
  let job: EncodeJob | undefined;
  // The page is the same either way, so a Worker that cannot run costs time and not the document.
  const encodeAllHere = (reason: unknown) => {
    if (encoderLimit > 1) console.warn(`Encoding font faces in-process: ${String(reason)}`);
    encoderLimit = 1;
    if (job) encodeHere(job);
    job = undefined;
    encodeQueue.splice(0).forEach(encodeHere);
  };
  let worker: Worker;
  try {
    worker = new Worker(join(ROOT, "scripts/encode-face.ts"));
  } catch (error) {
    return encodeAllHere(error);
  }
  const takeNext = () => {
    job = encodeQueue.shift();
    if (job) return worker.postMessage(job.font);
    encoders--;
    void worker.terminate();
  };
  worker.onmessage = ({ data }: MessageEvent<Uint8Array | null>) => {
    if (data) job!.resolve(data);
    else encodeHere(job!);
    takeNext();
  };
  worker.onerror = (event) => {
    encodeAllHere(event.message);
    void worker.terminate();
  };
  // A Worker that exits during a job posts nothing and fires no error.
  worker.addEventListener("close", () => {
    if (job) encodeAllHere("a Worker exited");
  });
  takeNext();
}

const encodeFace = (font: Uint8Array) =>
  new Promise<Uint8Array>((resolve) => {
    const job = { font, resolve };
    if (encoderLimit < 2) return encodeHere(job);
    encodeQueue.push(job);
    if (encoders < encoderLimit) startEncoder();
  });

/** A TrueType face cut to `text`, as WOFF2 base64. */
const cutTo = async (font: Uint8Array, text: string) =>
  Buffer.from(
    await encodeFace(await subsetFont(Buffer.from(font), text, { targetFormat: "truetype" })),
  ).toString("base64");

const cutFace = (data: string, text: string) => {
  if (lastCut.text !== text) lastCut = { text, faces: new Map() };
  let face = lastCut.faces.get(data);
  if (!face) {
    face = decodedFace(data).then((font) => cutTo(font, text));
    lastCut.faces.set(data, face);
  }
  return face;
};

/**
 * A standalone page with each inlined face cut to the characters the page can print (its text,
 * the style elements' `content` and printable ASCII), every OpenType feature kept, so tabular
 * figures and kerning print as before. The page as it is stored then carries a fraction of the
 * faces; a page baked again (bakeDocumentCss) gets the whole base back. A character a script adds
 * after load and the page holds nowhere prints a fallback, which assertBrandFonts fails.
 */
export async function subsetFaces(html: string): Promise<string> {
  // Sorted, so one page under another fit, which reorders its first appearances, cuts the same.
  const text =
    String.fromCodePoint(...[...printableCodePoints(html)].sort((a, b) => a - b)) + ALWAYS;
  const faces = [...new Set([...html.matchAll(FACES)].map(([, data]) => data!))];
  const cut = new Map(
    await Promise.all(faces.map(async (d) => [d, await cutFace(d, text)] as const)),
  );
  return html.replace(FACES, (_, data: string) => `data:font/woff2;base64,${cut.get(data)}`);
}

/** A font's PostScript name (name ID 6) from its sfnt tables. */
function postScriptName(font: Uint8Array): string | undefined {
  const view = new DataView(font.buffer, font.byteOffset, font.byteLength);
  for (let i = 0; i < view.getUint16(4); i++) {
    const record = 12 + i * 16;
    if (String.fromCharCode(...font.subarray(record, record + 4)) !== "name") continue;
    const table = view.getUint32(record + 8);
    const strings = table + view.getUint16(table + 4);
    for (let n = 0; n < view.getUint16(table + 2); n++) {
      const r = table + 6 + n * 12;
      if (view.getUint16(r + 6) !== 6) continue;
      const bytes = font.subarray(
        strings + view.getUint16(r + 10),
        strings + view.getUint16(r + 10) + view.getUint16(r + 8),
      );
      // Unicode and Windows names are UTF-16BE, Macintosh ones single bytes.
      return view.getUint16(r) === 1
        ? Buffer.from(bytes).toString("latin1")
        : Buffer.from(bytes).swap16().toString("utf16le");
    }
  }
  return undefined;
}

/** The hyphens and spaces a screen may break or space a line with where the print did not. */
const BREAKS = "  ­-‐";

/**
 * The page `pdf` printed, each inlined face cut to the characters that face printed there, and
 * each face it never printed dropped: subsetFaces keeps every character of the page in every face,
 * though most faces print a few words. The onepager's faces were half of its HTML (measured). The
 * screen sets the same words in the same faces, the print styles holding no other face, and only
 * a hyphen or space its other line breaks may add, which every face keeps.
 */
export async function cutFacesToPdf(html: string, pdf: string): Promise<string> {
  const bytes = readFileSync(pdf);
  // A Type 3 face carries no name to match: the page stays as it is.
  if (bytes.includes("/Subtype /Type3")) return html;
  const printed = printedCharacters(bytes);
  // No font found means fonts written in a form this reader does not know, not a page without
  // text: nothing is cut.
  if (printed.size === 0) return html;
  const faces = await Promise.all(
    [...new Set([...html.matchAll(FACES)].map(([, data]) => data!))].map(async (data) => {
      // Not through `decoded`, which holds the brand's faces: these are this page's cuts.
      const font = await decompress(Buffer.from(data, "base64"));
      return { data, font, name: postScriptName(font) ?? "" };
    }),
  );
  // A printed font no face is named for may be one of them under another name: nothing is cut.
  if ([...printed.keys()].some((name) => !faces.some((face) => face.name === name))) return html;
  const cut = new Map(
    await Promise.all(
      faces.map(async ({ data, font, name }) => {
        const points = printed.get(name);
        if (!points) return [data, ""] as const;
        const text = String.fromCodePoint(...[...points].sort((a, b) => a - b)) + BREAKS;
        return [data, await cutTo(font, text)] as const;
      }),
    ),
  );
  return editFaces(html, (face) => {
    const data = new RegExp(FACES.source).exec(face)?.[1];
    if (!data) return face;
    return cut.get(data) ? face.replace(data, cut.get(data)!) : "";
  });
}
