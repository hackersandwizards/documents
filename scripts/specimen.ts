#!/usr/bin/env bun
// The specimen: one page per document type from the components with the fictitious samples,
// and an overview, written to specimen/. `--check` builds them afresh and fails on any committed
// page that differs, and on a component no page shows.
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { composePage, escapeHtml, openComposer } from "./compose";
import { composeOnepager } from "./onepager";
import { composeSurveyReadout } from "./survey-readout";
import * as s from "./samples";

const ROOT = resolve(import.meta.dir, "..");
const OUT = join(ROOT, "specimen");
const BRAND = "../node_modules/@hackersandwizards/brand";

// pages: the sheets the document prints on, so the overview's frame shows it whole. A page that is
// no A4 document names its frame's size in `frame` and builds itself in `build`.
const PAGES: {
  file: string;
  title: string;
  component?: string;
  props?: object;
  pages?: number;
  frame?: string;
  build?: () => string;
}[] = [
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
    file: "geheimhaltungsvereinbarung",
    pages: 2,
    title: "Vereinbarung: Geheimhaltung (Vertrag)",
    component: "DocAgreement",
    props: s.agreementNda,
  },
  {
    file: "auftragsbestaetigung",
    title: "Vereinbarung: Auftragsbestätigung (Brief)",
    component: "DocAgreement",
    props: s.agreementOrder,
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
    props: s.certificateDe,
  },
  {
    file: "onepager",
    pages: 2,
    title: "Onepager",
    component: "DocOnepager",
    props: s.onepager,
  },
  {
    file: "handout",
    pages: 4,
    title: "Training Handout (English)",
    component: "DocHandout",
    props: { ...s.handout, lang: "en" },
  },
  {
    file: "vorbereitung",
    title: "Vorbereitung",
    component: "DocPreparation",
    props: s.preparation,
  },
  {
    file: "survey-readout",
    title: "Survey Readout (English, slides)",
    frame: "width: 1280px; height: 5208px",
    build: () => composeSurveyReadout(s.surveyReadout, BRAND),
  },
  {
    file: "delivery-briefing",
    title: "Delivery Briefing",
    component: "DocMarkdown",
    props: {
      title: "Delivery Briefing: Musterwerk Training",
      kind: "Delivery Briefing",
      html: s.deliveryBriefingHtml,
    },
  },
  {
    file: "trainer-briefing",
    title: "Trainer Briefing (English, with meta)",
    component: "DocMarkdown",
    props: {
      title: "Trainer Briefing — Musterwerk AG",
      lang: "en",
      kind: "Trainer Briefing",
      meta: ["November 2, 2026"],
      html: s.trainerBriefingHtml,
    },
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
const local = (file: string) =>
  readFileSync(join(ROOT, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^@import [^;]+;\n/gm, "");
const base = local("tokens.css") + local("document.css");
const handoutRules = local("handout.css");
const specimenBase = (html: string, extra = "") =>
  html.replace(
    "<style data-hw-document></style>",
    () =>
      `<link rel="icon" href="${BRAND}/logos/favicon.ico" sizes="32x32" />
<link rel="icon" href="${BRAND}/logos/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="${BRAND}/generated/tokens.root.css" />
<link rel="stylesheet" href="${BRAND}/tokens/print.css" />
<link rel="stylesheet" href="${BRAND}/tokens/marker.css" />
<style data-hw-document>
${base}${extra}
@media screen {
  html { background: var(--color-bg); }
  body { box-sizing: border-box; width: 210mm; min-height: 297mm; margin: 0 auto; }
}
</style>`,
  );

/** A component's purpose: the first sentence of its leading comment. */
function purpose(component: string): string {
  const source = readFileSync(join(ROOT, "components", `${component}.astro`), "utf8");
  const comment = [...source.matchAll(/^\/\/ ?(.*)$/gm)].map((m) => m[1]).join(" ");
  return comment.split(/(?<=\.)\s/)[0] ?? "";
}

/** The catalogue: the layers, then every component with the types that compose it. */
function catalogue(pages: typeof PAGES): string {
  const types = [...new Set(pages.flatMap((p) => (p.component ? [p.component] : [])))];
  const components = readdirSync(join(ROOT, "components"))
    .map((f) => f.replace(/\.astro$/, ""))
    .filter((c) => !types.includes(c));
  const users = (c: string) =>
    types
      .filter((t) => shown(t).has(c))
      .map((t) => {
        const page = pages.find((p) => p.component === t)!;
        return `<a href="#${page.file}">${t}</a>`;
      })
      .join(", ");
  const row = (c: string, used: string) =>
    `<tr><td><code>${c}</code></td><td>${escapeHtml(purpose(c))}</td><td>${used}</td></tr>`;
  return `<h2 id="aufbau">Aufbau</h2>
<p>Drei Ebenen. <strong>Tokens</strong>: <code>tokens.css</code> gibt jedem Wert eine Rolle (Farbe, Schrift, Abstand, Seite) aus <code>@hackersandwizards/brand</code>. <strong>Basis</strong>: <code>document.css</code> setzt Seite, Laufkopf und die Elemente, die jeder Typ und jeder Markdown-Text nutzt (Überschriften, Tabellen, Label, Callout, Karten). <strong>Komponenten</strong> setzen sich nur aus Tokens und Basis zusammen, <strong>Typen</strong> nur aus Komponenten. Jeder Typ beginnt mit <code>DocHeader</code>; das Gate <code>documents-styles</code> lehnt jeden Stil außerhalb dieser Ebenen ab.</p>
<h3>Typen</h3>
<table><thead><tr><th>Typ</th><th>Zweck</th><th>Muster</th></tr></thead><tbody>
${types
  .map((t) =>
    row(
      t,
      pages
        .filter((p) => p.component === t)
        .map((p) => `<a href="#${p.file}">${escapeHtml(p.title)}</a>`)
        .join(", "),
    ),
  )
  .join("\n")}
<tr><td><code>composeSurveyReadout</code></td><td>Die Auswertung einer Teilnehmerumfrage als Folien (1280 × 720), auf denselben Tokens.</td><td><a href="#survey-readout">Survey Readout</a></td></tr>
</tbody></table>
<h3>Komponenten</h3>
<table><thead><tr><th>Komponente</th><th>Zweck</th><th>Genutzt von</th></tr></thead><tbody>
${components.map((c) => row(c, users(c))).join("\n")}
</tbody></table>`;
}

const index = (pages: typeof PAGES) => `<!doctype html>
<html lang="de">
<head>
<meta charset="utf-8" />
<title>hackers&amp;wizards Dokumente: Muster</title>
<link rel="icon" href="${BRAND}/logos/favicon.ico" sizes="32x32" />
<link rel="icon" href="${BRAND}/logos/favicon.svg" type="image/svg+xml" />
<link rel="stylesheet" href="${BRAND}/generated/tokens.root.css" />
<link rel="stylesheet" href="${BRAND}/tokens/print.css" />
<link rel="stylesheet" href="${BRAND}/expert/header.css" />
<style>
body { margin: 0; font-family: var(--font-sans); color: var(--color-ink); background: var(--color-bg); }
.layout { display: grid; grid-template-columns: 16rem auto; gap: 2.5rem; padding-block: 1.5rem 4rem; }
.layout > nav { position: sticky; top: calc(3.5rem + 4px + 1.5rem); align-self: start; }
nav ul { list-style: none; padding: 0; margin: 0; }
nav li { margin: 0.4rem 0; }
a { color: var(--color-teal-dark); }
h1 { font: 700 1.5rem/1.25 var(--font-mono); letter-spacing: -0.01em; margin-top: 0; }
h2 { scroll-margin-top: calc(3.5rem + 4px + 1rem); }
h2 { font-size: var(--type-h4-size); margin-top: 3rem; }
p { color: var(--color-muted); }
table { border-collapse: collapse; width: 100%; font-size: 0.875rem; }
th, td { text-align: left; vertical-align: top; padding: 0.4rem 0.6rem; border-bottom: 1px solid var(--color-border); }
iframe { display: block; width: 210mm; border: 1px solid var(--color-border-strong); background: white; }
/* A frame wider than the column (the readout's 1280px slides) zooms down to fit it, so the page never scrolls sideways. */
main { min-width: 0; container-type: inline-size; }
iframe.wide { zoom: min(1, calc(100cqw / 1282px)); }
</style>
</head>
<body>
<header class="hw-header">
<div class="hw-header-strip"></div>
<div class="hw-header-row hw-container">
<a class="hw-header-brand" href="#" aria-label="hackers&amp;wizards Dokumente"><img class="hw-header-logo" src="${BRAND}/logos/lockup-screen.svg" alt="" width="8042" height="1489" /><img class="hw-header-logo-night" src="${BRAND}/logos/lockup-screen-night.svg" alt="" width="8196" height="1641" /><span class="hw-header-product">Dokumente</span></a>
<nav class="hw-header-nav" aria-label="Kataloge">
<a class="hw-header-link" href="http://brand.localhost/">Brand</a>
<a class="hw-header-link" href="http://slides.localhost/">Slides</a>
<a class="hw-header-link" href="#" aria-current="page">Dokumente</a>
</nav>
</div>
</header>
<div class="layout hw-container">
<nav aria-label="Dokumenttypen">
<ul>
<li><a href="#aufbau">Aufbau</a></li>
${pages.map((p) => `<li><a href="#${p.file}">${escapeHtml(p.title)}</a></li>`).join("\n")}
</ul>
</nav>
<main>
<h1>hackers&amp;wizards Dokumente: Muster</h1>
<p>Jeder Dokumenttyp aus <code>@hackersandwizards/documents</code>, mit erfundenen Daten. Jeder Betrag ist ein Platzhalter. Das Gate baut diese Seiten neu und vergleicht sie.</p>
${catalogue(pages)}
${pages.map((p) => `<h2 id="${p.file}">${escapeHtml(p.title)} <a href="${p.file}.html">einzeln öffnen</a></h2>\n<iframe src="${p.file}.html"${p.frame ? ' class="wide"' : ""} title="${escapeHtml(p.title)}" style="${p.frame ?? `height: ${(p.pages ?? 1) * 297}mm`}" loading="lazy"></iframe>`).join("\n")}
</main>
</div>
<script>
// On GitHub Pages, links to the other two catalogues leave their local addresses for their public pages.
if (location.hostname.endsWith(".github.io")) for (const a of document.querySelectorAll("a[href]")) { const name = a.hostname.slice(0, -".localhost".length); if (a.hostname.endsWith(".localhost") && ["brand", "slides", "documents"].includes(name)) a.href = "https://hackersandwizards.github.io/" + name + a.pathname + a.hash; }
</script>
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
        page.build
          ? page.build()
          : page.component === "DocOnepager"
            ? await composeOnepager(composer, s.onepager, BRAND, true)
            : await composePage(
                composer,
                page.component!,
                page.props as Record<string, unknown>,
                // The handout prints on handout.css, the document base plus its own layout.
                page.component === "DocHandout"
                  ? (html) => specimenBase(html, handoutRules)
                  : specimenBase,
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
  const covered = PAGES.reduce(
    (all, p) => (p.component ? shown(p.component, all) : all),
    new Set<string>(),
  );
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
