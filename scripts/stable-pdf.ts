/**
 * Two renders of one input differ in two places, both rewritten here to the same length, which
 * keeps the cross-reference offsets. Chrome stamps the render time as `/CreationDate` and
 * `/ModDate` (42 PDF pairs, measured): both are blanked, since a document's date is in
 * its text, never in its metadata. And Chrome names each table header cell in the structure tree
 * `node` plus Blink's DOM node id, a counter other nodes draw on first: in a cold Chrome the quote's
 * ids started at 51, 52 or 53 (20 renders measured; images, CSS, favicons and a wait
 * before the print changed nothing, a warm Chrome printed one variant). Each id becomes its rank,
 * so the order the ID tree is sorted by stays.
 */
export const stableBytes = (pdf: Buffer): Buffer => {
  const text = pdf.toString("latin1");
  const ids = [...text.matchAll(/\/ID \(node(\d+)\)/g)].map(([, id]) => +id!);
  const rank = new Map(ids.sort((a, b) => a - b).map((id, i) => [id, i + 1]));
  // Only where the structure tree names or cites a header cell: a heading reading "node22" stays.
  const renumber = (entry: string) =>
    entry.replace(
      /\(node(\d+)\)/g,
      (_, id: string) => `(node${String(rank.get(+id) ?? +id).padStart(id.length, "0")})`,
    );
  return Buffer.from(
    text
      .replace(/\/(?:CreationDate|ModDate) \(D:\d{14}[^)]{0,8}\)/g, (entry) =>
        " ".repeat(entry.length),
      )
      .replace(/\/ID \(node\d+\)|\/(?:Headers|Names|Limits) \[[^\]]*\]/g, renumber),
    "latin1",
  );
};
