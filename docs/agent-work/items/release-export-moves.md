---
kind: work
status: open
priority: 1
order: 100
owner: Poppy
area: software-engineering
evidence: "10a4bad, f7a08d7, b39fa50 on main; package.json exports"
---

# Follow the moved exports in every consumer at the next release

At the release after v1.30.8, change each consumer's imports and calls in the commit that raises its tag.

`main` splits `scripts/render-pdf.ts` by responsibility and changes three signatures. The tag
v1.30.8 still has the old surface, so nothing breaks until a consumer raises its tag. TypeScript
flags every stale import and call at that raise.

| Old                                                                         | New                                                                                                     |
| --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| `composeDocument(name, props, cwd, { warm })` in `./render-pdf`             | `composeDocument(name, props, cwd)` and `composeWarmDocument(name, props, cwd)` in `./compose-document` |
| `bakeDocumentCss`, `brandCss`, `documentCss`, `inlineCss` in `./render-pdf` | `./document-css`                                                                                        |
| `subsetFaces`, `cutFacesToPdf` in `./render-pdf`                            | `./font-faces`                                                                                          |
| `assertBrandFonts` in `./render-pdf`                                        | `./assert-brand-fonts`                                                                                  |
| `inlineImages`, `InlineImagesOptions` in `./render-pdf`                     | `./inline-images`                                                                                       |
| `renderHandoutPdf`, `HandoutPass`, `HandoutResult` in `./render-pdf`        | `./render-handout-pdf`                                                                                  |
| `fitOnepager(composer, page, _brand, dir)`                                  | `fitOnepager(composer, page, dir)`                                                                      |
| `composePage(composer, name, props, base)`                                  | `composePage(composer, name, props)`; `composeUnbakedPage` for a caller's own bake                      |

`renderPdf` stays in `./render-pdf`. The `documents-compose` command keeps its name and arguments;
its file is now `scripts/compose-cli.ts`.

Callers to change: Company OS (its PDF library, the trainer briefing, the onepager render, the
certificate share script, the attendee-survey report, the document file route), the trainer hub's
handout export, and the agent-config hub's `print-pdf` skill (`render.ts`), which every repository
mirrors.
