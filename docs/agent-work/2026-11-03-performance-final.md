# Performance final run: documents

Final run of os item `work-make-every-frontend-snappier-all-os-pages`, 2026-11-03. The one cost
documents owns that a person waits on was the onepager fit: 3.35 s, now 0.91 s (v0.7.3). Every PDF
type renders in 0.12-0.16 s in the kept Chrome and 0.52-0.59 s cold; every PDF page and catalog page
is pixel-identical. The catalog's weak spot, the home page on mobile (Lighthouse performance 77, LCP
5.9 s), belongs to scaffolding's tile home.

## Method

- Production: `astro build` of the catalog (94 pages), served by a static server that emulates
  GitHub Pages (gzip, `max-age=600`, base `/documents`): before on 127.0.0.1:4686, after on :4688.
  Dev: `astro dev --ignore-lock` on :4687. Ports 4321-4323 untouched.
- Headless Chrome for Testing 156.0.8078.80, a temporary profile per series, a fresh context per
  load, 1440 x 900. Three runs per figure: median, range in brackets. Lighthouse 13, desktop and
  mobile, three runs.
- PDF: `renderPdf` per type, cold (a fresh Chrome) and warm (the kept Chrome), three runs each;
  `fitOnepager` on the onepager fixture, three runs.
- Load (1-minute average from `uptime`): 7.0-14.6 across the series. The machine was never idle.
- Measured in the browser: catalog home, the 19 type pages and 6 dashboards and stories; Lighthouse
  on home and four type pages.

## Before and after

Production catalog, median (no catalog file changed, so before stands for after; the built `dist/`
before and after is byte-identical):

| Page                    | LCP ms     | KB      | Requests |
| ----------------------- | ---------- | ------- | -------- |
| Catalog home            | 76 [68-84] | 2,196   | 172      |
| Type pages (19)         | 52-72      | 157-249 | 12-39    |
| Dashboards, stories (6) | 48-56      | 92-209  | 7-19     |

TTFB 2-3 ms, long tasks 0 ms. Component dashboards CLS 0.063: the catalogue bar, inserted on
`DOMContentLoaded` (scaffolding).

Lighthouse, performance / accessibility / best practices / SEO:

| Page           | Desktop              | Mobile                 |
| -------------- | -------------------- | ---------------------- |
| Catalog home   | 95 [86-97]/96/100/91 | 77 [77-79]/100/100/91  |
| Angebot        | 100/97/100/91        | 94/97/100/91           |
| Handout        | 100/97/100/91        | 96 [95-96]/97/100/91   |
| Onepager       | 100/95/100/91        | 99 [99-100]/95/100/91  |
| Survey readout | 100/96/100/91        | 100 [99-100]/96/100/91 |

PDF render, median ms before / after:

| Path                   | Before              | After           |
| ---------------------- | ------------------- | --------------- |
| `renderPdf`, cold (19) | 530-585             | 519-565         |
| `renderPdf`, warm (19) | 115-162             | 120-137         |
| `fitOnepager`          | 3,354 [3,343-3,556] | 914 [912-1,511] |

Starts: dev cold 939 [927-957] ms, warm 904 [848-918] ms to the first page; the onepager type page
then 334 ms cold, 295 ms warm (its fit). Build 0.96-1.12 s before, 0.85-1.02 s after (Astro's page
count line; 1.26-2.08 s wall clock with `bun run`). v0.7.3 touches no dev or build path, so starts
were measured once.

## Fix

- v0.7.3 (fde7454, tag v0.7.3): `fitOnepager` renders each of its fits in the kept Chrome instead
  of a fresh one (about 0.4 s saved per fit, up to a dozen fits), with one retry, since headless
  Chrome on macOS sometimes exits non-zero.

Every consumer now pins a release past v0.7.3: os v1.7.0, website v1.8.0, trainer-hub v1.8.1
(read 06.11.2026).
