import { afterAll, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { scanSamples, scanText } from "../scripts/privacy";

// The privacy check's controls: each rule must hit a planted case, or its silence proves nothing.
const ROOT = resolve(import.meta.dir, "..");
const planted = mkdtempSync(join(tmpdir(), "hw-privacy-"));
afterAll(() => rmSync(planted, { recursive: true, force: true }));

test("the package is clean", () => {
  expect(scanText(ROOT)).toEqual([]);
  expect(scanSamples()).toEqual([]);
});

test("every text rule hits a planted case", () => {
  mkdirSync(join(planted, "scripts"));
  writeFileSync(
    join(planted, "scripts", "leak.ts"),
    // Split in this source, so the test file itself stays clean.
    [
      "4.200 " + "€",
      "jane" + "@acme-corp.de",
      "+49 40" + " 1234567",
      "DE89 3704" + " 0044 0532 0130 00",
      "Haupt" + "straße 5",
    ].join("\n"),
  );
  expect(scanText(planted).map((f) => f.line)).toEqual([1, 2, 3, 4, 5]);
});

test("a deny term hits as a whole word only", () => {
  const hits = scanText(ROOT, ["Musterwerk"]);
  expect(hits.length).toBeGreaterThan(0);
  // A prefix of a word is no hit.
  expect(scanText(ROOT, ["Muster" + "w"])).toEqual([]);
});

test("a person in the samples outside the invented names fails", () => {
  expect(scanSamples({ rateCard: { personName: "Anna Echt" } })).toEqual([
    "rateCard.personName: Anna Echt",
  ]);
});
