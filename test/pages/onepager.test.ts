import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { encodeNonAsciiHTML } from "entities";
import { rejection } from "@hackersandwizards/scaffolding/rejection";
import { openComposer } from "../../scripts/compose";
import { composeOnepager, fitOnepager } from "../../scripts/onepager";
import { chromeBinary } from "@hackersandwizards/scaffolding/chrome";
import { assertBrandFonts } from "../../scripts/assert-brand-fonts";
import { inlineImages } from "../../scripts/inline-images";
import { renderPdf } from "../../scripts/render-pdf";
import { ROOT } from "../../scripts/root";
import { onepager } from "../../scripts/samples";
import { fallbackFamilies, probePage, limit } from "../probe";

let composer: Awaited<ReturnType<typeof openComposer>>;
const work = mkdtempSync(join(tmpdir(), "hw-onepager-test-"));
beforeAll(async () => {
  composer = await openComposer(ROOT);
});
afterAll(async () => {
  await composer?.close();
  rmSync(work, { recursive: true, force: true });
});

describe("fitOnepager with named entities", () => {
  // A consumer's copy writes its umlauts as named entities. Page 2 opens on the heading made to
  // hold one, so the fit finds page 2's first block only where every named entity decodes.
  const html = onepager.html
    .replace("<h3>Gut zu wissen</h3>", "<h3>Schön zu wissen</h3>")
    .replace(/[\u0080-\u{10ffff}]/gu, (c) => encodeNonAsciiHTML(c));
  const file = join(work, "onepager.html");
  const pdf = join(work, "onepager.pdf");
  let fit: Awaited<ReturnType<typeof fitOnepager>>;

  beforeAll(async () => {
    fit = await fitOnepager(composer, { ...onepager, html }, work);
    writeFileSync(file, fit.html);
    await renderPdf(file, pdf);
  }, limit(60_000));

  it("finds the block and opens page 2 on the decoded heading", () => {
    expect(html).toContain("Sch&ouml;n");
    expect(fit.pages).toBe(2);
    expect(fit.fit.page2Start).toBeGreaterThan(2);
    const page2 = execFileSync("pdftotext", ["-f", "2", "-l", "2", pdf, "-"], {
      encoding: "utf8",
    });
    expect(page2.trimStart().toLowerCase().startsWith("schön zu wissen")).toBe(true);
  });

  it("prints outside the repository with its own brand and fallback faces", () => {
    expect(fit.html).not.toContain("tokens/fonts/");
    const { named, defined } = fallbackFamilies(fit.html);
    expect(named.length).toBeGreaterThan(0);
    expect(defined).toEqual(named);
    expect(() => assertBrandFonts(pdf)).not.toThrow();
  });

  it("strips CSS comments from the standalone page", () => {
    expect(fit.html).not.toMatch(/\/\*/);
  });

  it(
    "prints the same text with fewer faces than the composed page",
    async () => {
      const whole = join(work, "whole.html");
      writeFileSync(whole, await composeOnepager(composer, { ...onepager, html, fit: fit.fit }));
      const faces = (file: string) => readFileSync(file, "utf8").match(/data:font\/woff2/g)!.length;
      expect(faces(file)).toBeLessThan(faces(whole));
      const wholePdf = join(work, "whole.pdf");
      await renderPdf(whole, wholePdf);
      const text = (file: string) => execFileSync("pdftotext", [file, "-"], { encoding: "utf8" });
      expect(text(pdf)).toBe(text(wholePdf));
    },
    limit(60_000),
  );
});

describe("fitOnepager, page 2's first line", () => {
  let plain: Awaited<ReturnType<typeof fitOnepager>>;
  beforeAll(async () => {
    plain = await fitOnepager(composer, onepager, work);
  }, limit(120_000));

  it(
    "finds the opening block through capitals, ß and an inline tag",
    async () => {
      const html = onepager.html.replace(
        "<h3>Gut zu wissen</h3>",
        "<h3><em>Maßnahmen</em>: gut zu wissen</h3>",
      );
      expect(html).toContain("Maßnahmen");
      const fit = await fitOnepager(composer, { ...onepager, html }, work);
      expect(fit.pages).toBe(2);
      expect(fit.fit.page2Start).toBe(plain.fit.page2Start);
    },
    limit(120_000),
  );

  it(
    "identifies a short opening block even when its text occurs on page 1",
    async () => {
      const html = onepager.html.replace(
        '<div class="planning">',
        '<p class="path-note">Erster Hinweis</p>\n<p class="path-note">Zweiter Hinweis</p>\n<p class="path-note">Format</p>\n<div class="planning">',
      );
      const short = await fitOnepager(composer, { ...onepager, html }, work);
      expect(short.fit.page2Start).toBe(plain.fit.page2Start! + 2);
    },
    limit(120_000),
  );

  it(
    "leaves the opening block in place when a comment contains markup",
    async () => {
      const html = `<!-- <section><p>Entwurf</p></section> -->${onepager.html}`;
      const kept = await fitOnepager(composer, { ...onepager, html }, work);
      expect(kept.fit.page2Start).toBe(plain.fit.page2Start);
    },
    limit(120_000),
  );
});

it(
  "refuses markup with an unclosed block",
  async () => {
    const html = onepager.html.replace("</h3>", "</h3><ul><li>offen</ul>");
    expect(await rejection(fitOnepager(composer, { ...onepager, html }, work))).toMatch(
      /leaves an element open/,
    );
  },
  limit(120_000),
);

describe.skipIf(!chromeBinary())("the tight fit", () => {
  it(
    "tightens the key row and leaves the detail rows unpadded",
    async () => {
      const pads = await Promise.all(
        [{}, { tight: true }].map(async (fit) =>
          probePage(
            await composeOnepager(composer, { ...onepager, fit }),
            `const pad = (s) => { const d = document.querySelector(s); return getComputedStyle(d).paddingTop + " " + getComputedStyle(d).paddingBottom; };
           return pad(".facts dl.details > div") + " | " + pad(".facts dl.key-row > div");`,
          ),
        ),
      );
      const [loose, tight] = pads.map((p) => p.split(" | "));
      expect(tight![0]).toBe(loose![0]);
      expect(tight![1]).not.toBe(loose![1]);
    },
    limit(60_000),
  );
});

describe.skipIf(!chromeBinary())("the client row", () => {
  it(
    "sets a mark at its --mark-scale share of the 17 px row",
    async () => {
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
    },
    limit(60_000),
  );
});
