import { afterAll, beforeAll, describe, expect, test, beforeEach, afterEach, vi } from "vitest";
import {
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { scanSamples, scanText } from "../scripts/privacy";

vi.mock("node:fs", { spy: true });

beforeEach(() => {
  for (const key of Object.keys(process.env))
    if (key.startsWith("GIT_")) vi.stubEnv(key, undefined);
});
afterEach(() => vi.unstubAllEnvs());

test("propagates a denied stat when scanning for private data", () => {
  const denied = Object.assign(new Error("Cannot inspect folder"), { code: "EACCES" });
  vi.mocked(statSync).mockImplementationOnce(() => {
    throw denied;
  });
  expect(() => scanText(planted)).toThrow(denied);
});

// The privacy check's controls: each rule must hit a planted case, or its silence proves nothing.
const ROOT = resolve(import.meta.dirname, "..");
const planted = mkdtempSync(join(tmpdir(), "hw-privacy-"));
afterAll(() => rmSync(planted, { recursive: true, force: true }));

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

test.each([
  [
    "4.200 " + "€",
    "A numeric euro figure can expose private prices. Replace it in the source with a placeholder such as X.XXX €.",
  ],
  [
    "jane" + "@acme-corp.de",
    "A mail address outside the allowed domains can expose contact details. Replace it in the source with an address on example.com.",
  ],
  [
    "+49 40" + " 1234567",
    "A phone number can expose contact details. Remove it from the source or replace it with a nonnumeric placeholder.",
  ],
  [
    "DE89 3704" + " 0044 0532 0130 00",
    "An IBAN can expose bank details. Remove it from the source or replace it with a nonnumeric placeholder.",
  ],
  [
    "HW-AE-DEV-260318-" + "ABCDEF0123456789",
    "A credential ID without the EXAMPLE0EXAMPLE0 suffix can expose an issued credential. Replace the ID suffix in the source with EXAMPLE0EXAMPLE0.",
  ],
  [
    "Haupt" + "straße 5",
    "A street address outside the allowed set can expose a private address. Replace it in the source with an invented address from STREETS in scripts/privacy.ts.",
  ],
])("gives a repair for a planted text finding %#", (content, what) => {
  const dir = mkdtempSync(join(planted, "repair-"));
  writeFileSync(join(dir, "sample.md"), content);
  expect(scanText(dir)).toEqual([{ file: "sample.md", line: 1, what }]);
});

test("a deny term reports the file name and line zero", () => {
  const dir = mkdtempSync(join(planted, "deny-path-"));
  writeFileSync(join(dir, "echtfirma-logo.svg"), "<svg/>");
  expect(scanText(dir, ["Echtfirma"])).toEqual([
    {
      file: "echtfirma-logo.svg",
      line: 0,
      what: 'The term "Echtfirma" in the path is on the deny list. Rename the flagged file or directory in the source and regenerate it if it was built.',
    },
  ]);
});

describe("deny terms in document text", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(join(planted, "deny-text-"));
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
  });

  test.each([
    { term: "Echtfirma", lines: [1] },
    { term: "E&C", lines: [2] },
    { term: "Echte Firma", lines: [3, 4] },
    { term: "Müllerbau", lines: [6, 7, 11] },
    // A capital umlaut is spelled out in capitals.
    { term: "MÜLLERBAU", lines: [6, 11] },
    // Acronyms match in capitals in ordinary text and in either case beside a slug separator.
    { term: "ECHT", lines: [8, 10, 10] },
  ])("$term matches its allowed spellings on lines $lines", ({ term, lines }) => {
    expect(scanText(dir, [term]).map((finding) => finding.line)).toEqual(lines);
  });
});

test("a checkout's built type pages are scanned, though git ignores them", () => {
  const dir = mkdtempSync(join(tmpdir(), "hw-privacy-built-"));
  try {
    expect(Bun.spawnSync(["git", "init", "-q", dir]).exitCode).toBe(0);
    writeFileSync(join(dir, ".gitignore"), "dist/\n");
    mkdirSync(join(dir, "dist", "types", "x"), { recursive: true });
    writeFileSync(join(dir, "dist", "types", "x", "index.html"), "<p>Echtfirma</p>");
    expect(scanText(dir, ["Echtfirma"])).toEqual([
      {
        file: "dist/types/x/index.html",
        line: 1,
        what: 'The term "Echtfirma" is on the deny list. Remove or replace it in the flagged source and regenerate the page if it was built.',
      },
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
    {
      file: "notes\nmore.md",
      line: 2,
      what: 'The term "Echtfirma" is on the deny list. Remove or replace it in the flagged source and regenerate the page if it was built.',
    },
  ]);
});

test("an unreadable git index stops the scan", () => {
  const dir = mkdtempSync(join(planted, "index-"));
  expect(Bun.spawnSync(["git", "init", "-q", dir]).exitCode).toBe(0);
  writeFileSync(join(dir, ".git", "index"), "invalid index contents");
  const git = Bun.spawnSync(["git", "-C", dir, "ls-files"]);
  expect(() => scanText(dir)).toThrow(
    `git ls-files failed in ${dir}: ${git.stderr.toString().trimEnd()}\nThe privacy check cannot list files to scan. Run git status in that checkout and repair the reported Git error before retrying.`,
  );
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
    {
      file: "node_modules-guide/notes.md",
      line: 1,
      what: 'The term "Echtfirma" is on the deny list. Remove or replace it in the flagged source and regenerate the page if it was built.',
    },
  ]);
});

