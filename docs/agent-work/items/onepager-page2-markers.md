---
kind: work
status: open
priority: 3
owner: Claude
area: software-engineering
evidence: not established
---

# Find the onepager's page-2 block from the layout, not from matching text

Replace `page2Block` in `scripts/onepager.ts` with a probe render that marks each top-level block.

`fitOnepager` reads which block opens page 2 by matching page 2's first line against each block's
letters in pdftotext's output. Every rule on text alone has cases it cannot tell apart, and a wrong
pick throws nothing, it only balances the page on the wrong block:

- a short block on page 1 holding the same words as a short block opening page 2;
- a card on page 1 whose columns pdftotext reads out of order, holding page 2's first line;
- a long block both pages print.

The way out a code review proposed and tried on a made-up page: one extra render with an
invisible marker at the start of each top-level block, then the first marker pdftotext reads on
page 2. Still open: a block split over the page break (page 2 text before its first marker), an
element that cannot hold a marker (a table), the print copy's content policy for the marker's
style, and keeping markers out of the returned HTML and the font cut. Done when `page2Block` and
`PAGE1_BLOCK` are gone and `test/onepager.test.ts` covers the three cases above in a real render.
