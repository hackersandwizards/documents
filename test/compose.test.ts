import { execFileSync, spawn, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "bun:test";
import {
  certificate,
  certificateDe,
  leistungsnachweisLumpSum,
  proposalDe,
  proposalDeNoPrice,
  proposalEn,
  rateCard,
} from "../scripts/samples";
import { openComposer } from "../scripts/compose";
import { ROOT } from "../scripts/root";
import { foreignStyles } from "../scripts/styles";

const SCRIPT = resolve(import.meta.dir, "../scripts/compose.ts");
const dir = mkdtempSync(join(tmpdir(), "pdf-compose-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("scripts/compose.ts", () => {
  it("renders a document component with the base and its components' scoped styles", () => {
    writeFileSync(join(dir, "props.json"), JSON.stringify(rateCard));
    const out = join(dir, "rate-card.html");
    execFileSync("bun", [SCRIPT, "DocRateCard", join(dir, "props.json"), out]);
    const html = readFileSync(out, "utf8");
    expect(html).toMatch(/<style data-hw-document>\n?\S/);
    // The container renders markup only: without the collected styles, the header has no rule.
    expect(html).toMatch(/\.doc-header\[data-astro-cid-\w+\]/);
    expect(html).toMatch(/<header class="doc-header" data-astro-cid-\w+/);
    expect(html).toContain(rateCard.client.company);
    expect(html).toContain('content: "Honorarsätze Mara Beispiel"');
  });

  it("prints --help to stdout with exit 0 and a usage error to stderr with exit 1", () => {
    const help = spawnSync("bun", [SCRIPT, "--help"], { encoding: "utf8" });
    expect(help.status).toBe(0);
    expect(help.stdout).toContain("Usage:");
    const wrong = spawnSync("bun", [SCRIPT, "DocRateCard"], { encoding: "utf8" });
    expect(wrong.status).toBe(1);
    expect(wrong.stdout).toBe("");
    expect(wrong.stderr).toContain("Usage:");
  });

  it("refuses a lang that is no language tag, so none reaches the html element", () => {
    for (const lang of ["de_DE", 'de"><b>x']) {
      writeFileSync(join(dir, "lang.json"), JSON.stringify({ ...rateCard, lang }));
      const run = spawnSync(
        "bun",
        [SCRIPT, "DocRateCard", join(dir, "lang.json"), join(dir, "x.html")],
        {
          encoding: "utf8",
        },
      );
      expect(run.status).not.toBe(0);
      expect(run.stderr).toContain(
        `lang must be a language tag such as de or en, not ${JSON.stringify(lang)}`,
      );
    }
  });

  it("composes the Leistungsnachweis, its total row and its lump-sum confirmation", () => {
    writeFileSync(join(dir, "ln.json"), JSON.stringify(leistungsnachweisLumpSum));
    const out = join(dir, "ln.html");
    execFileSync("bun", [SCRIPT, "DocLeistungsnachweis", join(dir, "ln.json"), out]);
    const html = readFileSync(out, "utf8");
    expect(html).toMatch(/<tr class="total" data-astro-cid-\w+/);
    expect(html).toContain("Aufwand (Std.)</th>");
    expect(html).toContain("Abgerechnet</th>");
    // A lump sum states no hours in the confirmation.
    expect(html).toContain("Die aufgeführten Leistungen im Zeitraum");
  });

  it("composes the price-free proposal without a figure column", () => {
    writeFileSync(join(dir, "q.json"), JSON.stringify(proposalDeNoPrice));
    const out = join(dir, "q.html");
    execFileSync("bun", [SCRIPT, "DocProposal", join(dir, "q.json"), out]);
    const html = readFileSync(out, "utf8");
    expect(html).toContain("<title>Angebot AG-10004-2026</title>");
    expect(html).toMatch(/Basis\s*<\/th>/);
    expect(html).not.toMatch(/Betrag\s*<\/th>/);
    expect(html).not.toContain("Summe netto");
  });

  it("composes the certificate's wording, verification footer and escaped roster text", () => {
    const compose = (props: object) => {
      writeFileSync(join(dir, "c.json"), JSON.stringify(props));
      execFileSync("bun", [SCRIPT, "DocCertificate", join(dir, "c.json"), join(dir, "c.html")]);
      return readFileSync(join(dir, "c.html"), "utf8");
    };
    const en = compose({
      ...certificate,
      attendeeName: "Łukasz Wiśniewski-Grzybowski",
      attendeeCompany: "Q<b>&</b>A",
    });
    expect(en).toContain("Certificate of Completion");
    expect(en).not.toContain("Certificate of Attendance");
    // A long name breaks only between its words.
    expect(en).toMatch(/<span[^>]*>Łukasz<\/span>\s+<span[^>]*>Wiśniewski-Grzybowski<\/span>/);
    expect(en).toContain("Q&lt;b&gt;&amp;&lt;/b&gt;A");
    expect(en).toContain(`src="${certificate.qrCodeUri}"`);
    expect(en).toContain("Scan to verify &amp; add to LinkedIn");
    expect(en).toContain("Add to LinkedIn profile");
    expect(en).toMatch(
      new RegExp(
        `<p class="footer-credential"[^>]*>Credential ID: ${certificate.credentialId}</p>`,
      ),
    );
    expect(en).toMatch(/<img src="data:image\/svg\+xml,%3Csvg [^"]+" alt="hackers&amp;wizards"/);
    const de = compose({ ...certificate, lang: "de" });
    expect(de).toContain("Abschlusszertifikat");
    expect(de).not.toContain("Teilnahmezertifikat");
    expect(de).toContain("Scannen: verifizieren &amp; zu LinkedIn hinzufügen");
    expect(de).toContain("Zertifikat verifizieren und zum LinkedIn-Profil hinzufügen");
    const deSample = compose(certificateDe);
    expect(deSample).toContain("Training (2 Tage)");
    expect(deSample).toContain("Spezifikation mit Agenten");
    expect(deSample).toContain("12.–13. November 2026");
    for (const english of ["Days", "Specification", "Rules files", "12–13 November"])
      expect(deSample).not.toContain(english);
  }, 20_000);

  it("composes a Markdown document: escaped kind, the imprint, no style of the body's", () => {
    writeFileSync(
      join(dir, "md.json"),
      JSON.stringify({
        kind: "A & B",
        legal: true,
        html: '<h1 style="color: red">T</h1><table><tr><td style="text-align: right;">1</td></tr></table><div class="page-break"></div>',
        css: ".x { color: red; }",
      }),
    );
    execFileSync("bun", [SCRIPT, "DocMarkdown", join(dir, "md.json"), join(dir, "md.html")]);
    const html = readFileSync(join(dir, "md.html"), "utf8");
    expect(html).toMatch(/<span class="doc-tag[^"]*"[^>]*>A &amp; B<\/span>/);
    expect(html).toContain("Sitz und Registergericht Hamburg, HRB 198840");
    expect(html).not.toContain(".x { color: red; }");
    expect(html).not.toContain("color: red");
    expect(html).toContain('<td class="num">1</td>');
    expect(html).toContain('<div class="page-break"></div>');
    expect(foreignStyles(html)).toEqual([]);
  });

  it("refuses a Markdown body carrying a style element", () => {
    writeFileSync(
      join(dir, "md-style.json"),
      JSON.stringify({ kind: "K", html: "<style>p{}</style><p>x</p>" }),
    );
    expect(() =>
      execFileSync(
        "bun",
        [SCRIPT, "DocMarkdown", join(dir, "md-style.json"), join(dir, "x.html")],
        {
          stdio: "pipe",
        },
      ),
    ).toThrow(/the engine draws every style/);
  });

  it("rejects a name that is not a document component", () => {
    // A props file that exists, so the run fails on the name alone.
    writeFileSync(join(dir, "name.json"), "{}");
    const run = spawnSync("bun", [SCRIPT, "Header", join(dir, "name.json"), join(dir, "y.html")], {
      encoding: "utf8",
    });
    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Usage");
  });

  it("--serve answers a line it cannot read and a foreign name, and keeps serving", async () => {
    const child = spawn("bun", [SCRIPT, "--serve"], { stdio: ["pipe", "ignore", "pipe", "pipe"] });
    const answers: string[] = [];
    child.stdio[3]!.on("data", (chunk: Buffer) =>
      answers.push(...chunk.toString().split("\n").filter(Boolean)),
    );
    child.stdin!.write("not json\n");
    child.stdin!.write(`${JSON.stringify({ id: 2, name: "Header", props: {} })}\n`);
    const until = Date.now() + 10_000;
    while (answers.length < 2 && child.exitCode === null && Date.now() < until)
      await new Promise((r) => setTimeout(r, 50));
    child.stdin!.end();
    const parsed = answers.map((a) => JSON.parse(a));
    expect(parsed[0].error).toContain("JSON");
    expect(parsed[1]).toMatchObject({
      id: 2,
      error: expect.stringContaining("Not a document component: Header"),
    });
  }, 20_000);
});

// openComposer's compressHTML, the catalog's: the line break after </a> stays a space.
it("keeps the space between an inline element and the text on the next line", async () => {
  const composer = await openComposer(ROOT);
  try {
    expect(await composer.render("../test/fixtures/InlineSpace", {})).toMatch(/<\/a>\s+text/);
  } finally {
    await composer.close();
  }
});

// The English quote sample spreads the German one: every block of German prose it shows needs its
// own English value, or the type page prints German line items under an English header.
it("the English quote sample overrides every German prose block", () => {
  for (const key of ["price", "scopeHeadline", "services", "outcome", "terms", "greeting"] as const)
    expect(proposalEn[key]).not.toEqual(proposalDe[key]);
});
