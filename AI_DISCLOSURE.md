# Declaration on the use of AI tools

The rules of Track 1 (slide 13) allow any AI tool. They ask the team to declare which tool was used, how, and where.
This is that declaration.

## How we worked

The team designed Paprika and directed the work. We used AI coding agents as an engineering team under our direction:
we set the goals and the constraints, decided every design question, and checked the results.

| Who | What |
|---|---|
| The team (Sexy Plushies: Francesco Lucibello, Vincenzo Imperati, Lorenzo Camilli) | The protocol idea; the design constraints (no manufacturer, no central authority, open arbitration by UMA, every user signs with their own wallet, nothing hard-coded); every decision on the protocol, the app and the pitch; hands-on testing of the web app with MetaMask; final review of the slides |
| Claude Code (Anthropic), model Claude Fable 5.2 | Main agent: planned the work as GitHub issues, wrote code and text, and coordinated the sub-agents |
| Claude Code sub-agents, model Claude Opus | Parallel tasks given by the main agent: implementation, tests, independent reviews, documents, slides |

## Where the tools were used

| Area (slide 13) | How | Where |
|---|---|---|
| Solution design and code generation | Turned the team's design into the contract rules; wrote the contract, the deployment of UMA's contracts on a local chain, the chain library, the command-line tool and the web app | `contract/`, `app/` |
| Testing and review | Wrote and ran the contract tests and the browser end-to-end tests; ran independent adversarial reviews of the contract and repeated staging runs of the whole system; every finding was fixed before submission | `contract/test/`, `app/e2e/` |
| Documentation | Wrote the protocol specification, the design rationale, the demo guide, the README and these declarations | `README.md`, `docs/`, `AI_DISCLOSURE.md`, `THIRD_PARTY.md` |
| Pitch preparation | Drafted the deck and the speaker notes from the team's message and structure | `slides/` |
