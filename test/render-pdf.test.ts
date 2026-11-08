import { afterAll, afterEach, beforeAll, describe, expect, it } from "bun:test";
import { execFileSync, spawnSync } from "node:child_process";
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import {
  assertBrandFonts,
  bakeDocumentCss,
  compactStyles,
  composeDocument,
  cutFacesToPdf,
  documentCss,
  inlineImages,
  renderPdf,
  subsetFaces,
} from "../scripts/render-pdf";
import { decompress } from "woff2-encoder";
import { chromeBinary } from "@hackersandwizards/scaffolding/chrome";
import { svgUri } from "../scripts/fill";
import { rateCard } from "../scripts/samples";

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

  it("control: a character in a face's range keeps it, written as text, entity or CSS escape", () => {
    // Text after "data:" is no data URI.
    expect(compactStyles(page("<p>Metadata: Čaluk</p>"))).toContain("U+0100");
    expect(compactStyles(page("<p>&#x10C;aluk</p>"))).toContain("U+0100");
    expect(
      compactStyles(page("<ul><li>x</li></ul>", 'li::before { content: "\\2192"; }')),
    ).toContain("U+21??");
    // text-transform: uppercase prints ÿ as Ÿ (U+0178), and i as İ (U+0130) in Turkish.
    expect(compactStyles(page("<p>ÿ</p>"))).toContain("U+0100");
    expect(compactStyles(page("<p>i</p>").replace("<html>", '<html lang="tr">'))).toContain(
      "U+0100",
    );
    expect(compactStyles(page("<p>i</p>"))).not.toContain("U+0100");
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

  it("cuts each face of a composed document, and a re-bake cut again writes the same bytes", async () => {
    const html = await composeDocument("DocRateCard", rateCard);
    const whole = faces(bakeDocumentCss(html));
    const cut = faces(html);
    expect(cut.length).toBe(whole.length);
    expect(cut.join("").length).toBeLessThan(0.75 * whole.join("").length);
    expect(await subsetFaces(bakeDocumentCss(html))).toBe(html);
  }, 60_000);

  it("keeps the overlap flags of the glyphs it keeps; control: the brand face carries them", async () => {
    const page = `<html><head><style>${documentCss()}</style></head><body>Agenten</body></html>`;
    const [source] = faces(page);
    const [kept] = faces(await subsetFaces(page));
    expect(overlapFlagged(await decompress(Buffer.from(source!, "base64")))).toBeGreaterThan(0);
    expect(overlapFlagged(await decompress(Buffer.from(kept!, "base64")))).toBeGreaterThan(0);
  });
});

describe.skipIf(!chromeBinary())("cutFacesToPdf", () => {
  // Each ToUnicode map of `pdf` rewritten by `rewrite`; the cut reads the maps alone, so the
  // cross-reference offsets the new lengths shift do not matter.
  const withMaps = (pdf: Buffer, rewrite: (dict: string, map: Buffer) => [string, Buffer]) => {
    const text = pdf.toString("latin1");
    const ids = new Set([...text.matchAll(/\/ToUnicode (\d+) 0 R/g)].map(([, id]) => id!));
    const heads = [...ids]
      .map((id) =>
        new RegExp(`(?<!\\d)(${id}) 0 obj\\s*<<([\\s\\S]*?)>>\\s*stream\\r?\\n`).exec(text)!,
      )
      .sort((a, b) => a.index - b.index);
    const parts: Buffer[] = [];
    let at = 0;
    for (const m of heads) {
      const length = Number(/\/Length (\d+)/.exec(m[2]!)![1]);
      const start = m.index + m[0].length;
      const [dict, map] = rewrite(m[2]!, pdf.subarray(start, start + length));
      parts.push(pdf.subarray(at, m.index));
      parts.push(
        Buffer.from(
          `${m[1]} 0 obj\n<<${dict.replace(/\/Length \d+/, `/Length ${map.length}`)}>>\nstream\n`,
          "latin1",
        ),
        map,
      );
      at = start + length;
    }
    expect(parts.length).toBeGreaterThan(0);
    return Buffer.concat([...parts, pdf.subarray(at)]);
  };

  it("reads a ToUnicode map stored uncompressed or with its filter in an array as a compressed one", async () => {
    const html = await composeDocument("DocRateCard", rateCard);
    const file = join(dir, "faces.html");
    const pdf = join(dir, "faces.pdf");
    writeFileSync(file, html);
    await renderPdf(file, pdf);
    const cut = await cutFacesToPdf(html, pdf);
    expect(cut).not.toBe(html);
    const plain = join(dir, "faces-plain.pdf");
    writeFileSync(
      plain,
      withMaps(readFileSync(pdf), (dict, map) => [
        dict.replace(/\/Filter\s*\/FlateDecode/, ""),
        inflateSync(map),
      ]),
    );
    expect(await cutFacesToPdf(html, plain)).toBe(cut);
    const array = join(dir, "faces-array.pdf");
    writeFileSync(
      array,
      withMaps(readFileSync(pdf), (dict, map) => [
        dict.replace(/\/Filter\s*\/FlateDecode/, "/Filter [/FlateDecode]"),
        map,
      ]),
    );
    expect(await cutFacesToPdf(html, array)).toBe(cut);
  }, 60_000);
});

