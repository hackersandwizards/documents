import { fc, test } from "@hackersandwizards/scaffolding/property";
import { expect } from "vitest";
import { stableBytes } from "../scripts/stable-pdf";

test.prop(
  [
    fc.uniqueArray(fc.integer({ min: 1, max: 99_999 }), { maxLength: 32 }),
    fc
      .uint8Array({ maxLength: 1024 })
      .map((bytes) => bytes.map((byte) => (byte === 47 ? 46 : byte))),
    fc.constantFrom("", "Z", "+02'00'"),
  ],
  {
    examples: [
      [[], Uint8Array.of(), ""],
      [[100, 2, 10, 99999], Uint8Array.of(0, 233, 255), "Z"],
      [[1, 9, 10, 99, 100], new Uint8Array(1024).fill(255), "+02'00'"],
    ],
  },
)(
  "PDF metadata is blanked and header IDs are ranked without moving any byte offsets",
  (ids, payload, zone) => {
    const other = Math.max(0, ...ids) + 1;
    const node = (id: number) => `(node${id})`;
    const ranked = (id: number) =>
      `(node${String(ids.filter((candidate) => candidate <= id).length).padStart(String(id).length, "0")})`;
    const metadata = ["/CreationDate", "/ModDate"].map((key) => `${key} (D:20240909103015${zone})`);
    const dictionary = (nodes: string[]) =>
      nodes.map((name) => `/ID ${name}\n`).join("") +
      `/Headers [${nodes.join(" ")}]\n/Names [${nodes.join(" ")}]\n/Limits [${nodes.join(" ")} ${node(other)}]\n`;
    const tail = Buffer.concat([
      Buffer.from(`/Caption ${node(ids[0] ?? other)}\nstream\n`),
      payload,
    ]);
    const input = Buffer.concat([
      Buffer.from(metadata.join("\n") + "\n" + dictionary(ids.map(node))),
      tail,
    ]);
    const expected = Buffer.concat([
      Buffer.from(
        metadata.map((entry) => " ".repeat(entry.length)).join("\n") +
          "\n" +
          dictionary(ids.map(ranked)),
      ),
      tail,
    ]);
    expect(stableBytes(input)).toEqual(expected);
    expect(stableBytes(input)).toHaveLength(input.length);
  },
);
