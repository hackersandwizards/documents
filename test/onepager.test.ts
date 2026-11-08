import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { encodeNonAsciiHTML } from "entities";
import { openComposer } from "../scripts/compose";
import { composeOnepager, fitOnepager } from "../scripts/onepager";
import { chromeBinary } from "@hackersandwizards/scaffolding/chrome";
import { assertBrandFonts, inlineImages, renderPdf } from "../scripts/render-pdf";
import { ROOT } from "../scripts/root";
import { onepager } from "../scripts/samples";
import { probePage } from "./probe";

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
    // The faces the print never set are gone, the rest cut to what each set, and the page prints
    // the same text as the page composed with every face whole.
    const whole = join(work, "whole.html");
    writeFileSync(whole, await composeOnepager(composer, { ...onepager, html, fit: fit.fit }));
    const faces = (file: string) => readFileSync(file, "utf8").match(/data:font\/woff2/g)!.length;
    expect(faces(file)).toBeLessThan(faces(whole));
    await renderPdf(whole, join(work, "whole.pdf"));
    const text = (file: string) => execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
    expect(text(pdf)).toBe(text(join(work, "whole.pdf")));
  }, 60_000);
});

describe.skipIf(!chromeBinary())("the client row", () => {
  it("sets a mark at its --mark-scale share of the 17 px row", async () => {
    const mark = (style: string) =>
      `<li><img src="@hackersandwizards/brand/logos/wordmark.svg" alt="Musterwerk"${style}></li>`;
    const row = `<ul class="client-row">${mark(' style="--mark-scale: 0.5"')}${mark("")}</ul>`;
    const html = onepager.html.replace('<div class="references">', `$&${row}`);
    expect(html).toContain(row);
    const composed = await composeOnepager(composer, { ...onepager, html });
    const heights = probePage(
      inlineImages(composed, work),
      `return [...document.querySelectorAll(".client-row img")].map((img) => img.getBoundingClientRect().height).join();`,
    );
    expect(heights).toBe("8.5,17");
  }, 60_000);
});

describe("onepagerBrandFiles", () => {
  // The trace mocks node:fs, so it runs in its own process; a failed expect fails the command.
  it("lists exactly the brand files a traced render reads", () => {
    expect(() =>
      execFileSync("bun", ["test", "./test/onepager-trace.ts"], { cwd: ROOT, timeout: 55_000 }),
    ).not.toThrow();
  }, 60_000);
});