test("deny term findings follow document order and treat punctuation as literal", () => {
  const dir = mkdtempSync(join(planted, "terms-"));
  writeFileSync(join(dir, "notes.md"), "abc-guide\nABC-guide\nABC\nOne.Go\nOneXGo\nOneGo");
  expect(scanText(dir, ["ABC", "One.Go"]).map(({ line, what }) => [line, what])).toEqual([
    [
      1,
      'The term "ABC" is on the deny list. Remove or replace it in the flagged source and regenerate the page if it was built.',
    ],
    [
      2,
      'The term "ABC" is on the deny list. Remove or replace it in the flagged source and regenerate the page if it was built.',
    ],
    [
      3,
      'The term "ABC" is on the deny list. Remove or replace it in the flagged source and regenerate the page if it was built.',
    ],
    [
      4,
      'The term "One.Go" is on the deny list. Remove or replace it in the flagged source and regenerate the page if it was built.',
    ],
  ]);
});

test("an empty deny list fails rather than passes", () => {
  const empty = join(planted, "empty.txt");
  writeFileSync(empty, "\n");
  const run = Bun.spawnSync(["bun", join(ROOT, "scripts/privacy.ts"), "--deny", empty]);
  expect(run.exitCode).toBe(1);
  expect(run.stderr.toString()).toBe(
    `documents-privacy: ${empty} holds no deny terms, so the check cannot look for private names in paths or text. Put one term per line in ${empty} and rerun with --deny.\n`,
  );
});

test("the CLI points to the source field and invented words for a sample finding", () => {
  const preload = join(planted, "sample-preload.ts");
  writeFileSync(
    preload,
    `import { mock } from "bun:test";
mock.module(${JSON.stringify(join(ROOT, "scripts/samples.ts"))}, () => ({
  probe: { personName: "Zzx" },
}));`,
  );
  const run = Bun.spawnSync(["bun", "--preload", preload, join(ROOT, "scripts/privacy.ts")]);
  expect(run.exitCode).toBe(1);
  expect(run.stderr.toString().split("\n")).toContain(
    "scripts/samples.ts probe.personName: Zzx: Public samples must use invented names. Replace the flagged words in this field with invented words from INVENTED in scripts/privacy.ts.",
  );
});

test("the repository samples use invented names", () => {
  expect(scanSamples()).toEqual([]);
});

test.each([
  {
    scenario: "staff name",
    sample: { rateCard: { personName: "Anna Echt" } },
    findings: ["rateCard.personName: Anna Echt"],
  },
  {
    scenario: "customer name",
    sample: { surveyReadout: { customerName: "Echtfirma GmbH" } },
    findings: ["surveyReadout.customerName: Echtfirma"],
  },
  {
    scenario: "lower- and mixed-case client names",
    sample: { rateCard: { client: { company: "echtfirma", shortName: "eFirma" } } },
    findings: ["rateCard.client.company: echtfirma", "rateCard.client.shortName: eFirma"],
  },
  {
    scenario: "client short name",
    sample: { rateCard: { client: { shortName: "Echtfirma" } } },
    findings: ["rateCard.client.shortName: Echtfirma"],
  },
  {
    scenario: "agreement and certificate names",
    sample: {
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
    },
    findings: [
      "agreement.signatures[0].party: Echtfirma",
      "agreement.signatures[0].name: Anna Echt",
      "agreement.counterparty: Echtfirma",
      "agreement.salutation: Anna",
      "agreement.letter.recipient.lines[0]: Anna Echt",
      "agreement.letter.greeting[0]: Anna",
      "certificate.title: Anna Echt",
    ],
  },
])("reports names outside the invented list in $scenario", ({ sample, findings }) => {
  expect(scanSamples(sample)).toEqual(findings);
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
