# Paprika v2 — protocol specification

**Status: DRAFT, 2026-11-20, revision v2.5.** Hardened revision of the original proposal
([`../proposal/PAPRIKA.md`](../proposal/PAPRIKA.md)). The reason for every change is in
[`../docs/DECISIONS.md`](../docs/DECISIONS.md); the attacks that motivated them are reproduced in
[`../experiments/p01-paprika-baseline-attacks/`](../experiments/p01-paprika-baseline-attacks/).
Reference implementation and tests, one contract per revision:
[`../experiments/p03-paprika-v2-hardened/`](../experiments/p03-paprika-v2-hardened/). The frozen
contracts are `PaprikaV2_5.sol` (everything below) and `PaprikaCore.sol` (the same without the
claim path, messages 4–6). §11 lists what each revision fixed.

## 1. What the protocol claims, and what it does not

**Claim.** For a record `(H, K)` the chain proves that the holder of device key `K` signed photo
digest `H` after block `b0` and before block `b1`; that `K` was registered by an account that
locked a stake `S`, which is forfeited when evidence against `K` or the record is accepted, part of
it to whoever presents the evidence; and what has been proven or decided about `K` since, with the
block at which it happened.

**Not claimed.** That `H` is the digest of a camera capture. For a self-registered key
(assurance level 0) the guarantee is economic: a known amount is at risk, and the conditions under
which it is lost are public. A cryptographic link to hardware exists only at the higher levels
(§7), where it rests on the device maker.

## 2. Actors

