# Paprika v2.3: independent red-team review

Date: 2026-11-20. Artefact: `spec/PROTOCOL.md` (v2.3) and
`experiments/p03-paprika-v2-hardened/contracts/PaprikaV2_3.sol` with `MockOptimisticOracleV3Burn.sol`.
PoCs: `experiments/p08-redteam-v2_3/test/poc.js` (`npx hardhat test`, local Hardhat chain, osaka).
Raw output: `experiments/p08-redteam-v2_3/output/2026-11-20-run.txt` (12 passing).
The authors' README was read only after the findings below were formed. Each finding is marked
**new** (not in the README) or **known** (the README already states it).

Parameters used throughout: S = 0.25 ETH, alpha = 50 %, B = 0.11 ETH, REVEAL_WINDOW = 50 blocks,
CLAIM_GRACE = 100 blocks, unbonding 30 days.

## Findings

### R-01 (high, new in form a): an honest device can be slashed by prior existence, and the attacker profits
The prior-existence rule (`provePriorExistence`) slashes `keyId` if another owner's record of the same `H`
has `recordedBlock < anchorBlock` of this record. The spec says this is sound if the device fetches the
anchor before capture. That condition is **not sufficient**, because the anchor expires after 256 blocks
and a device has no ETH, so it depends on a relayer.

