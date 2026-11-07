import { describe, expect, it } from "bun:test";
import { pruneStyles } from "../scripts/prune";

const page = (css: string, body: string) =>
  `<html><head><style>${css}</style></head><body>${body}</body></html>`;
const styles = (html: string) => /<style>([\s\S]*)<\/style>/.exec(html)![1];

describe("pruneStyles", () => {
  const body = '<main id="top"><p class="kept">x</p></main>';

  it("drops each rule needing a class, id or element the markup carries nowhere", () => {
    const css = ".gone{color:red}#away{color:red}table td{color:red}.kept .gone{color:red}";
    expect(styles(pruneStyles(page(css, body)))).toBe("");
  });

  it("control: keeps a rule one of whose selectors can match, whatever its pseudo-classes test", () => {
    const css =
      ".gone,.kept{color:red}#top>p{color:red}main :not(.gone){color:red}" +
      'p:has(.gone)::before{content:"x"}[data-x] .kept:hover{color:red}html{color:red}';
    expect(styles(pruneStyles(page(css, body)))).toBe(css);
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
    expect(out).not.toContain("--a");
    expect(out).not.toContain("--b");
    expect(out).not.toContain("--f");
    // The control: read through var(), a style attribute and a style query.
    expect(out).toContain("--c:2");
    expect(out).toContain("--d:3");
    expect(out).toContain("--e:on");
  });

  it("keeps a rule on an element the parser adds, and the inlined data as it was", () => {
    const face = "url(data:font/woff2;base64,d09GMgABAAAAA+/=)";
    const css = `tbody td{color:red}body td{color:red}@font-face{src:${face}}`;
    expect(styles(pruneStyles(page(css, "<table><tr><td>1</td></tr></table>")))).toBe(css);
  });

  it("leaves a page holding a script whole, since the script may add a class", () => {
    const html = page(".gone{color:red}", "<p>x</p><script>1</script>");
    expect(pruneStyles(html)).toBe(html);
  });
});
