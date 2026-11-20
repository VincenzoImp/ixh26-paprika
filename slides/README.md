# Slides

| File | Content |
|---|---|
| `draft/deck-draft.tex` | The 7-slide pitch deck for Paprika (final protocol), LaTeX Beamer |
| `draft/deck-draft.pdf` | Compiled deck (`pdflatex deck-draft.tex`, run twice, from `draft/`) |
| `draft/speaker-notes.md` | 2-4 sentences per slide, about 650 words, for a 5-minute pitch |
| `draft/hard-questions.md` | The 8 hardest questions we expect from the judges, with short answers |

## Constraints

- Same preamble, colours, layout and slide structure as the sibling ORIGO draft
  (`crypto/slides/draft/deck-draft.tex`), so the two decks compare on equal terms.
- Source of truth: `docs/1-come-funziona.md`. Where `docs/2` or `docs/3` disagree with it, `docs/1`
  wins.
- Amounts and durations are deployment parameters, so the slides use the symbols `B`, `T_photo`,
  `T_reveal` and `f`. The only number tied to a measurement or source is the arbiter latency
  (48-72 h, from `docs/3`), and its source is noted in a LaTeX comment.
- There are no gas figures and no per-network costs. When the deck was written,
  `contract/output/cases.md` still described the previous design (a mock arbiter, separate deposit
  and bond).
- No "first", "novel", "secure" or "guarantees authenticity".
- Slide 6 includes `../../impl/mock/mock-verify-ok.png` if it exists, otherwise a placeholder box.

## Not yet audited

- **No claim audit has been run** on the deck, the notes or the hard questions.
- The screenshot is a static mock-up and may not match the final contract's labels.
- The answers in `hard-questions.md` to questions 3, 7 and 8 contain the team's reasoning, not
  measurements.
