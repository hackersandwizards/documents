import { execFileSync, spawnSync } from "node:child_process";
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
    // The base is baked, not left as the empty marker.
    expect(html).toMatch(/<style data-hw-document>\n\S/);
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

  it("escapes the lang prop into the html element", () => {
    writeFileSync(join(dir, "lang.json"), JSON.stringify({ ...rateCard, lang: 'de"><b>x' }));
    const out = join(dir, "lang.html");
    execFileSync("bun", [SCRIPT, "DocRateCard", join(dir, "lang.json"), out]);
    expect(readFileSync(out, "utf8")).toContain(
      '<html lang="de&quot;&gt;&lt;b&gt;x" data-hw-scale="print">',
    );
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
    expect(html).toContain("Basis</th>");
    expect(html).not.toContain("Betrag</th>");
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
    expect(en).toMatch(/<span[^>]*>Łukasz<\/span> <span[^>]*>Wiśniewski-Grzybowski<\/span>/);
    expect(en).toContain("Q&lt;b&gt;&amp;&lt;/b&gt;A");
    expect(en).toContain(`src="${certificate.qrCodeUri}"`);
    expect(en).toContain("Scan to verify &amp; add to LinkedIn");
    expect(en).toContain("Add to LinkedIn profile");
    expect(en).toMatch(
      new RegExp(
        `<p class="footer-credential"[^>]*>Credential ID: ${certificate.credentialId}</p>`,
      ),
    );
    expect(en).toMatch(/<img src="data:image\/svg\+xml;base64,[^"]+" alt="hackers&wizards"/);
    const de = compose({ ...certificate, lang: "de" });
    expect(de).toContain("Abschlusszertifikat");
    expect(de).not.toContain("Teilnahmezertifikat");
    expect(de).toContain("Scannen: verifizieren &amp; zu LinkedIn hinzufügen");
    expect(de).toContain("Zertifikat verifizieren und zum LinkedIn-Profil hinzufügen");
    // The German sample carries German data, not the English sample's title, topics and date.
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
    // The former css door is gone, a body's style attribute too; pandoc's alignment is a class.
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
    expect(() =>
      execFileSync("bun", [SCRIPT, "Header", "x.json", "y.html"], { stdio: "pipe" }),
    ).toThrow();
  });
});

// The English quote sample spreads the German one: every block of German prose it shows needs its
// own English value, or the specimen prints German line items under an English header.
it("the English quote sample overrides every German prose block", () => {
  for (const key of ["price", "scopeHeadline", "services", "outcome", "terms", "greeting"] as const)
    expect(proposalEn[key]).not.toEqual(proposalDe[key]);
});
