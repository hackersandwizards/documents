# CLAUDE.md

The hackers&wizards document engine as one package, `@hackersandwizards/documents`: the document
base `document.css`, the document components `components/Doc*.astro`, composing a component with
its props to standalone HTML (`scripts/compose.ts`, the `documents-compose` command) and rendering
HTML to PDF with headless Chrome (`scripts/render-pdf.ts`). Company OS and the trainer hub run it
and keep what fills a document: the props, the Markdown reading, the callers. The reasoning is in
os `docs/tracking/2026-10-31-brand-kit-slides-docs.md`.

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
the imprint's and the invented ones, and every person or client in the samples' props from its
`INVENTED` words. Company OS runs it with its real names as `--deny` terms in its own gate, so a
real name the rules cannot see fails there; those names never enter this repo.

## Layout

- `tokens.css`: the document tokens, three layers in one file: the brand's tokens, print faces and
  list marker (`marker.css`, switched on with `--hw-markers: on` at the print size) imported from
  `@hackersandwizards/brand`, never a copy; the roles (colour, type, page, rule,
  spacing) on them; the tokens of each type (proposal, certificate, handout, onepager, readout deck)
  and the named page boxes, since `@page` reads no custom property. The one value copied from
  another package is the readout's wordmark corner, from `@hackersandwizards/slides`, recorded
  beside it with its version: slides exports it only inside its Tailwind stylesheet.
- `document.css`: the print base every document sits on, on `tokens.css`: the page, the running
  heads and every element a type or a Markdown body uses. A component reuses a base class and never
  re-declares it. `test/tokens.test.ts` fails on a length or colour written anywhere but
  `tokens.css`, and on an inline style setting anything but a custom property.
- `components/`: one component per document type or building block; a type composes only
  components, and every type starts with `DocHeader`. `DocAgreement` is every document signed by
  hand (contract, NDA, framework agreement, order confirmation) in its contract or letter form. A component imports only this
  repo's files and the brand package's exported files (`@hackersandwizards/brand/logos/...`), never
  an app path.
- `scripts/compose.ts`: `openComposer` runs Astro's compiler of the project in the current
  directory; the command composes one component from a props JSON. `scripts/render-pdf.ts`: the
  Chrome flag set, the document base baked into `<style data-hw-document>`, `composeDocument` and
  the font check `assertBrandFonts`.
- `onepager.css` and `scripts/onepager.ts`: the training-offering onepager's own stylesheet,
  `composeOnepager`, which composes `DocOnepager` on it instead of the whole document base, and
  `fitOnepager`, which renders it and picks the fit (tight, page-2 start, lift and air levels) that
  keeps it on two pages.
- `handout.css` and `components/DocHandout.astro`: the printed training handout, the document base
  plus its own layout (margin notes, cover with contents, chapter openings) and the script that
  keeps headings with their blocks. The trainer hub keeps the chapters and the exporter that
  measures a first render for the contents' page numbers, the chapters that run on and the notes.
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
  (`@hackersandwizards/brand/elements.css`) on every composed and baked page; the base and the
  components keep only layout. `brand-elements.json` lists the elements used and each exception
  with its reason, and `brand-elements` in the gate measures the specimen against the brand. A
  rule restyling an element-named class fails there: set the element's `--hw-*` setting instead,
  or list an exception.
- `scripts/samples.ts`: the fictitious props the specimen and the tests share.
- `specimen/`: one page per document type, `elemente.html` (each brand element used, as a tile
  marked with its brand version, and each exception with its reason) and `index.html` with the layers and the component
  catalogue (each component, the types composing it), generated by `scripts/specimen.ts`.
  Never edit it; run `bun run specimen`. The pages link the brand files from `node_modules`, so they
  open from disk after `bun install`.

A consumer reaches the engine through `exports` (`./tokens.css`, `./document.css`, `./onepager.css`,
`./handout.css`, `./components/*`, `./compose`, `./render-pdf`, `./onepager`, `./survey-readout`) and the `documents-compose`, `documents-privacy` and `documents-styles` commands, run as `bun run <command>`. Every other
path is internal. Renaming a command, changing its arguments or moving an exported file breaks
consumers: the release commit names it and every consumer follows in the same pass. Astro and Vite
are peer dependencies; `keywords: ["astro-component"]` makes Astro compile the components from
`node_modules`.

## Commands

- `bun run check`: format, lint, typecheck, unique function names, tests (every component renders
  standalone, compose, the render and font checks, the certificate fit in Chrome, the base's class
  list), the freshness of `specimen/` and a component no specimen page shows, the brand's list-marker check on every specimen page with a list (`brand-markers`, `check:markers`), the privacy check (`documents-privacy`), the brand colour scan
  (`brand-colours.json` holds the exceptions). No hook runs it: `.githooks/pre-commit` runs
  `bun run check:staged`: `gitleaks` over the staged changes, `prettier --check` and `eslint` on
  the staged files. `bun install` points `core.hooksPath` at `.githooks/`.
- `bun run specimen`: rebuild `specimen/`.
- `bun run dev`: serve the checkout on port 4328 for `http://documents.localhost` (Caddy, as for
  `os.localhost`); the specimen's header links the brand catalogue and the slide specimen at
  `brand.localhost` and `slides.localhost`.
- `bun run fix`: `eslint --fix`, then `prettier --write`.
- One test file: `bun test <file>`.

## Releasing a change

1. Change the engine here, `bun run check` green, raise `version`. Before the commit, run Company
   OS's real names over this checkout: in os, `bun scripts/repo/documents-privacy.ts --package
<this checkout>`. Every push is public at once, so its gate in os, which reads the pinned
   release, comes too late (a client name reached history that way in v0.1.14). Then commit, tag
   `v<version>`, push with the tag.
2. In each consumer (os, trainer-hub), raise the tag in `package.json`, `bun install`, run its gate.
   A changed component changes rendered PDFs: render a real document of each changed type before
   and after and compare the pages.

## Behavioral rules

Project rules live in `.claude/rules/*.md`. Read and apply them each session. Claude loads them
natively. Codex and pi must read the directory themselves. Ignore the global `~/.claude/rules` set
in this repository. These project rules supersede it. The rules and skills under `.claude/` are
mirrored from the agent-config hub (`~/.claude/scripts/sync-agent-config.sh`): change them there,
never here.
