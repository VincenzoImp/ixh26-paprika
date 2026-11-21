# Paprika: cases, costs and limits

Measured in `output/2026-11-21-run.txt` (`npx hardhat test`, 9 tests, all passing; also passing with
`PHASE_LENGTH=86400`, UMA's mainnet phase). One suite, `test/paprika.integration.test.js`, against the real contracts,
all deployed on the in-process Hardhat chain (hardfork osaka) from published code:

- UMA (from `@uma/contracts-node` 0.4.28): Finder, Store, AddressWhitelist, IdentifierWhitelist, Registry,
  OptimisticOracleV3, the DVM `VotingV2` with `VotingToken` and `FixedSlashSlashingLibrary` (`lib/deploy-uma-dvm.js`).
- `WETH9` (UMA's copy) as the bond currency. Test accounts wrap ETH with `deposit`.
- Votes: three voter accounts (10, 11, 12) each stake 1,000,000 UMA voting tokens; GAT 1.5M, SPAT 50%. Each vote is
  commit, reveal and `settleAssertion` in the real round schedule; the chain clock jumps to each phase (`lib/vote.js`).

Parameters: `BOND` = 1 WETH (UMA's minimum bond for a final fee of 0.5 WETH), `PHOTO_WINDOW` = 7 days,
`REVEAL_WINDOW` = 1 hour, `LIVENESS` = 7200 s, UMA phase = 60 s. `fee = burnedBondPercentage x BOND` = 0.5 x 1 = 0.5
WETH; it goes to UMA's Store. "Net" means the change in WETH plus uncollected credit. After every test the suite
checks: Paprika's WETH = deposits of Attested records + live commit bonds + credits; OOv3 holds 2 x BOND per open
accusation.

## Cases

| case | what happens | who gains / loses (formula = measured) |
|------|--------------|-----------------------------------------|
| 1 Honest path | A key registers for free. A relayer attests a photo and locks `BOND`. `refund` reverts "too early" until `accusableUntil + REVEAL_WINDOW` has passed, then a stranger triggers it. The record stays, as Refunded. | Relayer: locks `BOND` = 1, net 0. |
| 2 One pixel changed | `attestersOf(modified hash)` = `[]`, and `verify` finds nothing (state None). | No WETH moves. |
| 3 True accusation | Commit, then reveal: Paprika calls `assertTruth` and `disputeAssertion` at OOv3 (which holds 2 WETH); OOv3 asks VotingV2 for a price. The voters vote TRUE, `settleAssertion` runs. The photo becomes Fake and the device Flagged (FakeProven). | Accuser credited `2 x BOND - fee` = 1.5 (net `+BOND - fee` = +0.5). Depositor `-BOND` = -1. Store `+fee` = +0.5. |
| 4 False accusation | The voters vote FALSE. The deposit is restored, the record returns to Attested, `accusableUntil` is extended by the time spent under accusation (236 s here, one vote). The device is untouched; the refund works afterwards. | Accuser `-BOND` = -1. Depositor `+BOND - fee` = +0.5 (deposit returned). Store `+fee` = +0.5. |
| 5 Second accusation while one is open | B reveals while A's accusation is open: no new accusation, B's commitment is consumed and its `BOND` is credited back (`BondReturned`). A's accusation is untouched (still open, OOv3 still holds 2 x BOND). Revealing the same commitment again: "no commit". After A is voted FALSE, B commits again and is voted TRUE. | B: net 0 while waiting, then `+BOND - fee` = +0.5. |
| 6 Self-accusation | The forger's second account accuses the forger's photo and wins. | Net `-fee` = -0.5: the real penalty for a fake. |
| 7 Key revocation | A copy of the revocation from another address reverts "bad sig". The key holder revokes. The revoked device's `attest` reverts "not active". Its record stays Attested and is refunded. | No WETH moves at revocation. |
| 8 Signatures and replay | Rejected: replayed attest "exists"; another key, another chain id, high-s, proof-of-possession used as capture, register copied by another sender "bad sig"; future anchor "anchor"; key registered twice "key used"; callback not from the oracle "only oracle"; reveal by another account "no commit"; commitment reused "commitment used"; reveal after `REVEAL_WINDOW` "too late", then `forfeitCommit` sends `BOND` to `0x...dEaD`. | Only the forfeited bond moves (`BOND` to the burn address). |
| 9 Long clock jump during an open accusation | With the accusation open, the clock jumps `PHOTO_WINDOW + REVEAL_WINDOW` (608,400 s, about 5,070 DVM rounds of 120 s). The request is still Active because `maxRolls` is the uint32 maximum; the vote resolves it (FALSE) and the record returns to Attested. With UMA's mainnet `maxRolls` = 4 the same jump deletes the request (status ToDelete). | Accuser `-BOND`; depositor `+BOND - fee` credit. |

## The vote, measured

- A dispute is voted in the **next** DVM round. One vote = 3 commits + 3 reveals + 1 settle (7 transactions) and
  moves the chain clock by 2 to 4 phases: 182 to 236 s with 60 s phases; 258,175 to 345,592 s (3 to 4 days) with
  UMA's mainnet 86,400 s phases.
- With mainnet phases, `REVEAL_WINDOW` (1 h) is far shorter than a vote: see Known limits.

## Gas (gasUsed, real contracts)

From the run file. Values move by a few hundred gas (up to ~16k for the first `commitVote` of a round) between runs,
because keys, salts and hashes are random and the zero bytes in calldata change.

| function | gas |
|---|---|
| `register` | 101,872 |
| `attest` (P-256 verify, WETH `transferFrom`, `attestersOf` index) | 167,013 |
| `commitClaim` | 86,787 |
| `revealClaim` (OOv3 `assertTruth` + `disputeAssertion` + `VotingV2.requestPrice`) | 703,897 |
| `VotingV2.commitVote` (max of 3; the first in a round costs most) | 231,883 |
| `VotingV2.revealVote` (max of 3) | 193,821 |
| `settleAssertion` -> callback, fake proven | 185,923 |
| `settleAssertion` -> callback, rejected | 161,269 |
| `refund` | 55,940 |
| `revokeKey` | 44,161 |
| `withdrawCredit` | 35,437 |
| deploy `Paprika` | 2,465,066 |

## Design choices made where the brief was silent

1. **The refund comes strictly after the last possible reveal** (`> accusableUntil + REVEAL_WINDOW`), so a refund can never get in ahead of a valid accusation.
2. **A commitment must come from a block at or after the photo's own block.** This blocks commitments made before the photo existed.
3. **An unknown assertion id in `assertionResolvedCallback` is ignored, not rejected.** Reverting there would block UMA's settlement of a third party's assertion that names Paprika as its callback recipient.
4. **A reveal on a Fake photo gets its bond back only after passing the window checks.**
5. **A revoked device keeps its first flag.** A fake proven afterwards does not change the reason (KeyRevoked).
6. **Token transfers accept tokens that return nothing as well as tokens that return `true`.**

## Known limits

- **A forger can stall accusations at `fee` per vote round.** Holding its own commitment, a forger can reveal a junk
  self-accusation right before an honest one (e.g. right after each settlement). The honest reveal then gets its bond
  back (no loss since the fix below) and must commit again after the vote. Each round costs the forger `fee`, and the
  photo's window is extended by the time under accusation, so the stall never makes the window run out.
- **Fixed: a waiting accuser no longer loses its bond.** Before, a reveal during an open accusation reverted, and a
  vote longer than `REVEAL_WINDOW` (3 to 4 days with UMA's mainnet phases, against 1 hour) made the waiting
  commitment expire and be forfeited. Now such a reveal returns the bond as credit (case 5).
- **Self-accusation makes the penalty for a fake `fee`, not `BOND`.** Repeated rejected self-accusations cost `fee`
  per round and do not make the window expire, because the window is extended each time.
- **One accusation per photo at a time.**
- **A flagged party returns for free with a new key.** Registration costs nothing.
- **After `accusableUntil + REVEAL_WINDOW` a fake can no longer be punished.**
- **The outcome is only as good as UMA's vote.** A wrong TRUE costs an honest depositor `BOND` and its key. Here the
  vote is UMA's real VotingV2, but the three voters hold all the stake: whoever controls them decides.
- **A vote request that is not resolved rolls to the next round; after `maxRolls` rolls VotingV2 deletes it.** The roll
  count grows by every round that passes without a resolution (quorum missed, or nobody voted). After deletion
  `getPrice` reverts, so `OOv3.settleAssertion` reverts for good: the record stays Accused, both bonds stay in OOv3,
  and refund is impossible. Only UMA governance could unblock it (a registered contract re-requesting the same price).
  UMA mainnet uses `maxRolls` = 4 (with daily phases: about 8 days without a resolution). This deployment uses the
  uint32 maximum, so a jump of the local clock can never delete a request (case 9). A missed quorum is not
  tested here: the three demo voters hold all the stake.
- **Griefing delays the refund by the vote time of each false accusation.** Each costs the griefer `BOND`.
- **`attestersOf` lists grow without limit.** Anyone with a free key can attach records to a famous hash, at a
  refundable `BOND` each.
- **A copied commitment that lands first blocks the honest one** (one block of delay; the copier loses `BOND`).
- **WETH sent to Paprika outside the protocol stays there for good.**
- **Not tested: a missing P-256 precompile.** In the code, every signature check then fails.
