---
kind: decision
status: assumed
priority: 3
order: 695
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
---

# Straight quotes stay in the survey readout (assumed; veto to switch)

The survey readout quotes two things: the answer kept off the risk ranking (slide 4) and the
question the form asked (slides 5 and 6). Since v1.1.0 it prints them with straight quotes. Before
that it used curly ones. The change followed the brand voice rule, which bans curly quotes in
customer-facing text and names proposals and documents among them. os asked to have the
typographic marks back, which would contradict that rule, so the engine has not changed.

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
finish alone, curly scores higher in all eight runs (Claude by 2, Codex by 1). Under the review
standard, an exception to a shared rule needs a lead outside the noise with both models, which
Codex does not give. That is why the recommendation stays with straight quotes, even though every
reviewer saw the curly version as better typeset.
