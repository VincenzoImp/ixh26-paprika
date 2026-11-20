# Statement on the use of artificial intelligence

The Track 1 rules (slide 13) allow any AI tool, as long as you declare **which tool was used,
how and where**. This is the statement for this repository.

## Summary

| Area | Tool | How | Where | Role of the people |
|---|---|---|---|---|
| Idea of the protocol | None | The first version of Paprika is the team's work | `proposal/PAPRIKA.md` | Idea |
| Review of and changes to the protocol | Claude Code (model Claude Fable 5.2) with Claude sub-agents (model Claude Opus) | It wrote the first version as a contract and attacked it; it proposed every change in the final version; it had the result reviewed by sub-agents that did not know the conclusions | `docs/`, `evidence/` | Direction and constraints from the team: no dependency on device makers, demo on a local blockchain, documents in plain Italian. Final approval by the team: still to be done |
| Code | Claude Code with Claude Opus sub-agents | It wrote the contract, the tests and the economic model, and ran them | `contract/`, `evidence/` | No line-by-line review so far |
| Documentation | Claude Code (Claude Fable 5.2) | It wrote the documents and the front page | `README.md`, `docs/` | Request and directions from the team; proofreading: still to be done |
| Research | Claude Opus sub-agents | Web research with sources listed; a sample checked again by Claude Code | `docs/background/` | None |
| Pitch preparation | Claude Opus sub-agents | Draft of the deck with notes, mock of the demo | `slides/`, `impl/mock/` | Not yet reviewed |

## Log

| Date and time (CET) | Tool | What it did | Human input |
|---|---|---|---|
| 20 November 2026, 21:18–22:10 | Claude Code (Claude Fable 5.2) and Claude Opus sub-agents | Critical review of the first version; contract written word for word and attacked; research on decentralized arbiters, incentives, fake detection; first strengthened version | Request from Vincenzo Imperati: validate the proposal, find its flaws, propose improvements |
| 20 November 2026, 22:10–23:05 | The same | Several revisions of the contract, each one attacked and fixed; economic model; independent review with attacks that can be run; simulated juries; mock and draft of the deck | Direction from Vincenzo Imperati: the demo runs on a local Ethereum blockchain |
| 20 November 2026, 23:05–23:59 | The same | Final version with no device makers; repository cleaned of the intermediate versions; documents rewritten in plain Italian | Direction from the team: Paprika must not depend on device makers; a single final version, explained in a way that is easy to understand and to compare with the first one |

The intermediate versions and the full reports of the sub-agents are in the git history, under
the tag `iterazioni-complete`.
