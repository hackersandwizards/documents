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
      "1.800,-" + " €",
      "2.345" + " Euro",
      "EUR" + " 1.800",
      "040" + " 1234567",
      "1.400,–" + " €",
      "12 k" + "€",
      "040 123" + " 456 78",
      "040 / " + "1234567",
      "+49 (0)40" + " 1234567",
      "040 / 123" + " 456 78",
      "(040)" + " 1234567",
      "Lange Straße" + " 12",
      "Muster" + "stieg 7",
      "Grauer Wall" + " 10",
      "Ühlen" + "weg 3",
      "4.200&nbsp;" + "€",
      "4.200 &" + "euro;",
      "1,2 Mio." + " €",
      "4,200" + " euros",
      "Euro" + " 4.200",
      "de89 3704" + " 0044 0532 0130 00",
      "Mail an jane" + "@acme-corp.de: sie antwortet",
    ].join("\n"),
  );
  const lines = Array.from({ length: 27 }, (_, i) => i + 1);
  expect(scanText(planted).map((f) => f.line)).toEqual(lines);
  // An SSH remote is no mailbox.
  writeFileSync(join(planted, "scripts", "leak.ts"), 'insteadOf="git' + '@github.com:"');
  expect(scanText(planted)).toEqual([]);
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
  expect(scanSamples({ surveyReadout: { customerName: "Echtfirma GmbH" } })).toEqual([
    "surveyReadout.customerName: Echtfirma",
  ]);
  expect(scanSamples({ rateCard: { client: { shortName: "Echtfirma" } } })).toEqual([
    "rateCard.client.shortName: Echtfirma",
  ]);
  expect(
    scanSamples({
      agreement: {
        signatures: [{ party: "Echtfirma GmbH", name: "Anna Echt" }],
        counterparty: "Echtfirma",
        salutation: "Hallo Anna,",
        letter: { recipient: { lines: ["Anna Echt", "Beispielweg 12"] } },
      },
      certificate: { title: "Certificate Agentic Engineering Training: Anna Echt" },
    }),
  ).toEqual([
    "agreement.signatures[0].party: Echtfirma",
    "agreement.signatures[0].name: Anna Echt",
    "agreement.counterparty: Echtfirma",
    "agreement.salutation: Anna",
    "agreement.letter.recipient.lines[0]: Anna Echt",
    "certificate.title: Anna Echt",
  ]);
});
