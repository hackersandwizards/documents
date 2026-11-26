import { brandCompany } from "./root";

const company = brandCompany();

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
  employee: `Jonas Probst (${company.name} Partner)`,
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
