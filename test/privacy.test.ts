import { afterAll, expect, test } from "vitest";
import { mkdirSync, mkdtempSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { scanSamples, scanText } from "../scripts/privacy";

// The privacy check's controls: each rule must hit a planted case, or its silence proves nothing.
const ROOT = resolve(import.meta.dirname, "..");
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
      "+33 1 23" + " 45 67 89",
      "+1 415 555" + " 0100",
      "4.200&#83" + "64;",
      "info@mül" + "ler.de",
      "HW-AE-DEV-260318-" + "ABCDEF0123456789",
    ].join("\n"),
  );
  const lines = Array.from({ length: 32 }, (_, i) => i + 1);
  expect(scanText(planted).map((f) => f.line)).toEqual(lines);
  // An SSH remote is no mailbox.
  writeFileSync(
    join(planted, "scripts", "leak.ts"),
    ['insteadOf="git' + '@github.com:"', "`VALUE=git" + "@github.com:`"].join("\n"),
  );
  expect(scanText(planted)).toEqual([]);
});

test("a deny term hits as a whole word only", () => {
  const hits = scanText(ROOT, ["Musterwerk"]);
  expect(hits.length).toBeGreaterThan(0);
  expect(scanText(ROOT, ["Muster" + "w"])).toEqual([]);
});

