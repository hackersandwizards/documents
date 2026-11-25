import { afterAll, afterEach, assert, beforeAll, describe, expect, it } from "vitest";
import { pathToFileURL } from "node:url";
import { execFileSync, spawnSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { inflateSync } from "node:zlib";
import { assertBrandFonts, cutFacesToPdf } from "../../scripts/font-faces";
import { bakeDocumentCss, documentCss } from "../../scripts/document-css";
import { composeDocument, composeWarmDocument } from "../../scripts/compose-document";
import { renderPdf } from "../../scripts/render-pdf";
import { chromeBinary } from "@hackersandwizards/scaffolding/chrome";
import { rejection } from "@hackersandwizards/scaffolding/rejection";
import { svgUri } from "../../scripts/fill";
import { isRecord } from "../../scripts/root";
import { preparation, rateCard } from "../../scripts/samples";
import { probePage, limit } from "../probe";

const dir = mkdtempSync(join(tmpdir(), "render-pdf-"));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

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

  it(
    "reads a ToUnicode map stored uncompressed or with its filter in an array as a compressed one",
    async () => {
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
      // A PDF whose fonts it cannot find (another writer's dictionaries) leaves every face whole,
      // never reads as one that printed no face.
      const unread = join(dir, "faces-unread.pdf");
      writeFileSync(
        unread,
        readFileSync(pdf, "latin1").replaceAll("/Subtype /Type0", "/Subtype /TypeX"),
        "latin1",
      );
      expect(await cutFacesToPdf(html, unread)).toBe(html);
    },
    limit(60_000),
  );
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
    expect(profile?.startsWith(tmpdir())).toBe(true);
    expect(lines).toContain(`exists ${profile}`);
    expect(existsSync(profile!)).toBe(false);
  });
});

