import { escapeHtml } from "./fill";
import { brandCompany } from "./root";

const company = brandCompany();

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
    `Vertragspartner ist die ${company.legal}.`,
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

/** A certificate with its verification footer; the QR code encodes the fictitious verification URL. */
export const certificate = {
  lang: "en" as const,
  title: "Certificate Agentic Engineering Training: Mara Beispiel",
  attendeeName: "Mara Beispiel",
  attendeeCompany: "Musterwerk AG",
  trainingTitle: `${company.name} Training (2 Days)`,
  trainingSubtitle: "Agentic Engineering",
  date: "12–13 November 2026",
  remote: true,
  durationHours: "16",
  topics: ["Specification with agents", "Tests first", "Review loops", "Rules files"],
  signers: [
    { name: "Erika Mustermann", title: `Co-Founder, ${company.name}`, image: "" },
    { name: "Max Mustermann", title: `Co-Founder, ${company.name}`, image: "" },
  ],
  credentialId: "HW-AE-261113-EXAMPLE0EXAMPLE0",
  verificationUrl: "https://certificates.hackersandwizards.dev/c/HW-AE-261113-EXAMPLE0EXAMPLE0",
  qrCodeUri:
    "data:image/svg+xml;base64,PD94bWwgdmVyc2lvbj0nMS4wJyBlbmNvZGluZz0nVVRGLTgnPz4KPHN2ZyB3aWR0aD0iNDFtbSIgaGVpZ2h0PSI0MW1tIiB2ZXJzaW9uPSIxLjEiIHZpZXdCb3g9IjAgMCA0MSA0MSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cmVjdCBmaWxsPSJ3aGl0ZSIgeD0iMCIgeT0iMCIgd2lkdGg9IjEwMCUiIGhlaWdodD0iMTAwJSIgLz48cGF0aCBkPSJNMiwySDNWM0gyek0zLDJINFYzSDN6TTQsMkg1VjNINHpNNSwySDZWM0g1ek02LDJIN1YzSDZ6TTcsMkg4VjNIN3pNOCwySDlWM0g4ek0xMywySDE0VjNIMTN6TTE2LDJIMTdWM0gxNnpNMTksMkgyMFYzSDE5ek0yMCwySDIxVjNIMjB6TTIyLDJIMjNWM0gyMnpNMjYsMkgyN1YzSDI2ek0yOSwySDMwVjNIMjl6TTMyLDJIMzNWM0gzMnpNMzMsMkgzNFYzSDMzek0zNCwySDM1VjNIMzR6TTM1LDJIMzZWM0gzNXpNMzYsMkgzN1YzSDM2ek0zNywySDM4VjNIMzd6TTM4LDJIMzlWM0gzOHpNMiwzSDNWNEgyek04LDNIOVY0SDh6TTExLDNIMTJWNEgxMXpNMTIsM0gxM1Y0SDEyek0xNCwzSDE1VjRIMTR6TTE1LDNIMTZWNEgxNXpNMTcsM0gxOFY0SDE3ek0xOSwzSDIwVjRIMTl6TTIwLDNIMjFWNEgyMHpNMjEsM0gyMlY0SDIxek0yNiwzSDI3VjRIMjZ6TTI3LDNIMjhWNEgyN3pNMzIsM0gzM1Y0SDMyek0zOCwzSDM5VjRIMzh6TTIsNEgzVjVIMnpNNCw0SDVWNUg0ek01LDRINlY1SDV6TTYsNEg3VjVINnpNOCw0SDlWNUg4ek0xMCw0SDExVjVIMTB6TTExLDRIMTJWNUgxMXpNMTIsNEgxM1Y1SDEyek0xNSw0SDE2VjVIMTV6TTE2LDRIMTdWNUgxNnpNMTcsNEgxOFY1SDE3ek0xOCw0SDE5VjVIMTh6TTIwLDRIMjFWNUgyMHpNMjEsNEgyMlY1SDIxek0yMiw0SDIzVjVIMjJ6TTIzLDRIMjRWNUgyM3pNMjQsNEgyNVY1SDI0ek0yNiw0SDI3VjVIMjZ6TTI4LDRIMjlWNUgyOHpNMjksNEgzMFY1SDI5ek0zMiw0SDMzVjVIMzJ6TTM0LDRIMzVWNUgzNHpNMzUsNEgzNlY1SDM1ek0zNiw0SDM3VjVIMzZ6TTM4LDRIMzlWNUgzOHpNMiw1SDNWNkgyek00LDVINVY2SDR6TTUsNUg2VjZINXpNNiw1SDdWNkg2ek04LDVIOVY2SDh6TTEwLDVIMTFWNkgxMHpNMTUsNUgxNlY2SDE1ek0xNiw1SDE3VjZIMTZ6TTE5LDVIMjBWNkgxOXpNMjEsNUgyMlY2SDIxek0yMiw1SDIzVjZIMjJ6TTI0LDVIMjVWNkgyNHpNMjYsNUgyN1Y2SDI2ek0yNyw1SDI4VjZIMjd6TTI4LDVIMjlWNkgyOHpNMzIsNUgzM1Y2SDMyek0zNCw1SDM1VjZIMzR6TTM1LDVIMzZWNkgzNXpNMzYsNUgzN1Y2SDM2ek0zOCw1SDM5VjZIMzh6TTIsNkgzVjdIMnpNNCw2SDVWN0g0ek01LDZINlY3SDV6TTYsNkg3VjdINnpNOCw2SDlWN0g4ek0xMCw2SDExVjdIMTB6TTExLDZIMTJWN0gxMXpNMTIsNkgxM1Y3SDEyek0xMyw2SDE0VjdIMTN6TTE4LDZIMTlWN0gxOHpNMjAsNkgyMVY3SDIwek0yMSw2SDIyVjdIMjF6TTIyLDZIMjNWN0gyMnpNMjUsNkgyNlY3SDI1ek0yNyw2SDI4VjdIMjd6TTMwLDZIMzFWN0gzMHpNMzIsNkgzM1Y3SDMyek0zNCw2SDM1VjdIMzR6TTM1LDZIMzZWN0gzNXpNMzYsNkgzN1Y3SDM2ek0zOCw2SDM5VjdIMzh6TTIsN0gzVjhIMnpNOCw3SDlWOEg4ek0xMCw3SDExVjhIMTB6TTEyLDdIMTNWOEgxMnpNMTUsN0gxNlY4SDE1ek0xNyw3SDE4VjhIMTd6TTE4LDdIMTlWOEgxOHpNMjAsN0gyMVY4SDIwek0yMiw3SDIzVjhIMjJ6TTI0LDdIMjVWOEgyNHpNMjcsN0gyOFY4SDI3ek0yOCw3SDI5VjhIMjh6TTI5LDdIMzBWOEgyOXpNMzAsN0gzMVY4SDMwek0zMiw3SDMzVjhIMzJ6TTM4LDdIMzlWOEgzOHpNMiw4SDNWOUgyek0zLDhINFY5SDN6TTQsOEg1VjlINHpNNSw4SDZWOUg1ek02LDhIN1Y5SDZ6TTcsOEg4VjlIN3pNOCw4SDlWOUg4ek0xMCw4SDExVjlIMTB6TTEyLDhIMTNWOUgxMnpNMTQsOEgxNVY5SDE0ek0xNiw4SDE3VjlIMTZ6TTE4LDhIMTlWOUgxOHpNMjAsOEgyMVY5SDIwek0yMiw4SDIzVjlIMjJ6TTI0LDhIMjVWOUgyNHpNMjYsOEgyN1Y5SDI2ek0yOCw4SDI5VjlIMjh6TTMwLDhIMzFWOUgzMHpNMzIsOEgzM1Y5SDMyek0zMyw4SDM0VjlIMzN6TTM0LDhIMzVWOUgzNHpNMzUsOEgzNlY5SDM1ek0zNiw4SDM3VjlIMzZ6TTM3LDhIMzhWOUgzN3pNMzgsOEgzOVY5SDM4ek0xMCw5SDExVjEwSDEwek0xMSw5SDEyVjEwSDExek0xMyw5SDE0VjEwSDEzek0xNCw5SDE1VjEwSDE0ek0xNiw5SDE3VjEwSDE2ek0xNyw5SDE4VjEwSDE3ek0yNSw5SDI2VjEwSDI1ek0yNiw5SDI3VjEwSDI2ek0yOCw5SDI5VjEwSDI4ek0yOSw5SDMwVjEwSDI5ek0yLDEwSDNWMTFIMnpNNCwxMEg1VjExSDR6TTUsMTBINlYxMUg1ek02LDEwSDdWMTFINnpNNywxMEg4VjExSDd6TTgsMTBIOVYxMUg4ek0xMSwxMEgxMlYxMUgxMXpNMTMsMTBIMTRWMTFIMTN6TTE0LDEwSDE1VjExSDE0ek0xNSwxMEgxNlYxMUgxNXpNMTYsMTBIMTdWMTFIMTZ6TTE3LDEwSDE4VjExSDE3ek0yMCwxMEgyMVYxMUgyMHpNMjEsMTBIMjJWMTFIMjF6TTIyLDEwSDIzVjExSDIyek0yMywxMEgyNFYxMUgyM3pNMjQsMTBIMjVWMTFIMjR6TTI2LDEwSDI3VjExSDI2ek0yOCwxMEgyOVYxMUgyOHpNMzAsMTBIMzFWMTFIMzB6TTMyLDEwSDMzVjExSDMyek0zMywxMEgzNFYxMUgzM3pNMzQsMTBIMzVWMTFIMzR6TTM1LDEwSDM2VjExSDM1ek0zNiwxMEgzN1YxMUgzNnpNMiwxMUgzVjEySDJ6TTMsMTFINFYxMkgzek00LDExSDVWMTJINHpNNiwxMUg3VjEySDZ6TTcsMTFIOFYxMkg3ek0xMCwxMUgxMVYxMkgxMHpNMTEsMTFIMTJWMTJIMTF6TTEyLDExSDEzVjEySDEyek0xMywxMUgxNFYxMkgxM3pNMTQsMTFIMTVWMTJIMTR6TTE1LDExSDE2VjEySDE1ek0xNiwxMUgxN1YxMkgxNnpNMTcsMTFIMThWMTJIMTd6TTE4LDExSDE5VjEySDE4ek0yMywxMUgyNFYxMkgyM3pNMjYsMTFIMjdWMTJIMjZ6TTI5LDExSDMwVjEySDI5ek0zMCwxMUgzMVYxMkgzMHpNMzEsMTFIMzJWMTJIMzF6TTMyLDExSDMzVjEySDMyek0zNCwxMUgzNVYxMkgzNHpNMzUsMTFIMzZWMTJIMzV6TTM3LDExSDM4VjEySDM3ek0yLDEySDNWMTNIMnpNNCwxMkg1VjEzSDR6TTYsMTJIN1YxM0g2ek04LDEySDlWMTNIOHpNOSwxMkgxMFYxM0g5ek0xMywxMkgxNFYxM0gxM3pNMTQsMTJIMTVWMTNIMTR6TTE1LDEySDE2VjEzSDE1ek0xNiwxMkgxN1YxM0gxNnpNMjAsMTJIMjFWMTNIMjB6TTIyLDEySDIzVjEzSDIyek0yMywxMkgyNFYxM0gyM3pNMjQsMTJIMjVWMTNIMjR6TTI1LDEySDI2VjEzSDI1ek0zMCwxMkgzMVYxM0gzMHpNMzIsMTJIMzNWMTNIMzJ6TTMzLDEySDM0VjEzSDMzek0zNCwxMkgzNVYxM0gzNHpNMzUsMTJIMzZWMTNIMzV6TTM3LDEySDM4VjEzSDM3ek0zOCwxMkgzOVYxM0gzOHpNMywxM0g0VjE0SDN6TTUsMTNINlYxNEg1ek0xMSwxM0gxMlYxNEgxMXpNMTMsMTNIMTRWMTRIMTN6TTE1LDEzSDE2VjE0SDE1ek0xOCwxM0gxOVYxNEgxOHpNMjMsMTNIMjRWMTRIMjN6TTI0LDEzSDI1VjE0SDI0ek0yOCwxM0gyOVYxNEgyOHpNMjksMTNIMzBWMTRIMjl6TTMxLDEzSDMyVjE0SDMxek0zNCwxM0gzNVYxNEgzNHpNMzYsMTNIMzdWMTRIMzZ6TTM4LDEzSDM5VjE0SDM4ek0yLDE0SDNWMTVIMnpNNCwxNEg1VjE1SDR6TTgsMTRIOVYxNUg4ek0xMCwxNEgxMVYxNUgxMHpNMTQsMTRIMTVWMTVIMTR6TTE4LDE0SDE5VjE1SDE4ek0xOSwxNEgyMFYxNUgxOXpNMjQsMTRIMjVWMTVIMjR6TTI1LDE0SDI2VjE1SDI1ek0yNiwxNEgyN1YxNUgyNnpNMjcsMTRIMjhWMTVIMjd6TTI4LDE0SDI5VjE1SDI4ek0zMSwxNEgzMlYxNUgzMXpNMzIsMTRIMzNWMTVIMzJ6TTM0LDE0SDM1VjE1SDM0ek0zNiwxNEgzN1YxNUgzNnpNMzcsMTRIMzhWMTVIMzd6TTM4LDE0SDM5VjE1SDM4ek0yLDE1SDNWMTZIMnpNMywxNUg0VjE2SDN6TTYsMTVIN1YxNkg2ek03LDE1SDhWMTZIN3pNOSwxNUgxMFYxNkg5ek0xMCwxNUgxMVYxNkgxMHpNMTEsMTVIMTJWMTZIMTF6TTE4LDE1SDE5VjE2SDE4ek0xOSwxNUgyMFYxNkgxOXpNMjEsMTVIMjJWMTZIMjF6TTIyLDE1SDIzVjE2SDIyek0yMywxNUgyNFYxNkgyM3pNMjQsMTVIMjVWMTZIMjR6TTI1LDE1SDI2VjE2SDI1ek0yNywxNUgyOFYxNkgyN3pNMjgsMTVIMjlWMTZIMjh6TTMwLDE1SDMxVjE2SDMwek0zMywxNUgzNFYxNkgzM3pNMiwxNkgzVjE3SDJ6TTMsMTZINFYxN0gzek00LDE2SDVWMTdINHpNNywxNkg4VjE3SDd6TTgsMTZIOVYxN0g4ek05LDE2SDEwVjE3SDl6TTExLDE2SDEyVjE3SDExek0xMywxNkgxNFYxN0gxM3pNMTQsMTZIMTVWMTdIMTR6TTE1LDE2SDE2VjE3SDE1ek0xNiwxNkgxN1YxN0gxNnpNMTcsMTZIMThWMTdIMTd6TTE4LDE2SDE5VjE3SDE4ek0xOSwxNkgyMFYxN0gxOXpNMjIsMTZIMjNWMTdIMjJ6TTIzLDE2SDI0VjE3SDIzek0yOSwxNkgzMFYxN0gyOXpNMzIsMTZIMzNWMTdIMzJ6TTMzLDE2SDM0VjE3SDMzek0zNCwxNkgzNVYxN0gzNHpNMzUsMTZIMzZWMTdIMzV6TTM4LDE2SDM5VjE3SDM4ek0yLDE3SDNWMThIMnpNNSwxN0g2VjE4SDV6TTcsMTdIOFYxOEg3ek05LDE3SDEwVjE4SDl6TTEyLDE3SDEzVjE4SDEyek0xMywxN0gxNFYxOEgxM3pNMTYsMTdIMTdWMThIMTZ6TTE3LDE3SDE4VjE4SDE3ek0xOCwxN0gxOVYxOEgxOHpNMTksMTdIMjBWMThIMTl6TTIwLDE3SDIxVjE4SDIwek0yMSwxN0gyMlYxOEgyMXpNMjIsMTdIMjNWMThIMjJ6TTIzLDE3SDI0VjE4SDIzek0yNCwxN0gyNVYxOEgyNHpNMjYsMTdIMjdWMThIMjZ6TTI3LDE3SDI4VjE4SDI3ek0yOCwxN0gyOVYxOEgyOHpNMzAsMTdIMzFWMThIMzB6TTMyLDE3SDMzVjE4SDMyek0zMywxN0gzNFYxOEgzM3pNMzQsMTdIMzVWMThIMzR6TTM3LDE3SDM4VjE4SDM3ek0zLDE4SDRWMTlIM3pNNCwxOEg1VjE5SDR6TTUsMThINlYxOUg1ek02LDE4SDdWMTlINnpNOCwxOEg5VjE5SDh6TTExLDE4SDEyVjE5SDExek0xMiwxOEgxM1YxOUgxMnpNMTMsMThIMTRWMTlIMTN6TTE0LDE4SDE1VjE5SDE0ek0xNSwxOEgxNlYxOUgxNXpNMTcsMThIMThWMTlIMTd6TTE4LDE4SDE5VjE5SDE4ek0yMywxOEgyNFYxOUgyM3pNMjgsMThIMjlWMTlIMjh6TTI5LDE4SDMwVjE5SDI5ek0zMCwxOEgzMVYxOUgzMHpNMzEsMThIMzJWMTlIMzF6TTMzLDE4SDM0VjE5SDMzek0zNiwxOEgzN1YxOUgzNnpNMzgsMThIMzlWMTlIMzh6TTIsMTlIM1YyMEgyek03LDE5SDhWMjBIN3pNMTAsMTlIMTFWMjBIMTB6TTExLDE5SDEyVjIwSDExek0xMywxOUgxNFYyMEgxM3pNMTcsMTlIMThWMjBIMTd6TTIwLDE5SDIxVjIwSDIwek0yMiwxOUgyM1YyMEgyMnpNMjMsMTlIMjRWMjBIMjN6TTI0LDE5SDI1VjIwSDI0ek0yNiwxOUgyN1YyMEgyNnpNMjgsMTlIMjlWMjBIMjh6TTMxLDE5SDMyVjIwSDMxek0zNCwxOUgzNVYyMEgzNHpNMzcsMTlIMzhWMjBIMzd6TTIsMjBIM1YyMUgyek02LDIwSDdWMjFINnpNNywyMEg4VjIxSDd6TTgsMjBIOVYyMUg4ek05LDIwSDEwVjIxSDl6TTEwLDIwSDExVjIxSDEwek0xNCwyMEgxNVYyMUgxNHpNMTUsMjBIMTZWMjFIMTV6TTE3LDIwSDE4VjIxSDE3ek0xOCwyMEgxOVYyMUgxOHpNMTksMjBIMjBWMjFIMTl6TTIwLDIwSDIxVjIxSDIwek0yMSwyMEgyMlYyMUgyMXpNMjUsMjBIMjZWMjFIMjV6TTI2LDIwSDI3VjIxSDI2ek0yOCwyMEgyOVYyMUgyOHpNMzEsMjBIMzJWMjFIMzF6TTMyLDIwSDMzVjIxSDMyek0zMywyMEgzNFYyMUgzM3pNMzQsMjBIMzVWMjFIMzR6TTM2LDIwSDM3VjIxSDM2ek0zNywyMEgzOFYyMUgzN3pNMzgsMjBIMzlWMjFIMzh6TTIsMjFIM1YyMkgyek0zLDIxSDRWMjJIM3pNNCwyMUg1VjIySDR6TTUsMjFINlYyMkg1ek05LDIxSDEwVjIySDl6TTEyLDIxSDEzVjIySDEyek0xNywyMUgxOFYyMkgxN3pNMjAsMjFIMjFWMjJIMjB6TTIxLDIxSDIyVjIySDIxek0yMiwyMUgyM1YyMkgyMnpNMjMsMjFIMjRWMjJIMjN6TTI5LDIxSDMwVjIySDI5ek0zMCwyMUgzMVYyMkgzMHpNMzEsMjFIMzJWMjJIMzF6TTMyLDIxSDMzVjIySDMyek0zNSwyMUgzNlYyMkgzNXpNMzYsMjFIMzdWMjJIMzZ6TTM4LDIxSDM5VjIySDM4ek00LDIySDVWMjNINHpNNSwyMkg2VjIzSDV6TTYsMjJIN1YyM0g2ek03LDIySDhWMjNIN3pNOCwyMkg5VjIzSDh6TTksMjJIMTBWMjNIOXpNMTAsMjJIMTFWMjNIMTB6TTExLDIySDEyVjIzSDExek0xMywyMkgxNFYyM0gxM3pNMTQsMjJIMTVWMjNIMTR6TTE3LDIySDE4VjIzSDE3ek0xOSwyMkgyMFYyM0gxOXpNMjEsMjJIMjJWMjNIMjF6TTIyLDIySDIzVjIzSDIyek0yNCwyMkgyNVYyM0gyNHpNMjYsMjJIMjdWMjNIMjZ6TTI3LDIySDI4VjIzSDI3ek0yOCwyMkgyOVYyM0gyOHpNMjksMjJIMzBWMjNIMjl6TTMxLDIySDMyVjIzSDMxek0zMiwyMkgzM1YyM0gzMnpNMzQsMjJIMzVWMjNIMzR6TTM1LDIySDM2VjIzSDM1ek0zNiwyMkgzN1YyM0gzNnpNMywyM0g0VjI0SDN6TTcsMjNIOFYyNEg3ek05LDIzSDEwVjI0SDl6TTEwLDIzSDExVjI0SDEwek0xMSwyM0gxMlYyNEgxMXpNMTIsMjNIMTNWMjRIMTJ6TTEzLDIzSDE0VjI0SDEzek0xNiwyM0gxN1YyNEgxNnpNMTgsMjNIMTlWMjRIMTh6TTIwLDIzSDIxVjI0SDIwek0yMSwyM0gyMlYyNEgyMXpNMjIsMjNIMjNWMjRIMjJ6TTI0LDIzSDI1VjI0SDI0ek0yNSwyM0gyNlYyNEgyNXpNMjcsMjNIMjhWMjRIMjd6TTMwLDIzSDMxVjI0SDMwek0zMSwyM0gzMlYyNEgzMXpNMzUsMjNIMzZWMjRIMzV6TTIsMjRIM1YyNUgyek0zLDI0SDRWMjVIM3pNNSwyNEg2VjI1SDV6TTcsMjRIOFYyNUg3ek04LDI0SDlWMjVIOHpNOSwyNEgxMFYyNUg5ek0xMCwyNEgxMVYyNUgxMHpNMTIsMjRIMTNWMjVIMTJ6TTE0LDI0SDE1VjI1SDE0ek0xNSwyNEgxNlYyNUgxNXpNMTYsMjRIMTdWMjVIMTZ6TTE3LDI0SDE4VjI1SDE3ek0yMCwyNEgyMVYyNUgyMHpNMjQsMjRIMjVWMjVIMjR6TTI2LDI0SDI3VjI1SDI2ek0yOSwyNEgzMFYyNUgyOXpNMzAsMjRIMzFWMjVIMzB6TTMyLDI0SDMzVjI1SDMyek0zMywyNEgzNFYyNUgzM3pNMzQsMjRIMzVWMjVIMzR6TTM1LDI0SDM2VjI1SDM1ek0zNywyNEgzOFYyNUgzN3pNMzgsMjRIMzlWMjVIMzh6TTMsMjVINFYyNkgzek00LDI1SDVWMjZINHpNNSwyNUg2VjI2SDV6TTcsMjVIOFYyNkg3ek0xMCwyNUgxMVYyNkgxMHpNMTEsMjVIMTJWMjZIMTF6TTEyLDI1SDEzVjI2SDEyek0xNCwyNUgxNVYyNkgxNHpNMTYsMjVIMTdWMjZIMTZ6TTE3LDI1SDE4VjI2SDE3ek0xOCwyNUgxOVYyNkgxOHpNMjIsMjVIMjNWMjZIMjJ6TTI2LDI1SDI3VjI2SDI2ek0yOCwyNUgyOVYyNkgyOHpNMjksMjVIMzBWMjZIMjl6TTMyLDI1SDMzVjI2SDMyek0zMywyNUgzNFYyNkgzM3pNMzQsMjVIMzVWMjZIMzR6TTM3LDI1SDM4VjI2SDM3ek0zLDI2SDRWMjdIM3pNNCwyNkg1VjI3SDR6TTUsMjZINlYyN0g1ek03LDI2SDhWMjdIN3pNOCwyNkg5VjI3SDh6TTEyLDI2SDEzVjI3SDEyek0xMywyNkgxNFYyN0gxM3pNMTUsMjZIMTZWMjdIMTV6TTE3LDI2SDE4VjI3SDE3ek0yMCwyNkgyMVYyN0gyMHpNMjIsMjZIMjNWMjdIMjJ6TTIzLDI2SDI0VjI3SDIzek0yNCwyNkgyNVYyN0gyNHpNMjUsMjZIMjZWMjdIMjV6TTI4LDI2SDI5VjI3SDI4ek0zMCwyNkgzMVYyN0gzMHpNMzEsMjZIMzJWMjdIMzF6TTMyLDI2SDMzVjI3SDMyek0zNiwyNkgzN1YyN0gzNnpNMzcsMjZIMzhWMjdIMzd6TTIsMjdIM1YyOEgyek01LDI3SDZWMjhINXpNOSwyN0gxMFYyOEg5ek0xMSwyN0gxMlYyOEgxMXpNMTIsMjdIMTNWMjhIMTJ6TTE1LDI3SDE2VjI4SDE1ek0xNywyN0gxOFYyOEgxN3pNMTgsMjdIMTlWMjhIMTh6TTIzLDI3SDI0VjI4SDIzek0yNSwyN0gyNlYyOEgyNXpNMjksMjdIMzBWMjhIMjl6TTMxLDI3SDMyVjI4SDMxek0zMiwyN0gzM1YyOEgzMnpNMzMsMjdIMzRWMjhIMzN6TTM1LDI3SDM2VjI4SDM1ek0yLDI4SDNWMjlIMnpNNCwyOEg1VjI5SDR6TTUsMjhINlYyOUg1ek02LDI4SDdWMjlINnpNNywyOEg4VjI5SDd6TTgsMjhIOVYyOUg4ek0xMSwyOEgxMlYyOUgxMXpNMTYsMjhIMTdWMjlIMTZ6TTIyLDI4SDIzVjI5SDIyek0yNSwyOEgyNlYyOUgyNXpNMjYsMjhIMjdWMjlIMjZ6TTI4LDI4SDI5VjI5SDI4ek0yOSwyOEgzMFYyOUgyOXpNMzIsMjhIMzNWMjlIMzJ6TTMzLDI4SDM0VjI5SDMzek0zNCwyOEgzNVYyOUgzNHpNMzUsMjhIMzZWMjlIMzV6TTM3LDI4SDM4VjI5SDM3ek0zOCwyOEgzOVYyOUgzOHpNMiwyOUgzVjMwSDJ6TTQsMjlINVYzMEg0ek01LDI5SDZWMzBINXpNNiwyOUg3VjMwSDZ6TTExLDI5SDEyVjMwSDExek0xMiwyOUgxM1YzMEgxMnpNMTMsMjlIMTRWMzBIMTN6TTE1LDI5SDE2VjMwSDE1ek0xOCwyOUgxOVYzMEgxOHpNMjAsMjlIMjFWMzBIMjB6TTIzLDI5SDI0VjMwSDIzek0yNCwyOUgyNVYzMEgyNHpNMjYsMjlIMjdWMzBIMjZ6TTI4LDI5SDI5VjMwSDI4ek0yOSwyOUgzMFYzMEgyOXpNMzAsMjlIMzFWMzBIMzB6TTMzLDI5SDM0VjMwSDMzek0zNSwyOUgzNlYzMEgzNXpNMzYsMjlIMzdWMzBIMzZ6TTM4LDI5SDM5VjMwSDM4ek0yLDMwSDNWMzFIMnpNNCwzMEg1VjMxSDR6TTUsMzBINlYzMUg1ek03LDMwSDhWMzFIN3pNOCwzMEg5VjMxSDh6TTEwLDMwSDExVjMxSDEwek0xMSwzMEgxMlYzMUgxMXpNMTIsMzBIMTNWMzFIMTJ6TTEzLDMwSDE0VjMxSDEzek0xNCwzMEgxNVYzMUgxNHpNMTUsMzBIMTZWMzFIMTV6TTE5LDMwSDIwVjMxSDE5ek0yNCwzMEgyNVYzMUgyNHpNMjUsMzBIMjZWMzFIMjV6TTI2LDMwSDI3VjMxSDI2ek0yNywzMEgyOFYzMUgyN3pNMjgsMzBIMjlWMzFIMjh6TTMwLDMwSDMxVjMxSDMwek0zMSwzMEgzMlYzMUgzMXpNMzIsMzBIMzNWMzFIMzJ6TTMzLDMwSDM0VjMxSDMzek0zNCwzMEgzNVYzMUgzNHpNMzYsMzBIMzdWMzFIMzZ6TTM3LDMwSDM4VjMxSDM3ek0xMCwzMUgxMVYzMkgxMHpNMTEsMzFIMTJWMzJIMTF6TTEyLDMxSDEzVjMySDEyek0xMywzMUgxNFYzMkgxM3pNMTQsMzFIMTVWMzJIMTR6TTE4LDMxSDE5VjMySDE4ek0xOSwzMUgyMFYzMkgxOXpNMjEsMzFIMjJWMzJIMjF6TTIyLDMxSDIzVjMySDIyek0yMywzMUgyNFYzMkgyM3pNMjUsMzFIMjZWMzJIMjV6TTI3LDMxSDI4VjMySDI3ek0yOCwzMUgyOVYzMkgyOHpNMjksMzFIMzBWMzJIMjl6TTMwLDMxSDMxVjMySDMwek0zNCwzMUgzNVYzMkgzNHpNMzUsMzFIMzZWMzJIMzV6TTIsMzJIM1YzM0gyek0zLDMySDRWMzNIM3pNNCwzMkg1VjMzSDR6TTUsMzJINlYzM0g1ek02LDMySDdWMzNINnpNNywzMkg4VjMzSDd6TTgsMzJIOVYzM0g4ek0xMywzMkgxNFYzM0gxM3pNMTYsMzJIMTdWMzNIMTZ6TTE3LDMySDE4VjMzSDE3ek0xOSwzMkgyMFYzM0gxOXpNMjMsMzJIMjRWMzNIMjN6TTI2LDMySDI3VjMzSDI2ek0yNywzMkgyOFYzM0gyN3pNMzAsMzJIMzFWMzNIMzB6TTMyLDMySDMzVjMzSDMyek0zNCwzMkgzNVYzM0gzNHpNMzYsMzJIMzdWMzNIMzZ6TTM4LDMySDM5VjMzSDM4ek0yLDMzSDNWMzRIMnpNOCwzM0g5VjM0SDh6TTEwLDMzSDExVjM0SDEwek0xMSwzM0gxMlYzNEgxMXpNMTMsMzNIMTRWMzRIMTN6TTE0LDMzSDE1VjM0SDE0ek0xNiwzM0gxN1YzNEgxNnpNMTgsMzNIMTlWMzRIMTh6TTE5LDMzSDIwVjM0SDE5ek0yMCwzM0gyMVYzNEgyMHpNMjEsMzNIMjJWMzRIMjF6TTIyLDMzSDIzVjM0SDIyek0yMywzM0gyNFYzNEgyM3pNMjQsMzNIMjVWMzRIMjR6TTI1LDMzSDI2VjM0SDI1ek0yNywzM0gyOFYzNEgyN3pNMjgsMzNIMjlWMzRIMjh6TTMwLDMzSDMxVjM0SDMwek0zNCwzM0gzNVYzNEgzNHpNMzUsMzNIMzZWMzRIMzV6TTIsMzRIM1YzNUgyek00LDM0SDVWMzVINHpNNSwzNEg2VjM1SDV6TTYsMzRIN1YzNUg2ek04LDM0SDlWMzVIOHpNMTAsMzRIMTFWMzVIMTB6TTEyLDM0SDEzVjM1SDEyek0xMywzNEgxNFYzNUgxM3pNMTYsMzRIMTdWMzVIMTZ6TTE4LDM0SDE5VjM1SDE4ek0yMSwzNEgyMlYzNUgyMXpNMjMsMzRIMjRWMzVIMjN6TTI1LDM0SDI2VjM1SDI1ek0yNiwzNEgyN1YzNUgyNnpNMjksMzRIMzBWMzVIMjl6TTMwLDM0SDMxVjM1SDMwek0zMSwzNEgzMlYzNUgzMXpNMzIsMzRIMzNWMzVIMzJ6TTMzLDM0SDM0VjM1SDMzek0zNCwzNEgzNVYzNUgzNHpNMzYsMzRIMzdWMzVIMzZ6TTM3LDM0SDM4VjM1SDM3ek0zOCwzNEgzOVYzNUgzOHpNMiwzNUgzVjM2SDJ6TTQsMzVINVYzNkg0ek01LDM1SDZWMzZINXpNNiwzNUg3VjM2SDZ6TTgsMzVIOVYzNkg4ek0xMCwzNUgxMVYzNkgxMHpNMTEsMzVIMTJWMzZIMTF6TTEzLDM1SDE0VjM2SDEzek0xNCwzNUgxNVYzNkgxNHpNMTcsMzVIMThWMzZIMTd6TTIwLDM1SDIxVjM2SDIwek0yMiwzNUgyM1YzNkgyMnpNMjMsMzVIMjRWMzZIMjN6TTI0LDM1SDI1VjM2SDI0ek0yNiwzNUgyN1YzNkgyNnpNMjgsMzVIMjlWMzZIMjh6TTI5LDM1SDMwVjM2SDI5ek0zMSwzNUgzMlYzNkgzMXpNMzIsMzVIMzNWMzZIMzJ6TTM0LDM1SDM1VjM2SDM0ek0zNSwzNUgzNlYzNkgzNXpNMzYsMzVIMzdWMzZIMzZ6TTIsMzZIM1YzN0gyek00LDM2SDVWMzdINHpNNSwzNkg2VjM3SDV6TTYsMzZIN1YzN0g2ek04LDM2SDlWMzdIOHpNMTAsMzZIMTFWMzdIMTB6TTExLDM2SDEyVjM3SDExek0xMiwzNkgxM1YzN0gxMnpNMTMsMzZIMTRWMzdIMTN6TTE1LDM2SDE2VjM3SDE1ek0xNywzNkgxOFYzN0gxN3pNMTgsMzZIMTlWMzdIMTh6TTE5LDM2SDIwVjM3SDE5ek0yMCwzNkgyMVYzN0gyMHpNMjEsMzZIMjJWMzdIMjF6TTIzLDM2SDI0VjM3SDIzek0yNSwzNkgyNlYzN0gyNXpNMjcsMzZIMjhWMzdIMjd6TTMxLDM2SDMyVjM3SDMxek0zOCwzNkgzOVYzN0gzOHpNMiwzN0gzVjM4SDJ6TTgsMzdIOVYzOEg4ek0xMiwzN0gxM1YzOEgxMnpNMTMsMzdIMTRWMzhIMTN6TTE0LDM3SDE1VjM4SDE0ek0xNywzN0gxOFYzOEgxN3pNMjEsMzdIMjJWMzhIMjF6TTIyLDM3SDIzVjM4SDIyek0yMywzN0gyNFYzOEgyM3pNMjQsMzdIMjVWMzhIMjR6TTI4LDM3SDI5VjM4SDI4ek0yOSwzN0gzMFYzOEgyOXpNMzAsMzdIMzFWMzhIMzB6TTMxLDM3SDMyVjM4SDMxek0zNCwzN0gzNVYzOEgzNHpNMzUsMzdIMzZWMzhIMzV6TTM4LDM3SDM5VjM4SDM4ek0yLDM4SDNWMzlIMnpNMywzOEg0VjM5SDN6TTQsMzhINVYzOUg0ek01LDM4SDZWMzlINXpNNiwzOEg3VjM5SDZ6TTcsMzhIOFYzOUg3ek04LDM4SDlWMzlIOHpNMTAsMzhIMTFWMzlIMTB6TTExLDM4SDEyVjM5SDExek0xNSwzOEgxNlYzOUgxNXpNMTYsMzhIMTdWMzlIMTZ6TTE3LDM4SDE4VjM5SDE3ek0xOSwzOEgyMFYzOUgxOXpNMjAsMzhIMjFWMzlIMjB6TTIxLDM4SDIyVjM5SDIxek0yNCwzOEgyNVYzOUgyNHpNMjUsMzhIMjZWMzlIMjV6TTI2LDM4SDI3VjM5SDI2ek0yNywzOEgyOFYzOUgyN3pNMjksMzhIMzBWMzlIMjl6TTMyLDM4SDMzVjM5SDMyek0zNCwzOEgzNVYzOUgzNHpNMzUsMzhIMzZWMzlIMzV6TTM2LDM4SDM3VjM5SDM2ek0zNywzOEgzOFYzOUgzN3pNMzgsMzhIMzlWMzlIMzh6IiBpZD0icXItcGF0aCIgZmlsbD0iIzAwMDAwMCIgZmlsbC1vcGFjaXR5PSIxIiBmaWxsLXJ1bGU9Im5vbnplcm8iIHN0cm9rZT0ibm9uZSIgLz48L3N2Zz4=",
  linkedinUrl: "https://www.linkedin.com/profile/add?startTask=CERTIFICATION_NAME",
};

