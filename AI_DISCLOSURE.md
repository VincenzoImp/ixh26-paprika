# Declaration on the use of AI tools

The rules of Track 1 (slide 13) allow any AI tool. They require the team to declare which tool was used, how, and where.
This is the declaration for this repository.

## Tools

| Tool | Model | Use |
|---|---|---|
| Claude Code (Anthropic) | Claude Fable 5.2 | Main agent. It planned the work, wrote code and text, and directed the sub-agents |
| Claude Code sub-agents | Claude Opus | Separate tasks given by the main agent: code, tests, reviews, documents, slides |

## What the tools did, by area

| Area (slide 13) | How the tools were used | Where |
|---|---|---|
| Solution design and code generation | The tools turned the team's protocol idea and constraints into the contract rules. They wrote the contract, its tests, the scripts that deploy UMA's oracle and voting contracts on a local chain and run UMA's vote, and the demo app. They wrote and ran the contract tests and the browser tests, ran the staging and acceptance runs, and attacked the contract to find flaws | `contract/`, `app/` |
| Documentation | The tools wrote the protocol specification, the design rationale, the demo guide, the README and these declarations | `README.md`, `docs/`, `AI_DISCLOSURE.md`, `THIRD_PARTY.md` |
| Pitch preparation | The tools drafted the deck, the speaker notes and the answers to expected questions | `slides/` |

## Role of the team

The team is Sexy Plushies: Francesco Lucibello, Vincenzo Imperati, Lorenzo Camilli.

- The idea of the protocol is the team's.
- The constraints are the team's: no manufacturer, decentralised arbitration, Ethereum on a local chain,
  parameters as symbols, plain English.
- Every decision on the protocol and on this repository is the team's.

## Human review

| Area | Review by the team |
|---|---|
| Contract and tests | To be completed by the team |
| Demo app | To be completed by the team |
| Documentation | To be completed by the team |
| Slides and speech | To be completed by the team |
