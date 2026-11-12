import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { encodeNonAsciiHTML } from "entities";
import { rejection } from "@hackersandwizards/scaffolding/rejection";
import { openComposer } from "../scripts/compose";
import { composeOnepager, fitOnepager, page2Block } from "../scripts/onepager";
import { chromeBinary } from "@hackersandwizards/scaffolding/chrome";
import { assertBrandFonts, inlineImages, renderPdf } from "../scripts/render-pdf";
import { ROOT } from "../scripts/root";
import { onepager } from "../scripts/samples";
import { fallbackFamilies, probePage, withLinkedBrand, limit } from "./probe";

let composer: Awaited<ReturnType<typeof openComposer>>;
const work = mkdtempSync(join(tmpdir(), "hw-onepager-test-"));
beforeAll(async () => {
  composer = await openComposer(ROOT);
});
afterAll(async () => {
  await composer?.close();
  rmSync(work, { recursive: true, force: true });
});

describe("composeOnepager, linked", () => {
  it("defines every fallback family its stacks name through the brand files it links", async () => {
    const page = withLinkedBrand(await composeOnepager(composer, onepager, (file) => file));
    const { named, defined } = fallbackFamilies(page);
    expect(named.length).toBeGreaterThan(0);
    expect(defined).toEqual(named);
  });
});

describe("fitOnepager", () => {
  // A consumer's copy writes its umlauts as named entities. Page 2 opens on the heading made to
  // hold one, so the fit finds page 2's first block only where every named entity decodes.
  const html = onepager.html
    .replace("<h3>Gut zu wissen</h3>", "<h3>Schön zu wissen</h3>")
    .replace(/[\u0080-\u{10ffff}]/gu, (c) => encodeNonAsciiHTML(c));

  it(
    "finds page 2's block through named entities, and the page carries its own faces",
    async () => {
      expect(html).toContain("Sch&ouml;n");
      const fit = await fitOnepager(composer, { ...onepager, html }, "unused", work);
      expect(fit.pages).toBe(2);
      expect(fit.fit.page2Start).toBeGreaterThan(2);
      expect(fit.html).not.toContain("tokens/fonts/");
      // Cutting the faces to the print keeps the fallback faces, which carry no data.
      const { named, defined } = fallbackFamilies(fit.html);
      expect(named.length).toBeGreaterThan(0);
      expect(defined).toEqual(named);
      // brand's comments name internal decisions; the page leaves the engine without any.
      expect(fit.html).not.toMatch(/\/\*/);
      // Rendered from a folder holding no brand file: every face comes from the page itself.
      const file = join(work, "onepager.html");
      const pdf = join(work, "onepager.pdf");
      writeFileSync(file, fit.html);
      await renderPdf(file, pdf);
      expect(() => assertBrandFonts(pdf)).not.toThrow();
      // The control holds only while page 2 opens on the heading with the entity.
      const page2 = execFileSync("pdftotext", ["-f", "2", "-l", "2", pdf, "-"], {
        encoding: "utf8",
      });
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
    },
    limit(60_000),
  );
});

describe("fitOnepager, page 2's first line", () => {
  // The PDF prints a label in capitals, ß as SS, and an inline tag before punctuation without the
  // space a tag-stripped block holds: the block is still found.
  it(
    "finds the block through capitals, ß and an inline tag",
    async () => {
      const html = onepager.html.replace(
        "<h3>Gut zu wissen</h3>",
        "<h3><em>Maßnahmen</em>: gut zu wissen</h3>",
      );
      expect(html).toContain("Maßnahmen");
      const fit = await fitOnepager(composer, { ...onepager, html }, "unused", work);
      const plain = await fitOnepager(composer, onepager, "unused", work);
      expect(fit.pages).toBe(2);
      expect(fit.fit.page2Start).toBe(plain.fit.page2Start);
      // Page 2 opens on a short block whose word page 1 prints too, in its facts card: the fit
      // balances on that block, not on the card.
      const notes = onepager.html.replace(
        '<div class="planning">',
        '<p class="path-note">Erster Hinweis</p>\n<p class="path-note">Zweiter Hinweis</p>\n<p class="path-note">Format</p>\n<div class="planning">',
      );
      const short = await fitOnepager(composer, { ...onepager, html: notes }, "unused", work);
      // The notes stand before the block that opens page 2 in the sample; the third is two blocks on.
      expect(short.fit.page2Start).toBe(plain.fit.page2Start! + 2);
      // A commented-out block is no block of the page.
      const commented = `<!-- <section><p>Entwurf</p></section> -->${onepager.html}`;
      const kept = await fitOnepager(composer, { ...onepager, html: commented }, "unused", work);
      expect(kept.fit.page2Start).toBe(plain.fit.page2Start);
      // An element left open would shift the count: refused, not balanced on the wrong block.
      const open = onepager.html.replace("</h3>", "</h3><ul><li>offen</ul>");
      expect(
        await rejection(fitOnepager(composer, { ...onepager, html: open }, "unused", work)),
      ).toMatch(/leaves an element open/);
    },
    limit(120_000),
  );
});

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

describe("onepagerBrandFiles", () => {
  // The trace mocks node:fs, so it runs in its own process; a failed expect fails the command.
  it(
    "lists exactly the brand files a traced render reads",
    () => {
      expect(() =>
        execFileSync("bun", ["test", "./test/onepager-trace.ts"], {
          cwd: ROOT,
          timeout: limit(55_000),
        }),
      ).not.toThrow();
    },
    limit(60_000),
  );
});

// The block choice on the pages' text alone, each case one the PDF text can mislead it into.
describe("page2Block", () => {
  const card = "faktenformatzweitageremotegruppezwölfpersonen";
  const intro = "einleitungmitgenugbuchstabenfuerseite";
  const page1 = `Einleitung mit genug Buchstaben für Seite\nFakten Format zwei Tage remote\nGruppe zwölf Personen`;
  const page2 = "Format\nund Ablauf";
  it("skips a short block on page 1 holding page 2's first line", () => {
    expect(page2Block([intro, "format", card, "formatundablauf"], page1, page2)).toBe(3);
  });
  it("takes a short opener whose word page 1 prints, past a later short block that page 1 prints too", () => {
    expect(page2Block([intro, card, "format", "lang", "zwei"], page1, "Format\nlang\nzwei")).toBe(
      2,
    );
  });
  it("skips the long block page 1 ends on, though it holds the line", () => {
    expect(page2Block([intro, card, "formatundablauf"], page1, page2)).toBe(2);
  });
  it("takes the opener before a long block both pages print", () => {
    const repeated = `${page2}\nEinleitung mit genug Buchstaben für Seite`;
    expect(page2Block([intro, card, "formatundablauf", intro], page1, repeated)).toBe(2);
  });
  it("finds none on a page 2 without a line", () => {
    expect(page2Block([intro, card], page1, "")).toBe(-1);
  });
});
