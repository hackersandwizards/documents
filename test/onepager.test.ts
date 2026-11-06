import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { encodeNonAsciiHTML } from "entities";
import { openComposer } from "../scripts/compose";
import { fitOnepager } from "../scripts/onepager";
import { assertBrandFonts, renderPdf } from "../scripts/render-pdf";
import { ROOT } from "../scripts/root";
import { onepager } from "../scripts/samples";

let composer: Awaited<ReturnType<typeof openComposer>>;
const work = mkdtempSync(join(tmpdir(), "hw-onepager-test-"));
beforeAll(async () => {
  composer = await openComposer(ROOT);
});
afterAll(async () => {
  await composer?.close();
  rmSync(work, { recursive: true, force: true });
});

describe("fitOnepager", () => {
  // A consumer's copy writes its umlauts as named entities. Page 2 opens on the heading made to
  // hold one, so the fit finds page 2's first block only where every named entity decodes.
  const html = onepager.html
    .replace("<h3>Gut zu wissen</h3>", "<h3>Schön zu wissen</h3>")
    .replace(/[\u0080-\u{10ffff}]/gu, (c) => encodeNonAsciiHTML(c));

  it("finds page 2's block through named entities, and the page carries its own faces", async () => {
    expect(html).toContain("Sch&ouml;n");
    const fit = await fitOnepager(composer, { ...onepager, html }, "unused", work);
    expect(fit.pages).toBe(2);
    expect(fit.fit.page2Start).toBeGreaterThan(2);
    expect(fit.html).not.toContain("tokens/fonts/");
    // brand's comments name internal decisions; the page leaves the engine without any.
    expect(fit.html).not.toMatch(/\/\*/);
    // Rendered from a folder holding no brand file: every face comes from the page itself.
    const file = join(work, "onepager.html");
    const pdf = join(work, "onepager.pdf");
    writeFileSync(file, fit.html);
    await renderPdf(file, pdf);
    expect(() => assertBrandFonts(pdf)).not.toThrow();
    // The control holds only while page 2 opens on the heading with the entity.
    const page2 = execFileSync("pdftotext", ["-f", "2", "-l", "2", pdf, "-"], { encoding: "utf8" });
    expect(page2.trimStart().toLowerCase()).toStartWith("schön zu wissen");
  }, 60_000);
});
