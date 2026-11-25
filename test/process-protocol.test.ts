import { expect, test } from "vitest";
import { readProtocol } from "../scripts/process-protocol";

const protocols = [
  {
    delimiter: "\n",
    chunks: ['{"id":', '1}\n{"id":2}\n{"id":3}'],
    expected: [{ id: 1 }, { id: 2 }],
  },
  { delimiter: "\0", chunks: ['{"id":1}\0{"id":', "2}\0"], expected: [{ id: 1 }, { id: 2 }] },
  { delimiter: "\n", chunks: ["null\n?\n[]\n"], expected: [undefined, undefined, undefined] },
] as const;

test.each(protocols)(
  "reads complete JSON records from $chunks",
  ({ delimiter, chunks, expected }) => {
    const records: unknown[] = [];
    const read = readProtocol(delimiter, (record) => {
      records.push(record);
      return true;
    });
    chunks.forEach(read);
    expect(records).toEqual(expected);
  },
);

test("stops dispatching a chunk when the receiver rejects a frame", () => {
  const records: unknown[] = [];
  const read = readProtocol("\n", (record) => {
    records.push(record);
    return false;
  });
  read('{"id":1}\n{"id":2}\n');
  expect(records).toEqual([{ id: 1 }]);
});
