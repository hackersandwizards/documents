---
kind: work
status: open
priority: 2
owner: agent
area: render
evidence: "measured 2026-11-06 on 43c3a9e and on the v1.7.1 tree: seven cold renders of dist/types/quote/index.html"
---

# renderPdf still writes two byte variants for the quote

v1.7.0 says one input prints the same bytes. For the catalog's quote page it does not: seven cold
renders of one `dist/types/quote/index.html` (`renderPdf`, no `warm`) gave two MD5s,
`f7c046cf...` and `8cdf5aef...`, in no fixed order. Both trees show it, v1.7.0 at brand v1.11.1
and v1.7.1 at brand v1.13.1. The two files have the same length (130629 bytes) and the same
`pdftotext` output, and `pdftoppm` draws the same pixels at 60 and 150 dpi. They differ in 24
bytes, all object numbers in the tagged structure tree that are one higher (`62` to `63`, and so on).
The certificate, the onepager and the survey readout gave the same bytes in each run.

The cause is not yet explained. `test/render-pdf.test.ts` ("writes the same bytes for the same
input") renders a different input, so it passes. Next: render the quote 20 times and count the
variants, read which structure element moves (`qpdf --qdf`), find which one factor changes the
count (a font held back, the print script's wait, Chrome's tagging), then make the test render the
quote. Consumers that compare committed PDFs by hash (website, os) see a changed file where nothing
changed until this is fixed.
