// The type pages (pages/types/<file>.astro or .html.ts) in the order the catalog lists them, with
// the A4 sheets each prints on, so its frame on the home shows it whole; a page that is no A4
// document names its frame's size in `frame`. `component` is the type a page shows, for the
// check that every component appears on some page (test/stories.test.ts).
export const TYPES: {
  file: string;
  title: string;
  component?: string;
  pages?: number;
  frame?: [number, number];
}[] = [
  { file: "angebot", title: "Angebot", component: "DocProposal", pages: 3 },
  { file: "quote", title: "Quote (English)", component: "DocProposal", pages: 2 },
  {
    file: "angebot-ohne-preise",
    title: "Angebot ohne Preise",
    component: "DocProposal",
    pages: 3,
  },
  { file: "honorarsaetze", title: "Honorarsätze", component: "DocRateCard" },
  {
    file: "leistungsnachweis-monat",
    title: "Leistungsnachweis, ein Monat",
    component: "DocLeistungsnachweis",
  },
  {
    file: "leistungsnachweis-training",
    title: "Leistungsnachweis, ein Training in Abschnitten",
    component: "DocLeistungsnachweis",
  },
  {
    file: "leistungsnachweis-pauschal",
    title: "Leistungsnachweis, pauschal",
    component: "DocLeistungsnachweis",
  },
  {
    file: "geheimhaltungsvereinbarung",
    title: "Vereinbarung: Geheimhaltung (Vertrag)",
    component: "DocAgreement",
    pages: 2,
  },
  {
    file: "auftragsbestaetigung",
    title: "Vereinbarung: Auftragsbestätigung (Brief)",
    component: "DocAgreement",
  },
  { file: "certificate", title: "Certificate (English)", component: "DocCertificate" },
  { file: "zertifikat", title: "Zertifikat", component: "DocCertificate" },
  { file: "onepager", title: "Onepager", component: "DocOnepager", pages: 2 },
  {
    file: "handout",
    title: "Training Handout (English)",
    component: "DocHandout",
    pages: 4,
  },
  { file: "vorbereitung", title: "Vorbereitung", component: "DocPreparation" },
  { file: "survey-readout", title: "Survey Readout (English, slides)", frame: [1280, 5208] },
  { file: "delivery-briefing", title: "Delivery Briefing", component: "DocMarkdown" },
  {
    file: "trainer-briefing",
    title: "Trainer Briefing (English, with meta)",
    component: "DocMarkdown",
  },
  { file: "dokument", title: "Dokument aus Markdown", component: "DocMarkdown" },
  { file: "elemente", title: "Elemente aus brand und Ausnahmen", pages: 2 },
];
