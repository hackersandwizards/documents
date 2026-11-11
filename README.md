# @hackersandwizards/documents

The hackers&wizards document engine: it turns a quote, a timesheet, an agreement, a certificate
or a training handout into a PDF in the company's design. The package holds the document base,
every document component, composing a component to standalone HTML and rendering it to PDF with
headless Chrome. Company OS and the trainer hub install it and keep what fills their documents.
Slide decks come from [slides](https://github.com/hackersandwizards/slides).

| You want                                   | Go to                                                                                                             |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| to see every document type and component   | the [catalog](https://hackersandwizards.github.io/documents/), with invented data, each type also as a whole page |
| documents in your repository               | [Install](#install) and [Use](#use)                                                                               |
| to change a component or the document base | [Work on the package](#work-on-the-package)                                                                       |
| to release a change                        | [Releasing a change](CLAUDE.md#releasing-a-change) in CLAUDE.md                                                   |
| someone to ask                             | the maintainer, Benedikt Stemmildt                                                                                |

## Install

Add it pinned to the newest tag
(`git ls-remote --tags https://github.com/hackersandwizards/documents.git` lists them); the
install needs no GitHub login:

```sh
bun add "git+https://github.com/hackersandwizards/documents.git#v<version>"
```

Pin beside it, each `@hackersandwizards` package from its Git tag in the form above:

- Astro (`^7.4.4`) and Vite (`^8.3.5`), which compile the components
- `@hackersandwizards/brand` v2.17.0 or newer, whose tokens, faces and logos the documents use
- `@hackersandwizards/testimonials`, whose marks a page names by package path
- `@hackersandwizards/scaffolding` among your runtime dependencies: `./render-pdf` imports its `./chrome` at run time

**Bun only.** The TypeScript exports parse HTML with Bun's `HTMLRewriter`, so under Node,
vitest included, they throw `HTMLRewriter is not defined`. Call them from a Bun process, and
test their callers with `bun test`.

## Use

Compose a component with its props, then print the page to PDF. Run it from your Astro project's
root: `composeDocument` compiles the component with that project's Astro.

```ts
import { composeDocument, renderPdf } from "@hackersandwizards/documents/render-pdf";

const html = await composeDocument("DocMarkdown", { kind: "Briefing", html: "<h1>Hi</h1>" });
await Bun.write("briefing.html", html);
await renderPdf("briefing.html", "briefing.pdf");
```

The imports, each under `@hackersandwizards/documents/`:

- `render-pdf`: `renderPdf` (an HTML file or URL), `composeDocument`, `renderHandoutPdf`, `bakeDocumentCss`, `assertBrandFonts`, `inlineImages`, `subsetFaces`, `brandCss`
- `document.css`: the print base; `tokens.css`: the document tokens, every value a role on the brand's tokens
- `components/<Doc*.astro>`: a document component, rendered in your own Astro route
- `compose`: `openComposer`, `composePage`, `escapeHtml`
- `onepager`: `composeOnepager`, `fitOnepager`, the onepager and its two-page fit; `onepager.css`: its own stylesheet
- `survey-readout`: `composeSurveyReadout`, the attendee-feedback readout deck; `bandColor`, `scalePosition`, `STRENGTH_AT`, its score bands
- `handout` and `handout.css`: `HANDOUT_TEXT`, the handout's words per language, and its print stylesheet

Every export and what it does: [CLAUDE.md](CLAUDE.md#layout).

## Commands

Run each with `bun run <name>`; `--help` prints its usage.

- `documents-compose` writes one component with its props as standalone HTML
- `documents-privacy` fails on private data in the package, and on each term of a deny file
- `documents-styles` fails on a style in a document HTML file that the engine did not draw

## Work on the package

Requirements: Bun 1.3 or newer, poppler (`brew install poppler`) for the font and handout checks,
and `gitleaks` (`brew install gitleaks`) for the commit hook. Rendering starts Chrome for Testing
and the first render or `bun run check` installs it into `~/.cache/puppeteer`.

- `bun install` installs and points the git hooks at `.githooks/`, which [.githooks/README.md](.githooks/README.md) lists
- `bun run dev` serves the catalog at `http://127.0.0.1:4330/`
- `bun run check` runs the gate: scaffolding's steps with the catalog build, then this repository's
- `bun run build` writes the catalog to `dist/`, never committed; Pages publishes it on every push to `main`

A release is a tag `v<version>` matching `package.json`. Before its commit, Company OS's privacy
check runs with the real names over this checkout; the tag follows once the push has landed. The
steps: [Releasing a change](CLAUDE.md#releasing-a-change); the rest of the rules: [CLAUDE.md](CLAUDE.md).

The repo is public, its history included, so nothing goes in that
may not be public. Security issues: [SECURITY.md](SECURITY.md). Licence: PolyForm Strict 1.0.0, see
[LICENSE](LICENSE).
