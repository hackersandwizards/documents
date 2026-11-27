import { defined } from "@hackersandwizards/scaffolding/defined";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { city, postcode, street } from "@hackersandwizards/brand/imprint.json";
import { name } from "@hackersandwizards/brand/verbal.json";
import { brandCompany, brandFile, brandName, stripComments } from "../scripts/root";
import { foreignStyles, rawInlineStyles, rawValues } from "../scripts/styles";

vi.mock("node:fs", { spy: true });

const ROOT = join(import.meta.dirname, "..");
const STYLESHEETS = ["document.css", "onepager.css", "handout.css", "readout.css"];
const COMPONENTS = readdirSync(join(ROOT, "components")).filter((f) => f.endsWith(".astro"));

function css(file: string): string {
  const text = readFileSync(join(ROOT, file), "utf8");
  if (!file.endsWith(".astro")) return text;
  return [...text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
}

// @page reads no custom property: each named page box's top margin is brand's token, typed again.
it("the handout's page boxes take brand's top margin", () => {
  const brand = readFileSync(brandFile("document.css"), "utf8");
  const top = defined(
    /--handout-margin-top:\s*([\d.]+mm);/.exec(brand),
    "brand handout top margin",
  )[1];
  const tokens = readFileSync(join(ROOT, "tokens.css"), "utf8");
  for (const box of ["handout", "opening"])
    expect(new RegExp(`@page ${box} \\{\\s*margin-top: ([\\d.]+mm);`).exec(tokens)?.[1]).toBe(top);
});

describe("tokens", () => {
  for (const file of [...STYLESHEETS, ...COMPONENTS.map((f) => `components/${f}`)])
    it(`${file} names tokens only`, () => {
      expect(rawValues(css(file))).toEqual([]);
    });

  for (const file of [...COMPONENTS.map((f) => `components/${f}`), "scripts/survey-readout.ts"])
    it(`${file} sets inline only custom properties`, () => {
      expect(rawInlineStyles(readFileSync(join(ROOT, file), "utf8"))).toEqual([]);
    });

  it("control: every kind of raw value is caught, a token and a comment are not", () => {
    expect(
      rawValues(
        `/* 4pt */ a { margin: 4pt 1.5mm; color: #fff; background: rgb(0 0 0); border: 0 solid white;
         font: var(--role-body); padding: var(--space-6); width: 100%; font-weight: 600;
         line-height: 1.5; color: var(--color-ink); content: "12pt"; }`,
      ),
    ).toEqual([
      "length: 4pt",
      "length: 1.5mm",
      "colour: #fff",
      "colour: rgb(",
      "named colour: : 0 solid white",
      "brand token: var(--color-",
      "weight: font-weight: 6",
      "leading: line-height: 1.5",
    ]);
    // A "/*" or an escaped quote inside a string hides no value after it.
    expect(
      rawValues(`a { content: "/*"; width: 12pt; } b { content: "\\" /*"; width: 3mm; } /* c */`),
    ).toEqual(["length: 12pt", "length: 3mm"]);
    expect(rawInlineStyles(`<b style="--share: 4%"></b><i style="width: 4%"></i>`)).toEqual([
      "width: 4%",
    ]);
    // Viewport and root-line units, a weight inside the font shorthand, a named colour outside
    // the first few, and a single-quoted literal in an Astro expression.
    expect(
      rawValues(
        `a { height: 2dvh; width: 3vmin; margin: 1rlh; font: italic 600 var(--x); color: orange; }`,
      ),
    ).toEqual([
      "length: 2dvh",
      "length: 3vmin",
      "length: 1rlh",
      "named colour: : orange",
      "weight: font: italic 6",
    ]);
    expect(rawInlineStyles(`<b style={'width: 4%'}></b>`)).toEqual(["width: 4%"]);
  });
});

describe("stylesheet checks", () => {
  it("ignores CSS comments, quoted content and URL paths but reports declarations beside them", () => {
    const css = String.raw`/* stray " 9pt */ p:after { content: '" color:red \' "';
      background: url(images/3px.png); width: 2px; content: "a\" color:blue"; }`;
    expect(rawValues(css)).toEqual(["length: 2px"]);
  });

  it("reads inline styles across HTML and Astro source and skips entire script and style blocks", () => {
    const source =
      '<script type="module">const demo = \'<p style="color:red">x</p>\';</script>' +
      '<style media="print">p::before { content: \'<p style="color:blue">\'; }</style>' +
      "<i STYLE = '  width: 4%;  '>a</i><i style=height:3pt>b</i>" +
      '<i style={enabled ? { css: `color:green` }.css : "font-weight: 600"}>c</i>' +
      '<i style=" --band: green; color:blue ">d</i><i style=" --band: green; --share: 4%; ">e</i>';
    expect(rawInlineStyles(source)).toEqual([
      "width: 4%;",
      "height:3pt",
      "color:green",
      "font-weight: 600",
      "--band: green; color:blue",
    ]);
  });

  it("reports each foreign style with the element or declarations a document author can find", () => {
    const html =
      '<style data-hw-page></style><style media="print" id="extra"></style>' +
      '<link rel="alternate stylesheet" href="extra.css" disabled>' +
      '<div id="sample" style="--band: green&#59; margin: 0; color: red; "></div>';
    expect(foreignStyles(html)).toEqual([
      'The document contains a style element the engine did not write: <style media="print" id="extra">. Move the CSS into the document type\'s engine stylesheet and recompose the document.',
      'The document links a stylesheet without an allowed brand href: <link rel="alternate stylesheet" href="extra.css" disabled>. Remove the link or set href to a relative path to a brand stylesheet such as print.css.',
      'The document sets unsupported inline properties margin, color in style="--band: green; margin: 0; color: red; ". Keep only engine-supported custom properties in style and move the other declarations into the document type\'s engine stylesheet.',
    ]);
  });

  it("handles stylesheet relationships and brand links as a browser reads them", () => {
    const html =
      '<link rel=" ALTERNATE\tSTYLESHEET " href=" ../@hackersandwizards/brand/print.css ">' +
      '<link rel="stylesheet" href="../@hackersandwizards/brand&#47;print.css">' +
      '<link rel="icon" href="icon.svg">' +
      '<link href="alternate.html">';
    expect(foreignStyles(html)).toEqual([]);
    expect(foreignStyles('<link rel="stylesheet" href="../@hackersandwizards/brand/%">')).toEqual([
      'The document links a stylesheet without an allowed brand href: <link rel="stylesheet" href="../@hackersandwizards/brand/%">. Remove the link or set href to a relative path to a brand stylesheet such as print.css.',
    ]);
    expect(foreignStyles('<link rel="stylesheet">')).toEqual([
      'The document links a stylesheet without an allowed brand href: <link rel="stylesheet">. Remove the link or set href to a relative path to a brand stylesheet such as print.css.',
    ]);
  });

  it("accepts custom properties and a stylesheet relationship split by repeated whitespace", () => {
    const html =
      '<link rel="alternate \t stylesheet" href="../@hackersandwizards/brand/print.css">' +
      '<figure style=" --mark-height: 20px; --mark-scale: 1; "></figure><i style></i>';
    expect(foreignStyles(html)).toEqual([]);
    expect(rawInlineStyles(html)).toEqual([]);
  });

  it("sees declarations with intervening comments and ignores CSS examples carried as strings", () => {
    const css = String.raw`p {
      font-weight:/* strong */600;
      content: '""'; content: '" /* note \' end */'; content: '/* note */';
      content: "before \" after /* note */";
      line-height: 2;
    }`;
    expect(rawValues(css)).toEqual(["weight: font-weight:6", "leading: line-height: 2"]);
  });
});

describe("document resources", () => {
  it("removes stylesheet comments while preserving quoted text and selector spacing", () => {
    const css = String.raw`/* heading */
main /* standalone */ p/* adjacent */ a { content: "say \"/* quoted */\""; color:red; /* shade */ }
i { content: '/* literal \' text */'; }`;
    expect(stripComments(css))
      .toBe(String.raw`main p a { content: "say \"/* quoted */\""; color:red; }
i { content: '/* literal \' text */'; }`);
  });

  it("reads the current brand name and address for document headers and imprints", () => {
    const names = { name: name.company, legal: name.legal };
    expect(brandName()).toEqual(names);
    expect(brandCompany()).toEqual({ ...names, city, postcode, street });
  });

  it.each(["null", "[]"])("names the source when brand facts contain %s", (contents) => {
    const read = vi.mocked(readFileSync).mockReturnValueOnce(contents);
    try {
      expect(() => brandName()).toThrow(
        "The documents engine needs a JSON object in the brand package's verbal.json to read its facts. Restore the object in verbal/verbal.json in the brand package source.",
      );
    } finally {
      read.mockReset();
    }
  });
  it.each([
    {
      key: "name.company",
      readFacts: brandName,
      contents: '{"name":{"legal":"Example"}}',
      file: "verbal.json",
    },
    {
      key: "name.legal",
      readFacts: brandName,
      contents: '{"name":{"company":"Example"}}',
      file: "verbal.json",
    },
    {
      key: "street",
      readFacts: brandCompany,
      contents: '{"postcode":"example","city":"example"}',
      file: "imprint.json",
    },
    {
      key: "postcode",
      readFacts: brandCompany,
      contents: '{"street":"example","city":"example"}',
      file: "imprint.json",
    },
    {
      key: "city",
      readFacts: brandCompany,
      contents: '{"street":"example","postcode":"example"}',
      file: "imprint.json",
    },
  ])("points to the missing $key fact", ({ key, readFacts, contents, file }) => {
    const read = vi.mocked(readFileSync).mockReturnValueOnce(contents);
    try {
      expect(readFacts).toThrow(
        `The documents engine requires a string at ${key} in the brand package's ${file}. Restore that key as a string in verbal/${file} in the brand package source.`,
      );
    } finally {
      read.mockReset();
    }
  });
});
