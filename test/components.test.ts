import { afterAll, beforeAll, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { openComposer } from "../scripts/compose";

// Every document component renders standalone, through Astro's compiler, from this repository and
// the brand package alone: an import of an app's internals fails here. Placeholder props, no figure
// or term of ours.
const ROOT = resolve(import.meta.dir, "..");
const components = readdirSync(join(ROOT, "components"))
  .filter((f) => f.endsWith(".astro"))
  .map((f) => f.replace(/\.astro$/, ""));

const P = "[PLACEHOLDER]";
const row = { date: "01.01.", day: "Mo", time: "09:00 – 10:00", hours: "1,00", activity: P };
const proposal = {
  lang: "de",
  title: P,
  number: P,
  date: P,
  validUntil: P,
  clientShort: P,
  eyebrow: P,
  heading: P,
  subtitle: P,
  salutation: P,
  greeting: [P],
  client: { company: P, lines: [P] },
  contact: P,
  price: {
    rows: [{ item: P, basis: P, rate: P, amount: P }],
    subtotal: P,
    vat: P,
    vatLabel: "[VAT-LABEL]",
    gross: P,
  },
  scopeHeadline: P,
  services: [{ name: P, items: [P] }],
  community: { price: P, meta: "[COMMUNITY-META]" },
  sequence: { headline: P, steps: [{ when: P, name: P }] },
  outcome: { result: P, measures: P },
  terms: [{ title: P, paragraphs: [P] }],
  signOff: P,
  personName: P,
  orderTerm: "[ORDER-TERM]",
};
const props: Record<string, Record<string, unknown>> = {
  DocAgreement: {
    lang: "de",
    title: P,
    date: P,
    heading: P,
    parties: [{ label: P, company: P, lines: [P] }],
    clauses: [{ title: P, html: `<p>${P}</p>` }],
    signatures: [{ label: P, party: P, name: P }],
    counterparty: P,
  },
  DocCallout: { title: P },
  DocCard: { title: P },
  DocCertificate: {
    lang: "en",
    title: P,
    attendeeName: P,
    trainingTitle: P,
    date: P,
    topics: [P],
    signers: [{ name: P, title: P, image: "" }],
  },
  DocClosing: { text: P, signOff: P, name: P },
  DocConfirmation: { label: P, text: P, line: P },
  DocHandout: { title: P, subtitle: P, chapters: [{ title: P, html: `<p>${P}</p>` }] },
  DocHeader: { kind: P, legal: true },
  DocLead: {},
  DocLeistungsnachweis: {
    periodLabel: P,
    clientShort: P,
    created: P,
    client: P,
    employee: P,
    period: P,
    rows: [row],
    total: P,
  },
  DocMarkdown: { kind: P, html: `<p>${P}</p>` },
  DocOnepager: { lang: "de", html: `<p>${P}</p>` },
  DocPreparation: { title: P, kind: P, heading: P, steps: [{ title: P, html: `<p>${P}</p>` }] },
  DocPriceTable: {
    columns: [{ label: P }, { label: P, num: true }],
    rows: [{ item: P, cells: [P] }],
  },
  DocProposal: proposal,
  DocProse: { html: `<p>${P}</p>` },
  DocRateCard: {
    personName: P,
    date: P,
    validUntil: P,
    year: P,
    opener: P,
    recipientFirstName: P,
    greeting: P,
    client: { company: P, shortName: P, recipientName: P, street: P, zip: P, city: P },
    rates: [{ item: P, detail: P, unit: P, rate: P }],
    terms: [P],
    scope: [P],
    closing: P,
    signOff: P,
  },
  DocRecipient: { label: P, company: P, lines: [P] },
  DocSectionHead: { title: P },
  DocSignatures: { signatures: [{ label: P, party: P, name: P }], placeDate: P, signature: P },
  DocSteps: { steps: [{ when: P, name: P }] },
  DocTitle: { title: P },
  DocTotalRow: { label: P, span: 1, figures: [P] },
};

let composer: Awaited<ReturnType<typeof openComposer>>;
beforeAll(async () => {
  composer = await openComposer(ROOT);
});
afterAll(() => composer?.close());

test("every component has placeholder props here", () => {
  expect([...components].sort()).toEqual(Object.keys(props).sort());
});

test.each(components)(
  "%s renders standalone",
  async (name) => {
    const html = await composer.render(name, props[name], {
      default: `<p>${P}</p>`,
      aside: `<p>${P}</p>`,
    });
    expect(html).toContain(P);
    if (["DocHeader", "DocProposal", "DocRateCard", "DocMarkdown"].includes(name))
      expect(html).toMatch(/data:image\/svg\+xml;base64,/);
  },
  30_000,
);

// validUntil and subtotal are optional: the trainer variant and a price-free proposal leave them out.
test.each(["de", "en"])(
  "DocProposal %s without validUntil or subtotal prints no undefined",
  async (lang) => {
    const html = await composer.render("DocProposal", {
      ...proposal,
      validUntil: undefined,
      lang,
      price: { rows: [{ item: P, basis: P }] },
    });
    expect(html).toContain(P);
    expect(html).not.toContain("undefined");
  },
);

test("DocProposal prints the amount of a fixed-price row that has no rate", async () => {
  const html = await composer.render("DocProposal", {
    ...proposal,
    price: { rows: [{ item: P, basis: "Pauschal", amount: "X.XXX €" }] },
  });
  expect(html).toContain("X.XXX €");
  expect(html).not.toContain("undefined");
});

// The VAT label, the community's access and the order by reply are terms, so the props carry them.
test.each(["de", "en"])("DocProposal %s prints its terms from props only", async (lang) => {
  const html = await composer.render("DocProposal", { ...proposal, lang });
  for (const term of ["[VAT-LABEL]", "[COMMUNITY-META]", "[ORDER-TERM]"])
    expect(html).toContain(term);
  expect(html).not.toMatch(/19.?%|kostenlos|Lifetime|Unterschrift|signature/);
  await expect(
    composer.render("DocProposal", {
      ...proposal,
      price: { ...proposal.price, vatLabel: undefined },
    }),
  ).rejects.toThrow("vatLabel");
});

test("styles() returns each scoped style once, however often it is called", async () => {
  await composer.render("DocCertificate", props.DocCertificate);
  expect(await composer.styles()).toBe(await composer.styles());
});

// § 35a GmbHG puts legal form, seat, register court and number and every managing director on
// business letters: every document issued as the GmbH carries them in the imprint, each fact once.
test.each([
  ["DocProposal", { ...proposal, lang: "en" }, "Registered office and court Hamburg, HRB 198840"],
  [
    "DocLeistungsnachweis",
    props.DocLeistungsnachweis,
    "Sitz und Registergericht Hamburg, HRB 198840",
  ],
  ["DocRateCard", props.DocRateCard, "Sitz und Registergericht Hamburg, HRB 198840"],
  ["DocAgreement", props.DocAgreement, "Sitz und Registergericht Hamburg, HRB 198840"],
  [
    "DocMarkdown",
    { ...props.DocMarkdown, legal: true },
    "Sitz und Registergericht Hamburg, HRB 198840",
  ],
])(
  "%s carries the imprint of § 35a GmbHG",
  async (name, componentProps, register) => {
    const html = await composer.render(name, componentProps as Record<string, unknown>);
    const imprint = html.match(/class="company-meta"[^>]*>([\s\S]*?)<\/div>/)?.[1] ?? "";
    expect(imprint).toContain("hackers&amp;wizards GmbH");
    expect(imprint).toContain(register);
    expect(imprint).toContain("Benedikt Stemmildt, Stefan Munz");
    expect(imprint.match(/Hamburg/g)).toHaveLength(2);
  },
  30_000,
);

// Every word a component prints itself is a prop with today's text as its default: a reverse-charge
// offer sets the acceptance's total line, an English timesheet every label.
test.each([
  ["DocProposal", proposal, "totalValue", "netto zzgl. USt."],
  ["DocRateCard", props.DocRateCard, "terms", "Konditionen"],
  ["DocLeistungsnachweis", props.DocLeistungsnachweis, "confirmation", "Bestätigung des Kunden"],
  ["DocCertificate", props.DocCertificate, "preamble", "This is to certify that"],
  ["DocHandout", props.DocHandout, "contents", "Contents"],
])("%s takes `labels.%s` in place of its default", async (name, componentProps, key, text) => {
  const base = componentProps as Record<string, unknown>;
  expect(await composer.render(name, base)).toContain(text);
  const html = await composer.render(name, { ...base, labels: { [key]: "[LABEL]" } });
  expect(html).toContain("[LABEL]");
  expect(html).not.toContain(text);
});

// A running head's text lands in a raw <style>: a caller's `</style>` must stay inside it.
test.each([
  ["DocProposal", { ...proposal, clientShort: "</style><b>x" }],
  [
    "DocRateCard",
    {
      ...props.DocRateCard,
      client: { ...(props.DocRateCard.client as object), shortName: "</style><b>x" },
    },
  ],
  ["DocLeistungsnachweis", { ...props.DocLeistungsnachweis, clientShort: "</style><b>x" }],
  ["DocHandout", { ...props.DocHandout, client: "</style><b>x" }],
])("%s keeps a running head's text inside its style element", async (name, componentProps) => {
  const html = await composer.render(name, componentProps as Record<string, unknown>);
  expect(html).not.toContain("</style><b>x");
});

// An agreement is a contract with parties or a letter with a recipient, never both; its clauses
// number themselves.
test("DocAgreement numbers its clauses and takes one form", async () => {
  const two = {
    ...props.DocAgreement,
    clauses: [
      { title: "A", html: "<p>a</p>" },
      { title: "B", html: "<p>b</p>" },
    ],
  };
  const html = await composer.render("DocAgreement", two);
  expect(html).toContain("§ 1 A");
  expect(html).toContain("§ 2 B");
  const letter = { recipient: { label: P, company: P, lines: [P] }, greeting: [P] };
  await expect(composer.render("DocAgreement", { ...props.DocAgreement, letter })).rejects.toThrow(
    "either parties or letter",
  );
});
