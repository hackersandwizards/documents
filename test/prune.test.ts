import { defined } from "@hackersandwizards/scaffolding/defined";
import { describe, expect, it, test } from "vitest";
import {
  attributeMatches,
  bareSelectorMatches,
  cssItemDelimiters,
  pruneStyles,
  skipQuotedString,
} from "../scripts/prune";

const page = (css: string, body: string) =>
  `<html><head><style>${css}</style></head><body>${body}</body></html>`;
const styles = (html: string) =>
  defined(/<style>([\s\S]*)<\/style>/.exec(html), "style element")[1];

describe("pruneStyles", () => {
  const body = '<main id="top" data-Mode="on"><p class="kept">x</p></main>';

  it("drops each rule needing a class, id or element the markup carries nowhere", () => {
    const css = ".gone{color:red}#away{color:red}table td{color:red}.kept .gone{color:red}";
    expect(styles(pruneStyles(page(css, body)))).toBe("");
  });

  it("control: keeps a rule one of whose selectors can match, whatever its pseudo-classes test", () => {
    const css =
      ".gone,.kept{color:red}#top>p{color:red}main :not(.gone){color:red}" +
      'p:has(.gone)::before{content:"x"}[data-mode] .kept:hover{color:red}html{color:red}' +
      ':where([data-gone], .kept){color:red}:not([data-gone]){color:red}[DATA-MODE="off"]{color:red}' +
      '[open]{color:red}:is([data-gone=")"], .kept){color:red}[data-mode="[gone]"]{color:red}' +
      "p[srcset]{color:red}";
    expect(styles(pruneStyles(page(css, body)))).toBe(css);
  });

  it("drops each rule testing an attribute no element carries, inside :is() and :where() too", () => {
    const css =
      '[data-gone]{color:red}.kept[data-gone="x"]{color:red}:where([data-gone] [data-mode]){color:red}' +
      ":is(.gone, [data-gone]) .kept{color:red}";
    expect(styles(pruneStyles(page(css, body)))).toBe("");
  });

  it("keeps an emptied @layer block, whose position orders the layers, and drops an emptied @media", () => {
    const css = "@layer components{.gone{color:red}}@media print{.gone{color:red}}@page{margin:0}";
    expect(styles(pruneStyles(page(css, body)))).toBe("@layer components{}@page{margin:0}");
  });

  it("drops each custom property nothing reads, down the chain of properties it alone read", () => {
    const css = ":root{--a:1;--b:var(--a);--c:2;--d:3;--e:on;--f:4}.kept{color:var(--c)}";
    const out = styles(
      pruneStyles(
        page(
          css + "@container style(--e: on){.kept{color:red}}",
          '<p class="kept" style="width: var(--d)">x</p>',
        ),
      ),
    );
    expect(out).toBe(
      ":root{--c:2;--d:3;--e:on}.kept{color:var(--c)}" +
        "@container style(--e: on){.kept{color:red}}",
    );
  });

  it("keeps a rule on an element the parser adds, and the inlined data as it was", () => {
    const face = "url(data:font/woff2;base64,d09GMgABAAAAA+/=)";
    const css = `tbody td{color:red}body td{color:red}@font-face{src:${face}}`;
    expect(styles(pruneStyles(page(css, "<table><tr><td>1</td></tr></table>")))).toBe(css);
  });

  it("leaves a page holding a script or an event handler whole, since either may add a class", () => {
    const html = page(".gone{color:red}", "<p>x</p><script>1</script>");
    expect(pruneStyles(html)).toBe(html);
    const handler = page(".gone{color:red}", `<p onclick="this.className='gone'">x</p>`);
    expect(pruneStyles(handler)).toBe(handler);
    // Any type but a data block's may run: the browser knows more script types than a list here.
    const legacy = page(".gone{color:red}", '<script type="application/x-javascript">1</script>');
    expect(pruneStyles(legacy)).toBe(legacy);
  });

  it("prunes beside a data block, which runs nothing", () => {
    const html = page(".gone{color:red}", '<p>x</p><script type="application/json">{}</script>');
    expect(styles(pruneStyles(html))).toBe("");
  });

  it("keeps a rule on a class or id beyond ASCII, and on a row or column group the parser adds", () => {
    const css = ".größe{color:red}#maß{color:red}tr{color:red}colgroup{color:red}";
    expect(
      styles(
        pruneStyles(page(css, '<p class="größe" id="maß">x</p><table><col><td>1</td></table>')),
      ),
    ).toBe(css);
    expect(styles(pruneStyles(page(".größer{color:red}", '<p class="größe">x</p>')))).toBe("");
  });

  it("preserves punctuation inside strings, functions and attribute selectors", () => {
    const css = String.raw`p[data-caption="a,b"],.gone{content:"a\"b}";font-family:'it\'s;fine';width:calc(100% - 1em)}`;
    const html = `<style media="print">${css}.gone{color:red}</style><p data-caption="a,b">x</p>`;
    expect(pruneStyles(html)).toBe(
      `<style media="print">${css}</style><p data-caption="a,b">x</p>`,
    );
  });

  it("keeps CSS statements, keyframes and rules inside a matching feature query", () => {
    const declarations = "@layer components,utilities;@keyframes fade{to{opacity:1}}";
    const query = "@supports (display:grid)";
    const matching = "p{display:grid}";
    const css = `${declarations}${query}{.gone{display:grid}${matching}}`;
    expect(styles(pruneStyles(page(css, "<p>x</p>")))).toBe(`${declarations}${query}{${matching}}`);
  });

  it("examines nested selector lists and leaves escaped selectors for the browser", () => {
    const kept = String.raw`:is(.gone,:where(.other,p)){color:red}.\31 23{color:red}p::first-line{color:red}`;
    const gone = ":is(.gone,:where(.other,article)) span{color:red}article:not(.gone){color:red}";
    expect(styles(pruneStyles(page(`${gone}${kept}`, '<p class="123">x</p>')))).toBe(kept);
  });

  it("keeps the properties a rule reads and drops similarly named unused declarations", () => {
    const css =
      ":root{ --tone:blue; --tone-print : red; --other-tone: green }p{color:var(--tone-print)}";
    expect(styles(pruneStyles(page(css, "<p>x</p>")))).toBe(
      ":root{ --tone-print : red}p{color:var(--tone-print)}",
    );
  });

  it("adds implied table selectors only for a document with the corresponding cells or columns", () => {
    const columns = "colgroup col{width:10%}";
    const rows = "tr td{font-weight:bold}";
    expect(styles(pruneStyles(page(columns + rows, "<table><col></table>")))).toBe(columns);
    expect(styles(pruneStyles(page(columns + rows, "<p>x</p>")))).toBe("");
  });

  it("keeps every inlined asset intact when a page holds more than ten", () => {
    const images = Array.from(
      { length: 12 },
      (_, n) => `<img src="data:image/png;base64,${Buffer.from(`image ${n}`).toString("base64")}">`,
    ).join("");
    expect(pruneStyles(page(".gone{color:red}", images))).toBe(page("", images));
  });

  it("leaves module scripts whole and prunes beside ordinary attributes", () => {
    const css = ".gone{color:red}.kept{color:red}";
    const body = '<p class="kept" data-on="on">x</p>';
    expect(styles(pruneStyles(page(css, body)))).toBe(".kept{color:red}");
    const modulePage = page(css, `${body}<script type="module">1</script>`);
    expect(pruneStyles(modulePage)).toBe(modulePage);
  });

  it("keeps strings and URLs that contain CSS punctuation without swallowing the next rule", () => {
    const label = String.raw`p{content:'it\'s };--unused:label';font-weight:bold}`;
    const image = "p{background-image:url(images/ink{print}.png)}";
    const next = "p{display:block}";
    const css = `${label}${image}.gone{color:red}${next}`;
    expect(styles(pruneStyles(page(css, "<p>x</p>")))).toBe(`${label}${image}${next}`);
  });

  it("keeps source whitespace out of pruned rules and preserves a layer order statement", () => {
    const css = "\n @layer base, print;\n p {color:red}\n .gone {color:red}\n";
    expect(styles(pruneStyles(page(css, "<p>x</p>")))).toBe("@layer base, print;p{color:red}");
  });

  it("handles selectors with namespaced attributes and continues after functional pseudo-classes", () => {
    const kept =
      'p:is(.printed):has(.caption){color:red}[*|title]{color:red}p[title="x"]{color:red}';
    const gone = 'p:is([title=")"],.missing) + article{color:red}p[role="aside"]{color:red}';
    const html = '<p class="printed" title="x">x</p>';
    expect(styles(pruneStyles(page(`${gone}${kept}`, html)))).toBe(kept);
  });

  it("drops empty feature queries even when their selector mentions an at-rule name", () => {
    const css = '@supports selector([data-name="@layer"]){.gone{color:red}}p{color:red}';
    expect(styles(pruneStyles(page(css, "<p>x</p>")))).toBe("p{color:red}");
  });

  it("keeps rules for implied page elements and matches classes across extra whitespace", () => {
    const kept = "html{color:red}head{font-weight:bold}body{display:block}.printed{color:black}";
    const gone = ".here{color:red}tr{color:red}colgroup{color:red}";
    const html = `<style>${kept}${gone}</style><p class="card  \tprinted">x</p>`;
    expect(styles(pruneStyles(html))).toBe(kept);
    expect(styles(pruneStyles(page("tr{color:red}", "<table><th>x</th></table>")))).toBe(
      "tr{color:red}",
    );
  });

  it("preserves nested rules so their declarations stay with the nested selector", () => {
    const css = "main{--orphan:0;&:hover{color:red}}main p{color:var(--ink);}";
    expect(styles(pruneStyles(page(css, "<main><p>x</p></main>")))).toBe(
      "main{--orphan:0;&:hover{color:red}}main p{color:var(--ink)}",
    );
  });
});

