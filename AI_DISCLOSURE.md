# Disclosure on the use of artificial intelligence

The Track 1 rules (slide 13, `track/TRACK.md`) allow any AI software provided that the team
**explicitly declares which tool was used, how and where**, for three areas: *solution design &
code generation*, *documentation*, *pitch preparation*. This file is that declaration for this
repository. It is updated at every block of work; the log is append-only.

## Summary by area

| Area | Tools | How | Where | Role of the humans |
|---|---|---|---|---|
| Solution design & code generation | Claude Code (model Claude Fable 5.2) directing Claude sub-agents (model Claude Opus) | The original idea (`proposal/PAPRIKA.md`) is the team's. The AI reviewed it adversarially, proposed every change that turns it into "Paprika v2" (stake, proof of possession, on-chain P-256 verification, proof of key misuse, contested claims, flag instead of erasure), wrote all contracts and tests, and ran them | `spec/`, `docs/DECISIONS.md`, `experiments/p00`–`p08` | Idea, direction and the request for an equal-terms comparison by the team (Vincenzo Imperati); design approval pending; no human line-by-line review yet |
| Documentation | Claude Code (model Claude Fable 5.2) and Claude sub-agents (model Claude Opus) | Wrote the specification, decision records, plan, status, research reports and reviews | `spec/`, `docs/`, `README.md` | Not reviewed by a human yet |
| Pitch preparation | Claude sub-agents (model Claude Opus) | Wrote the first draft of the 7-slide deck with speaker notes, and the clickable demo mock | `slides/draft/`, `impl/mock/` | Not reviewed by a human yet |

## Log

| Date and time (CET) | Tool and model | Area | How | Where | Human intervention |
|---|---|---|---|---|---|
| 2026-11-20 21:18–21:25 | Claude Code, model Claude Fable 5.2 (main session) | Preparation | Read the sibling repository and the brief; saved the proposal verbatim; copied `track/`; set up the repository rules | `proposal/`, `track/`, `AGENTS.md` | Request by Vincenzo Imperati: validate the proposal, find its flaws, propose improvements, plan, compare with the sibling design |
| 2026-11-20 21:20–21:25 | Claude Code, model Claude Fable 5.2 (main session) | Solution design & code generation | Wrote and ran the P-256 precompile check | `experiments/p00-*` | None |
| 2026-11-20 21:25–21:35 | 7 Claude sub-agents (model Claude Opus, medium or high effort) | Review, research, code generation | Adversarial review of the proposal; simulated judging panel on both designs; independent review of the sibling design; research on UMA and alternatives and on device identity; literal implementation of the proposal with attack tests; UMA Optimistic Oracle V3 run on a local fork of Sepolia | `docs/reviews/`, `docs/research/`, `experiments/p01-*`, `experiments/p02-*` | None. Samples re-checked by the main session at the sources (UMIP-170, Google and Android documentation) and on the raw outputs |
| 2026-11-20 21:30–22:45 | Claude Code, model Claude Fable 5.2 (main session) | Solution design; documentation | Designed Paprika v2 and its revisions v2.1 to v2.5 from the findings of each round; wrote the specification, decision records, plan, comparison and the report for the team | `spec/PROTOCOL.md`, `docs/DECISIONS.md` | Mid-session instruction by Vincenzo Imperati: bring Paprika to the same level of preparation as the sibling design, then compare on equal terms |
| 2026-11-20 21:30–22:50 | Claude sub-agents (model Claude Opus, medium or high effort) | Code generation, research, review, pitch preparation | Implemented and attacked Paprika v2 to v2.5 and the minimal contract; spike of the combined design with real zero-knowledge proofs; read-only probe of 12 networks; economic model; three literature reports; independent review of v2.3 with running exploits; two further judging panels; deck draft; demo mock | `experiments/p03-*`–`p08-*`, `docs/research/seed/`, `docs/reviews/`, `slides/draft/`, `impl/mock/` | Mid-session instruction by Vincenzo Imperati: the demo chain is a local Ethereum EVM |
