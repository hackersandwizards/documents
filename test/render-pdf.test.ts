import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  symlinkSync,
  utimesSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { hostname, tmpdir } from "node:os";
import { dirname, join, relative } from "node:path";
import { bakeDocumentCss, brandCss, documentCss } from "../scripts/document-css";
import { compactStyles, renderPdf } from "../scripts/render-pdf";
import { composeDocument } from "../scripts/compose-document";
import { inlineImages } from "../scripts/inline-images";
import { subsetFaces } from "../scripts/font-faces";
import { decompress } from "woff2-encoder";
import { rejection } from "@hackersandwizards/scaffolding/rejection";
import { rateCard, surveyReadout } from "../scripts/samples";
import { composeSurveyReadout } from "../scripts/survey-readout";
import { fallbackFamilies, withLinkedBrand, limit } from "./probe";

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

  it("inlines the brand files, with brand's tokens as :root", () => {
    const css = documentCss();
    expect(css).not.toContain("@import");
    expect(css).not.toContain("@theme");
    // brand's measures, which its elements read, sit in an @theme static block of tokens.css.
    expect(css).toContain("--container-measure:");
    expect(css).toContain("--type-body-family: var(--font-sans);");
    expect(css).toContain("--type-body-size: 10pt;");
  });
});

describe("the fallback faces", () => {
  it("define every fallback family the font stacks name, in the base, the brand files and the readout", () => {
    const linked = withLinkedBrand(composeSurveyReadout(surveyReadout, (file) => file));
    for (const css of [documentCss(), brandCss(), composeSurveyReadout(surveyReadout), linked]) {
      const { named, defined } = fallbackFamilies(css);
      // The control: the stacks name brand's three fallback families.
      expect(named).toEqual(["Inter Fallback", "Inter Fallback Roboto", "JetBrains Mono Fallback"]);
      expect(defined).toEqual(named);
    }
  });
});

describe("compactStyles", () => {
  const ext = "@font-face { font-family: X; src: url(x.woff2); unicode-range: U+0100-017F; }";
  const arrows = "@font-face { font-family: X; src: url(a.woff2); unicode-range: U+21??; }";
  const page = (body: string, css = "") =>
    `<html><head><style data-hw-document>/* internal: panel 8.3 */${ext}${arrows}${css}</style></head><body>${body}</body></html>`;

  it("drops every CSS comment and each face no character of the page falls in", () => {
    const out = compactStyles(page("<p>Metadata: Muller</p>"));
    expect(out).not.toContain("/*");
    expect(out).not.toContain("U+0100");
    expect(out).not.toContain("U+21??");
  });

  it.each([
    {
      input: "literal text after data: in a label",
      html: page("<p>Metadata: Čaluk</p>"),
      range: "U+0100",
    },
    { input: "an HTML entity", html: page("<p>&#x10C;aluk</p>"), range: "U+0100" },
    {
      input: "a CSS escape",
      html: page("<ul><li>x</li></ul>", 'li::before { content: "\\2192"; }'),
      range: "U+21??",
    },
    { input: "ÿ uppercased to Ÿ (U+0178)", html: page("<p>ÿ</p>"), range: "U+0100" },
    {
      input: "i uppercased to İ (U+0130) with double-quoted Turkish lang",
      html: page("<p>i</p>").replace("<html>", '<html lang="tr">'),
      range: "U+0100",
    },
    {
      input: "i uppercased to İ with single-quoted Turkish lang",
      html: page("<p>i</p>").replace("<html>", "<html lang='tr'>"),
      range: "U+0100",
    },
    // JavaScript Unicode escapes take four hex digits, or one to six within braces.
    {
      input: "a four-digit JavaScript escape",
      html: page('<script>document.title = "\\u0142a";</script>'),
      range: "U+0100",
    },
    {
      input: "a braced JavaScript escape",
      html: page('<script>document.title = "\\u{142}";</script>'),
      range: "U+0100",
    },
  ])("keeps the face for $input", ({ html, range }) => {
    expect(compactStyles(html)).toContain(range);
  });

  it.each([
    { input: "the default language", html: page("<p>i</p>"), range: "U+0100" },
    {
      input: "a four-digit JavaScript escape outside the range",
      html: page('<script>document.title = "\\u142a";</script>'),
      range: "U+0100",
    },
    {
      input: "a data-lang attribute without an HTML language declaration",
      html: page("<p>i</p>").replace("<html>", '<html data-lang="tr">'),
      range: "U+0100",
    },
  ])("drops the face for $input", ({ html, range }) => {
    expect(compactStyles(html)).not.toContain(range);
  });

  it("leaves text and selectors alone: a face in the body, an escape past U+10FFFF, a comment between selectors", () => {
    const shown = "<pre>@font-face { unicode-range: U+0100; } C:\\facade</pre>";
    expect(compactStyles(page(shown))).toContain(shown);
    expect(
      compactStyles(page('<p class="a"><b class="b">x</b></p>', ".a/* x */ .b { color: red; }")),
    ).toContain(".a .b{");
    const quoted = '.a { content: "x /* y"; } .b { color: red; } /* c */';
    expect(compactStyles(page('<p class="a b">x</p>', quoted))).toContain(
      '.a{ content: "x /* y"}.b{ color: red}',
    );
  });

  it("cases the page's characters as English where its lang is no valid tag", () => {
    expect(() =>
      compactStyles(page("<p>i</p>").replace("<html>", '<html lang="de_DE">')),
    ).not.toThrow();
  });

  it("keeps the base composed documents free of comments and of the latin-ext faces they never print", async () => {
    const html = await composeDocument("DocRateCard", rateCard);
    expect(html).not.toMatch(/\/\*/);
    expect(html).not.toContain("U+0100");
  });
});

