import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { rejection } from "@hackersandwizards/scaffolding/rejection";
import { renderHandoutPdf } from "../scripts/render-handout-pdf";
import { limit } from "./probe";

test(
  "a server that is not running is named in plain words, the way a bad status is",
  async () => {
    const server = Bun.serve({ port: 0, fetch: () => new Response(null) });
    const url = `http://127.0.0.1:${server.port}/print`;
    await server.stop(true);
    const dir = mkdtempSync(join(tmpdir(), "handout-pdf-"));
    const pdf = join(dir, "refused.pdf");
    const plain = `${url} refused the connection: is its server running?`;
    try {
      expect(await rejection(renderHandoutPdf(url, pdf))).toContain(`renderHandoutPdf: ${plain}`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
  limit(60_000),
);
