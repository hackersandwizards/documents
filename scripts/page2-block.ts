import { decodeHTMLStrict } from "entities";

/** Text as its letters and digits alone, case and ß folded: what a block's markup and its PDF text
 * share whatever spaces a tag leaves, or capitals and SS a label prints. */
const letters = (text: string) =>
  text
    .normalize("NFKC")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .replace(/[^\p{L}\p{N}]/gu, "");
/** A block's markup as the letters its PDF text shows: tags dropped, every entity decoded once,
 * and only where it ends in `;`, as copy writes it. */
export const flatBlock = (html: string) => letters(decodeHTMLStrict(html.replace(/<[^>]*>/g, " ")));

// A block shorter than this may print its letters on page 1 inside another block, such as a
// one-word note whose word a card's label holds, so it never marks how far page 1 reaches.
const PAGE1_BLOCK = 20;

/** The index of the block that opens page 2, -1 where none is found: the first block holding
 * page 2's first line after the last block of at least PAGE1_BLOCK letters that page 1 prints whole
 * and page 2 does not. `blocks` take `letters`; the pages are pdftotext's text. A block before
 * that one may hold the same words, in a card whose columns pdftotext reads out of order or in a
 * short block; a short block after it may print its letters on page 1 elsewhere, and a long one
 * repeated on page 2, such as a contact line, stands on page 2. */
export function page2Block(blocks: string[], page1Text: string, page2Text: string): number {
  const first = page2Text.split("\n").find((l) => l.trim().length > 3);
  if (!first) return -1;
  const line = letters(first);
  if (!line) return -1;
  const [page1, page2] = [letters(page1Text), letters(page2Text)];
  const last = blocks.findLastIndex(
    (b) => b.length >= PAGE1_BLOCK && page1.includes(b) && !page2.includes(b),
  );
  return blocks.findIndex((b, i) => i > last && b.includes(line));
}