/** The glyphs of a TrueType face whose first point carries the overlap flag (0x40), which FreeType
 * anti-aliases by. */
function overlapFlagged(ttf: Uint8Array): number {
  const view = new DataView(ttf.buffer, ttf.byteOffset, ttf.byteLength);
  const tables = new Map<string, number>();
  for (let i = 0; i < view.getUint16(4); i++) {
    const at = 12 + 16 * i;
    tables.set(String.fromCharCode(...ttf.subarray(at, at + 4)), view.getUint32(at + 8));
  }
  const [head, maxp, loca, glyf] = ["head", "maxp", "loca", "glyf"].map((t) => tables.get(t)!);
  const long = view.getInt16(head! + 50) === 1;
  const offset = (i: number) =>
    long ? view.getUint32(loca! + 4 * i) : 2 * view.getUint16(loca! + 2 * i);
  let flagged = 0;
  for (let g = 0; g < view.getUint16(maxp! + 4); g++) {
    if (offset(g + 1) === offset(g)) continue;
    const at = glyf! + offset(g);
    const contours = view.getInt16(at);
    if (contours <= 0) continue;
    const instructions = at + 10 + 2 * contours;
    if (ttf[instructions + 2 + view.getUint16(instructions)]! & 0x40) flagged++;
  }
  return flagged;
}

describe("subsetFaces", () => {
  const faces = (html: string) =>
    [...html.matchAll(/data:font\/woff2;base64,([\w+/=]+)/g)].map(([, data]) => data!);

  it(
    "cuts each face of a composed document, and a re-bake cut again writes the same bytes",
    async () => {
      const html = await composeDocument("DocRateCard", rateCard);
      const whole = faces(bakeDocumentCss(html));
      const cut = faces(html);
      expect(cut.length).toBe(whole.length);
      expect(cut.join("").length).toBeLessThan(0.75 * whole.join("").length);
      expect(await subsetFaces(bakeDocumentCss(html))).toBe(html);
    },
    limit(60_000),
  );

  it("keeps the overlap flags of the glyphs it keeps; control: the brand face carries them", async () => {
    const page = `<html><head><style>${documentCss()}</style></head><body>Agenten</body></html>`;
    const [source] = faces(page);
    const [kept] = faces(await subsetFaces(page));
    expect(overlapFlagged(await decompress(Buffer.from(source!, "base64")))).toBeGreaterThan(0);
    expect(overlapFlagged(await decompress(Buffer.from(kept!, "base64")))).toBeGreaterThan(0);
  });
});

