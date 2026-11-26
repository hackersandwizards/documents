import { brandCompany } from "./root";

const company = brandCompany();

/** A training proposal with a discounted line, the community and a dated sequence. */
export const proposalDe = {
  lang: "de" as const,
  title: "Angebot AG-10004-2026",
  number: "AG-10004-2026",
  date: "02.11.2026",
  validUntil: "30.11.2026",
  clientShort: "Musterwerk",
  eyebrow: "Training für ein Team",
  heading: "Agentic Engineering für Team Plattform",
  subtitle:
    "Euer Team liefert mit Agenten in Produktion, mit Tests und Review, die es selbst trägt.",
  salutation: "Hallo Jonas,",
  greeting: [
    "danke für das offene Gespräch. Ihr wollt, dass Team Plattform Agenten im Alltag nutzt, ohne an Qualität zu verlieren.",
  ],
  client: {
    company: "Musterwerk AG",
    lines: ["Jonas Probst", "Beispielweg 12", "20095 Hamburg"],
  },
  contact: "Mara Beispiel",
  price: {
    rows: [
      {
        item: "Training Agentic Engineering",
        detail: "Zwei Tage vor Ort, Übungen auf eurer Codebasis",
        basis: "12 Teilnehmende, 2 Tage",
        rate: "X.XXX,XX €",
        amount: "XX.XXX,XX €",
      },
      {
        item: "Mentoring nach dem Training",
        detail: "Vier Termine à zwei Stunden",
        basis: "8 Std., geschätzt",
        rate: { list: "XXX,XX €", offer: "XXX,XX €" },
        amount: { list: "X.XXX,XX €", offer: "X.XXX,XX €" },
      },
    ],
    subtotal: "XX.XXX,XX €",
    vat: "X.XXX,XX €",
    vatLabel: "zzgl. Umsatzsteuer 19 %",
    gross: "XX.XXX,XX €",
    calculation:
      "Das Training rechnet je teilnehmender Person, das Mentoring nach Aufwand. Reisekosten sind nicht enthalten.",
  },
  scopeHeadline: "Vom Training in den Alltag des Teams",
  services: [
    {
      name: "Training Agentic Engineering",
      format: "2 Tage vor Ort, 12 Teilnehmende",
      items: [
        "Spezifikation, Tests und Review mit Agenten",
        "Übungen auf der Codebasis des Teams",
        "Regeln für den Einsatz im Alltag",
      ],
    },
    {
      name: "Mentoring",
      format: "4 Termine remote",
      items: ["Review der ersten eigenen Agenten-Workflows", "Fragen aus dem Alltag"],
    },
  ],
  community: {
    price: "XXX",
    seats: "12",
    value: "X.XXX",
    meta: "Dauerhaft kostenlos für alle Teilnehmenden von Musterwerk",
  },
  sequence: {
    headline: "Zwei Tage Training, dann vier Wochen Begleitung",
    steps: [
      { when: "12.11.2026", name: "Training Tag 1", text: "Grundlagen und erste Übungen" },
      { when: "13.11.2026", name: "Training Tag 2", text: "Workflows auf eurer Codebasis" },
    ],
  },
  outcome: {
    result: "Das Team setzt Agenten in seinem Alltag ein und prüft ihre Ergebnisse selbst.",
    measures: "Durchlaufzeit bis Produktion und Änderungsfehlerrate gegen den Stand zu Beginn.",
  },
  terms: [
    {
      title: "Zahlung",
      paragraphs: [
        "Trainings und Festpreisleistungen: 25 % Anzahlung bei Annahme des Angebots, 75 % nach Durchführung.",
        "Alle Rechnungen: 15 Tage netto.",
      ],
    },
    {
      title: "Reisekosten",
      paragraphs: [
        "Reisekosten werden vom Auftraggeber getragen und bedürfen seiner vorherigen Freigabe.",
      ],
    },
    {
      title: "Weitere Hinweise",
      paragraphs: ["Termine werden in Abstimmung zwischen den Parteien vereinbart."],
    },
  ],
  signOff: "Viele Grüße",
  personName: "Mara Beispiel",
  orderTerm: "Das genügt als Beauftragung, eine Unterschrift brauchen wir nicht.",
};

