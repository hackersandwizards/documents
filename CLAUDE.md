# CLAUDE.md

The hackers&wizards document engine as one package, `@hackersandwizards/documents`: the document
base `document.css`, the document components `components/Doc*.astro`, composing a component with
its props to standalone HTML (`scripts/compose.ts`, the `documents-compose` command) and rendering
HTML to PDF with headless Chrome (`scripts/render-pdf.ts`). Company OS and the trainer hub run it
and keep what fills a document: the props, the Markdown reading, the callers.

This repo is public on GitHub (`github.com/hackersandwizards/documents`), its history included.
Consumers install it as a Git dependency pinned to a tag,
`git+https://github.com/hackersandwizards/documents.git#v<version>`, which needs no GitHub access.
`"private": true` stays: nothing is ever published to a registry. A release is a tag `v<version>`
matching `package.json`. Nothing here writes into another repo.

**Anyone can read this whole repo, its history included.** Nothing goes in that may not be public:
no client document, price, rate, discount, client term, personal data or secret. Every rate or term
is a prop, and so is every word a component prints itself (`labels`, the survey readout's `text`,
today's words the default); the samples are fictitious and every euro figure in them is a placeholder.
`scripts/privacy.ts` (the `documents-privacy` command) holds that line without private data: euro
figures only as placeholders, mail only on example domains or ours, no phone, IBAN or street but
the imprint's and the invented ones, credential IDs only as `…-EXAMPLE0EXAMPLE0`, and every person
or client in the samples' name props (`PERSON_KEYS`, `personAt`) from its `INVENTED` words; a name
in free text, such as a title or an `html` body, is left to the deny terms. Company OS runs it with
its real names as `--deny` terms in its own gate, each matched in file paths and text, in any case,
across a line break and with `&` as an entity (an all-capitals term in lower case only in a slug), so
a real name the rules cannot see fails there; those names never enter this repo, and an empty deny
list fails. A comment in a
shipped file says what the code does and why, never its history: scores, review rounds, dates,
decision or item ids, pointers to review notes and names go to the commit message or
`docs/agent-work/` (the gate's `history` step).

## Layout

- `tokens.css`: the document tokens: the brand's tokens, print faces, document scale
  (`document.css`: every length, size and step of the base and of each type) and list marker
  (`marker.css`, switched on with `--hw-markers: on` at the print size) imported from
  `@hackersandwizards/brand`, never a copy; the roles (colour, type, page, marks, spacing) as
  aliases of brand tokens; and the named page boxes, since `@page` reads no custom property. A
  value the engine lacks is added to brand's `document.css` first, then used here.
- `document.css`: the print base every document sits on, on `tokens.css`: the page, the running
  heads and every element a type or a Markdown body uses. A component owns its block's scoped
  style; the base keeps a class a component took over until no stored document uses it, and
  `test/document-css.test.ts` lists every class it still styles. `test/tokens.test.ts` fails on a
  length or colour written in a stylesheet or a component's style element but `tokens.css`, and on an inline style setting anything but a
  custom property.
- `components/`: one component per document type or building block; a type composes only
  components, and every type but the certificate, which draws its own strip, starts with `DocHeader`. `DocAgreement` is every agreement signed by
  hand (contract, NDA, framework agreement, order confirmation) in its contract or letter form; a
  proposal the client signs takes `DocProposal`'s `signatures`. A component imports only this
  repo's files and the brand package's exported files (`@hackersandwizards/brand/logos/...`), never
  an app path. `DocElements` maps the brand's elements over what it wraps, so a component a
  consumer renders in its own Astro route (the hub's handout, through `DocHandout`) matches a composed page.
  A component whose script lays the page out after load puts that work's promise on
  `globalThis.hwLayout`, which `renderPdf` waits for before it prints.
- `scripts/compose.ts`: `openComposer` runs Astro's compiler of the project in the current
  directory; the command composes one component from a props JSON, and `--serve` composes on
  request for `composeDocument`'s `warm`. `scripts/render-pdf.ts`: the print settings on the
  Chrome and flags of scaffolding's `./chrome`, the render date blanked and the table header ids
  renumbered so one input prints the same bytes, the document base baked into
  `<style data-hw-document>` (brand's fallback faces with it, which `print.css` imports),
  `compactStyles`, which every standalone page passes (baked, onepager,
  survey readout): its styles without CSS comments, which a reader of the page never needs, with the
  brand's `@layer` order once, first (`test/layers.test.ts`), without the
  rules (by class, id, element or attribute name) and custom properties its markup cannot use (`pruneStyles`, `scripts/prune.ts`; a page
  with a script or an event handler, such as the certificate, the handout and the readout, keeps every rule), and without a
  face whose `unicode-range` none of its characters fall in, `subsetFaces`, which cuts each inlined face to
  the page's characters for a composed page and the onepager, its WOFF2 encoding, like `cutFacesToPdf`'s, on Bun Workers (`scripts/encode-face.ts`) and in-process where none can run (a consumer that bakes a stored page in place
  runs it after `bakeDocumentCss`), `cutFacesToPdf`, which cuts each face of a printed page to the
  characters that face printed and drops the faces it never printed (`fitOnepager` runs it),
  `composeDocument` and the font check `assertBrandFonts`. `warm` on
  `composeDocument` and `renderPdf` keeps the composer and Chrome running between calls, for a long-running caller such as an app route. `renderPdf` prints an HTML file or a
  page an `http(s)` URL serves, an HTML file's images inlined: a file beside it, and a file one of
  our packages exports named by its package path (`src="@hackersandwizards/testimonials/marks/..."`),
  resolved from where this package is installed, which fails the render where that package does not
  export it. `inlineImages` does that inlining, exported for a
  consumer's viewer of stored pages too. `renderHandoutPdf` prints a `DocHandout` in passes, each read back
  with poppler's `pdftotext` for `toc`, `flow` and `notes`, from a URL (the pass as its query) or a
  function composing the HTML; without poppler the first render stands and the result says so.
- `onepager.css` and `scripts/onepager.ts`: the training-offering onepager's own stylesheet,
  `composeOnepager`, which composes `DocOnepager` on it instead of the whole document base, and
  `fitOnepager`, which renders it and picks the fit (tight, page-2 start, lift and air levels) that
  keeps it on two pages. `onepagerBrandFiles` lists every brand file that render reads, for a
  consumer that hashes them; `test/onepager-trace.ts` traces a render to hold the list exact.
- `handout.css` and `components/DocHandout.astro`: the printed training handout, the document base
  plus its own layout (margin notes, cover with contents, chapter openings) and the script that
  keeps headings with their blocks; `scripts/handout.ts` exports its own words, `HANDOUT_TEXT`, per
  language. The trainer hub keeps the chapters and the exporter that measures a first render for
  the contents' page numbers, the chapters that run on and the notes.
- `scripts/survey-readout.ts` and `readout.css`: `composeSurveyReadout`, the attendee-feedback
  readout, seven 1280x720 slides on the document tokens, and its score bands (`bandColor`,
  `scalePosition`). A TypeScript module that writes one HTML string, not an Astro component.
- `scripts/prose.ts`: `proseHtml`, how the engine takes a Markdown body: style attributes dropped,
  pandoc's alignment as a class, a style or link element refused.
- `scripts/styles.ts`: the `documents-styles` command and `foreignStyles`, which `bakeDocumentCss`
  also runs: a document carries only the engine's style elements (`data-hw-document`,
  `data-hw-components`, `data-hw-page`, `data-hw-onepager`, `data-hw-readout`,
  `data-hw-certificate`) and inline custom properties. Each consumer runs it over its stored
  documents in its own gate.
- `scripts/elements.ts`: `withElements`, which gives the engine's classes (card, callout, chip,
  doc-tag, eyebrow, label, table, quote, code block, link in text) the brand's shared elements
  (`@hackersandwizards/brand/elements.flat.css`) on every composed and baked page; the base and the
  components keep only layout. `brand-elements.json` lists the elements used and each exception
  with its reason, and `brand-elements` in the gate measures the type pages against the brand. A
  rule restyling an element-named class fails there: set the element's `--hw-*` setting instead,
  or list an exception.
- `scripts/samples.ts`: the fictitious props the catalog and the tests share.
- `catalog/`: the catalog, one Astro app in scaffolding's shell (`@hackersandwizards/scaffolding`,
  preset `catalog` in `catalog/astro.config.ts`). Astrobook over
  `catalog/stories` at the site's root, the tiles grouped `Types`, then `Components` (their former German paths forward); each story
  renders its component on an A4 sheet at the print scale (`Sheet.astro`). Every document type is
  an Astro page at `/types/<type>/index.html` (`catalog/pages/types/`, listed in `catalog/types.ts`): the
  component on `_Type.astro`, the document base as `composePage` prints it, and the elements page
  (each brand element used, as a tile marked with its brand version, and each exception with its
  reason). The onepager and the survey readout are routes calling `composeOnepager` and
  `composeSurveyReadout`, the string composers consumers call. `test/stories.test.ts` fails on a
  component without a story or on no type page. `bun run build` writes it all to `dist/`, never
  committed: the type pages link the brand files the preset's `copy` puts beside them, so they
  open from disk, and the tests, `brand-markers` and `brand-elements` read them there. The old
  addresses `/design-system/` and `/specimen/` redirect, and the former `/catalog/` pages forward.
  Astro and Astrobook are dev dependencies for it alone, outside `files` and `exports`, so no
  consumer gets them.

A consumer reaches the engine through `exports` (`./tokens.css`, `./document.css`, `./onepager.css`,
`./handout.css`, `./components/*`, `./compose`, `./render-pdf`, `./onepager`, `./survey-readout`, `./handout`) and the `documents-compose`, `documents-privacy` and `documents-styles` commands, run as `bun run <command>`. Every other
path is internal. `scaffolding.styles` in `package.json` lists `document.css` and `handout.css`, the
stylesheets a consumer loads beside the components, which scaffolding's `check-coupling` then lets
through. Renaming a command, changing its arguments or moving an exported file breaks
consumers: the release commit names it and every consumer follows in the same pass. Astro, Vite, brand,
testimonials (whose marks a page names by package path) and scaffolding (its `./chrome`, which
`render-pdf.ts` imports at run time, so a consumer installs it beside its runtime dependencies) are
peer dependencies, brand from v2.17.0 (the imprint DocHeader, the certificate, the samples and the
privacy check read from its `imprint.json` and `verbal.json`, so `documents-privacy` needs brand
installed, the tint panels' teal line on paper, and the readout's corner lockup,
`--deck-corner-lockup`), brand, testimonials and scaffolding optional in
`peerDependenciesMeta` so Bun never looks them up on the npm registry; the runtime dependencies are `entities`, which `fitOnepager` decodes copy with, and `subset-font`
(HarfBuzz) with `woff2-encoder`, which `subsetFaces` cuts and re-encodes the faces with; `keywords: ["astro-component"]` makes Astro compile the components from
`node_modules`.

## Commands

- `bun run check`: `scaffolding check`, the gate from `@hackersandwizards/scaffolding`: format,
  lint, stylelint (`stylelint.config.js`), typecheck (`tsc`, then `astro check` over the components,
  the catalog and the scripts, `scaffolding.typecheck`), structure, coupling, unique function names,
  the confidential-terms and history checks, the catalog build and `admin-check` side by side, then this
  repository's steps from `scaffolding.check` in `package.json`: the tests (every component renders
  standalone, compose, the render and font checks, the certificate fit in Chrome, the base's class
  list, the type pages, the markers `brand-markers` leaves out: step numbers and squares outside a
  list), `brand-markers` on every type page holding a `<ul>` (`check:markers`), the privacy check
  (`check:privacy`), the brand colour scan (`brand-colours.json` holds the exceptions) beside
  `brand-copies` and `brand-retired` over `dist/` (`check:retired`), and `brand-elements`. The
  tests read `dist/`, so they run after the build, not among the shared steps. No hook runs the
  gate: `.githooks/pre-commit` runs `bun run check:staged` (scaffolding's `check-staged`).
  `bun install` points `core.hooksPath` at `.githooks/`.
- `bun run dev` (or `bun run catalog`): serve the catalog at `http://127.0.0.1:4330/`, the type
  pages at `/types/<type>/index.html`. Dev serves at the root; the build keeps the Pages base
  `/documents` and writes the type pages to `dist/types/`.
- `bun run build`: write the catalog to `dist/`, under scaffolding's `check-lock`.
- `bun run fix`: `eslint --fix`, then `prettier --write`.
- One test file: `bun test <file>`.

## Releasing a change

1. Change the engine here, `bun run check` green, raise `version`. Before the commit, run Company
   OS's real names over this checkout: in os, `bun scripts/repo/documents-privacy.ts --package
<this checkout>`. Every push is public at once, so its gate in os, which reads the pinned
   release, comes too late (a client name reached history that way in v0.1.14). Then commit and
   push; once the push has landed, tag `v<version>` and push the tag.
2. In each consumer (os, trainer-hub), raise the tag in `package.json`, `bun install`, run its gate.
   A changed component changes rendered PDFs: render a real document of each changed type before
   and after and compare the pages.

## Behavioral rules

Project rules live in `.claude/rules/*.md`. Read and apply them each session. Claude loads them
natively. Codex and pi must read the directory themselves. Ignore the global `~/.claude/rules` set
in this repository. These project rules supersede it. The rules and skills under `.claude/` are
mirrored from the agent-config hub (`~/.claude/scripts/sync-agent-config.sh`): change them there,
never here.
