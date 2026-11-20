# Project status

> Working memory between sessions. Whoever resumes starts here, then checks `date` against the
> deadlines in `docs/PLAN.md`.

**Last update:** 2026-11-20, about 22:45 CET.
**Internal deadline:** 2026-11-21 08:00 CET. **Official submission:** 12:00 CET.

## Where we are

The original proposal has been reviewed, implemented literally and attacked; a hardened protocol
(Paprika v2, revision v2.5) is specified and its contract has been through five rounds of
implement, attack, fix, and one independent review with running exploits. The preparation package now matches the sibling repository's: brief,
decisions, experiments, reviews, research, mock, deck draft, plan. Implementation proper has not
started: the team has to choose between this candidate, ORIGO and their combination first
(`docs/COMPARISON.md`; the report for the team, in Italian, is `RISCONTRO.md`).

## Done

- Adversarial review of the original proposal: 19 findings (`docs/reviews/paprika-redteam.md`).
- `p01`: the proposal implemented literally; 24 tests; the attacks succeed.
- `p03`: hardened contract, revisions v2 → v2.5 and the minimal `PaprikaCore`, each with the
  attack suite re-run and a randomised stateful test from v2.2.
- `p08`: independent review of revision v2.3 with 12 running exploits; the prior-existence rule
  was broken and withdrawn (`docs/reviews/paprika-v2_3-redteam.md`).
- `p00`, `p05`: P-256 precompile on the local chain and on 12 public networks (read-only); costs.
- `p02`: UMA Optimistic Oracle V3 exercised end to end on a local fork of Sepolia.
- `p06`: incentive model with closed forms, sweeps and a population simulation.
- `p04`: the combination with ORIGO, with real zero-knowledge proofs, on a local chain.
- `p07`: demonstration that two signatures sharing a nonce reveal a P-256 key (for a possible
  later upgrade; not part of the protocol).
- Five research reports with tagged sources; a claims ledger with what the main session re-checked.
- Independent review of ORIGO and two rounds of a simulated judging panel on both candidates.
- Demo mock with screenshots; draft of the 7-slide deck with speaker notes, both at revision v2.5.

## Next three actions

1. The team chooses the candidate to build (see "Waiting on the team").
2. If Paprika: start milestone M1 of `docs/PLAN.md` (`PaprikaCore` and its regression suite into
   `impl/`).
3. If the combination: port `experiments/p04` into the sibling repository and add the owner stake
   and capped bounty from `PaprikaCore`.

## Waiting on the team

1. Which candidate to submit: ORIGO, Paprika v2, or ORIGO with Paprika's open admission and
   proof-based revocation.
2. Whether the vote-based claim path stays in Paprika or is dropped for the smallest sound protocol
   (`docs/DECISIONS.md`, P-06).
3. Permission to create a GitHub repository for this candidate and to push (not done: creating
   repositories is reserved to humans).
4. The open questions for the mentors listed in the sibling repository still apply.

## Environment notes

- Tools exercised here: Node 26.4, npm 12, Hardhat 2.29.2 (`hardfork: "osaka"` for the P-256
  precompile), ethers 6, `nargo` 1.0.0, `bb` 6.0.0, `pdflatex`, Python 3, Docker (screenshots).
  Absent: `forge`, `solc` binary.
- Each experiment has its own `node_modules` (git-ignored); `npm install` inside the folder.
- This repository is local only: no remote, nothing pushed.

## Actions reserved to humans

- Choose the candidate; ask the mentors; submit and present.
- Create the remote repository and give the judges access.
- Complete the "role of the humans" column in `AI_DISCLOSURE.md`.
