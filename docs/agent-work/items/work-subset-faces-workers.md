---
kind: work
status: open
priority: 3
order: 1970
area: engine
owner: an agent
evidence: "docs/agent-work/2026-11-08-performance.md, section The engine: encoding eight faces over four Bun Workers took 174 and 187 ms instead of 448 and 459 ms (prototype, not shipped)"
---

# Encode the cut faces in parallel once a Worker survives os's server build

`subsetFaces` spends about 0.35 s of every fresh compose re-encoding the cut faces to WOFF2, and a
kept composer pays it again whenever a page's characters change. Spreading the encoding over Bun
Workers takes about 0.27 s off each such call.

First test whether a Worker file that `subsetFaces` references through `import.meta.url` still
loads after os bundles this package into its Astro server build through Vite. Only then ship the
Workers, release, and measure a fresh `composeDocument` against the 1004 to 1226 ms in the report.

Done when a release encodes the faces in parallel, os's built server composes a document with it,
and the report states the new compose times.
