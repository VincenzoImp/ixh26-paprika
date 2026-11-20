# Slides

| File | Content |
|---|---|
| `draft/deck-draft.tex` | First draft of the 7-slide pitch deck for Paprika v2 (spec revision v2.5), LaTeX Beamer |
| `draft/deck-draft.pdf` | Compiled deck (`pdflatex deck-draft.tex`, run twice, from `draft/`) |
| `draft/speaker-notes.md` | 2-4 sentences per slide, about 650-700 words, for a 5-minute pitch |

## Constraints

- Same preamble, colours, layout and slide structure as the sibling ORIGO draft
  (`crypto/slides/draft/deck-draft.tex`), so the two decks compare on equal terms.
- The claim on slide 1 is spec section 1 (`spec/PROTOCOL.md`, revision v2.5), shortened, not
  strengthened. The limits on slide 7 are spec section 9, condensed; the level-0 limit comes first.
- Every number on a slide has a LaTeX comment naming the file it comes from. No "first", "novel",
  "secure" or "guarantees authenticity".
- Slide 6 includes `../../impl/mock/mock-verify-ok.png` if it exists at compile time, otherwise a
  placeholder box.

## Not yet audited

- **No claim audit has been run** on this deck or on the speaker notes.
- The proof of prior existence was withdrawn in v2.5 and is no longer on any slide; slide 5 says a third rule was tried and withdrawn. The demo uses a local Ethereum EVM chain only; p05 costs are a deployment estimate.
- The v2.4 fuzz result in p03 is still a placeholder: slide 4 cites the v2.3 fuzz and says v2.4's
  is pending.
- Costs per attestation (slide 7, from p05) were computed with v2's 86,026 gas per attestation,
  not v2.4's 63,980, from one gas-price sample (2026-11-20 20:38 UTC). They are upper bounds.
- The deterrence range (4-40 USD per forgery) rests on assumed inputs: detection probability
  and ETH = 3,000 USD (spec section 8, p06).
- The screenshot is a static mock-up whose labels (v2.1, 0.1 ETH stake) predate the current
  parameters; the slide says so.
- The prior-work line on slide 5 cites papers listed in spec section 10; their verification status
  is in `docs/research/seed/`, not checked here.
- The AI disclosure line points to `AI_DISCLOSURE.md` (it exists); check that it covers the slides.
