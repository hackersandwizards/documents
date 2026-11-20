import { join } from "node:path";
import { expect, it } from "vitest";
import { ROOT } from "../scripts/root";

it("answers null for bytes the encoder refuses", async () => {
  const worker = new Worker(join(ROOT, "scripts/encode-face.ts"));
  const answer = await new Promise((resolve) => {
    worker.onmessage = ({ data }: MessageEvent<unknown>) => resolve(data);
    worker.postMessage(new Uint8Array([1, 2, 3]));
  });
  worker.terminate();
  expect(answer).toBeNull();
});
