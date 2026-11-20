# Slides

| File | Content |
|---|---|
| `draft/deck-draft.tex` | First draft of the 7-slide pitch deck for Paprika (final version, no manufacturers), LaTeX Beamer |
| `draft/deck-draft.pdf` | Compiled deck (`pdflatex deck-draft.tex`, run twice, from `draft/`) |
| `draft/speaker-notes.md` | 2-4 sentences per slide, about 700 words, for a 5-minute pitch |

## Constraints

- Same preamble, colours, layout and slide structure as the sibling ORIGO draft
  (`crypto/slides/draft/deck-draft.tex`), so the two decks compare on equal terms.
- Sources of truth: `docs/1-come-funziona.md`, `docs/2-cosa-e-cambiato.md`,
  `docs/3-limiti-e-dipendenze.md`, `contract/output/`, `prove/*/README.md`.
- The claim on slide 1 is `docs/3-limiti-e-dipendenze.md`, "Come dirlo", item 1.
- Every number on a slide has a LaTeX comment naming the file it comes from. No "first", "novel",
  "secure" or "guarantees authenticity".
- Slide 6 includes `../../impl/mock/mock-verify-ok.png` if it exists, otherwise a placeholder box.

## Not yet audited

- **No claim audit has been run** on this deck or on the speaker notes.
- `contract/output/cases.md` did not exist when the deck was written; payouts come from
  `docs/1-come-funziona.md` and `contract/output/2026-11-20-run.txt`. Gas per attestation (about
  64k) comes from `docs/3`; the contract run output has no gas table.
- Per-network costs (slide 7) were computed by `prove/costi-sulle-reti` at 86,026 gas per
  attestation (an older contract) and one gas-price sample: an upper-bound estimate. The demo
  uses a local Ethereum EVM chain only.
- The deterrence range (4-190 USD) rests on assumed detection probabilities and ETH = 3,000 USD.
- The arbiter is simulated in the demo; the contract run reports that the claim path does not yet
  integrate with the real UMA bond interface (ERC-20), and was tested against a mock only.
- The screenshot is a static mock-up whose labels predate the final parameters; the slide says so.
