import { execFileSync } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { openComposer } from "../scripts/compose";
import { composeOnepager, page2Block } from "../scripts/onepager";
import { ROOT } from "../scripts/root";
import { onepager } from "../scripts/samples";
import { fallbackFamilies, withLinkedBrand, limit } from "./probe";

let composer: Awaited<ReturnType<typeof openComposer>>;
beforeAll(async () => {
  composer = await openComposer(ROOT);
});
afterAll(() => composer?.close());

describe("composeOnepager, linked", () => {
  it("defines every fallback family its stacks name through the brand files it links", async () => {
    const page = withLinkedBrand(await composeOnepager(composer, onepager, (file) => file));
    const { named, defined } = fallbackFamilies(page);
    expect(named.length).toBeGreaterThan(0);
    expect(defined).toEqual(named);
  });
});

describe("onepagerBrandFiles", () => {
  // The trace mocks node:fs, so it runs in its own process; a failed expect fails the command.
  it(
    "lists exactly the brand files a traced render reads",
    () => {
      expect(() =>
        execFileSync(
          "bun",
          ["--bun", "vitest", "run", "--config", "test/onepager-trace.config.ts"],
          {
            cwd: ROOT,
            timeout: limit(55_000),
          },
        ),
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
