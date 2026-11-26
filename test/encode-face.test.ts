import { join } from "node:path";
import { afterEach, assert, expect, it, vi } from "vitest";
import { compress } from "woff2-encoder";
import { ROOT } from "../scripts/root";

vi.mock("woff2-encoder");
afterEach(() => vi.unstubAllGlobals());

it("answers null for bytes the encoder refuses", async () => {
  const worker = new Worker(join(ROOT, "scripts/encode-face.ts"));
  const answer = await new Promise((resolve) => {
    worker.onmessage = ({ data }: MessageEvent<unknown>) => resolve(data);
    worker.postMessage(new Uint8Array([1, 2, 3]));
  });
  worker.terminate();
  expect(answer).toBeNull();
});

it("reports an unexpected compression error to the Worker caller", async () => {
  const worker: { onmessage?: (event: { data: Uint8Array }) => Promise<void> } = {};
  const post = vi.fn();
  vi.stubGlobal("self", worker);
  vi.stubGlobal("postMessage", post);
  const failure = new TypeError("Font encoder failed");
  vi.mocked(compress).mockRejectedValueOnce(failure);
  await import("../scripts/encode-face");
  assert(worker.onmessage, "Missing font Worker handler");
  await worker.onmessage({ data: new Uint8Array() });
  expect(post).toHaveBeenCalledWith({ error: failure });
});
