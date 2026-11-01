import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertBrandFonts,
  bakeDocumentCss,
  chromeBinary,
  composeDocument,
  documentCss,
  renderPdf,
} from "../scripts/render-pdf";

const dir = mkdtempSync(join(tmpdir(), "render-pdf-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("documentCss", () => {
  it("inlines every face, so a baked HTML renders outside the repository", () => {
    const css = documentCss();
    expect(css).toContain("url(data:font/woff2;base64,");
    expect(css).not.toMatch(/url\("fonts\//);
    // The HTML parser would end the style element there, even inside a comment.
    expect(css).not.toMatch(/<\/style/i);
  });

  it("inlines the brand files, with the website's @theme read as :root", () => {
    const css = documentCss();
    expect(css).not.toContain("@import");
    expect(css).not.toMatch(/@theme\s*\{/);
    expect(css).toContain("--type-body-family: var(--font-sans);");
    expect(css).toContain("--type-body-size: 10pt;");
  });
});

describe("bakeDocumentCss", () => {
  const doc =
    "<html><head><style data-hw-document></style><style data-hw-components>.own{}</style></head></html>";

  it("fills the marked style element and leaves the engine's component styles alone", () => {
    const baked = bakeDocumentCss(doc);
    expect(baked).toContain(".doc-header");
    expect(baked).toContain("<style data-hw-components>.own{}</style>");
  });

  it("re-bakes to the same bytes, so a re-render touches no stored file", () => {
    const once = bakeDocumentCss(doc);
    expect(bakeDocumentCss(once)).toBe(once);
  });

  it("gives a document stored before the brand elements their classes and the print scale", () => {
    const old =
      '<html lang="de"><head><style data-hw-document></style></head><body><div class="card tint">x</div><table><tr><td>1</td></tr></table></body></html>';
    const baked = bakeDocumentCss(old);
    expect(baked).toContain('<html data-hw-scale="print" lang="de">');
    expect(baked).toContain('<div class="card tint hw-card" data-variant="tint">');
    expect(baked).toContain('<table class="hw-table">');
    expect(bakeDocumentCss(baked)).toBe(baked);
  });

  it("passes HTML without the marker through unchanged", () => {
    const plain = "<html><head><style>body{}</style></head></html>";
    expect(bakeDocumentCss(plain)).toBe(plain);
  });

  it("refuses a document carrying a style the engine did not write", () => {
    for (const foreign of [
      "<style>.own{}</style>",
      '<link rel="stylesheet" href="x.css">',
      '<p style="margin-top: 4mm">x</p>',
    ])
      expect(() =>
        bakeDocumentCss(`<html><head><style data-hw-document></style>${foreign}</head></html>`),
      ).toThrow(/styles outside the document engine/);
  });
});

describe("renderPdf without output", () => {
  afterEach(() => {
    delete process.env.CHROME_BINARY;
  });

  it("fails when Chrome exits 0 without writing, even over a PDF from an earlier render", async () => {
    writeFileSync(join(dir, "stale.html"), "<!doctype html><html><body>x</body></html>");
    writeFileSync(join(dir, "stale.pdf"), "%PDF-1.7 stale");
    process.env.CHROME_BINARY = "/usr/bin/true";
    await expect(renderPdf(join(dir, "stale.html"), join(dir, "stale.pdf"))).rejects.toThrow(
      "Chrome produced no PDF",
    );
  });
});

describe("renderPdf profile", () => {
  afterEach(() => {
    delete process.env.CHROME_BINARY;
  });

  it("runs Chrome in its own temporary profile and removes it, so it never touches the user's Chrome", async () => {
    // A stand-in Chrome that records its arguments, whether the profile exists, and writes the PDF.
    const fake = join(dir, "fake-chrome.sh");
    const log = join(dir, "fake-chrome.log");
    writeFileSync(
      fake,
      `#!/bin/sh\nfor a in "$@"; do case "$a" in --user-data-dir=*) d="\${a#*=}"; [ -d "$d" ] && echo "exists $d" >> "${log}";; --print-to-pdf=*) echo "%PDF-1.7" > "\${a#*=}";; esac; echo "$a" >> "${log}"; done\n`,
      { mode: 0o755 },
    );
    writeFileSync(join(dir, "profile.html"), "<!doctype html><html><body>x</body></html>");
    process.env.CHROME_BINARY = fake;
    await renderPdf(join(dir, "profile.html"), join(dir, "profile.pdf"));
    const lines = readFileSync(log, "utf8").split("\n");
    const profile = lines.find((l) => l.startsWith("--user-data-dir="))?.slice(16);
    expect(profile).toStartWith(tmpdir());
    expect(lines).toContain(`exists ${profile}`);
    expect(existsSync(profile!)).toBe(false);
  });
});

describe("renderPdf with an empty Chrome cache", () => {
  it("installs Chrome without blocking the process and retries an install that failed", async () => {
    // A child process, since this file's module already holds the real Chrome. Its `bunx` stands
    // in for @puppeteer/browsers: it fails while the flag file exists, then prints a fake Chrome.
    const bin = join(dir, "install-bin");
    mkdirSync(bin);
    const flag = join(dir, "install-fails");
    const chrome = join(dir, "install-chrome.sh");
    writeFileSync(flag, "");
    writeFileSync(
      chrome,
      `#!/bin/sh\nfor a in "$@"; do case "$a" in --print-to-pdf=*) echo "%PDF-1.7" > "\${a#*=}";; esac; done\n`,
      { mode: 0o755 },
    );
    writeFileSync(
      join(bin, "bunx"),
      `#!/bin/sh\necho "$1" > "${flag}.pkg"\nsleep 0.5\n[ -e "${flag}" ] && exit 1\necho "${chrome}"\n`,
      { mode: 0o755 },
    );
    writeFileSync(join(dir, "install.html"), "<!doctype html><html><body>x</body></html>");
    const script = `
      import { unlinkSync } from "node:fs";
      import { renderPdf } from ${JSON.stringify(join(import.meta.dir, "../scripts/render-pdf.ts"))};
      let ticks = 0;
      const timer = setInterval(() => ticks++, 50);
      const render = () => renderPdf(${JSON.stringify(join(dir, "install.html"))}, ${JSON.stringify(join(dir, "install.pdf"))}).then(() => "ok", (e) => e.message);
      const failed = await render();
      unlinkSync(${JSON.stringify(flag)});
      const retried = await render();
      clearInterval(timer);
      console.log(JSON.stringify({ failed, retried, ticks }));`;
    const env: Record<string, string | undefined> = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      CHROME_BINARY: undefined,
      PUPPETEER_CACHE_DIR: join(dir, "empty-cache"),
    };
    const child = Bun.spawn([process.execPath, "-e", script], { env, stderr: "inherit" });
    const result = JSON.parse(await new Response(child.stdout).text());
    expect(result.failed).toContain("Chrome for Testing is required");
    expect(result.retried).toBe("ok");
    // bunx runs the package it is given from the registry: a version range would run whatever
    // was published last.
    expect(readFileSync(`${flag}.pkg`, "utf8").trim()).toMatch(
      /^@puppeteer\/browsers@\d+\.\d+\.\d+$/,
    );
    // Two installs of 0.5 s each: a blocking install leaves the 50 ms timer near zero.
    expect(result.ticks).toBeGreaterThan(10);
  });
});

describe.skipIf(!chromeBinary())("renderPdf", () => {
  let pdf: string;
  const pdfinfo = () => execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
  const print = async (name: string, css: string) => {
    writeFileSync(
      join(dir, `${name}.html`),
      `<!doctype html><html><head><style>${css}</style></head><body><p>Text</p></body></html>`,
    );
    await renderPdf(join(dir, `${name}.html`), join(dir, `${name}.pdf`));
    return join(dir, `${name}.pdf`);
  };

  beforeAll(async () => {
    const logo = readFileSync(
      createRequire(import.meta.url).resolve("@hackersandwizards/brand/logos/lockup.png"),
    ).toString("base64");
    writeFileSync(
      join(dir, "doc.html"),
      `<!doctype html><html lang="en"><body><h1>One</h1><img src="data:image/png;base64,${logo}" style="width:108px;height:20px"><h2>Two</h2></body></html>`,
    );
    pdf = join(dir, "doc.pdf");
    await renderPdf(join(dir, "doc.html"), pdf);
  }, 60_000);

  it("tags the PDF, so a screen reader reads its structure", () => {
    expect(pdfinfo()).toMatch(/^Tagged:\s+yes$/m);
  });

  it("writes the headings as the PDF outline", () => {
    expect(readFileSync(pdf, "latin1")).toContain("/Outlines");
  });

  it("titles a document without a <title> by its first heading", () => {
    expect(pdfinfo()).toMatch(/^Title:\s+One$/m);
  });

  it("embeds a raster image at twice its displayed size, not its source size", () => {
    const [, , row] = execFileSync("pdfimages", ["-list", pdf], { encoding: "utf8" }).split("\n");
    expect(row.trim().split(/\s+/).slice(3, 5)).toEqual(["216", "40"]);
  });

  it("passes a document on the base's static faces and fails one on the browser default", async () => {
    expect(() => assertBrandFonts(pdf)).toThrow(/non-brand face/);
    const branded = await print("branded", documentCss());
    expect(() => assertBrandFonts(branded)).not.toThrow();
  }, 60_000);

  it("fails on a system fallback face", async () => {
    const helvetica = await print("helvetica", "body { font-family: Helvetica; }");
    expect(() => assertBrandFonts(helvetica)).toThrow(/non-brand face/);
  }, 60_000);

  it("fails on a variable brand face, which prints as Type 3", async () => {
    const font = createRequire(import.meta.url).resolve(
      "@hackersandwizards/brand/fonts/inter-latin-wght-normal.woff2",
    );
    const variable = await print(
      "variable",
      `@font-face { font-family: Inter; src: url(data:font/woff2;base64,${readFileSync(font).toString("base64")}); } body { font-family: Inter; }`,
    );
    expect(() => assertBrandFonts(variable)).toThrow(/Type 3/);
  }, 60_000);
});

// A briefing writes each question as a bold paragraph over its answer. Sections of varied length
// put such a label at many heights on the page, so some reach a page foot: none ends a page alone.
describe.skipIf(!chromeBinary())("a bold label paragraph", () => {
  it("stays on the page with the text under it", async () => {
    const sections = Array.from({ length: 48 }, (_, i) => {
      const filler = "<p>An invented line of filler.</p>".repeat(i % 6);
      return `<p><strong>Label ${i}</strong></p><p>Answer ${i} runs over two lines of the page measure, long enough to wrap once at the body size of the base.</p>${filler}`;
    });
    const html = bakeDocumentCss(
      await composeDocument("DocMarkdown", { kind: "Delivery Briefing", html: sections.join("") }),
    );
    writeFileSync(join(dir, "labels.html"), html);
    await renderPdf(join(dir, "labels.html"), join(dir, "labels.pdf"));
    const pages = execFileSync("pdftotext", [join(dir, "labels.pdf"), "-"], {
      encoding: "utf8",
    }).split("\f");
    expect(pages.length).toBeGreaterThan(3);
    const page = (text: string) => pages.findIndex((p) => p.includes(text));
    const stranded = sections
      .map((_, i) => i)
      .filter((i) => page(`Label ${i}\n`) !== page(`Answer ${i} `));
    expect(stranded).toEqual([]);
  }, 60_000);
});