describe("bakeDocumentCss", () => {
  const doc =
    '<html><head><style data-hw-document></style><style data-hw-components>.own{color:red}</style></head><body><header class="doc-header"></header><p class="own">x</p></body></html>';

  it("fills the marked style element and leaves the engine's component styles alone", () => {
    const baked = bakeDocumentCss(doc);
    expect(baked).toContain(".doc-header");
    expect(baked).toContain("<style data-hw-components>.own{color:red}</style>");
  });

  it("bakes a marker written with a value or beside another attribute", () => {
    for (const open of ['<style data-hw-document="">', '<style id="base" data-hw-document>'])
      expect(bakeDocumentCss(doc.replace("<style data-hw-document>", open))).toContain(
        ".doc-header",
      );
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

  const withComponents = (css: string) =>
    `<html><head><style data-hw-document></style><style data-hw-components>${css}</style></head><body><p class="x">x</p></body></html>`;

  it("bakes component styles that read the strip as --gradient", () => {
    expect(() => bakeDocumentCss(withComponents(".x{background:var(--gradient)}"))).not.toThrow();
  });

  it("refuses a document whose styles read a custom property they define nowhere", () => {
    expect(() => bakeDocumentCss(withComponents(".x{color:var(--retired-token)}"))).toThrow(
      /--retired-token/,
    );
    expect(() => bakeDocumentCss(withComponents("/* var(--retired-token) */"))).not.toThrow();
    const inText = withComponents(".x{color:var(--retired-token)}").replace(
      "<body>",
      "<body><code>--retired-token: 1</code><code>var(--in-text)</code>",
    );
    expect(() => bakeDocumentCss(inText)).toThrow(/^(?!.*--in-text).*--retired-token/s);
    // Pandoc keeps the quotes of inline code as written.
    const shown = withComponents("").replace(
      "<body>",
      '<body><code>&lt;div style="--a: var(--shown)"&gt;</code>',
    );
    expect(() => bakeDocumentCss(shown)).not.toThrow();
  });

  it("takes no selector for a custom property's definition", () => {
    expect(() =>
      bakeDocumentCss(withComponents(".card--retired:hover{color:var(--retired)}")),
    ).toThrow(/--retired/);
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

describe("inlineImages", () => {
  const page = join(dir, "inline", "page");
  mkdirSync(page, { recursive: true });
  writeFileSync(join(page, "a b.jpg"), "jpeg");
  writeFileSync(join(page, "..dots.png"), "png");
  writeFileSync(join(dir, "inline", "outside.png"), "png");
  symlinkSync(join(dir, "inline", "outside.png"), join(page, "link.png"));

  it("inlines a file beside the page and a brand file, quoted either way, a src percent-encoded", () => {
    const html = inlineImages(
      `<img alt='x' src='a%20b.jpg'><img src="./a b.jpg"><img src="@hackersandwizards/brand/logos/wordmark.svg">`,
      page,
    );
    expect(html.split(`src="data:image/jpeg;base64,${btoa("jpeg")}"`).length).toBe(3);
    expect(html).toContain('src="data:image/svg+xml');
  });

  it("reads an img tag as the browser does: a > in an earlier attribute, spaces, no quotes, a query", () => {
    const jpeg = `data:image/jpeg;base64,${btoa("jpeg")}`;
    for (const tag of [
      `<img alt="a > b" src="a%20b.jpg">`,
      `<img src = "a%20b.jpg">`,
      `<img src=a%20b.jpg>`,
      `<img src="a%20b.jpg?v=2#x">`,
      `<IMG SRC="a%20b.jpg">`,
    ])
      expect(inlineImages(tag, page)).toContain(jpeg);
    // A package path behind such an attribute still fails the print rather than lose the image.
    expect(() =>
      inlineImages(`<img alt="a > b" src="@hackersandwizards/brand/logos/none.svg">`, page),
    ).toThrow("brand exports no image");
    // Text that only looks like a tag is no image.
    const text = `<p>&lt;img src="a%20b.jpg"&gt;</p><!-- <img src="a%20b.jpg"> -->`;
    expect(inlineImages(text, page)).toBe(text);
  });

  it("keeps a missing file, and with within, a file that resolves outside it", () => {
    const html = `<img src="none.png"><img src="../outside.png"><img src="link.png">`;
    expect(inlineImages(html, page)).toContain(
      `src="data:image/png;base64,${btoa("png")}"><img src="data:image/png`,
    );
    expect(inlineImages(html, page, { within: page })).toBe(html);
    // A name that only starts with two dots lies inside.
    expect(inlineImages(`<img src="..dots.png">`, page, { within: page })).toContain(
      "data:image/png",
    );
  });

  it("types each image by its extension, without Bun", () => {
    const types = { gif: "gif", webp: "webp", JPEG: "jpeg", svg: "svg+xml" };
    for (const ext of Object.keys(types)) writeFileSync(join(page, `t.${ext}`), ext);
    const file = Bun.file;
    Bun.file = () => {
      throw new Error("Bun.file called");
    };
    try {
      expect(
        inlineImages(
          Object.keys(types)
            .map((ext) => `<img src="t.${ext}">`)
            .join(""),
          page,
        ),
      ).toBe(
        Object.entries(types)
          .map(([ext, type]) => `<img src="data:image/${type};base64,${btoa(ext)}">`)
          .join(""),
      );
    } finally {
      Bun.file = file;
    }
  });

  it("keeps a file it cannot read and a Git LFS pointer, inside within too", () => {
    mkdirSync(join(page, "folder.png"), { recursive: true });
    writeFileSync(join(page, "locked.png"), "png");
    chmodSync(join(page, "locked.png"), 0o000);
    writeFileSync(
      join(page, "stub.png"),
      "version https://git-lfs.github.com/spec/v1\noid sha256:00\nsize 3\n",
    );
    try {
      for (const name of ["folder.png", "locked.png", "stub.png"]) {
        const html = `<img alt="${name}" src="${name}">`;
        expect(inlineImages(html, page)).toBe(html);
        expect(inlineImages(html, page, { within: page })).toBe(html);
      }
    } finally {
      chmodSync(join(page, "locked.png"), 0o644);
    }
  });

  it("throws on a package src its package does not export, or keeps it with keepMissing", () => {
    for (const [src, error] of [
      ["@hackersandwizards/brand/logos/none.svg", "@hackersandwizards/brand exports no image"],
      [
        "@hackersandwizards/testimonials/marks/none.svg",
        "@hackersandwizards/testimonials exports no image",
      ],
      ["@hackersandwizards/none/marks/a.svg", "@hackersandwizards/none exports no image"],
      // A `..` segment leaves the package, here to a file it would otherwise inline.
      [
        `@hackersandwizards/${relative(
          // The scope folder our packages are installed in.
          dirname(
            dirname(
              createRequire(import.meta.url).resolve("@hackersandwizards/brand/package.json"),
            ),
          ),
          join(dir, "inline", "outside.png"),
        )}`,
        "@hackersandwizards/.. exports",
      ],
    ]) {
      const html = `<img src="${src}">`;
      expect(() => inlineImages(html, page)).toThrow(error);
      expect(inlineImages(html, page, { keepMissing: true })).toBe(html);
    }
  });
});

describe("renderPdf without output", () => {
  afterEach(() => {
    delete process.env.CHROME_BINARY;
  });

  it("fails when Chrome exits 0 without printing, and leaves no PDF from an earlier render", async () => {
    writeFileSync(join(dir, "stale.html"), "<!doctype html><html><body>x</body></html>");
    writeFileSync(join(dir, "stale.pdf"), "%PDF-1.7 stale");
    process.env.CHROME_BINARY = "/usr/bin/true";
    expect(await rejection(renderPdf(join(dir, "stale.html"), join(dir, "stale.pdf")))).toContain(
      "Chrome exited",
    );
    expect(existsSync(join(dir, "stale.pdf"))).toBe(false);
  });
});

describe("a Chrome or composer that cannot start", () => {
  it(
    "rejects, removes the profile, and lets the next call start afresh",
    async () => {
      // A child process: a spawn error without a listener ends the process. Its own TMPDIR shows
      // whether a profile is left behind.
      const tmp = mkdtempSync(join(dir, "nostart-"));
      writeFileSync(join(dir, "nostart.html"), "<!doctype html><html><body>x</body></html>");
      const script = `
      import { composeWarmDocument } from ${JSON.stringify(join(import.meta.dirname, "../scripts/compose-document.ts"))};
      import { renderPdf } from ${JSON.stringify(join(import.meta.dirname, "../scripts/render-pdf.ts"))};
      const outcome = (p) => p.then(() => "ok", (e) => e.message);
      process.env.CHROME_BINARY = "/nonexistent/chrome";
      const render = (warm) => outcome(renderPdf(${JSON.stringify(join(dir, "nostart.html"))}, ${JSON.stringify(join(dir, "nostart.pdf"))}, { warm }));
      const chrome = [await render(false), await render(true), await render(true)];
      const path = process.env.PATH;
      process.env.PATH = "/nonexistent";
      const compose = () => outcome(composeWarmDocument("DocMarkdown", { html: "<p>x</p>" }, process.cwd()));
      const composer = [await compose()];
      process.env.PATH = path;
      composer.push(await compose());
      console.log(JSON.stringify({ chrome, composer }));`;
      const child = Bun.spawn([process.execPath, "-e", script], {
        env: { ...process.env, TMPDIR: tmp },
        stderr: "inherit",
      });
      const out = await new Response(child.stdout).text();
      await child.exited;
      expect(child.exitCode).toBe(0);
      const result: unknown = JSON.parse(out);
      // The second warm call fails on its own spawn, not on the dead Chrome the first one kept.
      const missingChrome: unknown = expect.stringContaining("ENOENT");
      const missingComposer: unknown = expect.stringMatching(/^Composing DocMarkdown failed/);
      expect(result).toEqual({
        chrome: [missingChrome, missingChrome, missingChrome],
        composer: [missingComposer, "ok"],
      });
      expect(readdirSync(tmp).filter((f) => f.startsWith("hw-chrome-"))).toEqual([]);
    },
    limit(60_000),
  );
});

describe("a malformed child-process reply", () => {
  const badChromeReply: unknown = expect.stringContaining("Invalid Chrome protocol message");
  const badComposerReply: unknown = expect.stringContaining("Invalid composer protocol message");
  it.each([
    { worker: "Chrome", replies: [badChromeReply, badChromeReply, badChromeReply] },
    { worker: "composer", replies: [badComposerReply, "ok"] },
  ])(
    "rejects a malformed $worker reply and lets the next warm request start a new child",
    async ({ worker, replies }) => {
      const stubDir = mkdtempSync(join(dir, "bad-reply-"));
      const stubChrome = join(stubDir, "chrome");
      const stubBun = join(stubDir, "bun");
      const input = join(stubDir, "input.html");
      writeFileSync(input, "<!doctype html><html><body>x</body></html>");
      writeFileSync(stubChrome, "#!/bin/sh\nprintf 'null\\000' >&4\nread -r request <&3\n", {
        mode: 0o755,
      });
      writeFileSync(stubBun, "#!/bin/sh\nread -r request\nprintf '!\\n' >&3\nread -r request\n", {
        mode: 0o755,
      });
      const script = `
      import { composeWarmDocument } from ${JSON.stringify(join(import.meta.dirname, "../scripts/compose-document.ts"))};
      import { renderPdf } from ${JSON.stringify(join(import.meta.dirname, "../scripts/render-pdf.ts"))};
      const outcome = (promise) => promise.then(() => "ok", (error) => error.message);
      const warm = { warm: true, timeoutMs: 2_000 };
      if (${JSON.stringify(worker)} === "Chrome") {
        const render = (options) => outcome(renderPdf(${JSON.stringify(input)}, ${JSON.stringify(join(stubDir, "out.pdf"))}, options));
        console.log(JSON.stringify([await render({ ...warm, warm: false }), await render(warm), await render(warm)]));
      } else {
        const originalPath = process.env.PATH;
        process.env.PATH = ${JSON.stringify(stubDir)} + ":" + originalPath;
        const compose = () => outcome(composeWarmDocument("DocMarkdown", { html: "<p>x</p>" }, process.cwd()));
        const failed = await compose();
        process.env.PATH = originalPath;
        console.log(JSON.stringify([failed, await compose()]));
      }`;
      const child = Bun.spawn([process.execPath, "-e", script], {
        env: { ...process.env, CHROME_BINARY: stubChrome, TMPDIR: stubDir },
        stderr: "pipe",
        timeout: limit(15_000),
      });
      const [stdout, stderr, status] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      expect(status, stderr).toBe(0);
      const answer: unknown = JSON.parse(stdout);
      expect(answer).toEqual(replies);
    },
    limit(30_000),
  );
});

describe("a profile left behind", () => {
  it(
    "is removed at the next start once an hour old and no running Chrome holds it",
    async () => {
      const tmp = mkdtempSync(join(dir, "left-"));
      const old = new Date(Date.now() - 2 * 3_600_000);
      const gone = Bun.spawnSync(["true"]).pid;
      mkdirSync(join(tmp, "hw-chrome-stale"));
      utimesSync(join(tmp, "hw-chrome-stale"), old, old);
      const locks = {
        "hw-chrome-crashed": `${hostname()}-${gone}`,
        "hw-chrome-held": `${hostname()}-${process.pid}`,
        "hw-chrome-elsewhere": "other-host-1",
      };
      for (const [name, lock] of Object.entries(locks)) {
        mkdirSync(join(tmp, name));
        symlinkSync(lock, join(tmp, name, "SingletonLock"));
        utimesSync(join(tmp, name), old, old);
      }
      mkdirSync(join(tmp, "hw-chrome-new"));
      writeFileSync(join(dir, "left.html"), "<!doctype html><html><body>x</body></html>");
      // A process of its own, so the sweep has not run yet in it.
      const script = `
      import { renderPdf } from ${JSON.stringify(join(import.meta.dirname, "../scripts/render-pdf.ts"))};
      process.env.CHROME_BINARY = "/nonexistent/chrome";
      await renderPdf(${JSON.stringify(join(dir, "left.html"))}, ${JSON.stringify(join(dir, "left.pdf"))}).catch(() => {});`;
      const child = Bun.spawn([process.execPath, "-e", script], {
        env: { ...process.env, TMPDIR: tmp },
        stderr: "inherit",
      });
      await child.exited;
      expect(readdirSync(tmp).sort()).toEqual([
        "hw-chrome-elsewhere",
        "hw-chrome-held",
        "hw-chrome-new",
      ]);
    },
    limit(60_000),
  );
});

describe("a Chrome that hangs", () => {
  afterEach(() => {
    delete process.env.CHROME_BINARY;
  });

  it(
    "is killed when it ignores SIGTERM, and the render fails within its time",
    async () => {
      // Answers nothing on its pipe and ignores SIGTERM, as a hung browser process does.
      const stub = join(dir, "hung-chrome.sh");
      writeFileSync(stub, "#!/bin/sh\ntrap '' TERM\nwhile :; do sleep 0.2; done\n", {
        mode: 0o755,
      });
      writeFileSync(join(dir, "hung.html"), "<!doctype html><html><body>x</body></html>");
      process.env.CHROME_BINARY = stub;
      const started = performance.now();
      const outcome = await Promise.race([
        renderPdf(join(dir, "hung.html"), join(dir, "hung.pdf"), { timeoutMs: 1000 }).then(
          () => "printed",
          (e: Error) => e.message,
        ),
        new Promise((resolve) => setTimeout(resolve, 15_000, "still waiting")),
      ]);
      expect(outcome).toContain("within 1000 ms");
      expect(performance.now() - started).toBeLessThan(10_000);
    },
    limit(30_000),
  );
});

describe.each([false, true])("renderPdf, warm: %p", (warm) => {
  afterEach(() => vi.unstubAllEnvs());

  it("fails on an image src brand does not export", async () => {
    vi.stubEnv("CHROME_BINARY", "/usr/bin/true");
    const file = join(dir, "no-brand-image.html");
    writeFileSync(
      file,
      `<!doctype html><html lang="en"><body><img src="@hackersandwizards/brand/logos/none.svg"></body></html>`,
    );
    // A PDF from an earlier render does not survive the failed one.
    const out = join(dir, `no-brand-image-${warm}.pdf`);
    writeFileSync(out, "earlier");
    expect(await rejection(renderPdf(file, out, { warm }))).toContain(
      "brand exports no image @hackersandwizards/brand/logos/none.svg",
    );
    expect(existsSync(out)).toBe(false);
  });
});