**a) Relayer withholding (new).** Sequence:
1. The camera fetches anchor A before capture and signs `(H, A)`. It hands the signature to relayer R.
2. R does not submit. R records `H` under its own key (owner = a second account of R), at block A+1.
3. R waits 257 blocks. The original signature is now unusable (`blockhash(A) = 0`, "anchor").
4. The camera, seeing no record, re-signs with a fresh anchor A' and submits. Now `R.recorded < A'`.
5. R calls `provePriorExistence(H, honest, R_key)`, waits 50 blocks, `settleStake`, `claimCredit`.

PoC `R-01a`: "honest stake 0.25 slashed (PriorExistence); relayer net +0.1247 ETH after 0.00025 gas;
relayer's own key still Active, record verdict None". The honest owner has no objective rebuttal; its only
recourse is a subjective claim against R's record, and the vote cannot tell from public data who had the
bytes first (the README's own rule: unsettleable claims are rejected). On a 2-second chain the 256-block
window is 8.5 minutes, so an ordinary relayer outage forces step 4.

**b) Post-capture anchor (known, README "J, the rule is unsound when its assumption fails").** Any camera
that captures offline for more than 256 blocks *cannot* anchor before capture at all, and the authors' own
test helper anchors at signing time. PoC `R-01b`: viewer credit 0.125 ETH from the honest device.

Fix (smallest): (1) read anchors from the EIP-2935 history contract (8191 blocks, available on Prague+)
instead of `blockhash`, so a device can always submit its *first* signature; (2) spec rule: a device never
re-signs a digest with a new anchor once the digest has left it; (3) give the accused an escrow-time
rebuttal: a CAPTURE signature over the same `H` whose anchor is `<= o.recordedBlock` cancels the
prior-existence flag. Without (3) the rule should not pay a reward at all.

### R-02 (high, new): prior-existence proofs are not bound to the prover and not committed
`proveKeyMisuse` names `msg.sender` in the signed message; `provePriorExistence` takes only public
arguments and pays whoever lands first.

a) **Copy.** A bot copies the pending call with a higher gas price. PoC `R-02a`: "finder tx status 0
(reverted 'has verdict'), copier tx status 1; copier credit 0.125 ETH, finder 0.0". Risk-free for the bot.

b) **Forger front-runs.** At level 0 the owner always holds its key, so on seeing a pending prior-existence
proof it sends `proveKeyMisuse` from a sybil in the same block. Equal priority, first one wins. PoC
`R-02b`: "finder credit 0.0; forger's sybil credit 0.125 ETH". The forger's loss is capped at (1-alpha)S
and the honest finder earns nothing, so nobody has a reason to hunt recycled photos.

The commit-reveal and escrow (D13-D17) protect only claims; the objective path that v2.3 added has neither.
Fix: route prior-existence proofs through `commitClaim`/reveal (commitment includes the prover; priority
`p = commitBlock << 64`), so a misuse proof sent after the commit loses priority.

### R-03 (medium, known): a forger escapes prior existence by copying within 256 blocks
The forger picks the oldest valid anchor. PoC `R-03`: "original recorded at 1115; copy recorded at 1316
with anchor 1104: no objective proof either way". The README states it. Note the interaction with R-01's
EIP-2935 fix: a longer anchor window widens this escape to 8191 blocks. A fix for one must be weighed
against the other: e.g. keep the long window only for the rebuttal of R-01 (3), not for `attest`.

### R-04 (medium, new): an upheld claim can be made unsettleable, locking stake and escrow forever
The asserter of the OOv3 assertion is the claimant, so the oracle pays the claimant directly before calling
back. A claimant that refuses the payment makes `settleAssertion` revert for ever. With the mock that means a
contract whose `receive` reverts; with real OOv3 and a blacklistable bond token (USDC is the default currency
on Sepolia, per p02) it means a blacklisted address. While the claim is open, `_trySettle` waits for it (lower
`p`), the record keeps `claimOpen` so no other claim can target it, and the flagged device can never withdraw.
PoC `R-04`: "settleAssertion reverts; device stake 0.14 + reserved 0.11 ETH stuck; prover credit 0.0"
(misuse prover never paid, past the window, after 31 days). Who would do it: a forger with an earlier commit
who prefers burning everyone's reward to letting a finder collect. The cost to the forger is its own stake,
which it loses anyway.
Fix: make the contract the asserter (`asserter = address(this)`) and credit the claimant internally, so every
oracle payout lands in the contract and nothing a claimant does can revert settlement.

### R-05 (medium as an integration blocker, partly known): the claim path does not work against real OOv3
These are the contract's assumptions about the oracle, and how they fare against the real OOv3:

| Assumption in the contract | Real OOv3 | Effect |
|---|---|---|
| `assertTruth` / `disputeAssertion` are payable, bond in native ETH | not payable, whitelisted ERC-20 pulled with `transferFrom` | every `revealClaim` reverts; PoC `R-05` with a non-payable oracle: reverts, and the claimant's 0.11 ETH commit bond is then burnable by anyone via `forfeitCommit` |
| winnings arrive as ETH through `receive()` into `inbox` | ERC-20 transfer, no call | `won` is always 0; the device's dispute bond and the claimant's lost half never reach `d.stake`; tokens stuck forever (no sweep, no admin) |
| `CLAIM_BOND = 0.11` constant is at least the minimum bond | `getMinimumBond` = Store final fee / burned percentage, changeable by UMA governance | if the WETH final fee rises, every reveal reverts permanently; the contract cannot be patched |
| currency and `ASSERT_TRUTH` stay whitelisted | governance-controlled | same: the claim path can die permanently |
| the callback cannot revert and is called once, by the oracle | true (no try/catch in OOv3, so a revert would block settlement) | holds in v2.3: the callback only does arithmetic, bounded loops and sends to `0xdEaD` |
| the oracle pays before it calls back | true for OOv3 | holds, but only matters once ETH accounting is replaced |
| the claimant can receive the bond | not with a blacklisted token holder | R-04 |
| stakes in ETH can fund a bond in the oracle's currency | needs wrapping (WETH) or a swap (USDC) | not designed |

The README's D1 says porting "changes only `claimFake`". That is not true: the dispute bond comes from an ETH
stake, the winnings must be accounted in tokens, and the bond amount must be read at reveal time.
Fix: hold stakes in WETH (or wrap at reveal), read `getMinimumBond(currency)` at reveal and store it per
claim, account winnings by token balance, and make the contract the asserter (R-04).

### R-06 (low, new): `verify().stakeAtRisk` overstates what a new challenger can win
`stakeAtRisk = stake + reserved`, but `reserved` bonds sit at the oracle, and the vote decides them. They are
not available to a new challenger. PoC `R-06`: "stakeAtRisk 0.25 ETH but free stake a new challenger can
win is 0.03 ETH" (two griefing claims open; a third reveal is refused, `stake < bond`, by line 170). A verifier
that "weighs a record by the stake" (spec section 8.4) is misled by roughly 8x here.
Fix: return free stake and reserved separately; call only the free stake "at risk".

### R-07 (low, new): block-denominated windows are fragile across chains
REVEAL_WINDOW (50), CLAIM_GRACE (100) and the 256-block anchor are in blocks, and the unbonding period is in
seconds. On a 2-second chain that is 100 s to reveal, 200 s for a hunter to react after the last settlement
before the owner exits, and 8.5 min of anchor life (which feeds R-01a). The spec's numbers assume L1.
Fix: express the grace and reveal windows in seconds, or pick the constants per chain at deploy time.

### R-08 (informational): the "flag" fields are first-come
`flaggedAtBlock` is the first flag; `flagReason` is the first reason, except that `KeyMisuse` overrides it
while keeping the old block. So a `KeyMisuse` flag can show a block earlier than the misuse proof. Under the
spec's time-scoped policy that is conservative (the verifier distrusts everything), so it does not mislead in
the dangerous direction, but the spec promises "what has been proven ... with the block at which it happened".

## What holds (tried, failed to break)
- **Signatures** (PoC `H-1`): high s, s = 0, s = n, r = 0, r = n, r = n+1, 63/65-byte signatures, key (0,0),
  off-curve key: all rejected. `HALF_N` = floor(n/2) is correct; exactly one of s and n-s passes. The three
  preimages have different lengths (120/121/163 bytes), so `encodePacked` cannot collide across them.
  Cross-domain replay and replay of a misuse proof by another challenger fail. Every digest is computed from
  typed fields. If the precompile is absent, `staticcall` returns success with empty data and `ret.length ==
  32` fails, so the contract **fails closed** (no registration possible). It does not accept everything.
- **Time bounds** (PoC `H-2`): current block, future block, `anchorBlock >= 2^64` all give "anchor"; 256
  back is accepted, 257 back is rejected. The relayer cannot change the anchor: the block hash is signed.
- **Funds** (PoC `H-3`): non-oracle callbacks and ETH revert; a double settlement reverts at the oracle; a
  second callback for a deleted claim only burns. Forced ETH via selfdestruct is stranded but breaks nothing
  (no equality checks). Balance >= stakes + credits + commit bonds. CEI is respected in `withdraw`,
  `claimCredit`, `revealClaim`. The loops are bounded by stake/bond. I found no double payment, no counter
  underflow and no way to withdraw with a pending claim or escrow.
- **Mempool attacker against a device that really anchored before the photo was public** (PoC `H-4`):
  "not prior". The vulnerability needs re-anchoring (R-01a) or a post-share anchor (R-01b).
- **CLAIM_GRACE**: I found no ordering in which the owner withdraws without a 100-block window with free
  slots (free stake >= B is guaranteed at that point, because an upheld claim flags the device).
- **Commitments**: they are stored per committer, so they cannot be revealed twice or by another account.

## Spec vs code

| Spec | Code |
|---|---|
| section 1 "a stake S ... forfeited when evidence ... is accepted, part of it to whoever presents the evidence" | after `withdraw` nothing is forfeited; the reward goes to the lowest-`p` challenger, which is front-runnable for prior existence (R-02); a refused reveal (slots full) is "evidence" that forfeits nothing |
| section 4 msg 2: attest checks four things | `attest` is also payable and adds `msg.value` from any relayer to the stake |
| msg 4: "stake slashed" | escrowed for 50 blocks, priority rule (not in section 5) |
| msg 4: "another owner" | owner address only; a sybil is free (cosmetic) |
| msg 6: "record exists without verdict or open claim; unreserved stake >= bond" | refunds instead of reverting; D17 lets a reveal through on a record that has a verdict; also refused if the stake was already settled |
| msg 7: "Rejected: the bond won ... added to the device's stake" | the whole payout (1.5 B) is added, or burned if the stake was settled; with real OOv3 nothing is added (R-05) |
| msg 8: unbond/withdraw conditions | + `CLAIM_GRACE` 100 blocks after the last settlement |
| section 4 "later ones get their own bonds back, and nothing more" | a later upheld claimant gets 1.5 B from the oracle |
| section 3 `commits[c]`: claimant, bond, block | keyed by (committer, c); fixed bond; `forfeitCommit` burns it (not in spec) |
| section 5: prior existence "sound when devices fetch the anchor before capture" | not sufficient: R-01a |
| section 5: misuse "an honest, hardware-bound device cannot be flagged" | at level 0 nothing is hardware-bound; the owner can always self-flag, and uses it to front-run (R-02b) |
| section 6 `verify` "stake still at risk" | includes oracle-held reserved bonds (R-06) |
| section 8.3 "half to the device and half burned" | real OOv3 sends that half to UMA's Store (a fee), not to a burn |
| section 8: B = 0.11 "the oracle's minimum bond" | a constant; the oracle's minimum is governance-mutable (R-05) |
| section 3 verdict `Upheld` | `UpheldFake`; also set by a prior-existence proof (not stated) |

**The Claim (section 1).** "Signed `H` after `b0` and before `b1`" is what the contract enforces (modulo the
builder of `b0` knowing its hash a few seconds early). The rest of the sentence would mislead a verifier in
four places:
1. `S` is the registration stake, not what is at risk now (top-ups, reservations, withdrawal).
2. "Forfeited when evidence is accepted" fails after withdrawal and when slots are full.
3. "Evidence against `K`" from a prior-existence proof can be manufactured against an honest `K` (R-01).
4. "Part of it to whoever presents the evidence" is false for a front-run finder (R-02).

## Would I build on this tonight?
**Yes, as a demo of signed, time-bounded, staked records with the misuse-proof path. No, for the
prior-existence and vote paths as they stand.** The signature and anchor handling, the accounting and the
state machine held under everything I tried. But the newest objective rule (prior existence) can be turned
against honest cameras for profit, and it pays the wrong party. The vote path cannot run against the real
UMA oracle without a redesign of the bond handling.

The three fixes I would insist on first:
1. **Prior existence:** commit-reveal it, with the prover bound in the commitment (R-02); add a rebuttal by
   an earlier-anchored signature over the same `H`, and EIP-2935 anchors so a device never has to re-sign
   (R-01). Until then, either disable the reward or ship the rule as a flag without a reward.
2. **Oracle integration:** the contract is the asserter, bonds in WETH, the bond read from
   `getMinimumBond` per claim, and winnings accounted by token balance (R-04, R-05). Test against the real
   OOv3 on the p02 fork before demoing claims.
3. **Verifier output:** report free stake and reserved bonds separately, and fix the section 1 sentence so
   that it says what is enforced (R-06, Claim).

Not done in the time box: a real-OOv3 fork run of the claim path; a fuzz campaign of my own; a gas
measurement of the D15 loop at large stakes (it is bounded by stake/bond, about 10^4 claims to matter).