export const proposalEn = {
  ...proposalDe,
  lang: "en" as const,
  title: "Quote AG-10004-2026",
  eyebrow: "Training for one team",
  heading: "Agentic Engineering for Team Platform",
  subtitle: "Your team ships with agents to production, with tests and review it carries itself.",
  salutation: "Dear Jonas,",
  greeting: ["thank you for the open conversation."],
  client: {
    company: "Musterwerk Ltd",
    lines: ["Jonas Probst", "Example Road 12", "SW1A 1AA London", "United Kingdom"],
  },
  price: {
    rows: [
      {
        item: "Agentic Engineering training",
        detail: "Two days on site, exercises on your codebase",
        basis: "12 participants, 2 days",
        rate: "X,XXX.XX €",
        amount: "XX,XXX.XX €",
      },
      {
        item: "Mentoring after the training",
        detail: "Four sessions of two hours each",
        basis: "8 h, estimated",
        rate: { list: "XXX.XX €", offer: "XXX.XX €" },
        amount: { list: "X,XXX.XX €", offer: "X,XXX.XX €" },
      },
    ],
    subtotal: "XX,XXX.XX €",
    vat: "X,XXX.XX €",
    vatLabel: "plus VAT 19%",
    gross: "XX,XXX.XX €",
    calculation:
      "The training is priced per participant, the mentoring as delivered. Travel is not included.",
  },
  scopeHeadline: "From the training into the team's everyday work",
  services: [
    {
      name: "Agentic Engineering training",
      format: "2 days on site, 12 participants",
      items: [
        "Specification, tests and review with agents",
        "Exercises on the team's codebase",
        "Rules for everyday use",
      ],
    },
    {
      name: "Mentoring",
      format: "4 remote sessions",
      items: ["Review of the team's first own agent workflows", "Questions from everyday work"],
    },
  ],
  community: { price: "XXX", meta: "Lifetime free access for all Musterwerk participants" },
  sequence: undefined,
  outcome: {
    result: "The team uses agents in its everyday work and checks their results itself.",
    measures: "Lead time to production and change failure rate against the starting point.",
  },
  terms: [{ title: "Payment", paragraphs: ["All invoices: 15 days net."] }],
  signOff: "Best regards",
  orderTerm: "That counts as the order; no signature needed.",
};

export const proposalDeNoPrice = {
  ...proposalDe,
  price: {
    heading: "Leistungen",
    rows: proposalDe.price.rows.map(({ item, detail, basis }) => ({ item, detail, basis })),
  },
  acceptance: { label: "Umfang", value: "Training und Mentoring wie oben" },
};

/** A proposal signed by hand: price tiers with struck list prices, signature lines in place of
 *  the acceptance block, and an outcome without measures. */
export const proposalDeSigned = {
  ...proposalDe,
  price: {
    ...proposalDe.price,
    tiers: {
      heading: "Staffelpreise",
      columns: ["Gruppen", "Rabatt", "Preis je Gruppe"],
      rows: [
        { item: "1 Gruppe", cells: ["0 %", "XX.XXX,XX €"] },
        { item: "3 Gruppen", cells: ["XX %", { list: "XX.XXX,XX €", offer: "XX.XXX,XX €" }] },
        { item: "5 Gruppen", cells: ["XX %", { list: "XX.XXX,XX €", offer: "XX.XXX,XX €" }] },
      ],
      note: "Die Stufe richtet sich nach der Zahl der beauftragten Gruppen.",
    },
  },
  outcome: { result: proposalDe.outcome.result },
  orderTerm: undefined,
  signatures: [
    { label: "Auftraggeber", party: "Musterwerk AG", name: "Jonas Probst" },
    { label: "Auftragnehmer", party: company.legal, name: "Mara Beispiel" },
  ],
};
