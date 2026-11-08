---
kind: decision
status: assumed
priority: 3
order: 1000
area: brand
owner: Benedikt
recommended: straight
options:
  - key: straight
    label: Straight quotes stay, as the brand voice prescribes
    detail: Nothing changes. os keeps asserting `&quot;` in survey-report-script.test.ts.
  - key: typographic
    label: Typeset documents get the language's typographic quotes
    detail: "The voice skill's ASCII rule gains a carve-out for documents the engine typesets (English `“…”`, German `„…“`), made in the agent-config hub first. Then this engine picks the marks by the readout's `lang` for noRisk and asked, and the test that bans curly quotes in the engine's words turns into one that requires the language's marks. os asserts them again."
images:
  straight:
    - src: straight-quote-detail.jpg
      caption: Slide 4, the answer kept off the risk ranking, at twice the size
    - src: straight-slide-4.jpg
      caption: Slide 4 as printed
    - src: straight-slide-5.jpg
      caption: Slide 5, the question the form asked
  typographic:
    - src: curly-quote-detail.jpg
      caption: Slide 4, the answer kept off the risk ranking, at twice the size
    - src: curly-slide-4.jpg
      caption: Slide 4 as printed
    - src: curly-slide-5.jpg
      caption: Slide 5, the question the form asked
---

# Survey readout: straight or typographic quote marks? (assumed straight; veto to switch)

The attendee-feedback readout (seven slides sent to a client after a training) quotes two things:
the answer kept off the risk ranking on slide 4 and the question the form asked on slides 5 and 6.
It prints both with straight quotes, `"…"`, because the brand voice rule bans curly quotes in
customer-facing text and names documents among them. os asked for typographic quotes back, which
would need an exception to that rule.

What to look at: the two detail images, the quoted line on slide 4 at twice its size, once per
option. The full slides show how small the difference is at reading size. The samples are invented.

Blind review, 06.11.2026: the two slides with straight quotes against the same slides with curly
quotes, at 1280x720, two personas (a client's Head of Engineering, a client's L&D lead), Claude
and Codex, two runs each, order shuffled per run. Overall score out of 10:

| Model  | Persona | Straight, runs 1 and 2 | Curly, runs 1 and 2 |
| ------ | ------- | ---------------------- | ------------------- |
| Claude | CTO     | 7, 6.5                 | 8, 8                |
| Claude | L&D     | 7, 6                   | 8, 8                |
| Codex  | CTO     | 7, 7                   | 7, 8                |
| Codex  | L&D     | 7, 8                   | 7, 8                |

Claude leads 1.4 for curly, noise up to 1. Codex leads 0.25, noise 1, so a tie. On typographic
finish alone, curly scores higher in all eight runs (Claude by 2, Codex by 1). An exception to a
shared rule needs a lead outside the noise with both models, which Codex does not give, so the
recommendation stays with straight quotes, although every reviewer saw the curly version as
better typeset.