test("a deny term hits a file name, any case, an entity, a slug and a line break", () => {
  const dir = mkdtempSync(join(tmpdir(), "hw-privacy-deny-"));
  try {
    writeFileSync(join(dir, "echtfirma-logo.svg"), "<svg/>");
    expect(scanText(dir, ["Echtfirma"])).toEqual([
      { file: "echtfirma-logo.svg", line: 0, what: 'the term "Echtfirma" in the path' },
    ]);
    rmSync(join(dir, "echtfirma-logo.svg"));
    writeFileSync(
      join(dir, "a.md"),
      [
        "ECHTFIRMA",
        "E&amp;C Partner",
        "echte-firma-2026",
        "die Echte",
        "Firma",
        "MÜLLERBAU",
        "muellerbau",
        "ECHT, nicht echt",
        "Echt",
        "echt-2026 echt_logo 2026",
        "MUELLERBAU",
      ].join("\n"),
    );
    const lines = (terms: string[]) => scanText(dir, terms).map((f) => f.line);
    expect(lines(["Echtfirma"])).toEqual([1]);
    expect(lines(["E&C"])).toEqual([2]);
    expect(lines(["Echte Firma"])).toEqual([3, 4]);
    expect(lines(["Müllerbau"])).toEqual([6, 7, 11]);
    // An umlaut in capitals is spelled out in capitals.
    expect(lines(["MÜLLERBAU"])).toEqual([6, 11]);
    // An all-capitals term is an acronym: in text in capitals, in any case only in a slug.
    expect(lines(["ECHT"])).toEqual([8, 10, 10]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a checkout's built type pages are scanned, though git ignores them", () => {
  const dir = mkdtempSync(join(tmpdir(), "hw-privacy-built-"));
  try {
    expect(Bun.spawnSync(["git", "init", "-q", dir]).exitCode).toBe(0);
    writeFileSync(join(dir, ".gitignore"), "dist/\n");
    mkdirSync(join(dir, "dist", "types", "x"), { recursive: true });
    writeFileSync(join(dir, "dist", "types", "x", "index.html"), "<p>Echtfirma</p>");
    expect(scanText(dir, ["Echtfirma"])).toEqual([
      { file: "dist/types/x/index.html", line: 1, what: 'the term "Echtfirma"' },
    ]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("a checkout scans untracked text and skips deleted paths, directory symlinks and ignored files", () => {
  const dir = mkdtempSync(join(planted, "checkout-"));
  expect(Bun.spawnSync(["git", "init", "-q", dir]).exitCode).toBe(0);
  writeFileSync(join(dir, ".gitignore"), "ignored/\n");
  mkdirSync(join(dir, "ignored"));
  writeFileSync(join(dir, "ignored", "text.md"), "Echtfirma");
  writeFileSync(join(dir, "deleted.md"), "Echtfirma");
  expect(Bun.spawnSync(["git", "-C", dir, "add", "deleted.md"]).exitCode).toBe(0);
  renameSync(join(dir, "deleted.md"), join(dir, "ignored", "deleted.md"));
  symlinkSync("ignored", join(dir, "link"));
  writeFileSync(join(dir, "notes\nmore.md"), "Example title\nEchtfirma");

  expect(scanText(dir, ["Echtfirma"])).toEqual([
    { file: "notes\nmore.md", line: 2, what: 'the term "Echtfirma"' },
  ]);
});

test("an unreadable git index stops the scan", () => {
  const dir = mkdtempSync(join(planted, "index-"));
  expect(Bun.spawnSync(["git", "init", "-q", dir]).exitCode).toBe(0);
  writeFileSync(join(dir, ".git", "index"), "invalid index contents");
  expect(() => scanText(dir)).toThrow(/git ls-files failed/);
});

test("an installed package scans ordinary folders and text while ignoring binary assets and caches", () => {
  const dir = mkdtempSync(join(planted, "installed-"));
  for (const folder of ["node_modules", ".astro", "node_modules-guide"]) {
    mkdirSync(join(dir, folder));
    writeFileSync(join(dir, folder, "notes.md"), "Echtfirma");
  }
  writeFileSync(join(dir, "logo.woff2"), Buffer.from("Echtfirma\0"));
  writeFileSync(
    join(dir, "inline.html"),
    `<img src="data:image/png;base64,AB12${"3456".repeat(4)}">`,
  );

  expect(scanText(dir, ["Echtfirma"])).toEqual([
    { file: "node_modules-guide/notes.md", line: 1, what: 'the term "Echtfirma"' },
  ]);
});

test("deny term findings follow document order and treat punctuation as literal", () => {
  const dir = mkdtempSync(join(planted, "terms-"));
  writeFileSync(join(dir, "notes.md"), "abc-guide\nABC-guide\nABC\nOne.Go\nOneXGo\nOneGo");
  expect(scanText(dir, ["ABC", "One.Go"]).map(({ line, what }) => [line, what])).toEqual([
    [1, 'the term "ABC"'],
    [2, 'the term "ABC"'],
    [3, 'the term "ABC"'],
    [4, 'the term "One.Go"'],
  ]);
});

test("an empty deny list fails rather than passes", () => {
  const empty = join(planted, "empty.txt");
  writeFileSync(empty, "\n");
  const run = Bun.spawnSync(["bun", join(ROOT, "scripts/privacy.ts"), "--deny", empty]);
  expect(run.exitCode).toBe(1);
  expect(run.stderr.toString()).toContain("holds no deny terms");
});

test("a person in the samples outside the invented names fails", () => {
  expect(scanSamples({ rateCard: { personName: "Anna Echt" } })).toEqual([
    "rateCard.personName: Anna Echt",
  ]);
  expect(scanSamples({ surveyReadout: { customerName: "Echtfirma GmbH" } })).toEqual([
    "surveyReadout.customerName: Echtfirma",
  ]);
  // A name in lower or mixed case is a name too.
  expect(
    scanSamples({ rateCard: { client: { company: "echtfirma", shortName: "eFirma" } } }),
  ).toEqual(["rateCard.client.company: echtfirma", "rateCard.client.shortName: eFirma"]);
  expect(scanSamples({ rateCard: { client: { shortName: "Echtfirma" } } })).toEqual([
    "rateCard.client.shortName: Echtfirma",
  ]);
  expect(
    scanSamples({
      agreement: {
        signatures: [{ party: "Echtfirma GmbH", name: "Anna Echt" }],
        counterparty: "Echtfirma",
        salutation: "Hallo Anna,",
        letter: {
          recipient: { lines: ["Anna Echt", "Beispielweg 12"] },
          greeting: ["Hallo Anna,", "danke für deine Zusage."],
        },
      },
      certificate: { title: "Certificate Agentic Engineering Training: Anna Echt" },
    }),
  ).toEqual([
    "agreement.signatures[0].party: Echtfirma",
    "agreement.signatures[0].name: Anna Echt",
    "agreement.counterparty: Echtfirma",
    "agreement.salutation: Anna",
    "agreement.letter.recipient.lines[0]: Anna Echt",
    "agreement.letter.greeting[0]: Anna",
    "certificate.title: Anna Echt",
  ]);
});

test("only the name-bearing entries in a letter and certificate are scanned as names", () => {
  expect(
    scanSamples({
      invitation: {
        client: { lines: ["Mara Beispiel", "Main Office"] },
        letter: { greeting: ["Hallo Mara,", "Danke für die Anmeldung"] },
      },
      certificateTraining: { title: "Introductory Course: Mara  (Beispiel)" },
      draft: { certificate: { title: "Free-text title" } },
      other: { personName: "Mara\t\tBeispiel", attendeeName: null },
    }),
  ).toEqual([]);
  expect(scanSamples({ certificateTraining: { title: "Introductory Course: Echtfirma" } })).toEqual(
    ["certificateTraining.title: Echtfirma"],
  );
});
