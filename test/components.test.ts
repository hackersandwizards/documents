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

// § 35a GmbHG puts legal form and seat on business letters: every document issued as the GmbH names
// both in the imprint's first line, and nothing stands beside the lockup.
test.each([
  [
    "DocProposal",
    { ...proposal, lang: "en" },
    "hackers&amp;wizards GmbH, registered office Hamburg",
  ],
  ["DocLeistungsnachweis", props.DocLeistungsnachweis, "hackers&amp;wizards GmbH, Sitz Hamburg"],
  ["DocRateCard", props.DocRateCard, "hackers&amp;wizards GmbH, Sitz Hamburg"],
  ["DocMarkdown", { ...props.DocMarkdown, legal: true }, "hackers&amp;wizards GmbH, Sitz Hamburg"],
])(
  "%s names the legal entity and its seat in the imprint",
  async (name, componentProps, entity) => {
    const html = await composer.render(name, componentProps as Record<string, unknown>);
    expect(html).toMatch(new RegExp(`class="company-meta"[^>]*>\\s*${entity}`));
    expect(html).not.toContain('class="legal"');
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
