import { afterAll, beforeAll, expect, test } from "bun:test";
import verbal from "@hackersandwizards/brand/verbal.json";
import { decodeHTML } from "entities";
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { openComposer } from "../scripts/compose";
import { withElements } from "../scripts/elements";
import { cssString } from "../scripts/fill";
import { HANDOUT_TEXT } from "../scripts/handout";
import { handout } from "../scripts/samples";

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
  DocElements: {},
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
    // The header and the certificate draw their strip as brand's element, not a hand-drawn gradient.
    if (["DocHeader", "DocCertificate"].includes(name))
      expect(html).toContain('class="strip hw-strip"');
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

test("DocProposal prints its tiers and signature lines, and an outcome without measures alone", async () => {
  const plain = await composer.render("DocProposal", proposal);
  expect(plain).not.toContain('class="tiers');
  expect(plain).not.toContain('class="signatures');
  expect(plain).toContain("Woran ihr es messt");
  expect(plain).toContain('class="acceptance');
  const html = await composer.render("DocProposal", {
    ...proposal,
    price: {
      ...proposal.price,
      tiers: {
        heading: "[TIERS]",
        columns: [P, P],
        rows: [{ item: "[TIER]", cells: [{ list: "[LIST]", offer: "[OFFER]" }] }],
        note: "[TIER-NOTE]",
      },
    },
    outcome: { result: "[RESULT]" },
    signatures: [{ label: P, party: "[PARTY]", name: "[SIGNER]" }],
  });
  for (const text of ["[TIERS]", "[TIER]", "[LIST]", "[OFFER]", "[TIER-NOTE]", "[PARTY]"])
    expect(html).toContain(text);
  expect(html).toContain("Unterschrift: [SIGNER]");
  expect(html).toContain('class="tiers');
  expect(html).toContain('class="signatures');
  expect(html).not.toContain("Woran ihr es messt");
  expect(html).not.toContain('class="acceptance');
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

// About us closes on brand's mission, read from its verbal.json; labels.aboutText is the control.
test.each(["de", "en"] as const)("DocProposal %s prints brand's mission", async (lang) => {
  const text = async (props: object) =>
    decodeHTML(await composer.render("DocProposal", { ...proposal, lang, ...props }));
  expect(await text({})).toContain(verbal.mission[lang]);
  expect(await text({ labels: { aboutText: [P] } })).not.toContain(verbal.mission[lang]);
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
  [
    "DocMarkdown",
    { ...props.DocMarkdown, legal: true, lang: "en" },
    "Registered office and court Hamburg, HRB 198840",
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

// A consumer reads the handout's words from HANDOUT_TEXT, so these are the words it prints.
test.each(["de", "en"] as const)("DocHandout %s prints HANDOUT_TEXT's words", async (lang) => {
  const html = await composer.render("DocHandout", {
    ...props.DocHandout,
    lang,
    company: P,
    date: P,
  });
  const { noCompany, noDate, runningBrand, ...printed } = HANDOUT_TEXT[lang];
  for (const word of Object.values(printed)) expect(html).toContain(word);
  // The lockup's alt text names the brand too: the running head's word is read in its margin box.
  expect(html).toContain(`@top-left { content: ${cssString(runningBrand)};`);
  // Company and date are both given, so neither placeholder prints.
  for (const placeholder of [noCompany, noDate]) expect(html).not.toContain(placeholder);
});

// The hub renders the handout in its own Astro route, without composePage: the handout maps the
// brand's elements itself, and Shiki's code palette classes survive the style rule.
test("DocHandout carries the brand's elements and the code palette's classes", async () => {
  const html = await composer.render("DocHandout", handout);
  for (const cls of ["hw-pill", "hw-table", "hw-code", "hw-code-keyword", "hw-code-string"])
    expect(html).toContain(cls);
  expect(html).not.toMatch(/<span[^>]* style=/);
});

// The lump-sum and rounding notes print as muted lines, never in the brand's callout box.
test("DocLeistungsnachweis notes take no callout", async () => {
  const html = await composer.render("DocLeistungsnachweis", {
    ...props.DocLeistungsnachweis,
    lumpSumQuote: P,
    rounding: "[ROUNDING]",
    rows: [{ ...row, billed: P }],
    totalBilled: P,
  });
  const out = withElements(html);
  expect(out).toContain("[ROUNDING]");
  expect(out).not.toContain("hw-callout");
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