/** The German certificate: German title, topics and date on the same fictitious attendee. */
export const certificateDe = {
  ...certificate,
  lang: "de" as const,
  title: "Zertifikat Agentic Engineering Training: Mara Beispiel",
  trainingTitle: `${company.name} Training (2 Tage)`,
  date: "12.–13. November 2026",
  topics: ["Spezifikation mit Agenten", "Tests zuerst", "Review-Schleifen", "Regeldateien"],
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

/** A training-offering onepager: an invented offering, placeholder prices, an invented testimonial,
 * no client marks. Each block onepager.css styles once. */
export const onepager = {
  lang: "de" as const,
  title: "Beispieltraining: Agenten im Teamalltag",
  html: `<header class="hero">
  <p class="claim">Ein Satz, der das Versprechen des Angebots trägt.</p>
  <h1 class="document-title">Beispieltraining: Agenten im Teamalltag</h1>
  <p class="intro">Zwei bis drei Sätze, für wen das Angebot ist und was sich nach ihm ändert. Der Text steht hier als Muster und beschreibt kein echtes Angebot.</p>
</header>
<div class="card tint facts">
  <div class="facts-key">
    <dl class="key-row">
      <div class="wide"><dt>Für wen</dt><dd>Teams, die mit Coding-Agenten anfangen</dd></div>
      <div><dt>Format</dt><dd>Zwei Tage, remote oder vor Ort</dd></div>
      <div><dt>Gruppe</dt><dd>8 bis 12 Teilnehmende</dd></div>
      <div><dt>Preis</dt><dd class="price-value">X.XXX € pro Person<span class="price-cap">höchstens XX.XXX € pro Team</span></dd></div>
    </dl>
    <p class="price-terms"><span class="price-note">Netto zzgl. USt. Jeder Betrag in diesem Muster ist ein Platzhalter.</span></p>
  </div>
  <dl class="details">
    <div><dt>Voraussetzung</dt><dd>Erste Erfahrung mit einem Coding-Agenten</dd></div>
    <div><dt>Hands-on</dt><dd>Übungen auf einer Beispiel-Codebasis</dd></div>
    <div><dt>Zuschnitt</dt><dd>Im Vorgespräch auf das Team</dd></div>
    <div><dt>Sprache</dt><dd>Deutsch oder Englisch</dd></div>
    <div><dt>Abschluss</dt><dd>Teilnahmezertifikat</dd></div>
    <div><dt>Einkauf und Recht</dt><dd><a class="url" href="https://example.com/einkauf">Vertrag und NDA</a></dd></div>
  </dl>
</div>
<div class="deliverable-banner">
  <h3>Was euer Team mitnimmt</h3>
  <ul>
    <li>Ein erster Workflow, den das Team selbst trägt</li>
    <li>Das Handout zum Training</li>
  </ul>
</div>
<div class="mentoring-section">
  <h2>Mentoring nach dem Training</h2>
  <p class="mentoring-why">Separat zu XXX € pro Stunde. Ein Absatz, wie die Begleitung nach dem Training läuft.</p>
</div>
<div class="module-grid">
  <div class="card module">
    <h3>Tag 1</h3>
    <h4>Grundlagen und erste Übungen</h4>
    <ul>
      <li><strong>Einstieg:</strong> was ein Agent im Alltag übernimmt</li>
      <li><strong>Spezifikation:</strong> die Aufgabe so stellen, dass sie prüfbar ist</li>
      <li><strong>Tests zuerst:</strong> der Agent arbeitet gegen ein Ziel</li>
    </ul>
  </div>
  <div class="card module">
    <h3>Tag 2</h3>
    <h4>Review und eigene Vorhaben</h4>
    <ul>
      <li><strong>Review:</strong> Ergebnisse des Agenten prüfen</li>
      <li><strong>Regeln:</strong> was das Team festhält</li>
      <li><strong>Eigene Vorhaben:</strong> echte Arbeit aus dem Backlog</li>
    </ul>
  </div>
</div>
<p class="path-note"><strong>Ein Hinweis zwischen den Blöcken:</strong> ein Satz, der eine Frage vorwegnimmt.</p>
<div class="planning">
  <h3>Gut zu wissen</h3>
  <dl>
    <div><dt>Tageszeiten</dt><dd>Nach Absprache</dd></div>
    <div><dt>Vorlauf</dt><dd>Nach Absprache</dd></div>
    <div><dt>Mehrere Teams</dt><dd>Team für Team in Wellen</dd></div>
    <div><dt>Absage</dt><dd>Wie im Angebot vereinbart</dd></div>
  </dl>
</div>
<div class="cover-box">
  <h3>Was abgedeckt ist</h3>
  <ul>
    <li>Ein Satz, was das Training abdeckt.</li>
    <li>Ein Satz, was es bewusst auslässt.</li>
  </ul>
</div>
<div class="testimonial">
  <p>„Ein erfundenes Zitat, ein bis zwei Sätze lang, wie’s eine Teilnehmerin nach dem Training sagen könnte.“</p>
  <cite>Mara Beispiel, Engineering Lead, Musterwerk AG</cite>
</div>
<div class="references">
  <p class="references-lead"><strong>Über den Anbieter</strong> Zwei Sätze über den Anbieter stehen hier als Platzhalter.</p>
</div>
<div class="closing">
  <div class="contact-footer">
    <div>
      <h2>Dieses Training für euer Team?</h2>
      <p>Erzählt uns von eurem Team, und wir schicken euch ein Angebot.</p>
    </div>
    <div class="cta-links">
      <a href="mailto:summon@hackersandwizards.dev">summon@hackersandwizards.dev</a><br />
      <a class="button" href="https://example.com/call">Gespräch buchen</a>
    </div>
  </div>
  <p class="legal">${escapeHtml(`${company.legal} · ${company.street} · ${company.postcode} ${company.city}`)} · <a href="https://hackersandwizards.dev">hackersandwizards.dev</a></p>
</div>`,
};

/** A preparation document for the attendees of an invented training. */
export const preparation = {
  lang: "de" as const,
  title: "Vorbereitung Training: Musterwerk",
  kind: "Vorbereitung",
  meta: ["12. und 13. November 2026", "Musterwerk AG, Hamburg"],
  eyebrow: "Agentic Engineering Training",
  heading: "Vorbereitung für das Training",
  note: {
    label: "Gut vorbereitet",
    html: `<p><strong>Einmal vorab, dann legen wir entspannt los.</strong> Spielt das Setup bis eine Woche vor dem Training einmal durch, dann bleibt Zeit für Fragen.</p>
<p class="it-line"><span class="chip it-chip">Für eure IT</span>Dürft ihr nicht selbst installieren, gebt diese Seite an eure IT weiter.</p>`,
  },
  steps: [
    {
      title: "Werkzeuge prüfen",
      html: `<p>Schaut, ob beides da ist: <code>node --version</code> und <code>git --version</code>.</p>
<div class="grid-2">
<div><span class="label">Windows</span><p class="small">In der PowerShell als Admin:</p><pre><code>choco install nodejs-lts git</code></pre></div>
<div><span class="label">Mac</span><p class="small">Im Terminal:</p><pre><code>brew install node git</code></pre></div>
</div>`,
    },
    {
      title: "Beispielprojekt starten",
      html: `<pre><code>git clone https://example.com/beispielprojekt.git
cd beispielprojekt
npm install
npm run dev</code></pre>
<p>Dann öffnet ihr <a href="http://localhost:3000">http://localhost:3000</a>.</p>`,
    },
    {
      title: "Coding-Agent bereit",
      html: `<p>Startet euren Coding-Agenten im Projektordner und stellt ihm eine Frage.</p>
<p class="small muted">Beim ersten Start meldet ihr euch mit eurem Firmenzugang an.</p>`,
    },
  ],
  closing: `<p>Bis bald, ich freue mich. <strong>Mara</strong> <span class="muted">· mara@example.com</span></p>`,
};

/** A delivery briefing as pandoc writes the Markdown: hard facts, soft facts, open items. */
export const deliveryBriefingHtml = `<h1>Delivery Briefing: Musterwerk Training</h1>
<p class="subtitle">What the trainer needs to know before the first day, from the records.</p>
<h2>Hard facts</h2>
<dl><dt>Dates</dt><dd>12 and 13 November 2026, 09:00 to 17:00</dd><dt>Place</dt><dd>On site, Hamburg</dd><dt>Group</dt><dd>12 developers, one team</dd><dt>Stack</dt><dd>TypeScript, a monorepo</dd></dl>
<h2>Soft facts</h2>
<ul><li>The team has used a coding agent for a few weeks, each person in their own way.</li><li>The team lead wants shared rules more than speed.</li></ul>
<h2>What is special here</h2>
<p>An invented paragraph: the exercises run on a copy of the team's codebase.</p>
<h2>Open items</h2>
<table><thead><tr><th>Item</th><th>Owner</th></tr></thead><tbody><tr><td>Licences for every attendee</td><td>Client</td></tr><tr><td>Room with a projector</td><td>Client</td></tr></tbody></table>`;

/** A trainer briefing's body as the deal page's button builds it, in English; its date goes under
 * the tag as DocMarkdown's `meta`. */
export const trainerBriefingHtml = `<span class="eyebrow">Trainer Briefing</span>
<h1>Musterwerk AG</h1>
<h2>Hard Facts</h2>
<p><strong>Location:</strong> On site, Hamburg<br /><strong>Language:</strong> German<br /><strong>Programming languages:</strong> TypeScript<br /><strong>Planned group size:</strong> 12</p>
<h2>Training Content</h2>
<p><strong>Tools:</strong> the team's own coding agent<br /><strong>Level:</strong> first weeks with agents</p>
<h2>Open Decisions</h2>
<ul><li>Which repository the exercises use</li></ul>`;

/** A training handout: an invented training, three chapters with each element a handout styles
 * (margin note, key box, code, table, the ruled notes), the cover with a recipient. */
export const handout = {
  title: "Example Training: Agents in Team Practice",
  client: "Musterwerk 2026-11",
  subtitle: "What we covered, to look up again when you work with your agent.",
  company: "Musterwerk AG",
  date: "November 12, 2026",
  toc: [2, 3, 4],
  chapters: [
    {
      title: "How an Agent Works",
      html: `<p>An invented chapter: an agent reads, plans, acts and checks, in a loop, until the task is done or it stops to ask.</p>
<aside class="margin-note"><strong>Remember:</strong> the loop is only as good as the check that ends it.</aside>
<p>Each turn the agent sees the files it opened, the commands it ran and what they printed. What it never saw, it cannot know.</p>
<div class="keybox"><p><strong>Key point:</strong> give the agent a check it can run, and it corrects itself.</p></div>
<h2>A first run</h2>
<p>Start the agent in the project folder and ask it to explain the build:</p>
<pre><code>$ agent "explain how this project builds and tests"</code></pre>
<p>A hook runs the check after every edit, highlighted as the hub's Markdown sets it (Shiki with the brand's code palette as classes):</p>
<pre class="astro-code hw-code" tabindex="0" data-language="ts"><code><span class="line"><span class="hw-code-comment">// The check the agent cannot skip</span></span>
<span class="line"><span class="hw-code-keyword">const</span><span> check </span><span class="hw-code-keyword">=</span><span> </span><span class="hw-code-string">"bun run check"</span><span>;</span></span>
<span class="line"><span class="hw-code-keyword">export default</span><span> { hooks: { afterEdit: [check] } };</span></span></code></pre>`,
    },
    {
      title: "Rules the Team Shares",
      html: `<p>Rules written once apply to every session. Where they live decides who reads them.</p>
<table><thead><tr><th>File</th><th>Read by</th></tr></thead><tbody><tr><td>Project rules</td><td>Every session in the repository</td></tr><tr><td>Personal rules</td><td>Your own sessions only</td></tr></tbody></table>
<h2>Keep them short</h2>
<p>A rule the agent follows without being told goes. A rule that names a measured number stays.</p>`,
    },
    {
      title: "Notes",
      html: `<p>Space for your own notes from the training.</p>
<div class="note-lines" data-lines="12"></div>`,
    },
  ],
};
