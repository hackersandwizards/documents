#!/usr/bin/env bun
// The specimen: one page per document type from the components with the fictitious samples,
// and an overview, written to specimen/. `--check` builds them afresh and fails on any committed
// page that differs, and on a component no page shows.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { composePage, escapeHtml, openComposer } from "./compose";
import * as s from "./samples";

const ROOT = resolve(import.meta.dir, "..");
const OUT = join(ROOT, "specimen");
const BRAND = "../node_modules/@hackersandwizards/brand";

// pages: the sheets the document prints on, so the overview's frame shows it whole.
const PAGES: { file: string; title: string; component: string; props: object; pages?: number }[] = [
  { file: "angebot", pages: 3, title: "Angebot", component: "DocProposal", props: s.proposalDe },
  {
    file: "quote",
    pages: 2,
    title: "Quote (English)",
    component: "DocProposal",
    props: s.proposalEn,
  },
  {
    file: "angebot-ohne-preise",
    pages: 3,
    title: "Angebot ohne Preise",
    component: "DocProposal",
    props: s.proposalDeNoPrice,
  },
  { file: "honorarsaetze", title: "Honorarsätze", component: "DocRateCard", props: s.rateCard },
  {
    file: "leistungsnachweis-monat",
    title: "Leistungsnachweis, ein Monat",
    component: "DocLeistungsnachweis",
    props: s.leistungsnachweisMonth,
  },
  {
    file: "leistungsnachweis-training",
    title: "Leistungsnachweis, ein Training in Abschnitten",
    component: "DocLeistungsnachweis",
    props: s.leistungsnachweisTraining,
  },
  {
    file: "leistungsnachweis-pauschal",
    title: "Leistungsnachweis, pauschal",
    component: "DocLeistungsnachweis",
    props: s.leistungsnachweisLumpSum,
  },
  {
    file: "certificate",
    title: "Certificate (English)",
    component: "DocCertificate",
    props: s.certificate,
  },
  {
    file: "zertifikat",
    title: "Zertifikat",
    component: "DocCertificate",
    props: { ...s.certificate, lang: "de", title: "Zertifikat Agentic Engineering Training" },
  },
  {
    file: "dokument",
    title: "Dokument aus Markdown",
    component: "DocMarkdown",
    props: {
      title: "Probelauf und Ergebnis",
      kind: "Interne Notiz",
      legal: true,
      html: s.proseHtml,
    },
  },
];

// The page links the brand's tokens and faces from the package instead of baking them in, so a
// brand release leaves the committed specimen current. On screen the sheet is A4 wide.
const base = readFileSync(join(ROOT, "document.css"), "utf8")
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .replace(/^@import [^;]+;\n/gm, "");
const specimenBase = (html: string) =>
  html.replace(
    "<style data-hw-document></style>",
    () =>
      `<link rel="icon" href="${BRAND}/logos/favicon.ico" sizes="32x32" />
<link rel="icon" href="${BRAND}/logos/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="${BRAND}/generated/tokens.root.css" />
<link rel="stylesheet" href="${BRAND}/tokens/print.css" />
<style data-hw-document>
${base}
@media screen {
  html { background: var(--color-bg); }
  body { box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto; }
}
</style>`,
  );

const index = (pages: typeof PAGES) => `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>hackers&amp;wizards Dokumente: Muster</title>
<link rel="icon" href="${BRAND}/logos/favicon.ico" sizes="32x32" />
<link rel="icon" href="${BRAND}/logos/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="${BRAND}/generated/tokens.root.css" />
<link rel="stylesheet" href="${BRAND}/tokens/print.css" />
<style>
body { margin: 0; font-family: var(--font-sans); color: var(--color-ink); background: var(--color-bg); }
.layout { display: grid; grid-template-columns: 16rem auto; gap: 2.5rem; max-width: calc(210mm + 21rem); margin: 0 auto; padding: 2rem; }
nav { position: sticky; top: 2rem; align-self: start; }
nav ul { list-style: none; padding: 0; margin: 0; }
nav li { margin: 0.4rem 0; }
a { color: var(--color-teal-dark); }
h1 { font-size: var(--type-h2-size); margin-top: 0; }
h2 { font-size: var(--type-h4-size); margin-top: 3rem; }
p { color: var(--color-muted); }
iframe { display: block; width: 210mm; border: 1px solid var(--color-border-strong); background: white; }
</style>
</head>
<body>
<div class="layout">
<nav aria-label="Dokumenttypen">
<ul>
${pages.map((p) => `<li><a href="#${p.file}">${escapeHtml(p.title)}</a></li>`).join("\n")}
</ul>
</nav>
<main>
<h1>hackers&amp;wizards Dokumente: Muster</h1>
<p>Jeder Dokumenttyp aus <code>@hackersandwizards/documents</code>, mit erfundenen Daten. Jeder Betrag ist ein Platzhalter. Das Gate baut diese Seiten neu und vergleicht sie.</p>
${pages.map((p) => `<h2 id="${p.file}">${escapeHtml(p.title)} <a href="${p.file}.html">einzeln öffnen</a></h2>\n<iframe src="${p.file}.html" title="${escapeHtml(p.title)}" style="height: ${(p.pages ?? 1) * 297}mm" loading="lazy"></iframe>`).join("\n")}
</main>
</div>
</body>
</html>
`;

/** Every component a page shows, its own imports followed. */
function shown(component: string, seen = new Set<string>()): Set<string> {
  if (seen.has(component)) return seen;
  seen.add(component);
  const source = readFileSync(join(ROOT, "components", `${component}.astro`), "utf8");
  for (const [, child] of source.matchAll(/from "\.\/(Doc\w+)\.astro"/g)) shown(child, seen);
  return seen;
}

/** The specimen's files by name, built afresh. */
export async function buildSpecimen(): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  for (const page of PAGES) {
    // One compiler per page: the collected styles are those of this page's components alone.
    const composer = await openComposer(ROOT);
    try {
      files.set(
        `${page.file}.html`,
        await composePage(
          composer,
          page.component,
          page.props as Record<string, unknown>,
          specimenBase,
        ),
      );
    } finally {
      await composer.close();
    }
  }
  files.set("index.html", index(PAGES));
  return files;
}

if (import.meta.main) {
  const covered = PAGES.reduce((all, p) => shown(p.component, all), new Set<string>());
  const missing = readdirSync(join(ROOT, "components"))
    .map((f) => f.replace(/\.astro$/, ""))
    .filter((c) => !covered.has(c));
  if (missing.length > 0) {
    console.error(
      `No specimen page shows ${missing.join(", ")}: add a page to scripts/specimen.ts.`,
    );
    process.exit(1);
  }
  const files = await buildSpecimen();
  if (process.argv.includes("--check")) {
    const committed = readdirSync(OUT).filter((f) => f.endsWith(".html"));
    const stale = [
      ...[...files]
        .filter(
          ([f, html]) => !committed.includes(f) || readFileSync(join(OUT, f), "utf8") !== html,
        )
        .map(([f]) => f),
      ...committed.filter((f) => !files.has(f)),
    ];
    if (stale.length > 0) {
      console.error(`specimen/ is stale (${stale.join(", ")}): run bun run specimen.`);
      process.exit(1);
    }
  } else {
    mkdirSync(OUT, { recursive: true });
    for (const [f, html] of files) writeFileSync(join(OUT, f), html);
    console.log(`${files.size} files in specimen/`);
  }
}
