import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  assertBrandFonts,
  bakeDocumentCss,
  chromeBinary,
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
  const doc = "<html><head><style data-hw-document></style><style>.own{}</style></head></html>";

  it("fills the marked style element and leaves the document's own styles alone", () => {
    const baked = bakeDocumentCss(doc);
    expect(baked).toContain(".doc-header");
    expect(baked).toContain("<style>.own{}</style>");
  });

  it("re-bakes to the same bytes, so a re-render touches no stored file", () => {
    const once = bakeDocumentCss(doc);
    expect(bakeDocumentCss(once)).toBe(once);
  });

  it("passes HTML without the marker through unchanged", () => {
    const plain = "<html><head><style>body{}</style></head></html>";
    expect(bakeDocumentCss(plain)).toBe(plain);
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
