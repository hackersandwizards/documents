---
kind: decision
status: assumed
priority: 3
owner: Benedikt
area: documents
recommended: b
assumption: The total figure in price tables and timesheets prints at brand's 1.2 times its row (17.6 px), as v1.26.0 ships it.
options:
  - key: a
    label: Smaller total, as up to v1.25.0
    detail: The figure prints at 15.2 px, 1.04 times its label, because its 1.2em resolved against the text around the table. The training description keeps one line.
    score: 7.25
  - key: b
    label: brand's total, 1.2 times its row
    detail: The row carries the h4 role and the figure is 17.6 px. The wider amount column narrows the description column, so the sample's training description wraps onto a third line.
    score: 7.25
images:
  a:
    - src: a-proposal.jpg
      caption: Proposal page 1, total as up to v1.25.0
    - src: a-price-print.jpg
      caption: Price table at 150 dpi, total as up to v1.25.0
  b:
    - src: b-proposal.jpg
      caption: Proposal page 1, total at 1.2 times its row
    - src: b-price-print.jpg
      caption: Price table at 150 dpi, total at 1.2 times its row
---

# Does the printed total stay at brand's 1.2 times its row?

Veto only if the smaller total read better, at the cost of a figure size brand's token does not set.

The total figure's `1.2em` resolved against the text around the table instead of the row's h4
role, so it printed at 1.04 times its label. v1.26.0 gives the row the h4 role, which every printed
total of a proposal and timesheet shows larger. One purchasing-manager persona scored both blind
(Claude Opus at medium effort, and Codex), each once:

| Criterion                     | a (Claude) | b (Claude) | a (Codex) | b (Codex) |
| ----------------------------- | ---------: | ---------: | --------: | --------: |
| Sum you pay found at a glance |          7 |        7.5 |         6 |         6 |
| Figures and rows read clearly |          8 |        7.5 |         7 |         8 |
| Visual calm                   |          8 |        7.5 |         8 |         7 |
| Breathing room, not cramped   |        7.5 |        7.5 |         7 |         8 |
| Hierarchy fits the content    |          7 |          7 |         7 |         7 |
| Professional, trustworthy     |          8 |          8 |         8 |         8 |
| Overall                       |        7.5 |        7.5 |         7 |         7 |

A tie in both models, noise not measured. The tie goes to b, which follows brand's token. Both
reviewers raised two points that hold for both versions: the gross amount, which the client pays,
prints quieter than the net sum, and the struck-through discount in red and green reads as two grey
lines on a monochrome printer.