describe.skipIf(!chromeBinary())("renderPdf with an empty Chrome cache", () => {
  it("installs Chrome without blocking the process and retries an install that failed", async () => {
    // A child process, since this file's module already holds the real Chrome. Its `bunx` stands
    // in for @puppeteer/browsers: it fails while the flag file exists, then installs a
    // Chrome into the folder its `--path` names, $5, and prints its path.
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
      `#!/bin/sh\necho "$1" > "${flag}.pkg"\nsleep 0.5\n[ -e "${flag}" ] && exit 1\nmkdir -p "$5/chrome/test-1"\ncp "${chrome}" "$5/chrome/test-1/chrome"\necho "$5/chrome/test-1/chrome"\n`,
      { mode: 0o755 },
    );
    writeFileSync(join(dir, "install.html"), "<!doctype html><html><body>x</body></html>");
    const script = `
      import { unlinkSync } from "node:fs";
      import { renderPdf } from ${JSON.stringify(join(import.meta.dirname, "../../scripts/render-pdf.ts"))};
      let ticks = 0;
      const timer = setInterval(() => ticks++, 50);
      const render = () => renderPdf(${JSON.stringify(join(dir, "install.html"))}, ${JSON.stringify(join(dir, "install.pdf"))}).then(() => "ok", (e) => e.message);
      const failed = await render();
      // The failed call is the install alone: no Chrome came back to print with.
      const installing = ticks;
      unlinkSync(${JSON.stringify(flag)});
      const retried = await render();
      clearInterval(timer);
      console.log(JSON.stringify({ failed, retried, installing }));`;
    const env: Record<string, string | undefined> = {
      ...process.env,
      PATH: `${bin}:${process.env.PATH}`,
      CHROME_BINARY: undefined,
      PUPPETEER_CACHE_DIR: join(dir, "empty-cache"),
    };
    const child = Bun.spawn([process.execPath, "-e", script], { env, stderr: "inherit" });
    const result: unknown = JSON.parse(await new Response(child.stdout).text());
    assert(isRecord(result), "Expected Chrome install outcomes");
    expect(result.failed).toContain("Chrome for Testing is required");
    expect(result.retried).toBe("ok");
    // bunx runs the package it is given from the registry: a version range would run whatever
    // was published last.
    expect(readFileSync(`${flag}.pkg`, "utf8").trim()).toMatch(
      /^@puppeteer\/browsers@\d+\.\d+\.\d+$/,
    );
    // An install of 0.5 s: a blocking one leaves the 50 ms timer near zero, a print never counts.
    expect(result.installing).toBeGreaterThan(5);
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
    // wizard is a 512 px PNG inside the SVG, as a data URI and as a file beside the page. The
    // page's own script declares the print script's names, which runs beside it all the same.
    writeFileSync(
      join(dir, "doc.html"),
      `<!doctype html><html lang="en"><body><script>const redraw = 1, keep = 2, svgText = 3;</script><h1>One</h1><img src="data:image/png;base64,${logo.toString("base64")}" style="width:108px;height:20px"><img src="mark.png" style="height:20px"><img src="${svgUri(readFileSync(brand("lockup.svg"), "utf8"))}" style="height:40px"><img src="lockup.svg" style="height:20px"><h2>Two</h2></body></html>`,
    );
    pdf = join(dir, `doc-${warm}.pdf`);
    await renderPdf(join(dir, "doc.html"), pdf, { warm });
  }, limit(60_000));

  it(
    "prints only once the page's layout on globalThis.hwLayout has finished",
    async () => {
      // The layout ends a second after load, so a print at load would read "Pending".
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
    },
    limit(60_000),
  );

  it(
    "fails, and writes no PDF, when the layout never finishes or fails",
    async () => {
      const pending = `<script>(globalThis.hwLayout ??= []).push(new Promise(() => {}));</script>`;
      writeFileSync(
        join(dir, "pending.html"),
        `<!doctype html><html><body>x${pending}</body></html>`,
      );
      const out = join(dir, `pending-${warm}.pdf`);
      expect(
        await rejection(renderPdf(join(dir, "pending.html"), out, { warm, timeoutMs: 3000 })),
      ).toMatch(/within 3000 ms.*hwLayout/);
      expect(existsSync(out)).toBe(false);
      const failing = `<script>(globalThis.hwLayout ??= []).push(Promise.reject(new Error("no fit")));</script>`;
      writeFileSync(
        join(dir, "failing.html"),
        `<!doctype html><html><body>x${failing}</body></html>`,
      );
      expect(await rejection(renderPdf(join(dir, "failing.html"), out, { warm }))).toMatch(
        /no fit/,
      );
      expect(existsSync(out)).toBe(false);
    },
    limit(60_000),
  );

  it(
    "keeps a page without a head in standards mode",
    async () => {
      const page = join(dir, `headless-${warm}.html`);
      writeFileSync(
        page,
        `<!doctype html><html lang="en"><body><script>document.title = document.compatMode;</script>x</body></html>`,
      );
      const out = join(dir, `headless-${warm}.pdf`);
      await renderPdf(page, out, { warm });
      expect(execFileSync("pdfinfo", [out], { encoding: "utf8" })).toMatch(
        /^Title:\s+CSS1Compat$/m,
      );
    },
    limit(60_000),
  );

  it(
    "times out a page whose server never answers, and leaves no rejection unhandled",
    async () => {
      const unhandled: unknown[] = [];
      const note = (reason: unknown) => unhandled.push(reason);
      process.on("unhandledRejection", note);
      const silent = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: () => new Promise<Response>(() => {}),
      });
      try {
        expect(
          await rejection(
            renderPdf(`http://127.0.0.1:${silent.port}/x`, join(dir, `silent-${warm}.pdf`), {
              warm,
              timeoutMs: 1000,
            }),
          ),
        ).toMatch(/within 1000 ms/);
        await Bun.sleep(200);
        expect(unhandled).toEqual([]);
      } finally {
        process.off("unhandledRejection", note);
        await silent.stop(true);
      }
    },
    limit(60_000),
  );

  it(
    "fails, and writes no PDF, when the URL cannot be reached or answers an error",
    async () => {
      const out = join(dir, `url-${warm}.pdf`);
      const closed = Bun.serve({ port: 0, hostname: "127.0.0.1", fetch: () => new Response() });
      const port = closed.port;
      await closed.stop(true);
      expect(await rejection(renderPdf(`http://127.0.0.1:${port}/x`, out, { warm }))).toContain(
        "refused the connection: is its server running?",
      );
      const server = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: () => new Response("<p>Internal error</p>", { status: 500 }),
      });
      try {
        expect(
          await rejection(renderPdf(`http://127.0.0.1:${server.port}/x`, out, { warm })),
        ).toMatch(/500/);
      } finally {
        await server.stop(true);
      }
      expect(existsSync(out)).toBe(false);
    },
    limit(60_000),
  );

  it(
    "writes the same bytes for the same input, with no render date and the file intact",
    async () => {
      // Chrome stamps the time to the second, so the second render lands in a later one.
      await Bun.sleep(1100);
      const again = join(dir, `doc-again-${warm}.pdf`);
      await renderPdf(join(dir, "doc.html"), again, { warm });
      expect(readFileSync(again).equals(readFileSync(pdf))).toBe(true);
      const info = spawnSync("pdfinfo", [pdf], { encoding: "utf8" });
      expect(info.stderr).toBe("");
      expect(info.stdout).not.toMatch(/^(CreationDate|ModDate):/m);
    },
    limit(60_000),
  );

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
    limit(60_000),
  );

  it(
    "prints an SVG data URI it cannot read as it is",
    async () => {
      const file = join(dir, "bad-svg.html");
      writeFileSync(
        file,
        `<!doctype html><html lang="en"><body><p>Kept</p><img src="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10'%3E%3Crect width='100%' height='10'/%3E%3C/svg%3E" style="height:10px"></body></html>`,
      );
      const out = join(dir, `bad-svg-${warm}.pdf`);
      await renderPdf(file, out, { warm });
      expect(execFileSync("pdftotext", [out, "-"], { encoding: "utf8" })).toContain("Kept");
    },
    limit(60_000),
  );

  it(
    "keeps every image in the box it was laid out in",
    async () => {
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
    },
    limit(60_000),
  );

  it(
    "passes a document on the base's static faces and fails one on the browser default",
    async () => {
      expect(() => assertBrandFonts(pdf)).toThrow(/non-brand face/);
      const branded = await print("branded", documentCss());
      expect(() => assertBrandFonts(branded)).not.toThrow();
      // A file pdffonts cannot read says so, rather than that poppler is missing.
      const broken = join(dir, "broken.pdf");
      writeFileSync(broken, "no pdf");
      expect(() => assertBrandFonts(broken)).toThrow(/could not read/);
    },
    limit(60_000),
  );

  it(
    "fails on a system fallback face",
    async () => {
      const helvetica = await print("helvetica", "body { font-family: Helvetica; }");
      expect(() => assertBrandFonts(helvetica)).toThrow(/non-brand face/);
    },
    limit(60_000),
  );

  it(
    "fails on a variable brand face, which prints as Type 3",
    async () => {
      const font = createRequire(import.meta.url).resolve(
        "@hackersandwizards/brand/fonts/inter-latin-wght-normal.woff2",
      );
      const variable = await print(
        "variable",
        `@font-face { font-family: Inter; src: url(data:font/woff2;base64,${readFileSync(font).toString("base64")}); } body { font-family: Inter; }`,
      );
      expect(() => assertBrandFonts(variable)).toThrow(/Type 3/);
    },
    limit(60_000),
  );
});