test.each([
  ["'foo'", 0, 4],
  ['a"x\\"y"z', 1, 6],
  ["a'unclosed", 1, 10],
])("finds the closing quote in %j", (text, start, expected) => {
  expect(skipQuotedString(text, start)).toBe(expected);
});

test.each([
  [
    'p{";";}',
    [
      { char: "{", index: 1 },
      { char: ";", index: 5 },
      { char: "}", index: 6 },
    ],
  ],
  ["f(g(;));", [{ char: ";", index: 7 }]],
  ["a(unclosed;", []],
])("finds stylesheet delimiters outside strings and parentheses in %j", (css, expected) => {
  expect([...cssItemDelimiters(css)]).toEqual(expected);
});

const selectorPage = {
  attributes: new Set(["data-own"]),
  classes: new Set(["known"]),
  ids: new Set(["main"]),
  tags: new Set(["p"]),
};

test.each([
  ['[DATA-OWN="x"]', true],
  ["[open]", true],
  ["[data-absent]", false],
  ["[unknown\\2d name]", true],
])("checks whether an attribute selector can match %s", (selector, expected) => {
  expect(attributeMatches(selector, selectorPage)).toBe(expected);
});

test.each([
  ["P.known#main:hover", true],
  ["p::first-letter", true],
  ["p.missing", false],
  ["p#other", false],
  ["aside.known", false],
])("checks tag, ID, and class requirements in %s", (selector, expected) => {
  expect(bareSelectorMatches(selector, selectorPage)).toBe(expected);
});
