// The type pages (pages/types/<file>.astro or <file>/index.html.ts) in the order the catalog lists them.
export const TYPES: { file: string; title: string }[] = [
  { file: "angebot", title: "Quote (German)" },
  { file: "quote", title: "Quote (English)" },
  {
    file: "angebot-ohne-preise",
    title: "Quote without prices (German)",
  },
  { file: "angebot-unterschrift", title: "Quote signed by hand, with price tiers (German)" },
  { file: "honorarsaetze", title: "Rate card (German)" },
  {
    file: "leistungsnachweis-monat",
    title: "Timesheet, one month (German)",
  },
  {
    file: "leistungsnachweis-training",
    title: "Timesheet, one training in parts (German)",
  },
  {
    file: "leistungsnachweis-pauschal",
    title: "Timesheet, flat fee (German)",
  },
  {
    file: "geheimhaltungsvereinbarung",
    title: "Agreement: NDA as a contract (German)",
  },
  {
    file: "auftragsbestaetigung",
    title: "Agreement: order confirmation as a letter (German)",
  },
  { file: "certificate", title: "Certificate (English)" },
  { file: "zertifikat", title: "Certificate (German)" },
  { file: "onepager", title: "Onepager (German)" },
  {
    file: "handout",
    title: "Training handout (English)",
  },
  { file: "vorbereitung", title: "Preparation (German)" },
  { file: "survey-readout", title: "Survey readout (English, slides)" },
  { file: "delivery-briefing", title: "Delivery briefing (German)" },
  {
    file: "trainer-briefing",
    title: "Trainer briefing (English, with meta lines)",
  },
  { file: "dokument", title: "Document from Markdown (German)" },
  { file: "elements", title: "Brand elements and exceptions" },
];
