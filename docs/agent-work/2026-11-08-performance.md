# Performance, 08.11.2026 (v1.22.2)

Measured on the Mac (Apple Silicon, Bun 1.4.4, Chrome for Testing 156), on servers this run started
on free ports. Other sessions ran Lighthouse on the same machine; each Lighthouse batch waited until
the 1-minute load was at or below 4, and the load sits beside every number as 1, 5 and 15 minutes.

## What changed against 07.11.

- Catalog home on mobile: 63 then, 64 before this run's change, 78 after it. The story pages no
  longer inline the catalog's 123 KB stylesheet (below).
- `composeDocument`, fresh process: 507 to 675 ms then, 1004 to 1226 ms now. Explained below:
  cutting the faces, which v1.17.0 added, takes about 0.4 s of it. Not changed in this run.
- Type pages: SEO 91 then, 54 now. They have carried `noindex` since v1.14.1, which fails
  Lighthouse's `is-crawlable`. Intended, no performance change.
- Everything else is within the noise of the load.

## The change: the catalog links its stylesheet

`build.inlineStylesheets: "always"` put the catalog's whole stylesheet (Astrobook's shell, the
brand's faces, every component) into each story page: 123 KB, 40 KB gzipped. The home loads one
story page per visible preview iframe, so it fetched and parsed that block once per iframe. The
setting existed for the type pages, which open from disk. Now the catalog uses Astro's default,
`auto`, which links the shared stylesheet so every iframe reuses one cached copy, and
`type-page-styles` inlines whatever stylesheet Astro links on a type page.

Every type page in `dist/types/` is byte-identical to the build before the change, and screenshots
of the home, a story in the dashboard and two story frames are pixel-identical. Page size, gzipped:
home 52 to 11 KB, story in the dashboard 49 to 10 KB, story frame 67 to 28 KB, plus the shared
39 KB stylesheet once.

## Lighthouse 12.8.2, production build, median of three

Served as GitHub Pages serves (gzip, `Cache-Control: max-age=600`). Before and after ran back to back
per page and form factor, under the same load reading.

| Page                      | Mobile before | after | FCP before | after | Desktop before | after | Load at start  |
| ------------------------- | ------------- | ----- | ---------- | ----- | -------------- | ----- | -------------- |
| Catalog home              | 64            | 78    | 5.7 s      | 3.8 s | 87             | 97    | 3.70 6.93 6.48 |
| Story in the dashboard    | 86            | 96    | 3.1 s      | 2.1 s | 100            | 100   | 3.98 5.66 6.03 |
| Story frame               | 96            | 94    | 2.3 s      | 2.4 s | 100            | 100   | 3.77 4.99 5.70 |
| Type page, Angebot        | 90            | 91    | 2.9 s      | 2.9 s | 100            | 100   | 3.86 4.70 5.43 |
| Type page, Elements       | 87            | 87    | 3.2 s      | 3.2 s | 99             | 99    | 3.85 4.60 5.27 |
| Type page, Onepager       | 98            | 98    | 2.0 s      | 2.0 s | 100            | 100   | 3.95 4.46 5.12 |
| Type page, Survey Readout | 98            | 98    | 2.0 s      | 2.0 s | 100            | 100   | 3.93 4.49 5.01 |

TBT is 0 ms everywhere, CLS at most 0.013. Accessibility 97 to 100, best practices 93 to 100 (the
type pages: no viewport meta and print-size type, by design). The type pages are the same files in
both builds and score the same, which puts the run-to-run noise at about one point.

The story frame opened on its own loses two points on mobile: it now waits for the linked
stylesheet. Inside the dashboard, where the frame is seen, the page gains ten.

The type pages lose their mobile points to render-blocking brand stylesheets: `elements.css`
`@import`s 29 files and `document.css` one more, a chain of about 40 requests before first paint.
Control: the Angebot page with only those links flattened into one inline style scores 98 instead
of 91 (FCP 2.0 s instead of 2.9 s; three runs each, alternating, load 3.85 4.39 4.85). The brief
is below.

