import { expect, test } from "vitest";
import { fill, wordsFor } from "../scripts/fill";

test("an unset constructor placeholder does not print Object's constructor", () => {
  expect(fill("{constructor} / {constructor}", {})).toBe(" / ");
});

test("an inherited language key falls back to English", () => {
  expect(wordsFor("__proto__", { en: "en", de: "de" })).toBe("en");
});
