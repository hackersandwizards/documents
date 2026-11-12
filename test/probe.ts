import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromeArgs, chromeBinary, INSTALL_HINT } from "@hackersandwizards/scaffolding/chrome";
import { brandFile, inlineCss } from "../scripts/render-pdf";

/** `html` rendered in Chrome, then `probe` (a script body run on load, after the page's own load
 * listeners) returns the string the test reads. `args` adds Chrome flags, such as a window size. */
export function probePage(html: string, probe: string, args: string[] = []): string {
  const chrome = chromeBinary();
  if (!chrome) throw new Error(INSTALL_HINT);
  const script = `<script>addEventListener("load", () => {
    const pre = document.createElement("pre");
    pre.id = "probe";
    pre.textContent = (() => { ${probe} })();
    document.body.append(pre);
  });</script>`;
  const dir = mkdtempSync(join(tmpdir(), "probe-"));
  try {
    const page = join(dir, "page.html");
    writeFileSync(page, html.replace("</body>", `${script}</body>`));
    const dom = execFileSync(
      chrome,
      [
        ...chromeArgs(join(dir, "profile")),
        ...args,
        "--virtual-time-budget=10000",
        "--dump-dom",
        `file://${page}`,
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    );
    return dom.match(/<pre id="probe">([^<]*)<\/pre>/)![1]!;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** The fallback families (a name holding "Fallback") the font stacks in `css` name, and those of
 * them an `@font-face` in `css` defines, each sorted. */
export function fallbackFamilies(css: string): { named: string[]; defined: string[] } {
  const families = (pattern: RegExp) =>
    new Set(
      [...css.matchAll(pattern)].flatMap(([, s]) =>
        [...s!.matchAll(/"([^"]*Fallback[^"]*)"/g)].map(([, n]) => n!),
      ),
    );
  const named = [...families(/--font-(?:sans|mono|code)\s*:([^;]+);/g)].sort();
  const faces = families(/@font-face\s*\{\s*font-family:([^;]+);/g);
  return { named, defined: named.filter((n) => faces.has(n)) };
}

/** A page linking brand's files by their export name (a `link` of `(file) => file`), each link
 * replaced by the file with its imports inlined, as a browser reaches it in the installed package. */
export const withLinkedBrand = (html: string) =>
  html.replace(
    /<link rel="stylesheet" href="([^"]+)" \/>/g,
    (_, file: string) => `<style>${inlineCss(brandFile(file))}</style>`,
  );

/** `ms` stretched by the load the gate measured: `SCAFFOLDING_TEST_TIMEOUT_MS` is 5000 on an idle
 * machine and grows with load, and a test's own limit grows with it. */
export const limit = (ms: number) =>
  (ms * Number(process.env.SCAFFOLDING_TEST_TIMEOUT_MS || 5000)) / 5000;
