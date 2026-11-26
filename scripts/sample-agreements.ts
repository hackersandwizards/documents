import { brandCompany } from "./root";

const company = brandCompany();

const hw = {
  company: company.legal,
  lines: [
    "vertreten durch die Geschäftsführer",
    company.street,
    `${company.postcode} ${company.city}`,
  ],
};

/** The contract form: a trainer's NDA for one client's training. */
export const agreementNda = {
  lang: "de" as const,
  title: "Geheimhaltungsvereinbarung Erika Mustermann",
  kind: "Geheimhaltungsvereinbarung",
  date: "02.11.2026",
  eyebrow: "Training für Musterwerk AG",
  heading: "Geheimhaltungsvereinbarung",
  subtitle: "Für das Agentic Engineering Training mit Team Plattform im November 2026.",
  parties: [
    { label: "Auftraggeber", ...hw },
    {
      label: "Auftragnehmer",
      company: "Erika Mustermann",
      lines: ["Beispielweg 12", "22767 Hamburg"],
    },
  ],
  preamble: [
    `${company.name} führt für die Musterwerk AG ein Training durch, das der Auftragnehmer als Trainer mitgestaltet. Dabei erhält er Einblick in Informationen der Musterwerk AG und von ${company.name}. Diese Vereinbarung regelt, wie er sie schützt.`,
  ],
  clauses: [
    {
      title: "Vertrauliche Informationen",
      html: "<p>Vertraulich sind alle Informationen, die der Auftragnehmer im Rahmen des Trainings erhält, insbesondere:</p><ul><li>Quellcode, Architektur und Werkzeuge des Teams,</li><li>Geschäftszahlen, Pläne und Namen von Mitarbeitenden,</li><li>Inhalte aus Gesprächen und Übungen mit den Teilnehmenden.</li></ul>",
    },
    {
      title: "Ausnahmen",
      html: "<p>Nicht vertraulich ist, was öffentlich bekannt ist, dem Auftragnehmer vorher rechtmäßig bekannt war oder was er unabhängig selbst entwickelt hat.</p>",
    },
    {
      title: "Pflichten",
      html: "<p>Der Auftragnehmer nutzt vertrauliche Informationen nur für das Training, gibt sie nicht an Dritte weiter und löscht sie nach dem Training, soweit keine Aufbewahrungspflicht besteht.</p>",
    },
    {
      title: "Laufzeit",
      html: "<p>Die Pflichten gelten ab Unterzeichnung und enden drei Jahre nach dem letzten Trainingstag.</p>",
    },
    {
      title: "Schlussbestimmungen",
      html: "<p>Es gilt deutsches Recht. Gerichtsstand ist Hamburg. Änderungen bedürfen der Textform.</p>",
    },
  ],
  signatures: [
    {
      label: "Auftraggeber",
      party: company.legal,
      name: "Mara Beispiel",
    },
    { label: "Auftragnehmer", party: "Erika Mustermann", name: "Erika Mustermann" },
  ],
  counterparty: "Erika Mustermann",
};

/** The letter form: an order confirmation on the offer's terms. */
export const agreementOrder = {
  lang: "de" as const,
  title: "Auftragsbestätigung AG-10001-2026",
  kind: "Auftragsbestätigung",
  number: "AB-10001-2026",
  date: "05.11.2026",
  eyebrow: "Training für ein Team",
  heading: "Auftragsbestätigung",
  letter: {
    recipient: {
      label: "Auftraggeber",
      company: "Musterwerk AG",
      lines: ["Jonas Probst", "Beispielweg 12", "20095 Hamburg"],
    },
    greeting: [
      "Hallo Jonas,",
      "danke für deine Zusage. Wir bestätigen den Auftrag zu den Bedingungen unseres Angebots AG-10001-2026.",
    ],
  },
  facts: [
    { term: "Leistung", value: "Training Agentic Engineering, zwei Tage vor Ort" },
    { term: "Team", value: "Team Plattform, 12 Teilnehmende" },
    { term: "Termin", value: "12. und 13. November 2026" },
    { term: "Vergütung", value: "XX.XXX,XX € netto zzgl. USt." },
    { term: "Zahlungsziel", value: "14 Tage nach Rechnungsstellung" },
    { term: "Grundlage", value: "Angebot AG-10001-2026 vom 20.10.2026" },
  ],
  signatures: [{ label: `Für ${company.name}`, party: company.legal, name: "Mara Beispiel" }],
  counterparty: "Musterwerk",
};
