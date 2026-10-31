# @hackersandwizards/documents

The hackers&wizards document engine as one private package: the document base, every document
component, composing a component to standalone HTML and rendering it to PDF with headless Chrome.
Company OS and the trainer hub install it and keep what fills their documents.

Maintainer: Benedikt Stemmildt. Trainers can read the whole repo, its history included, so nothing
goes in that a trainer may not see.

The specimen shows every document type with invented data: open `specimen/index.html` after
`bun install`.

## Use it in another repo

Add the dependency in exactly this form, pinned to the newest tag
(`git ls-remote --tags https://github.com/hackersandwizards/documents.git` lists them), next to
`@hackersandwizards/brand`, whose tokens, faces and logos the documents use. Your machine needs
GitHub read access to both repos. Bun rewrites `github:` and `git+https://` to GitHub's tarball
API, which answers 404 for a private repo; the `git+ssh://` form clones through git. Without access
Bun stops at `InstallFailed cloning repository for @hackersandwizards/documents` and names no
cause.

```json
"@hackersandwizards/documents": "git+ssh://git@github.com/hackersandwizards/documents.git#v<version>"
```

| Import or command                                         | What                                                                  |
| --------------------------------------------------------- | --------------------------------------------------------------------- |
| `@hackersandwizards/documents/document.css`               | the print base                                                        |
| `@hackersandwizards/documents/components/<Doc*.astro>`    | a document component                                                  |
| `@hackersandwizards/documents/render-pdf`                 | `renderPdf`, `bakeDocumentCss`, `composeDocument`, `assertBrandFonts` |
| `@hackersandwizards/documents/compose`                    | `openComposer`, `composePage`                                         |
| `bun run documents-compose <Doc> <props.json> <out.html>` | one component with its props as standalone HTML                       |

Astro and Vite are peer dependencies: the consumer's own copies compile the components.

## Work on the package

```sh
bun install      # also points the git hooks at .githooks/
bun run check    # format, lint, typecheck, unique names, tests, specimen, brand colours
```

A release is a tag `v<version>` matching `version` in `package.json`; consumers then raise the tag
in their dependency line. The rest: [CLAUDE.md](CLAUDE.md).

Licence: PolyForm Strict 1.0.0, see [LICENSE](LICENSE).
