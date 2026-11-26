/**
 * Blank Chrome's render timestamps and rank its table-header IDs to preserve ID tree order.
 * Same-length replacements preserve the PDF's cross-reference offsets.
 */
export const stableBytes = (pdf: Buffer): Buffer => {
  const text = pdf.toString("latin1");
  const ids = [...text.matchAll(/\/ID \(node(\d+)\)/g)].map(([, id]) => Number(id));
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
