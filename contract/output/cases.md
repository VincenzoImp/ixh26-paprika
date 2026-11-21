# Paprika: cases, costs and limits

Measured in `output/2026-11-21-run.txt`. There are two suites:

- `test/paprika.integration.test.js` runs against the **real UMA Optimistic Oracle V3** stack, deployed from `@uma/contracts-node`. Only the vote is UMA's `MockOracleAncillary`.
- `test/paprika.test.js` runs against `MockOptimisticOracleV3`, which has the same interface and payouts.

Parameters: `BOND` = 100 tokens (UMA's minimum bond for a final fee of 50), `PHOTO_WINDOW` = 7 days,
`REVEAL_WINDOW` = 1 hour, `LIVENESS` = 7200 s. `fee = burnedBondPercentage x BOND` = 0.5 x 100 = 50 tokens; it goes
to UMA's Store. "Net" means the change in tokens plus uncollected credit.

## With the real UMA oracle

| case | what happens | who gains / loses (formula = measured) |
|------|--------------|-----------------------------------------|
| Honest path | A key registers for free. A relayer attests a photo and locks `BOND`. `refund` reverts "too early" until `accusableUntil + REVEAL_WINDOW` has passed, then a stranger triggers it. The record stays, as Refunded. | Relayer: locks `BOND` = 100, net 0. |
| One pixel changed | `attestersOf(modified hash)` = `[]`, and `verify` finds nothing (state None). | No tokens move. |
| True accusation | Commit, then reveal: Paprika calls `assertTruth` and `disputeAssertion` at OOv3 (the oracle holds 200). The vote is TRUE and `settleAssertion` runs. The photo becomes Fake and the device Flagged (FakeProven). | Accuser credited `2 x BOND - fee` = 150 (net `+BOND - fee` = +50). Depositor: `-BOND` = -100. Store: `+fee` = +50. |
| False accusation | The vote is FALSE. The deposit is restored, the record returns to Attested, and `accusableUntil` is extended by the time spent under accusation (172,802 s). The device is untouched, and the refund works afterwards. | Accuser: `-BOND` = -100. Depositor: `+BOND - fee` = +50 (deposit returned). Store: `+fee` = +50. |
| Second accusation while one is open | The second reveal reverts "accusation open". The second commitment stays valid until it expires; after the first is voted FALSE, it is revealed and voted TRUE. | One accusation per photo at a time. |
| Self-accusation | The forger's second account accuses the forger's photo and wins. | Net `-fee` = -50. This is the real penalty for a fake. |
| Key revocation | A copy from another address reverts "bad sig". The key holder revokes. The revoked device's `attest` reverts "not active". Its record stays Attested and is refunded. | No tokens move. |
| Signatures and replay | Each attempt is rejected: replay "exists"; another key, another chain, high-s, or a proof-of-possession signature used as a capture: "bad sig"; future anchor "anchor"; a key registered twice "key used"; a callback not from the oracle "only oracle". | No tokens move. |

The real oracle behaved exactly like the mock. It pays the asserter and the disputer (both are Paprika)
`2 x bond - fee`, sends `fee` to the Store, and calls `assertionResolvedCallback` after paying. The identifier is
`ASSERT_TRUTH`, and the bonds are pulled with `transferFrom` from Paprika, which approves `2 x BOND`. No change to
the contract or the mock was needed.

## With the mock oracle (19 tests)

The same cases, plus these:

- **Refund timing.** Repeated self-accusations cost `-ROUNDS x fee` (3 rounds = -150) and push the window out by exactly the time spent accused.
- **The vote errs.** An honest depositor loses `BOND`, and its key stays flagged.
- **A flagged party comes back with a new key** for free.
- **Mempool copies.** A copied `attest` makes the copier the depositor of the honest key's record. A copied `register` reverts. A copied commitment blocks the honest commit for one block, and the copier loses `BOND`.
- **A reveal seen in the mempool.** The forger cannot get in first without a commitment from an earlier block.
- **Insurance** (see Known limits).
- **Invalid accusations** each revert or forfeit `BOND` to `0x…dEaD`.
- **Griefing N = 5.** The griefer pays `-N x BOND` = -500, the depositor gets `+N x (BOND - fee)` = +250, and the refund is delayed by N x the vote time.
- **A depositor that cannot receive tokens** blocks nobody.
- **Constructor checks.** A bond below UMA's minimum reverts "bad params".
- **`attestersOf`.** Two devices that attested the same file are both listed, and each record is independent.

## Gas (gasUsed)

| function | real OOv3 | mock |
|---|---|---|
| `register` | - | 101,860 |
| `attest` (incl. token pull and `attestersOf` index) | - | 169,388 |
| `commitClaim` | - | 89,174 |
| `revealClaim` (assert + dispute) | **673,488** | 390,047 |
| `settleAssertion` -> callback, fake proven | **165,524** | 130,276 |
| `settleAssertion` -> callback, rejected | **140,870** | 142,628 |
| `refund` | - | 55,940 |
| `forfeitCommit` | - | 49,172 |
| `revokeKey` | - | 44,161 |
| `withdrawCredit` | - | 37,244 |
| `verify` / `attestersOf` (view, estimateGas) | - | 31,756 / 28,836 |

Size: `Paprika.sol` 219 code lines, 11,157 bytes deployed.

## Design choices made where the brief was silent

1. **The refund comes strictly after the last possible reveal** (`> accusableUntil + REVEAL_WINDOW`), so a refund can never get in ahead of a valid accusation.
2. **A commitment must come from a block at or after the photo's own block.** This blocks commitments made before the photo existed.
3. **An unknown assertion id in `assertionResolvedCallback` is ignored, not rejected.** Reverting there would block UMA's settlement of a third party's assertion that names Paprika as its callback recipient.
4. **A reveal on a Fake photo gets its bond back only after passing the window checks.**
5. **A revoked device keeps its first flag.** A fake proven afterwards does not change the reason (KeyRevoked).
6. **Token transfers accept tokens that return nothing as well as tokens that return `true`.**

## Known limits

- **FLAW: an accusation can outlast the commitments it blocks.** While one accusation is open (UMA's vote takes days), every other commitment on that photo expires after `REVEAL_WINDOW` (1 hour) and is forfeited. A forger holding its own commitment can reveal first when a hunter's reveal appears, and the hunter then loses `BOND` (mock test 10, scenarios B and C). The forger's cost is `fee`. Simplest fix, not applied: while the photo is Accused, return the bond on reveal instead of reverting.
- **Insurance residual.** When the vote is short, the hunter only gets its bond back (net 0). Unused insurance costs `BOND` per `REVEAL_WINDOW` if forfeited, or `fee` per round if revealed as a junk self-accusation.
- **Self-accusation makes the penalty for a fake `fee`, not `BOND`.** Repeated rejected self-accusations cost `fee` per round and do not make the window expire, because the window is extended each time.
- **One accusation per photo at a time.**
- **A flagged party returns for free with a new key.** Registration costs nothing.
- **After `accusableUntil + REVEAL_WINDOW` a fake can no longer be punished.**
- **The outcome is only as good as UMA's vote.** A wrong TRUE costs an honest depositor `BOND` and its key.
- **Griefing delays the refund by the vote time of each false accusation.** Each costs the griefer `BOND`.
- **`attestersOf` lists grow without limit.** Anyone with a free key can attach records to a famous hash, at a refundable `BOND` each.
- **A copied commitment that lands first blocks the honest one** (one block of delay; the copier loses `BOND`).
- **Tokens sent to Paprika outside the protocol stay there for good.**
- **Not tested: a missing P-256 precompile.** In the code, every signature check then fails.
