// The specimen's sample data, fictitious throughout: no real client, person, rate or price. Every
// figure in euros is a placeholder.
export const rateCard = {
  personName: "Mara Beispiel",
  date: "02.11.2026",
  validUntil: "31.12.2026",
  year: "2026",
  opener: "Hallo",
  recipientFirstName: "Jonas",
  greeting:
    "wie besprochen findest du hier meine persönlichen Honorarsätze für die Zusammenarbeit im kommenden Quartal.",
  client: {
    company: "Musterwerk AG",
    shortName: "Musterwerk",
    recipientName: "Jonas Probst",
    street: "Beispielweg 12",
    zip: "20095",
    city: "Hamburg",
  },
  rates: [
    { item: "Tagessatz", detail: "1 Personentag (PT) = 8 Stunden", unit: "PT", rate: "X.XXX €" },
    {
      item: "Stundensatz",
      detail: "Abrechnung im 15-Minuten-Takt (0,25 Std.)",
      unit: "Stunde",
      rate: "XXX €",
    },
  ],
  terms: [
    "Vertragspartner ist die hackers&wizards GmbH.",
    "Alle Preise verstehen sich zzgl. der gesetzlichen Umsatzsteuer (derzeit 19\u00a0%).",
    "Reisekosten werden vom Auftraggeber getragen und müssen vorab von ihm freigegeben werden.",
    "Die Abrechnung erfolgt im 15-Minuten-Takt. Für angefangene 15 Minuten wird jeweils ein Viertel des Stundensatzes berechnet.",
    "Zahlungsbedingungen: Innerhalb von 15 Tagen netto. Die Abrechnung erfolgt monatlich.",
  ],
  scope: [
    "Coaching von Teams in agentischer Softwareentwicklung",
    "Architektur-Reviews und Pairing an realem Code",
    "Workshops zu Spezifikation, Tests und Review mit Agenten",
  ],
  closing: "Bei Fragen melde dich gern jederzeit.",
  signOff: "Viele Grüße",
};

// The 22 working days of October 2026, the 1st a Thursday.
const october = [1, 2, 5, 6, 7, 8, 9, 12, 13, 14, 15, 16, 19, 20, 21, 22, 23, 26, 27, 28, 29, 30];
const weekdays = ["Mo", "Di", "Mi", "Do", "Fr"];
const activities = [
  "Regeltermin mit Kunde: Stand der Pipeline und nächste Schritte",
  "Review der Agenten-Konfiguration im Plattform-Repository",
  "Pairing an der Testabdeckung des Bestellservice",
  "Workshop-Vorbereitung: Spezifikation mit Agenten",
];

/** A full month: its 22 working days, one single-line row each. */
export const leistungsnachweisMonth = {
  title: "Leistungsnachweis Musterwerk Oktober 2026",
  periodLabel: "Oktober 2026",
  clientShort: "Musterwerk",
  created: "31.10.2026",
  client: "Musterwerk AG",
  project: "Agentic Engineering Begleitung",
  employee: "Mara Beispiel",
  period: "01.10.2026 – 31.10.2026",
  references: ["Angebot AG-10001-2026", "Bestellung 4500000001", "Rechnung Nr. RE-2026-0001"],
  rows: october.map((d, i) => ({
    date: `${String(d).padStart(2, "0")}.10.`,
    day: weekdays[(d + 2) % 7],
    time: "09:00 – 10:30",
    hours: "1,50",
    activity: activities[i % activities.length],
  })),
  total: "33,00",
};

/** A training engagement whose source structures the hours into sections. */
export const leistungsnachweisTraining = {
  periodLabel: "Training Team Plattform",
  clientShort: "Musterwerk",
  created: "20.11.2026",
  client: "Musterwerk AG",
  project: "Agentic Engineering Training",
  team: "Team Plattform (12 Teilnehmende)",
  employee: "Jonas Probst (hackers&wizards Partner)",
  period: "02.11.2026 – 13.11.2026",
  references: ["Angebot AG-10002-2026", "Rechnung Nr. RE-2026-0002"],
  rows: [
    { section: "Vorbereitung", hours: "4,00" },
    {
      date: "02.11.",
      day: "Mo",
      time: "10:00 – 12:00",
      hours: "2,00",
      activity: "Abstimmung der Agenda mit dem Team",
    },
    {
      date: "04.11.",
      day: "Mi",
      time: "14:00 – 16:00",
      hours: "2,00",
      activity: "Übungen auf die Codebasis des Teams zuschneiden",
    },
    { section: "Durchführung", hours: "16,00" },
    { date: "12.11.", day: "Do", time: "09:00 – 17:00", hours: "8,00", activity: "Training Tag 1" },
    { date: "13.11.", day: "Fr", time: "09:00 – 17:00", hours: "8,00", activity: "Training Tag 2" },
  ],
  total: "20,00",
};

