# A list in a table cell starts on its row's baseline, 11.11.2026 (v1.28.1)

The flat-fee timesheet's activity list printed its first line below the date and the hours in the
same row. Measured on the sample (`leistungsnachweisLumpSum`):

| Reading                              | Before               | After |
| ------------------------------------ | -------------------- | ----- |
| HTML layout, list vs. date and hours | 1.33 px lower        | 0.00  |
| PDF (pdftotext word boxes)           | 0.75 pt (1 px) lower | 0.00  |

The cause is the base's `ul li { padding: var(--space-hair) 0 … }` in `document.css`: every item
carries 1 pt above it, the first one too. Controls on the type page, one rule changed each:

| Change                                  | List's offset                               |
| --------------------------------------- | ------------------------------------------- |
| the first item's top padding set to 0   | 0.00 px                                     |
| the list's margin set to 0              | 1.33 px                                     |
| the marker (`li::before`) hidden        | 1.33 px                                     |
| cells set to `vertical-align: baseline` | 0.00 px (the other cells move down instead) |

The fix: a list opening a table cell drops its first item's top padding. The row is 1.33 px shorter
as a result. `test/cell-baseline.test.ts` holds it on every type page's tables: a list whose first
item wraps and a one-line list each start where plain text in that cell does, and the control with
the padding back fails. brand-markers still reads every marker within 0.25 px.

Before:

![The row before](2026-11-11-timesheet-list-baseline/before.png)

After:

![The row after](2026-11-11-timesheet-list-baseline/after.png)

## Left open

- Under the list, the cell still holds the list's bottom margin and the last item's 1 pt: 10.33 px
  below the last line, against 0.76 px in the cells beside it. Closing that gap would change the
  row's height, which is a visual choice, so it is not part of this fix.
- Moving the 1 pt from every item to the gap between items (`li + li`), as brand's prose block does,
  would make this rule unnecessary. It would also change every list in every document, so every
  rendered PDF would need a before-and-after comparison.