## Navigation and interaction, headless Chrome, median of five

Unthrottled, viewport 1366x900, a fresh profile per run, two passes in alternating order.

Second pass, load 3.64 at the start of after and 3.75 at the start of before:

| Step                                    | Before | After  |
| --------------------------------------- | ------ | ------ |
| Home to load event                      | 193 ms | 170 ms |
| Search: typing to the next frame        | 2 ms   | 2 ms   |
| Home to a story (click, load)           | 73 ms  | 61 ms  |
| Story to the next story (client router) | 49 ms  | 48 ms  |
| Type page Angebot, cold tab             | 16 ms  | 14 ms  |

The first pass read 62 and 40 ms before, 69 and 53 ms after for the two story steps, at load 3.9
and 4.7; the second pass, at 3.6 and 3.8, reads as in the table. Beyond the home, no difference outside the load.

## Startup

Launch to the first 200, three cold runs each:

- `astro dev --ignore-lock` (`bun run dev`): 897, 837, 792 ms (load 3.3). 903 to 935 ms on 07.11.
- `astro preview --ignore-lock`: 577, 441, 425 ms (load 3.7). There is no `preview` script; the
  catalog deploys as static files.
- `bun run build`, whole process: 2.13, 1.49, 1.51 s for 97 pages (load 3.0 to 3.3).

## The engine (the endpoints of this package)

DocProposal from the samples, load 3.79 at start and 5.26 at the end:

| Call                     | 07.11.                   | 08.11.                     |
| ------------------------ | ------------------------ | -------------------------- |
| `composeDocument`, fresh | 507 to 675 ms            | 1226, 1028, 1004 ms        |
| `composeDocument`, kept  | p50 11.5 ms, p95 14.3 ms | p50 18.4 ms, p95 22.0 ms   |
| `renderPdf`, fresh       | 531 to 557 ms            | 592, 528, 556 ms           |
| `renderPdf`, kept        | p50 135 ms, p95 142 ms   | p50 130.9 ms, p95 134.1 ms |

A fresh compose in phases, three runs at load 4.6 to 5.7: imports 175 ms, opening Vite 258 to
296 ms, rendering 47 to 54 ms, baking 19 to 20 ms, `subsetFaces` 461 to 474 ms. Without that last
phase the total is about 530 ms, the 07.11. figure. Within `subsetFaces` on this page's 101
characters, eight faces: decoding 21 ms, cutting with HarfBuzz 34 ms, encoding back to WOFF2
350 ms. A kept composer pays the 0.4 s again whenever a page's characters differ from the last
call's (395 to 472 ms over four such calls); the same characters again take 2 ms.

`woff2-encoder` exposes no compression level. A prototype encoding the eight faces over four
Bun Workers took 174 and 187 ms instead of 448 and 459 ms, Worker start included (load 3.6).
Not shipped: os bundles this package into its Astro server build through Vite, and whether a
Worker file referenced by `import.meta.url` survives that bundle is not tested.

## Open in other repositories

- brand: `elements/elements.css` is 29 `@import`s and `tokens/document.css` imports
  `stage.css`, so a page that links them waits on a request chain before first paint. Ship a flat
  build of each (imports resolved, one file) beside the source, and the type pages link that. The
  control above measured 91 to 98 on mobile for the Angebot type page.
- brand (from 07.11., still open): the marker's cap share (`--hw-marker-mid`, 2/3) is no value a
  test can read, so `test/marker-position.test.ts` retypes it.
- scaffolding (from 07.11., narrowed): the home still loads a live iframe per visible story. With
  the stylesheet shared, the home scores 78 on mobile; 94 was measured without the iframes on
  07.11.

## Left open here

- `subsetFaces` encoding in parallel (above): about 0.27 s off every fresh compose and every
  warm compose with new characters. It needs a test of the Worker inside os's built server first.
