// The type pages (pages/types/<file>.astro or .html.ts) in the order the catalog lists them.
export const TYPES: { file: string; title: string }[] = [
  { file: "angebot", title: "Angebot" },
  { file: "quote", title: "Quote (English)" },
  {
    file: "angebot-ohne-preise",
    title: "Angebot ohne Preise",
  },
  { file: "honorarsaetze", title: "Honorarsätze" },
  {
    file: "leistungsnachweis-monat",
    title: "Leistungsnachweis, ein Monat",
  },
  {
    file: "leistungsnachweis-training",
    title: "Leistungsnachweis, ein Training in Abschnitten",
  },
  {
    file: "leistungsnachweis-pauschal",
    title: "Leistungsnachweis, pauschal",
  },
  {
    file: "geheimhaltungsvereinbarung",
    title: "Vereinbarung: Geheimhaltung (Vertrag)",
  },
  {
    file: "auftragsbestaetigung",
    title: "Vereinbarung: Auftragsbestätigung (Brief)",
  },
  { file: "certificate", title: "Certificate (English)" },
  { file: "zertifikat", title: "Zertifikat" },
  { file: "onepager", title: "Onepager" },
  {
    file: "handout",
    title: "Training Handout (English)",
  },
  { file: "vorbereitung", title: "Vorbereitung" },
  { file: "survey-readout", title: "Survey Readout (English, slides)" },
  { file: "delivery-briefing", title: "Delivery Briefing" },
  {
    file: "trainer-briefing",
    title: "Trainer Briefing (English, with meta)",
  },
  { file: "dokument", title: "Dokument aus Markdown" },
  { file: "elemente", title: "Elemente aus brand und Ausnahmen" },
];