/** A lump-sum item without days, billed flat, beside a rounded column. */
export const leistungsnachweisLumpSum = {
  periodLabel: "Mentoring November 2026",
  clientShort: "Musterwerk",
  created: "30.11.2026",
  client: "Musterwerk AG",
  employee: "Mara Beispiel",
  period: "01.11.2026 – 30.11.2026",
  references: ["Angebot AG-10003-2026"],
  lumpSumQuote: "AG-10003-2026",
  rounding: "Abgerechnet wird je Termin im 15-Minuten-Takt, wie im Angebot vereinbart.",
  rows: [
    {
      date: "01.11. – 30.11.",
      hours: "6,40",
      billed: "6,50",
      activity: ["Vier Mentoring-Termine mit dem Team", "Review der Agenten-Regeln"],
    },
  ],
  total: "6,40",
  totalBilled: "6,50",
};

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
  community: { price: "XXX", seats: "12", value: "X.XXX" },
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
  community: { price: "XXX" },
  sequence: undefined,
  terms: [{ title: "Payment", paragraphs: ["All invoices: 15 days net."] }],
  signOff: "Best regards",
};

export const proposalDeNoPrice = {
  ...proposalDe,
  price: {
    heading: "Leistungen",
    rows: proposalDe.price.rows.map(({ item, detail, basis }) => ({ item, detail, basis })),
  },
  acceptance: { label: "Umfang", value: "Training und Mentoring wie oben" },
};

/** A certificate with its verification footer; the QR image is a fictional placeholder. */
export const certificate = {
  lang: "en" as const,
  title: "Certificate Agentic Engineering Training: Mara Beispiel",
  attendeeName: "Mara Beispiel",
  attendeeCompany: "Musterwerk AG",
  trainingTitle: "hackers&wizards Training (2 Days)",
  trainingSubtitle: "Agentic Engineering",
  date: "12–13 November 2026",
  remote: true,
  durationHours: "16",
  topics: ["Specification with agents", "Tests first", "Review loops", "Rules files"],
  signers: [
    { name: "Erika Mustermann", title: "Co-Founder, hackers&wizards", image: "" },
    { name: "Max Mustermann", title: "Co-Founder, hackers&wizards", image: "" },
  ],
  credentialId: "HW-AE-261113-EXAMPLE0EXAMPLE0",
  verificationUrl: "https://certificates.hackersandwizards.dev/c/HW-AE-261113-EXAMPLE0EXAMPLE0",
  qrCodeUri:
    "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxIDEiPjxyZWN0IHdpZHRoPSIxIiBoZWlnaHQ9IjEiLz48L3N2Zz4=",
  linkedinUrl: "https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME",
};

/** A Markdown body as pandoc writes it, with the eyebrow and lead in place. */
export const proseHtml = `<span class="eyebrow">Interne Notiz</span>
<h1>Probelauf und Ergebnis</h1>
<p class="subtitle">Ein Beispiel mit den Elementen, die Markdown liefert.</p>
<p>Ein Absatz mit <strong>fett</strong>, <em>kursiv</em>, <code>code</code> und einem <a href="https://hackersandwizards.dev">Link</a>.</p>
<h2>Liste</h2>
<ul><li>Erster Punkt</li><li>Zweiter Punkt</li></ul>
<table><thead><tr><th>Spalte</th><th>Wert</th></tr></thead><tbody><tr><td>A</td><td>1</td></tr></tbody></table>
<blockquote><p>Ein Zitat.</p></blockquote>
<pre><code>$ bun run check</code></pre>`;