describe.skipIf(!chromeBinary())("the quote, a page with a table", () => {
  // Chrome names each table header cell by a DOM node id that differed between cold renders: 3
  // variants in 20 renders of this page (measured), so one pair could still match.
  it(
    "writes the same bytes in every render, cold or warm, its header cells numbered from 1",
    async () => {
      const quote = join(import.meta.dirname, "../..", "dist/types/quote/index.html");
      const pdfs: Buffer[] = [];
      for (let i = 0; i < 7; i++) {
        const out = join(dir, `quote-${i}.pdf`);
        await renderPdf(quote, out, { warm: i === 6 });
        pdfs.push(readFileSync(out));
      }
      expect(pdfs[0].toString("latin1")).toContain("/ID (node00000001)");
      expect(pdfs.findIndex((pdf) => !pdf.equals(pdfs[0]))).toBe(-1);
    },
    limit(60_000),
  );
});

// A briefing writes each question as a bold paragraph over its answer. Sections of varied length
// put such a label at many heights on the page, so some reach a page foot: none ends a page alone.
describe.skipIf(!chromeBinary())("a bold label paragraph", () => {
  it(
    "stays on the page with the text under it",
    async () => {
      const sections = Array.from({ length: 48 }, (_, i) => {
        const filler = "<p>An invented line of filler.</p>".repeat(i % 6);
        return `<p><strong>Label ${i}</strong></p><p>Answer ${i} runs over two lines of the page measure, long enough to wrap once at the body size of the base.</p>${filler}`;
      });
      const html = bakeDocumentCss(
        await composeDocument("DocMarkdown", {
          kind: "Delivery Briefing",
          html: sections.join(""),
        }),
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
    },
    limit(60_000),
  );
});

describe.skipIf(!chromeBinary())("a body naming other resources", () => {
  it(
    "prints no local file it frames and calls no host out of the render",
    async () => {
      writeFileSync(join(dir, "secret.txt"), "SECRET-LOCAL-FILE");
      let requests = 0;
      const server = Bun.serve({
        port: 0,
        hostname: "127.0.0.1",
        fetch: () => {
          requests++;
          return new Response("x");
        },
      });
      try {
        const url = `http://127.0.0.1:${server.port}`;
        writeFileSync(
          join(dir, "active.html"),
          `<!doctype html><html><head><meta charset="utf-8"></head><body><p>Body</p><iframe src="secret.txt"></iframe><iframe src="${pathToFileURL(join(dir, "secret.txt")).href}"></iframe><img src="${url}/pixel.png"><script>fetch("${url}/beacon").catch(() => {});</script></body></html>`,
        );
        await renderPdf(join(dir, "active.html"), join(dir, "active.pdf"));
        const text = execFileSync("pdftotext", [join(dir, "active.pdf"), "-"], {
          encoding: "utf8",
        });
        expect(text).toContain("Body");
        expect(text).not.toContain("SECRET-LOCAL-FILE");
        expect(requests).toBe(0);
      } finally {
        await server.stop(true);
      }
    },
    limit(60_000),
  );
});

describe.skipIf(!chromeBinary())("the preparation's code", () => {
  it(
    "wraps a command wider than its card rather than widen the page",
    async () => {
      const long =
        "bunx some-long-command --with-a-flag=value --and-another=/a/long/path/to/a/file/that/goes/on.txt";
      const [first, ...following] = preparation.steps;
      assert(first, "Expected an installation step in the sample");
      const steps = [
        { ...first, html: first.html.replace("choco install nodejs-lts git", long) },
        ...following,
      ];
      expect(steps[0]!.html).toContain(long);
      const html = await composeDocument("DocPreparation", { ...preparation, steps });
      const width = probePage(html, `return String(document.documentElement.scrollWidth);`, [
        "--window-size=794,1123",
      ]);
      expect(width).toBe("794");
    },
    limit(60_000),
  );
});

describe.skipIf(!chromeBinary())("the warm path", () => {
  it(
    "a page that times out leaves the kept Chrome's other prints running",
    async () => {
      const never = `<script>(globalThis.hwLayout ??= []).push(new Promise(() => {}));</script>`;
      const slow = `<script>(globalThis.hwLayout ??= []).push(new Promise((done) => addEventListener("load", () => setTimeout(() => { document.body.textContent = "Laid out"; done(); }, 2500))));</script>`;
      writeFileSync(join(dir, "never.html"), `<!doctype html><html><body>x${never}</body></html>`);
      writeFileSync(join(dir, "slow.html"), `<!doctype html><html><body>x${slow}</body></html>`);
      writeFileSync(join(dir, "start.html"), `<!doctype html><html><body>x</body></html>`);
      // Chrome started first, so both prints run in the same kept one.
      await renderPdf(join(dir, "start.html"), join(dir, "start.pdf"), { warm: true });
      const [hung, done] = await Promise.allSettled([
        renderPdf(join(dir, "never.html"), join(dir, "never.pdf"), { warm: true, timeoutMs: 1000 }),
        renderPdf(join(dir, "slow.html"), join(dir, "slow.pdf"), {
          warm: true,
          timeoutMs: limit(20_000),
        }),
      ]);
      expect(hung.status).toBe("rejected");
      expect(done).toEqual({ status: "fulfilled", value: undefined });
    },
    limit(60_000),
  );

  it(
    "composes the bytes a fresh run writes, after another type too, and prints what a fresh Chrome prints",
    async () => {
      const props = { kind: "Trainer Briefing", lang: "en", html: "<h1>Briefing</h1><p>Text</p>" };
      const once = await composeDocument("DocMarkdown", props);
      await composeWarmDocument("DocRateCard", rateCard, process.cwd());
      const warm = await composeWarmDocument("DocMarkdown", props, process.cwd());
      expect(warm).toBe(once);
      writeFileSync(join(dir, "warm.html"), once);
      await renderPdf(join(dir, "warm.html"), join(dir, "warm-cli.pdf"));
      await renderPdf(join(dir, "warm.html"), join(dir, "warm-kept.pdf"), { warm: true });
      expect(
        readFileSync(join(dir, "warm-kept.pdf")).equals(readFileSync(join(dir, "warm-cli.pdf"))),
      ).toBe(true);
    },
    limit(60_000),
  );

  it(
    "lets the caller exit once its calls are done, Chrome and the composer with it",
    async () => {
      // Its own TMPDIR shows whether the kept Chrome's profile outlives it.
      const tmp = mkdtempSync(join(dir, "exit-"));
      const script = `
      import { composeWarmDocument } from ${JSON.stringify(join(import.meta.dirname, "../../scripts/compose-document.ts"))};
      import { renderPdf } from ${JSON.stringify(join(import.meta.dirname, "../../scripts/render-pdf.ts"))};
      await composeWarmDocument("DocMarkdown", { html: "<p>x</p>" }, process.cwd());
      await renderPdf(${JSON.stringify(join(dir, "doc.html"))}, ${JSON.stringify(join(dir, "exit.pdf"))}, { warm: true });
      // The kept Chrome and composer, still running here; the test looks for them once this exits.
      const { spawnSync } = await import("node:child_process");
      console.log(spawnSync("pgrep", ["-P", String(process.pid)], { encoding: "utf8" }).stdout.trim());`;
      const started = performance.now();
      const child = Bun.spawn([process.execPath, "-e", script], {
        env: { ...process.env, TMPDIR: tmp },
        stderr: "inherit",
      });
      await child.exited;
      expect(child.exitCode).toBe(0);
      expect(performance.now() - started).toBeLessThan(20_000);
      expect(readdirSync(tmp).filter((f) => f.startsWith("hw-chrome-"))).toEqual([]);
      const children = (await new Response(child.stdout).text()).trim().split(/\s+/).map(Number);
      expect(children.length).toBeGreaterThanOrEqual(2);
      const alive = children.filter((pid) => {
        try {
          process.kill(pid, 0);
          return true;
        } catch {
          return false;
        }
      });
      expect(alive).toEqual([]);
    },
    limit(60_000),
  );
});
