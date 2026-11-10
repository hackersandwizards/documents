# @hackersandwizards/documents

The hackers&wizards document engine as one package: the document base, every document
component, composing a component to standalone HTML and rendering it to PDF with headless Chrome.
Company OS and the trainer hub install it and keep what fills their documents.

Maintainer: Benedikt Stemmildt. The repo is public, its history included, so nothing goes in that
may not be public.

The catalog shows every document type and component with invented data, and each type as a whole
page at `/documents/types/<type>/index.html`. It is published at
https://hackersandwizards.github.io/documents/ on every push to `main`; `bun run build`
writes it to `dist/`, never committed.

## Use it in another repo

Add the dependency in exactly this form, pinned to the newest tag
(`git ls-remote --tags https://github.com/hackersandwizards/documents.git` lists them), next to
`@hackersandwizards/brand`, whose tokens, faces and logos the documents use. Both repos are public:
Bun fetches the `git+https://` form through GitHub's tarball API without a GitHub login.

```json
"@hackersandwizards/documents": "git+https://github.com/hackersandwizards/documents.git#v<version>"
```

| Import or command                                         | What                                                                                                            |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `@hackersandwizards/documents/tokens.css`                 | the document tokens: every value a role on the brand's tokens                                                   |
| `@hackersandwizards/documents/document.css`               | the print base                                                                                                  |
| `@hackersandwizards/documents/onepager.css`               | the onepager's own stylesheet                                                                                   |
| `@hackersandwizards/documents/handout.css`                | the handout's print stylesheet                                                                                  |
| `@hackersandwizards/documents/components/<Doc*.astro>`    | a document component                                                                                            |
| `@hackersandwizards/documents/render-pdf`                 | `renderPdf` (an HTML file or URL), `renderHandoutPdf`, `bakeDocumentCss`, `composeDocument`, `assertBrandFonts` |
| `@hackersandwizards/documents/compose`                    | `openComposer`, `composePage`                                                                                   |
| `@hackersandwizards/documents/onepager`                   | `composeOnepager`, `fitOnepager`: the onepager and its two-page fit                                             |
| `@hackersandwizards/documents/survey-readout`             | `composeSurveyReadout`: the attendee-feedback readout deck                                                      |
| `@hackersandwizards/documents/handout`                    | `HANDOUT_TEXT`: the handout's own words per language                                                            |
| `bun run documents-compose <Doc> <props.json> <out.html>` | one component with its props as standalone HTML                                                                 |
| `bun run documents-privacy [--deny <terms.txt>]`          | fails on private data in the package, and on each term of the file                                              |
| `bun run documents-styles <file or dir>...`               | fails on a style in a document HTML file that the engine did not draw                                           |

Astro, Vite, `@hackersandwizards/brand`, `@hackersandwizards/testimonials` and
`@hackersandwizards/scaffolding` are peer dependencies: the consumer's own copies compile the
components, a page names a testimonial's mark by its package path, and `./render-pdf` imports
scaffolding's `./chrome` at run time, so a consumer installs scaffolding beside its runtime
dependencies. Brand, testimonials and scaffolding are optional peers, so Bun never looks them up
on the npm registry: pin each from its Git tag.

The TypeScript exports run under Bun only: they parse HTML with Bun's `HTMLRewriter`, which Node
lacks, so `inlineImages` and every composer and render throw `HTMLRewriter is not defined` under
Node (a Node test runner such as vitest included). Call them from a Bun process.

## Work on the package

Requirements: Bun 1.3 or newer, poppler (`brew install poppler`) for the font and handout checks,
and `gitleaks` (`brew install gitleaks`) for the commit hook. Rendering starts Chrome for Testing
and the first render or `bun run check` installs it into `~/.cache/puppeteer`.

```sh
git clone https://github.com/hackersandwizards/documents.git && cd documents
bun install      # also points the git hooks at .githooks/
bun run dev      # the catalog at http://127.0.0.1:4330/
bun run check    # scaffolding's gate with the catalog build, then this repository's steps (CLAUDE.md, Commands)
```

The git hooks check the staged files, the commit message and each push;
[.githooks/README.md](.githooks/README.md) lists them.

## Release

A release raises `version` in `package.json`, commits and pushes `main` first
(`git push origin main`). Only once that push has landed does it tag `v<version>` to match and push
the tag (`git tag v<version> && git push origin v<version>`): a tag pushed with a rejected `main`
points at a commit `main` never holds. Consumers then raise the tag in their dependency line.
Every push is public at once, so before the commit the maintainer runs Company OS's privacy check
with its real names over this checkout, from a Company OS checkout:
`bun scripts/repo/documents-privacy.ts --package <this checkout>`. The full steps and the layout:
[CLAUDE.md](CLAUDE.md).

Security issues: [SECURITY.md](SECURITY.md). Licence: PolyForm Strict 1.0.0, see
[LICENSE](LICENSE).
