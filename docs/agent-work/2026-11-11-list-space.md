# The space under a list in a table cell, and where an item's 1 pt goes, 11.11.2026

Nothing shipped. Neither change scored ahead of today's lists outside the noise of a blind panel,
so the engine stays at v1.28.1. This report holds the readings and the scores. It follows up the
two points left open in [the timesheet baseline report](2026-11-11-timesheet-list-baseline.md).

## Variants

| Variant | Change in `document.css`                                                                                                                                                                                                                                                |
| ------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| a       | none (v1.28.1)                                                                                                                                                                                                                                                          |
| b       | a list that is a cell's last element loses its bottom margin and its last item's bottom padding                                                                                                                                                                         |
| c       | items lose their 1 pt above and below. The 2 pt between two items, today's gap, moves to `li + li`. The v1.28.1 rule for the first item in a cell goes, and `scripts/onepager.ts` takes the `li + li` rule beside `ul li`. Without it, the onepager's items would touch |
| d       | b and c together                                                                                                                                                                                                                                                        |

## Readings

Print media, 794 px wide, on the type pages in `dist/types/`. A gap runs from text box to text box.

**Under a list in a cell.** The test's copied rows were used: plain wrapped text against a wrapped
list in the same cell.

| Page                                                                 | Plain text | a     | b     | c     | d     |
| -------------------------------------------------------------------- | ---------- | ----- | ----- | ----- | ----- |
| timesheets (month, training, flat fee)                               | 3.25       | 12.58 | 3.25  | 11.25 | 3.25  |
| quote without prices, delivery briefing, Markdown document, elements | 9.16       | 18.48 | 9.16  | 17.16 | 9.16  |
| handout                                                              | 10.14      | 19.47 | 10.14 | 18.14 | 10.14 |
| flat-fee timesheet, its own row                                      | 3.75       | 13.08 | 3.75  | 11.75 | 3.75  |

In a, the list adds 9.33 px (7 pt: 6 pt margin, 1 pt padding) on every page. The earlier report
read 10.33 against 0.76 px from another reference point. The 0.24 px between the two differences
is not explained. Every list still starts on its row's baseline in every variant.

**Lists outside tables.** In c and d, a list after a paragraph sits 11.31 px below it. That is the
gap between two paragraphs (a: 12.64). After a heading the gap goes from 9.33 to 8 px. The gap
between items stays at 5.97 px. Lists with their own item spacing do not change: DocSteps' timeline
and the handout's contents. The certificate's topics list is 2.66 px shorter.

**PDF pages.** One PDF per type, rendered from each build. No type changed its page count under
any variant, and every page kept the same text, so no page break moved. In b, only the flat-fee
timesheet and the elements page change at all. In c and d, every type with a list in the base's
style changes by 1 to 3 px per list. That is every type except the handout, the order confirmation,
the preparation and the month and training timesheets.

## Blind panel

Three crops at scale 2, full A4 width: the flat-fee timesheet's list row with the total below, the
quote's two service cards and the NDA's clause 1 with its list. b and d render the same timesheet,
and a and b render the same cards and clause. Each distinct render was shown once, under a neutral
label in a shuffled order. Three personas (a controller who signs off timesheets, an editorial
designer, an engineering lead receiving quotes) on Claude Opus 5.5 at medium effort and Codex
gpt-6.1-sol at high effort, two runs each. A variant's score is the mean of its three views'
overall scores (1 to 10). Noise is the mean change between a reviewer's two runs.

| Model  | Noise | Run | a    | b            | c            | d            |
| ------ | ----- | --- | ---- | ------------ | ------------ | ------------ |
| Claude | 0.56  | 1   | 8.22 | 7.78 (−0.44) | 8.44 (+0.22) | 8.00 (−0.22) |
| Claude | 0.56  | 2   | 8.33 | 7.22 (−1.11) | 8.00 (−0.33) | 7.11 (−1.22) |
| Codex  | 0.08  | 1   | 8.78 | 8.56 (−0.22) | 9.00 (+0.22) | 8.67 (−0.11) |
| Codex  | 0.08  | 2   | 9.00 | 8.67 (−0.33) | 9.00 (0.00)  | 8.67 (−0.33) |

The rule, fixed before scoring, was: a variant ships only where its lead over a exceeds the noise
in both runs and with both models. None does. c leads in one Codex run only. b and d lose because
of the timesheet row. There the reviewers read the last item as pressed against the total row's
rule: room 6.33 against 9.0 for a. On balance, though, b and d score highest (8.25 against 7.92).
So the space under the list does make the row ride high, and it is also the only room before the
total.

| a, today                                | b and d                                        | c                                               |
| --------------------------------------- | ---------------------------------------------- | ----------------------------------------------- |
| ![a](2026-11-11-list-space/a-today.png) | ![b and d](2026-11-11-list-space/b-d-cell.png) | ![c](2026-11-11-list-space/c-between-items.png) |

A variant that might beat a has not been built: it would close the gap under a list only where
another body row follows, not a total. The sample has a single row, so it shows the total case
alone.
