import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderPdf } from "./render-pdf";
import { isRecord } from "./root";

/** The page balance fitOnepager picks: `tight` for copy over two pages, then the widest gap level
 *  (0 to 4) between page 1's blocks after the hero (`lift`) and between page 2's blocks after its
 *  first one (`air`); `page2Start` is the position of the block that opens page 2 among the
 *  children of `.page` (1 is the header). */
export interface OnepagerFit {
  tight?: boolean;
  lift?: number;
  air?: number;
  page2Start?: number;
}

/** A page's extracted text as its words, lower case, on single spaces. */
export const flatText = (text: string) => text.toLowerCase().replace(/\s+/g, " ").trim();
const pdfPages = (pdf: string) =>
  Number(execFileSync("pdfinfo", [pdf], { encoding: "utf8" }).match(/^Pages:\s+(\d+)/m)?.[1]);
export const pdfPageText = (pdf: string, page: number) =>
  execFileSync("pdftotext", ["-f", `${page}`, "-l", `${page}`, pdf, "-"], { encoding: "utf8" });

export function onepagerTrials(bake: (fit: OnepagerFit) => Promise<string>, dir: string) {
  const work = mkdtempSync(join(tmpdir(), "hw-onepager-"));
  const tag = work.split("-").pop();
  // Each fit renders once into its own files, so the levels of one kind render side by side and
  // the last step reads the chosen fit back instead of rendering it again.
  const renders = new Map<string, { html: string; pdf: string }>();
  const files = async (fit: OnepagerFit) => {
    const key = JSON.stringify(fit);
    let f = renders.get(key);
    if (!f) {
      f = {
        html: join(dir, `.onepager-fit-${tag}-${renders.size}.html`),
        pdf: join(work, `fit-${renders.size}.pdf`),
      };
      renders.set(key, f);
      writeFileSync(f.html, await bake(fit));
    }
    return f;
  };
  const rendered = new Map<string, Promise<number>>();
  const render = async (fit: OnepagerFit) => {
    const { html, pdf } = await files(fit);
    const key = JSON.stringify(fit);
    let pages = rendered.get(key);
    if (!pages) {
      // In the kept Chrome: a fit renders up to 13 times, and a fresh Chrome per render
      // cost about 0.4 s each. Retry an exit once: a fresh-Chrome render sometimes exited non-zero on macOS,
      // and whether a kept one still does is not measured.
      pages = renderPdf(html, pdf, { warm: true })
        .catch((error: unknown) => {
          if (isRecord(error) && error.code === "HW_CHROME_EXITED")
            return renderPdf(html, pdf, { warm: true });
          throw error;
        })
        .then(() => pdfPages(pdf));
      rendered.set(key, pages);
    }
    return { pages: await pages, pdf };
  };
  return {
    files,
    render,
    close() {
      for (const { html } of renders.values()) rmSync(html, { force: true });
      rmSync(work, { recursive: true, force: true });
    },
  };
}

export async function widestOnepagerSpacing(
  fits: OnepagerFit[],
  first: string,
  trial: ReturnType<typeof onepagerTrials>,
): Promise<OnepagerFit | undefined> {
  for (const fit of fits) await trial.files(fit);
  const renders = fits.map(trial.render);
  await Promise.allSettled(renders);
  const results = await Promise.all(renders);
  let kept: OnepagerFit | undefined;
  for (const [i, { pages, pdf }] of results.entries()) {
    if (pages !== 2 || flatText(pdfPageText(pdf, 1)) !== first) break;
    kept = fits[i];
  }
  return kept;
}
