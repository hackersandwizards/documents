---
kind: decision
status: assumed
priority: 3
order: 1296
owner: Benedikt
area: software-engineering
recommended: a
assumption: The hand-drawn tint panels keep their teal line, listed as the exception tint-panel in brand-elements.json.
options:
  - key: a
    label: Keep the teal line
    detail: The proposal's community and terms panels and the timesheet's head panel stay as printed today, a teal line on brand's 7 % teal wash. brand-elements.json lists them as an exception.
    score: 7.9
    noise: 0.25
  - key: b
    label: brand's tint card
    detail: The panels become brand's hw-card with data-variant tint, the teal-light line. Layout and page breaks stay the same; only the line colour changes.
    score: 7.2
    noise: 0.25
images:
  a:
    - src: a-page.jpg
      caption: Proposal page 2, teal line
    - src: a-terms-print.jpg
      caption: Terms panel at 150 dpi, teal line
  b:
    - src: b-page.jpg
      caption: Proposal page 2, brand's tint card
    - src: b-terms-print.jpg
      caption: Terms panel at 150 dpi, brand's tint card
---

# Do the proposal's tint panels keep their teal line?

Veto only if printed proposals should follow brand's tint card exactly, at the cost of a fainter edge.

DocProposal draws its community and terms panels by hand, as DocLeistungsnachweis draws its head
panel: a teal line (`--accent-line`) on brand's teal wash. brand's tint card draws the line in
`--color-teal-light`. Both were rendered from the sample proposal and timesheet, identical apart
from the line colour, and scored blind by three client personas (CTO, purchasing manager,
engineering team lead) on six criteria fixed before scoring: the box reads as one unit, its edge
stays visible at 70 % zoom and in print, visual calm, breathing room, consistency with the other
boxes, a professional impression. Each saw the page at 70 % zoom, at 1000 px, the terms panel
printed at 150 dpi and the timesheet, under neutral labels in a shuffled order.

| Overall, 1 to 10     | Teal line (a) | brand's tint card (b) |
| -------------------- | ------------- | --------------------- |
| Claude, run 1, mean  | 7.8           | 7.3                   |
| Claude, run 2, mean  | 8.0           | 7.0                   |
| Codex, one run, mean | 8.7           | 8.0                   |
| Edge visible, Claude | 9 in all six  | 5 to 7, one 9         |
| Consistency, Claude  | 6 to 7        | 7 to 8                |

Noise is the spread between a persona's two Claude runs: 0.25 on average, 1.0 at most. The teal
line leads in both runs and with both models. The reviewers' reason: brand's teal-light line nearly
vanishes at 70 % zoom and on an office printer, and a tinted box with a fainter edge than the
white cards beside it reverses the emphasis. Against the teal line they named its weight beside the
grey-edged cards, which costs some calm.

The lasting fix sits in brand: a line setting for the tint card on paper, as the plain card has
with `--hw-line`. With it the panels can become brand's card with no exception.
