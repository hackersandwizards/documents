# Performance, 07.11.2026 (v1.13.2 to v1.14.0)

Measured on the Mac (Apple Silicon, Bun 1.4.4, Chrome for Testing 156), on servers this run started
on free ports. Other sessions kept the machine busy: the load average sits beside each number.

## Startup

`bun run dev` (`astro dev --ignore-lock`), launch to first 200 on `/`, three cold runs: 903, 908 and
935 ms (load 11.8). Astro 7 starts `astro dev` in the background when it detects an agent; a run
that measures it passes `--ignore-lock`, or it times a server that never stops.

`composeDocument` (a fresh `compose.ts` process per call), DocProposal: 675, 559, 507 ms before,
555, 529, 521 ms after (load 10 and 7). Kept (`warm`): p50 11.5 ms, p95 14.3 ms before; 13.3 and
15.8 ms after, within the noise of the load. `renderPdf` of the same page: fresh 531 to 557 ms,
kept p50 135 ms, p95 142 ms, before and after alike.

## Dev routes, 20 requests each after one warm-up

| Route                              | First  | p50      | p95      |
| ---------------------------------- | ------ | -------- | -------- |
| `/`                                | 4 ms   | 2.4 ms   | 3.4 ms   |
| `/dashboard/Typen/.../angebot/`    | 98 ms  | 2.5 ms   | 3.7 ms   |
| `/stories/Typen/.../angebot/`      | 18 ms  | 2.2 ms   | 3.1 ms   |
| `/stories/Typen/.../handout/`      | 22 ms  | 1.9 ms   | 2.2 ms   |
| `/types/angebot/index.html`        | 19 ms  | 1.2 ms   | 1.6 ms   |
| `/types/handout/index.html`        | 4 ms   | 0.9 ms   | 1.1 ms   |
| `/types/elemente/index.html`       | 6 ms   | 1.0 ms   | 1.2 ms   |
| `/types/onepager/index.html`       | 304 ms | 150.6 ms | 164.1 ms |
| `/types/survey-readout/index.html` | 8 ms   | 2.3 ms   | 2.9 ms   |

Load 11.4 to 11.8. The onepager route opens a fresh Vite composer per request, so a component
edit shows on reload: opening it takes 126 to 154 ms, composing 14 to 18 ms (six runs). Explained,
kept.

## Lighthouse 12.8, production build, median of three

Served as GitHub Pages serves (gzip, `Cache-Control: max-age=600`).

| Page                      | Mobile perf | FCP   | Desktop perf | FCP   | Load      |
| ------------------------- | ----------- | ----- | ------------ | ----- | --------- |
| Catalog home              | 63          | 5.5 s | 90           | 1.4 s | 14.7-15.6 |
| Story in the dashboard    | 96          | 2.3 s | 100          | 0.6 s | 12.1-15.3 |
| Story frame               | 95          | 2.4 s | 100          | 0.5 s | 8.5-13.0  |
| Type page, Angebot        | 91          | 2.9 s | 100          | 0.7 s | 17.2-23.8 |
| Type page, Elemente       | 87          | 3.2 s | 99           | 0.8 s | 10.2-12.1 |
| Type page, Onepager       | 97          | 2.1 s | 100          | 0.5 s | 6.3-8.2   |
| Type page, Survey Readout | 98          | 2.1 s | 100          | 0.4 s | 6.8-14.3  |

Accessibility 97 to 100, best practices 93 to 100. SEO is 60 to 63 on the catalog pages, which
carry `noindex`, and 91 on the type pages (no meta description; print-size type, by design).

The catalog home's previews cause its mobile score. Control: the same build with the preview
iframes removed scores 94 on mobile (FCP 2.1 s) and 100 on desktop. Each preview is a story page
of about 94 KB gzipped: 46 KB the lockup as a data URI (brand's `lockup.svg` embeds a PNG), 39 KB
inline CSS (`inlineStylesheets: "always"`, which the type pages need to open from disk), 8 KB the
rest. Since v1.20.0 the header carries brand's `lockup-screen.svg`: the same story page
(`dist/stories/Types/doc-proposal/angebot-mit-staffel-und-unterschrift/index.html`) is 68 KB
gzipped, 17 KB of it the lockup. The preview iframes do not belong to this repository; the brief
is below.

## Open in other repositories

- brand: it does not export the marker's cap share (`--hw-marker-mid`, 2/3) as a value a test can
  read, so `test/marker-position.test.ts` retypes it as `CAP_SHARE`.
- scaffolding: the catalog home loads a live iframe per visible story (`catalog/render.ts`, already
  lazy). Static preview images, or iframes deferred until the tile scrolls into view past the first
  row, lift the home's mobile score from 63 toward the 94 measured without them.
