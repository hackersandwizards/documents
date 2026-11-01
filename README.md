# @hackersandwizards/documents

The hackers&wizards document engine as one package: the document base, every document
component, composing a component to standalone HTML and rendering it to PDF with headless Chrome.
Company OS and the trainer hub install it and keep what fills their documents.

Maintainer: Benedikt Stemmildt. The repo is public, its history included, so nothing goes in that
may not be public.

The specimen shows every document type with invented data: open `specimen/index.html` after
`bun install`.

## Use it in another repo

Add the dependency in exactly this form, pinned to the newest tag
(`git ls-remote --tags https://github.com/hackersandwizards/documents.git` lists them), next to
`@hackersandwizards/brand`, whose tokens, faces and logos the documents use. Both repos are public:
Bun fetches the `git+https://` form through GitHub's tarball API without any GitHub access.

```json
"@hackersandwizards/documents": "git+https://github.com/hackersandwizards/documents.git#v<version>"
```

| Import or command                                         | What                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `@hackersandwizards/documents/document.css`               | the print base                                                        |
| `@hackersandwizards/documents/components/<Doc*.astro>`    | a document component                                                  |
| `@hackersandwizards/documents/render-pdf`                 | `renderPdf`, `bakeDocumentCss`, `composeDocument`, `assertBrandFonts` |
| `@hackersandwizards/documents/compose`                    | `openComposer`, `composePage`                                         |
| `@hackersandwizards/documents/onepager`                   | `composeOnepager`: `DocOnepager` on the onepager's own stylesheet     |
| `bun run documents-compose <Doc> <props.json> <out.html>` | one component with its props as standalone HTML                       |
| `bun run documents-privacy [--deny <terms.txt>]`          | fails on private data in the package, and on each term of the file    |

Astro and Vite are peer dependencies: the consumer's own copies compile the components.

## Work on the package

```sh
bun install      # also points the git hooks at .githooks/
bun run check    # format, lint, typecheck, unique names, tests, specimen, brand colours
```

A release is a tag `v<version>` matching `version` in `package.json`; consumers then raise the tag
in their dependency line. The rest: [CLAUDE.md](CLAUDE.md).

Licence: PolyForm Strict 1.0.0, see [LICENSE](LICENSE).
