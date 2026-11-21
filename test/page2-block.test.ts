import { describe, expect, it } from "vitest";
import { page2Block } from "../scripts/page2-block";

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
});