describe("bakeDocumentCss", () => {
  const doc =
    '<html><head><style data-hw-document></style><style data-hw-components>.own{color:red}</style></head><body><header class="doc-header"></header><p class="own">x</p></body></html>';

  it("fills the marked style element and leaves the engine's component styles alone", () => {
    const baked = bakeDocumentCss(doc);
    expect(baked).toContain(".doc-header");
    expect(baked).toContain("<style data-hw-components>.own{color:red}</style>");
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
    expect(html).toContain(`src='data:image/jpeg;base64,${btoa("jpeg")}'`);
    expect(html).toContain(`src="data:image/jpeg;base64,${btoa("jpeg")}"`);
    expect(html).toContain('src="data:image/svg+xml');
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

  it("throws on a brand src brand does not export, or keeps it with keepMissing", () => {
    const html = `<img src="@hackersandwizards/brand/logos/none.svg">`;
    expect(() => inlineImages(html, page)).toThrow("brand exports no image");
    expect(inlineImages(html, page, { keepMissing: true })).toBe(html);
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
    await expect(renderPdf(join(dir, "stale.html"), join(dir, "stale.pdf"))).rejects.toThrow(
      "Chrome exited",
    );
    expect(existsSync(join(dir, "stale.pdf"))).toBe(false);
  });
});

describe("a Chrome or composer that cannot start", () => {
  it("rejects, removes the profile, and lets the next call start afresh", async () => {
    // A child process: a spawn error without a listener ends the process. Its own TMPDIR shows
    // whether a profile is left behind.
    const tmp = mkdtempSync(join(dir, "nostart-"));
    writeFileSync(join(dir, "nostart.html"), "<!doctype html><html><body>x</body></html>");
    const script = `
      import { composeDocument, renderPdf } from ${JSON.stringify(join(import.meta.dir, "../scripts/render-pdf.ts"))};
      const outcome = (p) => p.then(() => "ok", (e) => e.message);
      process.env.CHROME_BINARY = "/nonexistent/chrome";
      const render = (warm) => outcome(renderPdf(${JSON.stringify(join(dir, "nostart.html"))}, ${JSON.stringify(join(dir, "nostart.pdf"))}, { warm }));
      const chrome = [await render(false), await render(true), await render(true)];
      const path = process.env.PATH;
      process.env.PATH = "/nonexistent";
      const compose = () => outcome(composeDocument("DocMarkdown", { html: "<p>x</p>" }, process.cwd(), { warm: true }));
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
    const { chrome, composer } = JSON.parse(out);
    // The second warm call fails on its own spawn, not on the dead Chrome the first one kept.
    for (const message of chrome) expect(message).toContain("ENOENT");
    expect(composer[0]).toStartWith("Composing DocMarkdown failed");
    expect(composer[1]).toBe("ok");
    expect(readdirSync(tmp).filter((f) => f.startsWith("hw-chrome-"))).toEqual([]);
  }, 60_000);
});

describe.skipIf(!chromeBinary())("renderPdf profile", () => {
  afterEach(() => {
    delete process.env.CHROME_BINARY;
  });

  it("runs Chrome in its own temporary profile and removes it, so it never touches the user's Chrome", async () => {
    // Chrome behind a script that records its arguments and whether the profile exists.
    const fake = join(dir, "fake-chrome.sh");
    const log = join(dir, "fake-chrome.log");
    writeFileSync(
      fake,
      `#!/bin/sh\nfor a in "$@"; do case "$a" in --user-data-dir=*) d="\${a#*=}"; [ -d "$d" ] && echo "exists $d" >> "${log}";; esac; echo "$a" >> "${log}"; done\nexec ${JSON.stringify(chromeBinary())} "$@"\n`,
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

describe.skipIf(!chromeBinary())("renderPdf with an empty Chrome cache", () => {
  it("installs Chrome without blocking the process and retries an install that failed", async () => {
    // A child process, since this file's module already holds the real Chrome. Its `bunx` stands
    // in for @puppeteer/browsers: it fails while the flag file exists, then prints a Chrome.
    const bin = join(dir, "install-bin");
    mkdirSync(bin);
    const flag = join(dir, "install-fails");
    const chrome = join(dir, "install-chrome.sh");
    writeFileSync(flag, "");
    writeFileSync(chrome, `#!/bin/sh\nexec ${JSON.stringify(chromeBinary())} "$@"\n`, {
      mode: 0o755,
    });
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

// Every check runs on a Chrome of its own and on the kept one.
describe.skipIf(!chromeBinary()).each([false, true])("renderPdf, warm: %p", (warm) => {
  let pdf: string;
  const pdfinfo = () => execFileSync("pdfinfo", [pdf], { encoding: "utf8" });
  const print = async (name: string, css: string) => {
    writeFileSync(
      join(dir, `${name}.html`),
      `<!doctype html><html><head><style>${css}</style></head><body><p>Text</p></body></html>`,
    );
    await renderPdf(join(dir, `${name}.html`), join(dir, `${name}-${warm}.pdf`), { warm });
    return join(dir, `${name}-${warm}.pdf`);
  };

  const brand = (file: string) =>
    createRequire(import.meta.url).resolve(`@hackersandwizards/brand/logos/${file}`);

  beforeAll(async () => {
    const logo = readFileSync(brand("lockup.png"));
    writeFileSync(join(dir, "mark.png"), logo);
    copyFileSync(brand("lockup.svg"), join(dir, "lockup.svg"));
    // The data URI, the file beside the page at its own proportions, and brand's lockup, whose
    // wizard is a 512 px PNG inside the SVG, as a data URI and as a file beside the page.
    writeFileSync(
      join(dir, "doc.html"),
      `<!doctype html><html lang="en"><body><h1>One</h1><img src="data:image/png;base64,${logo.toString("base64")}" style="width:108px;height:20px"><img src="mark.png" style="height:20px"><img src="${svgUri(readFileSync(brand("lockup.svg"), "utf8"))}" style="height:40px"><img src="lockup.svg" style="height:20px"><h2>Two</h2></body></html>`,
    );
    pdf = join(dir, `doc-${warm}.pdf`);
    await renderPdf(join(dir, "doc.html"), pdf, { warm });
  }, 60_000);

  it("prints only once the page's layout on globalThis.hwLayout has finished", async () => {
    // The layout ends a second after load, well past the load that Chrome's --print-to-pdf waited for.
    const late = `<script>(globalThis.hwLayout ??= []).push(new Promise((done) => addEventListener("load", () => setTimeout(() => { document.body.textContent = "Laid out"; done(); }, 1000))));</script>`;
    writeFileSync(
      join(dir, "late.html"),
      `<!doctype html><html><body>Pending${late}</body></html>`,
    );
    await renderPdf(join(dir, "late.html"), join(dir, `late-${warm}.pdf`), { warm });
    const text = execFileSync("pdftotext", [join(dir, `late-${warm}.pdf`), "-"], {
      encoding: "utf8",
    });
    expect(text.trim()).toBe("Laid out");
  }, 60_000);

  it("fails, and writes no PDF, when the layout never finishes or fails", async () => {
    const pending = `<script>(globalThis.hwLayout ??= []).push(new Promise(() => {}));</script>`;
    writeFileSync(
      join(dir, "pending.html"),
      `<!doctype html><html><body>x${pending}</body></html>`,
    );
    const out = join(dir, `pending-${warm}.pdf`);
    await expect(
      renderPdf(join(dir, "pending.html"), out, { warm, timeoutMs: 3000 }),
    ).rejects.toThrow(/within 3000 ms.*hwLayout/);
    expect(existsSync(out)).toBe(false);
    const failing = `<script>(globalThis.hwLayout ??= []).push(Promise.reject(new Error("no fit")));</script>`;
    writeFileSync(
      join(dir, "failing.html"),
      `<!doctype html><html><body>x${failing}</body></html>`,
    );
    await expect(renderPdf(join(dir, "failing.html"), out, { warm })).rejects.toThrow(/no fit/);
    expect(existsSync(out)).toBe(false);
  }, 60_000);

  it("fails, and writes no PDF, when the URL cannot be reached or answers an error", async () => {
    const out = join(dir, `url-${warm}.pdf`);
    const closed = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
    const port = closed.port;
    await closed.stop(true);
    await expect(renderPdf(`http://127.0.0.1:${port}/x`, out, { warm })).rejects.toThrow(
      "refused the connection: is its server running?",
    );
    const server = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response("<p>Internal error</p>", { status: 500 }),
    });
    try {
      await expect(renderPdf(`http://127.0.0.1:${server.port}/x`, out, { warm })).rejects.toThrow(
        /500/,
      );
    } finally {
      await server.stop(true);
    }
    expect(existsSync(out)).toBe(false);
  }, 60_000);

  it("writes the same bytes for the same input, with no render date and the file intact", async () => {
    // Chrome stamps the time to the second, so the second render lands in a later one.
    await Bun.sleep(1100);
    const again = join(dir, `doc-again-${warm}.pdf`);
    await renderPdf(join(dir, "doc.html"), again, { warm });
    expect(readFileSync(again).equals(readFileSync(pdf))).toBe(true);
    const info = spawnSync("pdfinfo", [pdf], { encoding: "utf8" });
    expect(info.stderr).toBe("");
    expect(info.stdout).not.toMatch(/^(CreationDate|ModDate):/m);
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

  it("embeds each raster image at three times its displayed size, not its source size", () => {
    const sizes = execFileSync("pdfimages", ["-list", pdf], { encoding: "utf8" })
      .split("\n")
      .slice(2)
      .map((row) => row.trim().split(/\s+/))
      .filter((cells) => cells[2] === "image")
      .map((cells) => cells.slice(3, 5).map(Number));
    // The data URI, the file beside the page, and the wizard as tall as the lockup's box, 40 px
    // from the data URI and 20 px from the file.
    expect(sizes[0]).toEqual([324, 60]);
    expect(sizes[1]![1]).toBe(60);
    expect(sizes[2]).toEqual([120, 120]);
    expect(sizes[3]).toEqual([60, 60]);
  });

  // The file beside the page, and the file brand exports named by its package path.
  it.each(["mark.svg", "@hackersandwizards/brand/logos/wordmark.svg"])(
    "prints a vector SVG, src %p, as paths, not as an image",
    async (src) => {
      copyFileSync(brand("wordmark.svg"), join(dir, "mark.svg"));
      const file = join(dir, "vector.html");
      writeFileSync(
        file,
        `<!doctype html><html lang="en"><body><img src="${src}" style="height:17px"></body></html>`,
      );
      const out = join(dir, `vector-${warm}.pdf`);
      await renderPdf(file, out, { warm });
      expect(execFileSync("pdfimages", ["-list", out], { encoding: "utf8" }).split("\n")[2]).toBe(
        "",
      );
      // The control: the mark printed, so the page has ink.
      const pgm = execFileSync("pdftoppm", ["-gray", "-r", "72", "-f", "1", "-l", "1", out]);
      // A PGM: three header lines, then one byte a pixel.
      const pixels = pgm.subarray(pgm.toString("latin1").split("\n", 3).join("\n").length + 1);
      expect(pixels.some((value) => value < 200)).toBe(true);
    },
    60_000,
  );

  it("fails on an image src brand does not export", async () => {
    const file = join(dir, "no-brand-image.html");
    writeFileSync(
      file,
      `<!doctype html><html lang="en"><body><img src="@hackersandwizards/brand/logos/none.svg"></body></html>`,
    );
    // A PDF from an earlier render does not survive the failed one.
    const out = join(dir, `no-brand-image-${warm}.pdf`);
    writeFileSync(out, "earlier");
    await expect(renderPdf(file, out, { warm })).rejects.toThrow(
      "brand exports no image @hackersandwizards/brand/logos/none.svg",
    );
    expect(existsSync(out)).toBe(false);
  });

  it("prints an SVG data URI it cannot read as it is", async () => {
    const file = join(dir, "bad-svg.html");
    writeFileSync(
      file,
      `<!doctype html><html lang="en"><body><p>Kept</p><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='100%' height='10'/%3E%3C/svg%3E" style="height:10px"></body></html>`,
    );
    const out = join(dir, `bad-svg-${warm}.pdf`);
    await renderPdf(file, out, { warm });
    expect(execFileSync("pdftotext", [out, "-"], { encoding: "utf8" })).toContain("Kept");
  }, 60_000);

  it("keeps every image in the box it was laid out in", async () => {
    // A word after each image sits where it sits beside the same images left unredrawn, which
    // data-print-scaled marks as done.
    const after = async (name: string, attr: string) => {
      writeFileSync(
        join(dir, `${name}.html`),
        `<!doctype html><html lang="en"><body><p><img ${attr} src="mark.png" style="height:13px">Alpha <img ${attr} src="${svgUri(readFileSync(brand("lockup.svg"), "utf8"))}" style="height:17px">Beta</p></body></html>`,
      );
      const out = join(dir, `${name}-${warm}.pdf`);
      await renderPdf(join(dir, `${name}.html`), out, { warm });
      return execFileSync("pdftotext", ["-bbox", out, "-"], { encoding: "utf8" })
        .match(/<word xMin="[\d.]+"[^>]*>(Alpha|Beta)</g)
        ?.join();
    };
    const redrawn = await after("boxes", "");
    expect(redrawn).toContain("Beta");
    expect(redrawn).toBe(await after("boxes-kept", "data-print-scaled"));
  }, 60_000);

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

describe.skipIf(!chromeBinary())("the quote, a page with a table", () => {
  // Chrome names each table header cell by a DOM node id that differed between cold renders: 3
  // variants in 20 renders of this page (measured), so one pair could still match.
  it("writes the same bytes in every render, cold or warm, its header cells numbered from 1", async () => {
    const quote = join(import.meta.dir, "..", "dist/types/quote/index.html");
    const pdfs: Buffer[] = [];
    for (let i = 0; i < 7; i++) {
      const out = join(dir, `quote-${i}.pdf`);
      await renderPdf(quote, out, { warm: i === 6 });
      pdfs.push(readFileSync(out));
    }
    expect(pdfs[0].toString("latin1")).toContain("/ID (node00000001)");
    expect(pdfs.findIndex((pdf) => !pdf.equals(pdfs[0]))).toBe(-1);
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

describe.skipIf(!chromeBinary())("the warm path", () => {
  it("composes the bytes a fresh run writes, after another type too, and prints what a fresh Chrome prints", async () => {
    const props = { kind: "Trainer Briefing", lang: "en", html: "<h1>Briefing</h1><p>Text</p>" };
    const once = await composeDocument("DocMarkdown", props);
    await composeDocument("DocRateCard", rateCard, process.cwd(), { warm: true });
    const warm = await composeDocument("DocMarkdown", props, process.cwd(), { warm: true });
    expect(warm).toBe(once);
    writeFileSync(join(dir, "warm.html"), once);
    await renderPdf(join(dir, "warm.html"), join(dir, "warm-cli.pdf"));
    await renderPdf(join(dir, "warm.html"), join(dir, "warm-kept.pdf"), { warm: true });
    expect(
      readFileSync(join(dir, "warm-kept.pdf")).equals(readFileSync(join(dir, "warm-cli.pdf"))),
    ).toBe(true);
  }, 60_000);

  it("lets the caller exit once its calls are done, Chrome and the composer with it", async () => {
    // Its own TMPDIR shows whether the kept Chrome's profile outlives it.
    const tmp = mkdtempSync(join(dir, "exit-"));
    const script = `
      import { composeDocument, renderPdf } from ${JSON.stringify(join(import.meta.dir, "../scripts/render-pdf.ts"))};
      await composeDocument("DocMarkdown", { html: "<p>x</p>" }, process.cwd(), { warm: true });
      await renderPdf(${JSON.stringify(join(dir, "doc.html"))}, ${JSON.stringify(join(dir, "exit.pdf"))}, { warm: true });
      console.log(process.pid);`;
    const started = performance.now();
    const child = Bun.spawn([process.execPath, "-e", script], {
      env: { ...process.env, TMPDIR: tmp },
      stderr: "inherit",
    });
    await child.exited;
    expect(child.exitCode).toBe(0);
    expect(performance.now() - started).toBeLessThan(20_000);
    expect(readdirSync(tmp).filter((f) => f.startsWith("hw-chrome-"))).toEqual([]);
    // No process outlives the caller that started it.
    const pid = (await new Response(child.stdout).text()).trim();
    const orphans = spawnSync("pgrep", ["-P", pid], { encoding: "utf8" }).stdout.trim();
    expect(orphans).toBe("");
  }, 60_000);
});