| Actor | Role |
|---|---|
| Device | Holds a P-256 key `K = (x, y)`; signs capture records. Simulated in the prototype. |
| Owner | The account that registers `K` and locks the stake. |
| Relayer | Any account that submits a signed capture record and pays the gas. |
| Challenger | Any account that presents evidence against a key or a record. |
| Issuer | Optional. An account that locks a bond and endorses device keys (a device maker). A key it endorses is at assurance level 1. |
| Optimistic oracle | Resolves claims by vote (interface of UMA's Optimistic Oracle V3). |
| Verifier | Anyone: hashes the file and reads the chain. |

The contract has no owner, no administrator, no upgrade path and no treasury.

## 3. State

- `devices[keyId]`, `keyId = SHA-256(x ‖ y)`: owner, stake, stake reserved for open claims,
  level, issuer, status (`Active`, `Flagged`, `Retired`), `flaggedAtBlock`, `flagReason` (`KeyMisuse`,
  `ClaimUpheld`), unbonding time, block at which the stake was withdrawn.
  A key is registered at most once, ever.
- `records[H][keyId]`: `anchorBlock` (not-before), `recordedBlock` (not-after), `verdict`
  (`None`, `Upheld`). Records are never deleted or overwritten.
- `issuers[account]`: bond, keys endorsed, keys flagged for misuse, exit time.
- `commits[c]`: claimant, bond, block. `claims[assertionId]`: record, claimant, commit block.

## 4. Messages

All device signatures are ECDSA P-256 over a SHA-256 digest that **the contract computes itself**
from the fields below, checked through the P-256 precompile (address `0x100`), with `s` required
in the lower half of the group order. Every signed message starts with a domain label and binds
the chain, the contract and the key.

| # | Message | Signed by the device | Contract checks | Effect |
|---|---|---|---|---|
| 0 | `registerIssuer()` + bond | — | bond ≥ `ISSUER_MIN_BOND` | Issuer active while its bond covers one bounty and it is not exiting |
| 1 | `register(x, y, pop, issuer, endorsement)` + stake | `"PAPRIKA/REGISTER" ‖ chainId ‖ contract ‖ keyId ‖ owner` | stake ≥ `MIN_STAKE`; signature; key never seen. With an issuer: the issuer is active and signed `"PAPRIKA/ENDORSE" ‖ chainId ‖ contract ‖ keyId` | Device `Active`, bound to the owner; level 1 if endorsed, else level 0 |
| 2 | `attest(H, anchorBlock, keyId, sig)` by any relayer | `"PAPRIKA/CAPTURE" ‖ chainId ‖ contract ‖ keyId ‖ H ‖ blockhash(anchorBlock)` | device `Active`; `blockhash(anchorBlock) ≠ 0`; signature; no record yet for `(H, keyId)` | Record stored with `[anchorBlock, block.number]` |
| 3 | `proveKeyMisuse(keyId, sig)` by a challenger | `"PAPRIKA/EXTRACTED" ‖ chainId ‖ contract ‖ keyId ‖ challenger` | signature | Device `Flagged (KeyMisuse)` at once; reward escrowed (§5) |
| 4 | `commitClaim(c)` + bond | — | `c = keccak256(claimant, H, keyId, evidenceHash, salt)` is new | Commitment stored; it names neither device nor record |
| 5 | `revealClaim(H, keyId, evidenceHash, salt)` | — | same claimant; 1 to `REVEAL_WINDOW` blocks after the commit; record exists without verdict or open claim; unreserved stake ≥ bond | Assertion opened on the oracle and contested at once by the contract, with a dispute bond reserved from the device's stake |
| 6 | Oracle callback | — | caller is the oracle | Upheld: verdict `Upheld`, device `Flagged (ClaimUpheld)`, stake slashed. Rejected: the bond won from the claimant is added to the device's stake |
| 7 | `requestUnbond`, `withdraw` | — | owner; unbonding period elapsed; no open claim; no escrowed reward; `CLAIM_GRACE` blocks since the last claim on the device settled | Device `Retired` at once; stake returned after the period |

**Slashing.** A share `α` of the stake that remains goes to the challenger; the rest is burned.
The first accepted challenge takes it: later upheld claims get their own bond back and the share
of the dispute bond they won, and no part of the stake.

**Issuer bounty.** When a misuse proof against a level-1 key is paid, the challenger also receives
`ISSUER_BOUNTY` from the issuer's bond, and the issuer's public count of keys flagged for misuse
grows. An upheld claim does not charge the issuer: it is not a hardware failure.

**Time bounds.** `blockhash(anchorBlock)` is unpredictable before that block exists, so the
signature was made after it; the record is stored in block `recordedBlock`, so it was made before.
The window is at most 256 blocks wide. A device is expected to obtain the anchor block **before**
capture.

## 5. Two kinds of challenge

**Proof of key misuse — objective (message 3).** A key that lives inside a capture pipeline signs
only capture records. A valid signature under `K` on the `EXTRACTED` domain is proof that `K` can
be used outside that pipeline: it was extracted, or it never was hardware-bound. No vote. The
message names the challenger, so a copied proof is useless to anyone else. Nobody can produce it
for a key they cannot sign with: an honest, hardware-bound device cannot be flagged this way.

**Claim against a record — by vote (messages 4–6).** For evidence a contract cannot check, such
as an earlier publication elsewhere. Two phases: a commitment that hides the target, then a reveal.
The contract contests every claim with the device's own stake, so a claim is never upheld by
silence. Under the oracle's rule a claim that cannot be settled from public evidence is rejected.
This path is **not** a detector of well-made synthetic images. It is specified and tested against
an oracle mock; against the real oracle it needs the changes listed in §9, item 3, and it is not
part of the prototype's demo.

**Priority between challenges.** The reward of a misuse proof is escrowed for `REVEAL_WINDOW`
blocks. A claim revealed in that time whose commitment is older than the proof comes first: if
upheld it takes the reward and the prover gets nothing. An owner who sees a commitment cannot tell
whether it targets its device, and gains nothing by slashing itself afterwards.

**Withdrawn: proof of prior existence.** Revisions v2.3 and v2.4 had a third, objective challenge:
slash a key if another owner's key had recorded the same digest before this record's anchor
block. An independent review broke it with running tests: a relayer that receives an honest
camera's signed record can record the same file under its own key, withhold the camera's record
until its anchor expires, and collect the reward when the camera signs again; and the proof named
no one, so it could be copied from the mempool. The rule is removed. Re-used images are left to
the claim path. What a sound version would need is in `docs/reviews/paprika-v2_3-redteam.md`
(findings R-01, R-02).

## 6. What a flag does

A flag is prospective: a flagged key cannot attest again. Earlier records stay readable with
their time bounds, next to the flag's block and reason. `verify(H, keyId)` returns all of it,
with the stake still at risk and the block at which the stake was withdrawn, so a verifier can
tell a record that is still challengeable from one that passed the challenge window unchallenged.
A verifier applies its own policy:

- strict: distrust every record of a flagged key;
- time-scoped: keep records made before the flag when the reason is `ClaimUpheld` (only the
  record concerned is discredited); distrust all records of a key flagged for `KeyMisuse`, because
  the time of extraction is unknown.

Nothing is erased, by anyone.

## 7. Assurance levels

| Level | Admission | What the record means | Status in the prototype |
|---|---|---|---|
| 0 | Self-registered key with stake | Economic guarantee only | Implemented |
| 1 | Key endorsed by a bonded issuer (device maker) that vouches it is hardware-bound | Level 0 plus the issuer's bond and public track record; a misuse proof is then evidence of extraction, paid in part by the issuer | Implemented (revision v2.4, issuers simulated). A private variant with zero-knowledge proofs is tested in `experiments/p04-combined-critical-path/` |
| 2 | As level 1, signed at the sensor | Capture inside the trust boundary | Not implemented |

Without the claim path (the minimal contract `PaprikaCore`), a level-0 stake can be slashed only
by someone who holds the key, that is the owner or a thief: there the stake deters little, and the
protocol's value rests on level 1.

Anyone can become an issuer by locking the bond, and can endorse software keys of its own. The
chain does not say which issuers are real device makers: a verifier brings its own list of
trusted issuers and treats a key endorsed by an unknown issuer as level 0. What the chain adds is
that every issuer has a bond at risk and a public record of how many of its keys were proven
misusable.

## 8. Incentive conditions

With stake `S`, reward share `α`, claim bond `B`, gain `G` from one accepted forgery, and `p` the
probability that acceptable evidence against it is produced:

1. **Self-reporting loses money, and bounds the penalty.** An owner that slashes its own key
   recovers `αS`: a loss of `(1−α)S` plus gas for every `α < 1`. For the same reason an owner that
   expects to be caught can slash itself first, so the effective penalty is `(1−α)S`, not `S`.
2. **Nothing to drain.** Rewards are paid only out of the slashed stake of the same device.
3. **A false claim costs the claimant its bond**, half to the device and half burned, unless the
   vote errs. With vote error rate `e` on false claims, griefing is irrational when
   `e ≤ (B + gas) / (α(S−B) + B/2 + B + V)`, where `V` is what the griefer gains outside the
   protocol.
4. **Deterrence** needs `p · (1−α) · S > G`. The protocol cannot make this hold for arbitrary `G`:
   the stake is a public number, and a verifier should weigh a record by it.
5. **Self-revocation of an endorsed key loses money.** `ISSUER_BOUNTY < (1−α) · MIN_STAKE`, so an
   owner that proves misuse of its own level-1 key receives less than the stake it forfeits. A
   third party that extracts a key gains `αS` plus the bounty by disclosing it.
6. **Evasion is priced.** A new identity costs a new stake, locked for the unbonding period. A
   record nobody challenges before the stake is withdrawn has cost its author only the lock-up.

Parameters chosen from the model in `experiments/p06-economic-model/` (inputs `p`, `e`, `G` are
assumptions there, not measurements): `S = 0.25` ETH, `α = 0.5`, `B = 0.11` ETH (the oracle's
minimum bond in WETH), unbonding 30 days, `REVEAL_WINDOW = 50` blocks, `CLAIM_GRACE = 100` blocks,
`ISSUER_MIN_BOND = 1` ETH, `ISSUER_BOUNTY = 0.1` ETH. With these and a detection
probability of 1–10%, the stake deters forgeries worth roughly 4 to 40 USD at 3,000 USD per ETH.

## 9. Limits

1. A level-0 key proves no physical origin; a staked software key can attest synthetic bytes. A
   level-1 key proves it only as far as its issuer is honest and its hardware holds, and only to a
   verifier that has reason to trust that issuer.
2. The stake bounds the punishment, not the damage: the mechanism deters low-value fraud only.
3. Claims are decided by a token-holder vote that takes two to three days and whose economic
   security is the oracle's, not ours. A griefer whose outside gain is much larger than the stake
   cannot be priced out. The reference contract was tested against a mock: the real oracle takes
   bonds in an ERC-20 token and can change its minimum bond, so the contract must become the
   asserter, hold bonds in that token and read the minimum for each claim; and an upheld claim
   must not depend on the claimant accepting a transfer (review findings R-04, R-05).
4. Before any commitment exists, an owner can slash itself and leave challengers nothing.
   Whoever steals a key can do the same to its owner, and under both verifier policies a
   `KeyMisuse` flag discredits the key's whole archive: the records stay, the trust in them goes.
5. An owner can fill a device's reservable claim slots with its own weak claims, at the cost of
   one lost bond per vote period each, to delay genuine claims.
6. Records of one key are linkable to each other and to the owner's account. The protocol makes
   no claim about who photographed first.
7. Exact-digest matching: a re-encoded or cropped copy is a different photo to the protocol.
8. One transaction per photo; batching is not specified.
9. A genuine device pointed at a screen yields a genuine record.
10. ECDSA P-256 is not post-quantum.
11. The contract cannot be patched.

## 10. Prior work this builds on

Binding a key to a deposit so that leaking the key forfeits it is the idea of leakage-deterring
cryptography and of collateralised keys (Kiayias and Tang, ACM CCS 2013 and 2015); penalising
misbehaviour by making it reveal control over a deposit is that of accountable assertions (Ruffing,
Kate and Schröder, ACM CCS 2015). The split between challenges a contract can check and those that
need a vote follows the objective / intersubjective distinction of the EIGEN whitepaper. What is
ours is the assembly for camera keys, with or without an issuer, and the bounty rule of §8. References and
their verification status: `docs/research/seed/`.

## 11. Revisions

| Revision | Flaw found by the tests of the previous one | Fix |
|---|---|---|
| v2 | Baseline: free ban evasion, unsigned records, treasury drain, banning over unattested photos, erasure | Stake, proof of possession, device signature checked on-chain, rewards from the slashed stake, flags instead of erasure |
| v2.1 | Owner took the reward of an open claim with a misuse proof; first-attester field could be front-run; unwatched honest device lost to an uncontested claim | Open claims have priority; field removed; every claim contested by the contract |
| v2.2 | Owner front-ran a pending claim by slashing itself; owner's second account squatted the single claim slot | Commit and reveal with escrowed misuse rewards; several claims per device, stake reserved per claim |
| v2.3 | Review of the signature handling; an owner could fill every claim slot and withdraw in the same block | Low-`s` rule, key identifier in every signed message, withdrawal grace after the last claim. A proof of prior existence was added here and withdrawn in v2.5 |
| v2.4 | Two judging panels: without level 1 the design gives no link to hardware at all; in the combined spike an owner could revoke its own device to collect the issuer's bounty | Issuers with a bond, endorsed registration, bounty smaller than the burned part of the owner's stake |
| v2.5 | Independent review of v2.3 with running exploits: the prior-existence rule lets a relayer slash an honest camera for profit and its proofs can be copied; an upheld claim cannot settle if the claimant refuses the transfer; the stake reported as at risk included bonds held by the oracle | Prior-existence rule withdrawn; claim rewards credited for collection instead of sent; free and reserved stake reported separately |
