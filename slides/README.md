# Slides

| File | Content |
|---|---|
| [`deck.tex`](deck.tex) | The 7-slide pitch deck for Paprika (LaTeX Beamer) |
| [`deck.pdf`](deck.pdf) | The compiled deck. Build it with `pdflatex deck.tex`, run twice, from this folder |
| [`speaker-notes.md`](speaker-notes.md) | Two to four sentences per slide, for a 5-minute pitch |
| [`hard-questions.md`](hard-questions.md) | The 8 hardest questions we expect from the judges, with short answers |

## Rules for the slides

- The source of truth is [`docs/protocol.md`](../docs/protocol.md). The limits are in [`docs/limits.md`](../docs/limits.md).
- The deck presents one solution, Paprika, as it is.
- Amounts and durations are deployment parameters. The slides use the symbols `B`, `T_photo`, `T_reveal` and `f`.
- The only number with a source is UMA's vote time ("within 48-72 hours", https://docs.uma.xyz/developers/resolving-disputes).
- There are no gas figures and no per-network costs.
- The slides do not say "first", "novel", "secure" or "guarantees authenticity".
- Slide 6 shows a screenshot of the web app if the file exists, else a placeholder box.
- The demo statement: a local Ethereum chain, UMA's contracts, and the vote simulated with UMA's test oracle
  (`MockOracleAncillary`, deployed by [`contract/lib/deploy-uma.js`](../contract/lib/deploy-uma.js)).
  See [`docs/demo.md`](../docs/demo.md).

## Review status

- No claim audit has been run on the deck, the notes or the hard questions.
- The answers to questions 3, 7 and 8 in `hard-questions.md` give the team's reasoning, not measurements.
