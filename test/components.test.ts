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
  price: { rows: [{ item: P, basis: P, rate: P, amount: P }], subtotal: P, vat: P, gross: P },
  scopeHeadline: P,
  services: [{ name: P, items: [P] }],
  community: { price: P },
  sequence: { headline: P, steps: [{ when: P, name: P }] },
  outcome: { result: P, measures: P },
  terms: [{ title: P, paragraphs: [P] }],
  signOff: P,
  personName: P,
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
