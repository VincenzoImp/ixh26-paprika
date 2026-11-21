# Slides

| File | Content |
|---|---|
| `deck.tex` | The 7-slide pitch deck for Paprika (LaTeX Beamer) |
| `deck.pdf` | Compiled deck (`pdflatex deck.tex`, run twice, from this folder) |
| `speaker-notes.md` | 2-5 sentences per slide, for a 5-minute pitch |
| `hard-questions.md` | The 10 hardest questions we expect from the judges, with short answers |

## Constraints

- Facts: `docs/protocol.md`, `docs/design-rationale.md`, `docs/limits.md`, `docs/demo.md`,
  `app/README.md`. Measured values: `contract/output/cases.md`.
- Structure follows the slide proposal in `app/output/first-time-review.md` (section 2.3), with
  one running example: Alice attests, Bob accuses, UMA decides.
- Amounts and durations use the symbols `B`, `T_photo`, `T_reveal` and `f`. Demo values appear
  once, on slide 6, with their source (`app/README.md`) in a LaTeX comment.
- Slide 6 uses crops (verdict card and "What this record shows / Not shown") of
  `app/output/screens/06-verifier-signed-and-staked.png` and `16-verifier-proven-fake.png`. The click path
  follows `docs/demo.md` and the button labels in the screenshots.
- No "first", "novel", "secure" or "guarantees authenticity".

## Not yet audited

- **No claim audit has been run** on the deck, the notes or the hard questions.
- The two slide-6 crops come from two demo runs with different sample images, not from the same
  file before and after.
- Hard question 8 (sequencer-known block hashes on rollups) is our reasoning; no source in the
  repository checks it.
