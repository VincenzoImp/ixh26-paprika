# Slides

| File | Content |
|---|---|
| `deck.tex` | The 7-slide pitch deck for Paprika (LaTeX Beamer) |
| `deck.pdf` | Compiled deck (`pdflatex deck.tex`, run twice, from this folder) |
| `speaker-notes.md` | 2-4 sentences per slide, about 650 words, for a 5-minute pitch |
| `hard-questions.md` | The 8 hardest questions we expect from the judges, with short answers |

## Constraints

- Source of truth: `docs/1-come-funziona.md`.
- The deck presents one solution, Paprika, as it is.
- Amounts and durations are deployment parameters, so the slides use the symbols `B`, `T_photo`,
  `T_reveal` and `f`. The only number tied to a source is the arbiter latency (48-72 h, from
  `docs/3`), and its source is noted in a LaTeX comment.
- There are no gas figures and no per-network costs.
- No "first", "novel", "secure" or "guarantees authenticity".
- Slide 6 includes `../impl/mock/mock-verify-ok.png` if it exists, otherwise a placeholder box. No
  app screenshots existed when the deck was compiled.
- Demo statement: local Ethereum chain, UMA's real contracts, the vote simulated with UMA's test
  oracle (`MockOracleAncillary`, per `contract/lib/deploy-uma.js`).

## Not yet audited

- **No claim audit has been run** on the deck, the notes or the hard questions.
- The screenshot is a static mock-up and may not match the final contract's labels.
- The answers in `hard-questions.md` to questions 3, 7 and 8 contain the team's reasoning, not
  measurements.
