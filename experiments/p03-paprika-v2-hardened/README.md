# p03: Paprika v2 to v2.5 and PaprikaCore (hardened), attack tests

## Purpose
Evidence for the hackathon decision. `contracts/PaprikaV2.sol` implements the hardened revision ("Paprika v2"). `test/attacks-v2.js` re-runs every attack from `../p01-paprika-baseline-attacks` against it and adds a few new ones. Each test prints `ATTACK <name>: SUCCEEDS / FAILS / PRICED | numbers`. `contracts/PaprikaV2_1.sol` and `test/attacks-v2_1.js` implement revision v2.1, which fixes four flaws found in v2 (see "Paprika v2.1" below). `contracts/PaprikaV2_2.sol`, `test/attacks-v2_2.js` and `test/fuzz-v2_2.js` implement v2.2, which fixes the two flaws found in v2.1 (see "Paprika v2.2"). `contracts/PaprikaV2_3.sol`, `test/attacks-v2_3.js` and `test/fuzz-v2_3.js` implement v2.3, the frozen revision that follows `/home/tux/crypto2/spec/PROTOCOL.md` (see "Paprika v2.3" and "Spec vs implementation"). The contracts and suites of v2, v2.1 and v2.2 are kept unchanged for the record, and they still pass. `contracts/PaprikaV2_4.sol`, `test/attacks-v2_4.js` and `test/fuzz-v2_4.js` add assurance level 1 (bonded issuers); see "Paprika v2.4". v2.3 stays unchanged too. After an independent red team broke the prior-existence rule (`/home/tux/crypto2/docs/reviews/paprika-v2_3-redteam.md`), two final contracts follow spec revision v2.5:

- **`contracts/PaprikaV2_5.sol`** (tests `test/attacks-v2_5.js`, `test/fuzz-v2_5.js`): v2.4 with the rule withdrawn and R-04, R-06 and R-08 fixed.
- **`contracts/PaprikaCore.sol`** (tests `test/attacks-core.js`, `test/fuzz-core.js`): the same protocol with the whole vote path removed. This is the contract to demo.

**Jump to "Final state: v2.5 and Core" at the end of this file.** This is a spike, not a product. It runs only on a local in-process Hardhat chain with the default accounts.

## How to run
```
npm install && npx hardhat test
```
Tested with Node 26.4, hardhat 2.29.x, ethers 6, solc 0.8.28 (optimizer 200 runs, bytecode target cancun), and chain hardfork `osaka`, which provides the P-256 verify precompile at `0x100` (EIP-7951). `npx hardhat test` runs both suites. Raw outputs:
- `output/2026-11-20-run.txt`: v2 only, 15 passing.
- `output/2026-11-20-run-v2_1.txt`: both suites, 47 passing, 0 failing. That is v2's 15 tests plus v2.1's 16 tests run twice, once with AUTO_DISPUTE off and once with it on.
- `output/2026-11-20-run-v2_2.txt`: every suite plus the fuzz, 67 passing, 0 failing. That is 15 (v2) + 32 (v2.1) + 17 (v2.2) + 3 fuzz seeds. Fuzz options: `FUZZ_SEEDS=1,2,3 FUZZ_STEPS=2500` (the defaults).
- `output/2026-11-20-run-v2_3.txt`: every suite of every version, both fuzzers, frozen state. Options for the v2.3 fuzz: `FUZZ3_SEEDS=1,2,3,4,5 FUZZ3_STEPS=5000` (the defaults). This full run takes several minutes, mostly the v2.3 fuzz.
- `output/2026-11-20-run-v2_4.txt`: every suite of every version and all three fuzzers. Options for the v2.4 fuzz: `FUZZ4_SEEDS=1,2,3,4,5 FUZZ4_STEPS=5000` (the defaults).
- `output/2026-11-20-run-v2_5-and-core.txt`: every suite and every fuzzer, run as two concurrent processes and concatenated. Part A is v2 to v2.4, part B is v2.5 and Core. Fuzz options: `FUZZ5_*` and `FUZZC_*`.

Devices are simulated with Node `crypto` P-256 keys (`dsaEncoding: "ieee-p1363"`). `contracts/MockOptimisticOracleV3.sol` stands in for UMA OOv3. It keeps UMA's function names and argument lists (`assertTruth`, `disputeAssertion`, `settleAssertion`, `defaultIdentifier`) and UMA's callbacks (`assertionResolvedCallback(bytes32,bool)`, `assertionDisputedCallback(bytes32)`), using the interface from `../p02-uma-oov3-feasibility/contracts/BanByAssertion.sol`. Account `s[0]` plays the DVM vote (`resolveDispute`).

Parameters: `MIN_STAKE` 0.1 ETH, `REWARD_BPS` 5000 (50%), `CLAIM_BOND` 0.05 ETH, `LIVENESS` 2 h, `UNBONDING_PERIOD` 7 days. Burned funds go to `0x…dEaD`.

## The design as implemented (short)
- **No owner, no admin, no upgrade path, no treasury.** The oracle address is fixed in the constructor. ETH leaves the contract by exactly three paths: `withdraw` (an owner takes back its own stake after unbonding), `claimCredit` (a challenger collects an earned reward), and the burn on a slash.
- **register(x, y, popSig)** requires a stake of at least 0.1 ETH and a P-256 signature over `sha256("PAPRIKA-V2/REGISTER" ‖ chainid ‖ this ‖ msg.sender)`. `keyId = sha256(x ‖ y)`. A key can be registered only once, ever.
- **attest(photoHash, anchorBlock, keyId, sig)** can be sent by any account. It requires: the device is Active; `blockhash(anchorBlock) != 0`; a signature over `sha256("PAPRIKA-V2/CAPTURE" ‖ chainid ‖ this ‖ photoHash ‖ blockhash)`; and no existing record for (photo, key). Any ETH sent with the call is added to the device's stake. The contract stores `records[photo][key] = {anchorBlock, recordedBlock, verdict}` and `firstKeyOf[photo]`.
- **proveKeyMisuse(keyId, sig)** takes a signature over `sha256("PAPRIKA-V2/EXTRACTED" ‖ chainid ‖ this ‖ msg.sender)`. The device is flagged at once with reason KeyMisuse, and its stake is split 50% to the challenger and 50% burned.
- **claimFake(photo, keyId, evidenceHash)** requires a record, no verdict, no open claim, and a 0.05 ETH bond. It calls `oracle.assertTruth` with asserter = claimant and callback = this contract.
  - Truthful: the record gets verdict UpheldFake, the device is flagged (DisputeUpheld), and the stake is split 50/50. The oracle returns the bond to the claimant.
  - Not truthful: nothing happens to the device. The oracle pays both bonds to the disputer.
- **requestUnbond / withdraw.** `requestUnbond` sets the device to Retired at once. `withdraw` works after 7 days if the device has no open claims and is still Retired (not Flagged).
- **verify(photo, keyId)** returns the record, status, `flaggedAtBlock`, `flagReason`, stake and `recordedBeforeFlag`. Nothing is hidden after a flag.

## Design notes and deviations
- **D1 Native-ETH bond.** The mock takes the claim bond in native ETH (`assertTruth` and `disputeAssertion` are `payable`, `currency = address(0)`). Real OOv3 takes a whitelisted ERC-20 bond, pulled with `transferFrom` after `approve`, and the bond must be at least the oracle's minimum bond for that currency. It also burns part of the loser's bond to UMA's Store; the mock pays the dispute winner both bonds in full. Porting to OOv3 changes only `claimFake` (pull the ERC-20, approve the oracle) and the interface.
- **D2 Asserter = claimant.** The oracle returns the bond (or both bonds) directly to the claimant, so PaprikaV2 never holds bonds. The bond invariant is therefore checked on the oracle: `oracle.balance == openBonds`.
- **D3 Rewards are pull payments (`credit` + `claimCredit`).** With real UMA, a revert inside `assertionResolvedCallback` reverts `settleAssertion`, which would freeze the bonds and leave the claim open forever. That would also block the owner's `withdraw`. So the callback never sends ETH to arbitrary addresses: it credits the reward. The burn goes to `0x…dEaD`, which cannot revert. The invariant checked after every test is therefore `balance == Σ stakes + Σ unclaimed credits`. It held in all 15 tests.
- **D4 Flag precedence.** The first flag fixes `flaggedAtBlock`. Later events never move it, so a forger cannot push its flag later to make more records count as "before the flag". KeyMisuse overrides DisputeUpheld, because it is the stronger statement. A second misuse proof reverts. Claims stay possible after a flag or a withdrawal, so per-photo verdicts can still be recorded, but they pay nothing because the stake is already 0.
- **D5 `recordedBeforeFlag`.** It is true when the record exists and either the device is not flagged or `recordedBlock < flaggedAtBlock` (strictly less). A record in the same block as the flag counts as not before.
- **D6 Misuse proofs are accepted while the device is Retired and after withdrawal.** Otherwise a forger could unbond to escape the proof. After withdrawal the proof only flags; there is no stake left to pay out.
- **D7 Claim text.** The text is packed bytes (photo hash, key, contract, evidence hash). A real UMA deployment needs human-readable UTF-8 (hex-encode the fields), which adds gas.
- **D8 Liveness.** UMA's `disputeAssertion` needs a disputer with a matching bond in time. An owner who is offline during the 2 h liveness loses (attack 5b). The liveness is a constant here; a production version would pick a much longer one.
- **D9 Malleability.** The precompile accepts high-s signatures (tested). This is harmless here: replay protection is keyed on (photo, key), the key's registration status, and `msg.sender`, never on the signature bytes.

### Flaws found in the v2 design itself (important)
1. **The forger can snipe its own bounty (test 12, SUCCEEDS).** When a hunter opens a claim, the forger has the whole 2 h liveness to send `proveKeyMisuse` for its own key from a sybil account. The sybil collects 50% of the stake. The hunter's claim is later upheld, but the stake is already 0, so the hunter gets 0 ETH for its work. So the most any forger who holds its own key can lose is `(1 - REWARD_BPS) × stake`, never the full stake. Worse, hunters can always be denied their reward, so **nobody is economically motivated to hunt forgers**. The design gives subjective claims a reward that the accused can pre-empt.
   - Possible fix (not implemented): when a device has an open claim, a misuse proof escrows the reward until the claims resolve and pays it to an upheld claimant first. Or: misuse proofs pay 0 while claims are open. That opens a new griefing vector, so it needs more thought.
2. **"First attester" can be front-run (test 3b, SUCCEEDS).** A thief reads the photo hash in the mempool, signs it with its own device using the same anchor, and pays more gas. The two records then have identical windows `[anchor, recorded]`, and `firstKeyOf` names the thief. The honest record still exists, but `firstKeyOf` must not be read as provenance. It needs commit-reveal or private submission.
3. **There is a stake-recovery window (test 10c, SUCCEEDS).** A forger can attest, call `requestUnbond` immediately, and get the full stake back 7 days later if nobody has claimed. After that, a forged record stays on-chain forever and cannot be slashed. Deterrence only applies during `UNBONDING_PERIOD`.
4. **A stolen honest key becomes a profitable attack on its owner (test 13, SUCCEEDS).** The thief proves "misuse", takes 50% of the victim's stake, and (reason KeyMisuse) makes lenient verifiers drop the victim's whole archive. The contract cannot tell extraction from theft. This is inherent to an objective misuse proof.

## Paprika v2.1 (`contracts/PaprikaV2_1.sol`)
v2.1 fixes v2's flaws 1 to 3 and the 5b residual risk. Flaw 4 is accepted. The v2 contract and its tests are unchanged.

- **A. Open claims have priority on the stake (flaw 1).** A misuse proof that arrives while a claim on the device is open flags the device at once (reason KeyMisuse, block kept) but pays nothing yet.
  - If the claim is upheld, the claimant gets the reward share and the prover gets nothing.
  - If the claim is rejected, the prover is paid from the stake as it stands then.
  - With no open claim, the proof pays at once, as in v2.
  - `verify` also exposes `misusePending`.
- **B. No "first attester" field (flaw 2).** `firstKeyOf` is gone. The protocol makes no priority or authorship claim: each (photo digest, key) record stands alone with its own time bounds `[anchorBlock, recordedBlock]`. A side effect: attest drops from 86k to 64k gas.
- **C. Explicit challenge window (flaw 3).** Unbonding works as before. `verify` now also returns:
  - `stakeAtRisk`: free stake plus any dispute bond the oracle holds for the device;
  - `withdrawnAtBlock`: 0 while the device is bonded.

  This lets a verifier tell "bonded and challengeable" from "survived the challenge window, bond released".
- **D. `AUTO_DISPUTE` (constructor flag).** With the flag on, `claimFake` requires `stake >= CLAIM_BOND` and at most one open claim per device ("device busy"). Right after opening the assertion, the contract disputes it with `CLAIM_BOND` taken from the device's stake (disputer = the contract). Every claim therefore goes to the vote: a flag needs an affirmative decision, never silence.
  - Upheld: verdict, flag and slash of the remaining stake, as before. The device's dispute bond is lost under the oracle's rules.
  - Rejected: the oracle pays the winnings to the contract (`receive()`, oracle only, held in `inbox` within the same tx), and they are added to the device's stake.
  - With the flag off, behaviour is as in v2 (per-record claims, no stake requirement).
- **Mock with UMA's bond split.** `contracts/MockOptimisticOracleV3Burn.sol`, used by the v2.1 suite, pays a resolved dispute like OOv3: half of the loser's bond goes to a Store address, and the winner gets its own bond back plus the other half. The v2 suite still uses the old mock, so its numbers are unchanged.
  - Numbers that depend on the split: in auto mode, the owner's +0.025 on a rejected claim (it would be +0.05 without the burn); the claimant's +0.025 from the device's bond on an upheld claim; the 0.0625 paid to a pending misuse prover; and the 0.025 cost of claim-slot squatting.
  - In off mode, the disputer's +0.025 on a rejected claim (+0.05 in v2).
  - The griefer's loss is the full 0.05 bond either way.

### v2.1 design notes
- **D10.** Upheld claims in auto mode: the claimant receives its bond back + half of the device's dispute bond from the oracle, plus `REWARD_BPS` of the remaining free stake. The forger still loses the full stake: 0.1 ETH, of which 0.05 goes to the claimant, 0.025 to UMA's Store and 0.025 is burned.
- **D11.** In auto mode a device with stake below `CLAIM_BOND` cannot be claimed against: after a slash, after a withdrawal, or with an under-staked device. Per-photo verdicts after a slash are therefore not possible in auto mode. Misuse proofs still work.
- **D12.** The oracle's dispute winnings are matched to the device through `inbox`, filled by `receive()` and consumed by the callback in the same transaction. This relies on the oracle paying before calling back, which our mock does. With real OOv3 (ERC-20) the port would measure the token balance delta around the settlement instead.

### New flaws found in v2.1 (important)
1. **A protects only claims that are already open (test 12b, SUCCEEDS).** The forger watches the mempool. When a hunter's `claimFake` appears, the forger front-runs it with a self misuse proof from a sybil account. The sybil gets 0.05 and the forger loses only half its stake.
   - The hunter's claim then reverts ("stake < bond", auto mode) or is upheld with a reward of 0 (off mode).
   - Fix: commit-reveal for claims (commit `hash(photo, key, claimant, salt)`, which freezes the stake for the committed claimant), or private submission.
2. **Claim-slot squatting (test 14, AUTO mode only, SUCCEEDS).** The one-open-claim-per-device rule lets the forger's own sybil occupy the slot with a weak claim on a genuine photo. Every claim now goes to a multi-day vote, so the slot can stay busy for the whole unbonding window: hunters get "device busy". When the vote rejects the weak claim, the forger settles and withdraws in the same block, ahead of any hunter (statuses 1/1/0 in the test). An owner contract could do it atomically.
   - Cost to the forger: about 0.026 ETH (the sybil's bond minus the half that returns to the device's stake) to keep a deepfake unchallengeable and recover the full stake.
   - Fixes:
     - allow several open claims while `stake >= bond × (open + 1)`;
     - or extend `unbondAt` by the duration of any open claim;
     - and stop letting a just-resolved claim open the exit at once (re-open the window for a minimum time after each resolution).
3. **The effective penalty is (1 − α) × S, not S (test 4, RESIDUAL by design).** A forger with no open claim against it can self-report from a sybil at any time and lose only 0.05 of 0.1 (+ gas). A rational forger expecting to be caught always does this. Deterrence must be computed with `(1 − α) × S`.
4. **Auto-dispute makes every claim a DVM vote.** A vote takes days, not 2 h, and is a cost to UMA voters. That is the price of "never by silence". The honest device's stake is locked and cannot be withdrawn while the vote runs (priced, test 13: one open claim at a time).

### Stolen keys at level 0 (flaw 4, accepted)
At assurance level 0 (self-asserted software key), key custody is the owner's risk. Whoever holds the key can flag the device and take `α × S`, and the contract cannot tell theft from extraction (test 13). This is deliberate. The bounty is what makes *disclosure* of an extracted key rational compared with *abusing* it. It works only when `α × S` exceeds what the holder of the key expects to gain by forging with it: (expected forging gain) < `α × S`. For high-value forgeries that condition fails (F-09), and the key is used for forging rather than reported.

## Paprika v2.2 (`contracts/PaprikaV2_2.sol`)
v2.2 is v2.1 with auto-dispute always on (the flag is gone), plus three changes:

- **F. Commit-reveal for claims.**
  - `commitClaim(commitment)` takes the 0.05 bond, with `commitment = keccak256(abi.encode(claimant, photoHash, keyId, evidenceHash, salt))`. It names neither the device nor the record.
  - Commits are stored per committer. A copied commitment is therefore useless: the copier cannot reveal it, and it does not block the original.
  - `revealClaim(...)` must be sent by the same claimant, at least 1 block and at most `REVEAL_WINDOW` = 50 blocks after the commit. It opens the assertion, and the contract disputes it with a bond from the device's stake, as in v2.1.
  - A commit that is not revealed in time can be burned by anyone through `forfeitCommit`.
  - A misuse proof flags the device at once, but its reward escrows for 50 blocks. It is paid only through `settleStake` or automatically, and only if no claim whose **commit** block is earlier than the proof's block was revealed.
- **G. Several open claims per device.** Each revealed claim reserves one bond from the free stake. A reveal is rejected, with its bond credited back, if any of these holds:
  - the free stake is below the bond;
  - the record already has an open claim or a verdict;
  - the stake was already paid out.

  A reveal **reverts**, so the commit can later be forfeited, for a wrong claimant or salt, a reveal too early or too late, or a record that does not exist.
- **Priority rule (D13).** Each challenger has a priority `p`:
  - a claim: `commitBlock << 64 | revealSeq`;
  - a misuse proof: `proofBlock << 64`. Ties in the same block go to the misuse proof.

  The upheld claim or misuse proof with the lowest `p` receives `REWARD_BPS` of the *free* stake, and the rest is burned. Payment happens once no open claim with a lower `p` remains and the misuse proof's window (if any) has passed.
  - Later upheld claims get only the oracle's payout: their own bond back plus half the device's bond. **They get no share of the stake, because it is gone.**
  - Dispute winnings that reach a device after its stake was paid out are burned (D14).
- **Unchanged from v2.1:**
  - no first-attester field;
  - `verify` returns `stakeAtRisk`, `withdrawnAtBlock`, plus `misusePending` and `openClaims`;
  - misuse proofs work during unbonding;
  - payments are pull-based;
  - withdrawal needs the period elapsed, zero open claims and status Retired. A misuse proof sets Flagged, so a pending escrow always blocks withdrawal.
- **Choices.**
  - Two hunters committing against the same record: the second reveal is **rejected and refunded, not queued**. A queue would add state for little value, because the first claim's vote decides the record.
  - `devices` is internal, read through `device(keyId)`. The public struct getter hit "stack too deep" and I did not want to switch the compiler to via-IR, which would change the gas numbers.
  - The priority check loops over the device's open claims (D15). That loop is bounded by stake / bond, so a device carrying a large deposit makes the oracle callback dearer. This is a theoretical gas-griefing vector; it was not measured.

### Results specific to v2.2 (from `output/2026-11-20-run-v2_2.txt`)
- **Commit-reveal mechanics:** all behave as designed.
  - A reveal by another account and a wrong salt revert "no commit".
  - A reveal in the commit's block reverts "too early"; after 50 blocks, "too late".
  - Forfeiting before the window ends reverts "window open"; afterwards it burns 0.05, and a second forfeit reverts "no commit".
  - A copied commitment cannot be revealed by the copier, and its bond is burned.
  - A second hunter on the same record is rejected and refunded 0.05.
- **12b, self-slash after a commit (FAILS for the forger).** The revealed claim has priority. The hunter receives 0.025 reward + 0.025 oracle split (net +0.0496) and the prover 0, so the forger loses the full stake.
- **12b, self-slash in the same block as an opaque commit:** this is the 12c residual, because ties go to the prover. The prover gets 0.025 and the hunter +0.0245 (oracle split only). The forger cannot tell which device a commit targets, so reacting to every commit is simply the 12c strategy.
- **12c residual, stated plainly:** **a forger that self-slashes before any commit still loses only (1 − α) × S** (test 4: −0.0503 per key, gas included). A late hunter can still open a non-priority claim on the flagged device. That claim reserves a bond from the escrowed stake, so in the test the forger recovered only 0.025 instead of 0.05.
- **14, partial squatting (FAILS):** one weak claim from the forger's sybil no longer blocks the hunter, who opens a claim next to it (2 slots at 0.1 stake).
- **14, all slots filled (SUCCEEDS, priced; residual of G):** the sybil fills all `k = stake / bond = 2` slots right after retirement, and the hunter's reveal is rejected and refunded. At the end of the window the forger settles both claims and withdraws in one block, ahead of the hunter's reveal (statuses 1/1/1/1; the hunter's reveal was rejected because the stake was already withdrawn).
  - Cost to the forger, measured: −0.0517 ETH versus a plain withdrawal, i.e. `k × (0.05 − 0.025)` per vote period plus gas.
  - Each rejected weak claim adds 0.025 to the stake, so `k` grows from round to round: 2, 3, 4.5 slots. Cost per round: 0.05, 0.075, 0.1125 ETH.
  - With a DVM vote of roughly 2–4 days `[MEMORY]` and a 7-day window, that is about 2–3 rounds: about 0.125–0.24 ETH to keep one deepfake unchallengeable and recover the stake. The hunter's delay is the whole window, and its cost is gas only.
  - Possible fix (not implemented): extend `unbondAt` by the time any claim was open, and/or allow reveals to reserve beyond the free stake (queue them) so that full slots never reject.
- **4b, commit order:** two claims were upheld, and the later-committed one settled first. Its payout waited (credit 0) until the earlier-committed one settled and took the 0.05 share.

### Randomised stateful test (`test/fuzz-v2_2.js`)
- **Setup.** Seeds 1, 2, 3, with 2,500 steps each and 6 accounts over 8 P-256 keys. Each step is one of 14 actions (valid and invalid): register, attest, commit, reveal, vote, settle, misuse, unbond, withdraw, claimCredit, forfeit, settleStake, warp, mine.
- **Checked after every step:**
  - the balance invariant, including `oracle bonds = 2 × reserved = 2 × open × bond`;
  - ETH conservation over all 7 accounts + contract + oracle + burn + Store, with gas added back, including the gas of mined reverts;
  - a Flagged or Retired key never gets a new record;
  - a key never registers twice;
  - records never change or disappear. Six random records plus the touched one are checked every step, and **all** records every 100 steps and at the end.
- **Result: 0 violations in all three seeds.** Histograms and revert reasons are in the output file. Per seed: 35–62 records, about 300 commits, 21–45 claims opened and settled; 879–2,157 of the 2,500 steps had an Active device.
- **Honest limit on coverage.** With only 8 keys, most devices end Flagged, after which most attests revert "not active" (409–521 per seed). Successful withdrawals were rare (1–3 per seed).
- **Reproducibility.** The action sequence follows from the seed. The P-256 keys and ECDSA nonces come from Node's CSPRNG, so a run reproduces the actions, not the exact signatures.

## Paprika v2.3 (`contracts/PaprikaV2_3.sol`, frozen)
v2.3 is v2.2 plus five changes:

- **I. Signature hygiene.**
  - Every device signature must have `s ≤ ⌊n/2⌋` (low-s).
  - Every signed message carries `keyId`, with the spec's labels.
  - The contract computes every digest itself from fields. No function takes a digest: the only signature-taking functions are `register(x, y, popSig)`, `attest(photoHash, anchorBlock, keyId, sig)` and `proveKeyMisuse(keyId, sig)`.
- **Byte layouts.** All three messages use `abi.encodePacked`, SHA-256, and big-endian 32-byte `chainId`:

| Message | Layout | Bytes |
|---|---|---|
| REGISTER | `"PAPRIKA/REGISTER"`(16) ‖ chainId(32) ‖ contract(20) ‖ keyId(32) ‖ owner(20) | 120 |
| CAPTURE | `"PAPRIKA/CAPTURE"`(15) ‖ chainId(32) ‖ contract(20) ‖ keyId(32) ‖ H(32) ‖ blockhash(32) | 163 |
| EXTRACTED | `"PAPRIKA/EXTRACTED"`(17) ‖ chainId(32) ‖ contract(20) ‖ keyId(32) ‖ challenger(20) | 121 |

  The labels share `"PAPRIKA/"` and diverge at byte 8 (`R`, `C`, `E`). No label is a prefix of another, so no preimage can parse as two message types. The total lengths also differ. The fields after each label have a fixed length, so a single message type cannot be parsed in two ways either.
- **J. `provePriorExistence(H, keyId, otherKeyId)`.** Anyone may call it. It requires:
  - both records exist;
  - the devices have different owners;
  - `records[H][otherKeyId].recordedBlock < records[H][keyId].anchorBlock`;
  - the record has no verdict.

  Effect: verdict on `(H, keyId)`, flag `PriorExistence` from this block. The reward is **escrowed exactly like a misuse proof** (D16): priority `p = block << 64`, a `REVEAL_WINDOW` escrow, and a claim committed earlier keeps priority. This follows your view; the spec text says "stake slashed" (see below).
- **K. Claim grace.** `withdraw` additionally needs `CLAIM_GRACE` = 100 blocks since the device's last claim settlement.
- **L. Parameters (spec §8).** `MIN_STAKE` 0.25, α = 50%, `CLAIM_BOND` 0.11, unbonding 30 days, `REVEAL_WINDOW` 50 blocks. The mock oracle's liveness is unchanged (2 h, constant `LIVENESS`). It is irrelevant here, because every claim is disputed at once.
- **Flag reasons follow the spec:** `KeyMisuse`, `PriorExistence`, `ClaimUpheld`. The first reason is kept, except that `KeyMisuse` overrides. `verify().misusePending` now means "an objective proof (misuse or prior existence) is pending in escrow".

### Flaw found while building v2.3, and fixed openly (D17)
**An accomplice's prior-existence proof could pre-empt a committed claim.** The sequence: a hunter commits against record `(H, V)`. One block later, the owner's accomplice (who holds an earlier record of `H` under another owner) calls `provePriorExistence`. That sets the record's verdict, and v2.2's rule "reveal rejected if the record has a verdict" then refunded the hunter's reveal. The accomplice took the escrowed reward, despite the escrow.

In the first run of test 17f, the hunter's reveal was refunded and the accomplice was credited after the window. The fix: a verdict set by an objective proof made **after** the commit no longer rejects the reveal. Test 17f now shows the claim keeps priority (hunter 0.07, accomplice 0). Your escrow requirement was necessary but not sufficient; the reveal path also had to change.

### Results specific to v2.3 (from `output/2026-11-20-run-v2_3.txt`)
- **I, signature hygiene (all rejected).**
  - High-s capture, PoP and misuse signatures are rejected ("bad sig" / "bad pop").
  - B's signature over a message naming A is rejected both as B and as A.
  - A's signature with B's keyId is rejected.
  - Cross-domain reuse is rejected in every direction: PoP → capture, PoP → misuse, capture → misuse, misuse → capture, capture → PoP, misuse → PoP.
- **J, recycled photo: caught.**
  - B re-attests A's photo with a later anchor. A third party flags B (PriorExistence, record Upheld) and collects 0.125 after the 50-block escrow.
  - The honest original A cannot be slashed through B's later record ("not prior").
  - The same owner on both keys is rejected ("same owner"). This check is **cosmetic**: a second address costs nothing.
- **J, mempool attacker vs honest A: FAILS in every ordering tried.**
  - Attacker front-runs A in the same block: A [1810, 1811], attacker [1810, 1811], "not prior" both ways.
  - Attacker's record lands strictly between A's anchor and A's record: A [1815, 1824], attacker [1818, 1821], "not prior".
  - Reason: A's anchor block exists before `H` does, so the earliest the attacker can record is A's anchor + 1, and the rule needs `attacker.recorded < A.anchor`. A same-block anchor is impossible for the same reason.
- **J, the rule is unsound when its assumption fails (SUCCEEDS).** An honest device whose app takes the anchor block *after* the photo was shared, for example at signing time rather than at capture, is slashable by anyone who recorded the shared file first. The rule is only as sound as the spec's "fetch the anchor before capture" assumption (§4, Time bounds), and the contract cannot check it. Device software must anchor before capture and must not re-anchor later.
- **J, forger picks the oldest anchor (PARTLY ESCAPES).** With an anchor 255 blocks back, a re-use is caught only if the original was recorded before that anchor. **Every re-use of an original recorded less than ~256 blocks (~51 min at 12 s) before the forger's attest escapes this rule.** In the test: original at block 2192, forger anchor at 2037, "not prior". Re-use of a file never attested, and any non-byte-identical copy, also escape.
- **K, slot filling (FAILS now).** The forger fills both slots (k = ⌊0.25 / 0.11⌋ = 2), the claims are rejected, and the forger settles them and calls `withdraw` in the same block. The withdraw reverts "claim grace", and the hunter's reveal in that same block opens a claim (statuses 1/1/0/1). The claim was upheld: forger net −0.222, hunter +0.179.
  - Squatting now buys **delay only**, at `B/2` = 0.055 per slot per vote period, i.e. 0.11 per period at the minimum stake.
  - **Is there still an ordering in which the forger withdraws without a hunter having had an open slot for `CLAIM_GRACE` blocks? By argument (not exhaustively tested): no.** `withdraw` needs zero open claims and no settlement in the last 100 blocks. Any squatting claim open during those 100 blocks would have to settle before the withdraw, which restarts the grace. So the final 100 blocks before any withdraw always have every slot free.
  - Remaining assumptions: a hunter must notice and commit + reveal within those 100 blocks (about 20 min on L1), and the grace counts only *settlements*. A reveal that is *rejected* (refunded) does not count, which is harmless because it never opened a claim.
- **Unchanged residuals at the new parameters:**
  - self-slash before any commit: −0.1253 per key = (1 − α) × S + gas;
  - an unchallenged exit after the 30-day window: full 0.25 back;
  - stolen level-0 key: the thief takes 0.125.

### Randomised stateful test v2.3 (`test/fuzz-v2_3.js`)
- **Setup.** 5 seeds × 5,000 steps, 10 accounts, 24 key **slots**: a slot whose key is dead (flagged, or withdrawn) is refilled with a fresh key. That is my reading of "24 keys"; with exactly 24 keys ever, the 50-successes target cannot be met for both misuse proofs and withdrawals, since each key can be misused or withdrawn only once. 15 action types, including `prior`.
- **Invariants checked after every step,** in addition to v2.2's set:
  - a verdict only ever goes None → Upheld;
  - `flaggedAtBlock` never changes once set;
  - the rewards slashed for one device never exceed the stake it ever held (registration + deposits + dispute winnings, taken from events).
- **A check that is less frequent than stated:** keys that can no longer change (stake paid out or withdrawn, no open claim) are re-checked every 100 steps instead of every step, for speed.
- **Results:** **0 invariant violations in all 5 seeds.** Per seed: 168–177 keys used (about 150 slot rotations), 324–454 records, 88–117 claims opened, and an Active device in at least 4,621 of the 5,000 steps. Successes summed over all seeds (the target was at least 50 each, asserted by the test): attest 1917, claimCredit 559, commit 2342, forfeit 515, misuse 252, **prior 426**, register 866, reveal 1391, settle 518, settleStake 74, unbond 511, vote 521, **withdraw 309**, plus warp 1160 and mine 1404 time moves. ETH was conserved in every seed. Per-action success and revert counts, with the top revert reasons, are in the output file. The full run of all suites is 92 passing, 0 failing, 7 min: v2 15, v2.1 32, v2.2 17, v2.2 fuzz 3, v2.3 19, v2.3 fuzz 5 + 1 coverage check. One label in the frozen output is wrong: the v2.3 test 13 line "griefer loses 0.05 per rejected claim" was printed before I corrected the text, and the real loss is the 0.11 bond. Only the printed text is wrong.
- **Reproducibility.** The action sequence follows from the seed; keys and ECDSA nonces come from Node's CSPRNG.

### Spec (`spec/PROTOCOL.md`) vs implementation: where they disagree
1. **§4, message 4:** the spec says the prior-existence proof slashes the stake. The implementation escrows the reward like a misuse proof (your instruction; D16), and §5 "Priority" names only misuse proofs. The spec should extend that rule to prior existence.
2. **§4, "Slashing: later ones get their own bonds back, and nothing more":** in the implementation, a later upheld claim also receives half of the device's dispute bond through the oracle's split. That is more than "nothing more". Either the spec text or the auto-dispute bond accounting should change.
3. **§4, message 6** lists "record exists without verdict or open claim; unreserved stake ≥ bond" as reveal checks. The implementation:
   - **rejects with a refund** in those cases, rather than reverting, so that a hunter is not penalised for conditions it cannot control;
   - makes the D17 exception: a verdict from a later objective proof does not reject the reveal;
   - reverts only for a missing record.
4. **§4, message 8:** the spec does not mention `CLAIM_GRACE`; the implementation requires it (K).
5. **§3:** the verdict is called `Upheld` in the spec and `UpheldFake` in the contract (cosmetic).
6. **§5, prior existence:** the spec calls it sound under its assumptions. That is right, but the spec should state the two escapes (the ~256-block re-use window, and a cosmetic same-owner check) and the failure mode for devices that anchor after sharing.

## Paprika v2.4 (`contracts/PaprikaV2_4.sol`): assurance level 1
v2.4 is v2.3 plus keys endorsed by a bonded issuer.

- **N. Issuers.**
  - `registerIssuer()` takes at least 1 ETH. `topUpIssuer()` adds to the bond.
  - `requestIssuerExit()`, then `withdrawIssuerBond()` after `ISSUER_UNBONDING` = 30 days.
  - An issuer is active while it is not exiting and its bond is at least `ISSUER_BOUNTY` (0.1).
- **O. Endorsed registration.**
  - The signature is `register(x, y, pop, issuer, v, r, s)`. With `issuer = 0` it is the v2.3 level-0 registration.
  - Otherwise it needs an active issuer and an `ecrecover` signature over `keccak256("PAPRIKA/ENDORSE" ‖ chainId ‖ contract ‖ keyId)`. The digest is raw, with no EIP-191 prefix. Low-s and `v ∈ {27, 28}` are enforced.
  - The full `MIN_STAKE` is still required.
- **P. Bounty.** When a misuse proof against a level-1 key is the stake's beneficiary at payout, the challenger also gets a bounty from the issuer's bond. The constructor enforces `ISSUER_BOUNTY < (1 − α) × MIN_STAKE` (0.1 < 0.125). Upheld claims and prior-existence slashes do not charge the issuer.
- **Q. `verify(...).iss`** returns: level, issuer, the issuer's bond, `keysEndorsed`, `keysFlaggedForMisuse`, active, exiting.
- **Off-chain policy helper.** `policy(verifyResult, trustedIssuers, mode)` lives in `test/attacks-v2_4.js`. A level-1 key whose issuer is not in the verifier's list is treated as level 0.

### v2.4 design notes
- **D18. The bounty is `min(ISSUER_BOUNTY, issuer bond, burned part of this device's stake)`.** The cap is needed. The inequality αS + bounty < S does break, but not through lost dispute bonds: losing the dispute means the claim was upheld, and that already slashes the device. It breaks in two other ways:
  - **through withdrawal.** The owner withdraws the full stake after unbonding, then proves misuse of its own key: misuse proofs stay valid after withdrawal (D6). Without the cap that pays +0.1 per key from the issuer, and test 19(b) shows the cap makes it 0;
  - **through reserved bonds,** which shrink the free stake at payout.

  With the cap, self-revocation can at best break even on the free portion, and loses on every other path.
- **D19. Counters survive an exit.** An issuer may register again after a full withdrawal, but `keysEndorsed` and `keysFlaggedForMisuse` are kept, so a bad record cannot be laundered.
- **D20.** `withdrawIssuerBond` also requires that no misuse proof against one of its keys is still waiting for payout.
- **D21.** `keysFlaggedForMisuse` counts at **proof time**, as a public fact, even when an earlier-committed claim takes the stake and no bounty is paid.

### Results specific to v2.4 (from `output/2026-11-20-run-v2_4.txt`)
- **Endorsement checks (all rejected):** forged ("bad endorsement"); a non-issuer ("issuer inactive"); signed by another account; an endorsement of another key; one for another contract; a high-s twin ("bad endorsement"); an exiting issuer ("issuer inactive"). The same key still registers at level 0.
- **(a) A third party who extracted a level-1 key** gets 0.225 (0.125 stake share + 0.1 bounty), and the issuer's counter rises to 1.
- **(b) The owner self-revoking its own level-1 key loses every time:**

| Case | Owner + second account, net |
|---|---|
| plain | −0.0253 |
| after a 0.25 top-up | −0.150 |
| with free stake cut to 0.03 by two open self-claims | −0.127 (bounty capped) |
| after withdrawing the stake | −0.0004 (gas); bounty 0 |

  Without the cap the withdrawal case would be +0.1 per key.
- **(c) An issuer colluding with owners** loses −0.376 over 3 keys (wallets + bond), i.e. −(1 − α)S each. The bounty is its own money, and its public record shows 3/3 keys flagged.
- **(d) Draining an honest issuer with keys from its own devices** that really can be extracted costs the attacker −0.0253 per key in-protocol, plus the cost of each extraction. The issuer loses 0.1 per key, **4.0× the attacker's in-protocol cost**. This is the intended exposure, and the bond limits it: 1 ETH covers 10 extractions.
- **(e) Exhaustion.** Bounties paid were 0.1 ten times, then 0.05, then 0. The issuer becomes inactive and new endorsements are rejected. Stake shares are still paid, and existing level-1 records are unchanged; verify shows the issuer's bond as 0.
- **Prior existence and upheld claims** on level-1 keys leave the issuer's bond untouched.
- **Anyone can become an issuer for 1 ETH and endorse its own software keys: SUCCEEDS on-chain (the stated limit).** The policy helper returns `accept-L0` unless the verifier lists that issuer.
- **Issuer exit with a pending bounty:** withdrawal reverts "bounties pending" until the escrow pays (the challenger got 0.225). A key whose issuer has already withdrawn pays only the stake share (0.125).
- **Policy helper output:** see the `POLICY` lines in the run file, which cover level 0, level 1 with a trusted issuer, level 1 with an unknown issuer, and each flag reason under strict and time-scoped.

### New flaws found in v2.4 (important)
1. **An issuer that keeps copies of its keys can rob its own customers.** An issuer that generates keys outside the secure element and keeps copies (or leaks them) can prove misuse on any customer's device. It collects α × S = 0.125 per device; the bounty it pays is returned to itself, so its net is +0.125 per key. The customer loses its stake and its archive (KeyMisuse discredits everything).
   - This is the level-1 version of the stolen-key case (flaw 4).
   - The bond does not deter it. The only deterrent is the public `keysFlaggedForMisuse` counter and the verifier's choice to stop trusting that issuer.
   - This figure comes from arithmetic on test 19(c)'s mechanics; the victim case is not separately tested.
   - Possible mitigations, not implemented: pay no stake share when the challenger is the key's own issuer; or let level-1 owners opt to have misuse proofs pay only the bounty.
2. **Level-1 backing ends when the issuer exits.** After `withdrawIssuerBond`, the keys stay `level = 1` on-chain with a bond of 0, and a misuse proof pays no bounty. A verifier must read `iss.active` and `iss.bond`, not only `level`.
3. **Draining leverage.** If an issuer's hardware really is extractable, anyone can turn 0.025 ETH plus one extraction into 0.1 ETH of the issuer's loss. That is by design, but issuers must size their bond accordingly.

### Randomised stateful test v2.4 (`test/fuzz-v2_4.js`)
- **Setup.** Same scale as v2.3 (5 seeds × 5,000 steps, 10 accounts, 24 key slots), plus `issuerRegister`, `issuerTopUp`, `issuerExit` and `issuerWithdraw`. 45% of registrations are endorsed: mostly by an active issuer, sometimes by any account, sometimes signed by the wrong key.
- **Extra invariants:**
  - the balance includes issuer bonds;
  - per issuer, `bountiesPaid` equals the sum of `Bounty` events and never exceeds `deposited`;
  - the bond only decreases by exactly the bounty paid, or to 0 by that issuer's own withdrawal;
  - a device's level and issuer never change.
- **Results:** **0 invariant violations in all 5 seeds.** Per seed: 132–172 keys used and 89–113 claims. Successes summed over all seeds: issuerRegister 143, issuerTopUp 129, issuerExit 135, issuerWithdraw 104, register 754 (about 45% of them endorsed), misuse 228, prior 316, withdraw 276, settleStake 69, plus every other action above 400. Every action was above 50, as the test asserts. The full run of all suites is 121 passing, 0 failing, 15 min: 92 as in the v2.3 run, plus 23 v2.4 unit tests, 5 v2.4 fuzz seeds and 1 coverage check.

## Results: baseline (p01) vs v2 vs v2.1 vs v2.2 vs v2.3 vs v2.4
SUCCEEDS = the attack works. FAILS = blocked. PRICED = still possible, but it costs the attacker a stated amount. v2.1 is shown as AUTO off / on.

| # | Attack | Baseline | v2 | v2.1 (off / on) | v2.2 | v2.3 | v2.4 |
|---|---|---|---|---|---|---|---|
| 1 | Ban evasion | SUCCEEDS (free) | PRICED 0.1 stake | PRICED | PRICED (0.1 + 146k gas) | PRICED (0.25 + 146k gas) | as v2.3 |
| 2 | Synthetic content | SUCCEEDS | SUCCEEDS, punishable | same | same (forger −0.1, claimant +0.0495) | same (forger −0.25, claimant +0.1245) | as v2.3 |
| 3a | Copy attest calldata | SUCCEEDS | FAILS | FAILS | FAILS | FAILS | as v2.3 |
| 3b | Same hash, thief's device | n/a | SUCCEEDS (`firstKeyOf`) | FAILS (nothing to steal) | FAILS | FAILS | as v2.3 |
| 3c/d/e | Front-run register / misuse proof / copy commitment | squatting SUCCEEDS | FAILS | FAILS | FAILS (copied commitment unrevealable, bond burned) | FAILS | as v2.3 |
| 4 | Self-report / treasury drain | SUCCEEDS (+0.785) | FAILS | FAILS | FAILS (−0.2513 / 5) | FAILS (−0.626 / 5) | as v2.3 |
| 4 | Effective penalty with no claim pending | n/a | (1 − α)S | (1 − α)S | **(1 − α)S, residual by design** (−0.0503/key) | (1 − α)S residual (−0.1253/key) | as v2.3 |
| 4b | Double rewards | SUCCEEDS | FAILS | FAILS | FAILS; the earliest-committed upheld claim gets the stake share, later ones only the oracle split | FAILS (first by commit gets 0.14) | as v2.3 |
| 5 | False claim, unwatched | n/a | SUCCEEDS (owner −0.1) | SUCCEEDS / FAILS | FAILS (griefer −0.0505, owner +0.025, factor −0.50; needs an honest vote) | FAILS (griefer −0.1105, owner +0.055) | as v2.3 |
| 6 | Retroactive effect | SUCCEEDS | FAILS | FAILS | FAILS (100/100) | FAILS | as v2.3 |
| 7 | Replay / domain / anchors | partly | FAILS | FAILS | FAILS | FAILS + low-s + keyId binding + cross-domain | as v2.3 |
| 8 | Admin / drain | via oracle SUCCEEDS | FAILS | FAILS | FAILS | FAILS | as v2.3 |
| 9 | Squatting / unattested claim | SUCCEEDS | FAILS | FAILS | FAILS ("no record"; the commit is then forfeited) | FAILS | as v2.3 |
| 10 | Withdraw races | n/a | FAILS | FAILS | FAILS (incl. withdraw while a misuse reward is escrowed: "not retired") | FAILS (+ "claim grace") | as v2.3 |
| 10c | Unchallenged exit after the window | n/a | SUCCEEDS | BY DESIGN | BY DESIGN (stakeAtRisk 0.1 → 0, withdrawnAtBlock set; late claim refunded) | BY DESIGN (0.25 back after 30 days) | as v2.3 |
| 12 | Forger snipes an open claim | n/a | SUCCEEDS | FAILS | FAILS | FAILS (hunter 0.07) | as v2.3 |
| 12b | Forger front-runs the claim | n/a | — | SUCCEEDS | **FAILS** when the self-slash comes after the commit. Same block = the 12c residual | FAILS after the commit; same block = 12c | as v2.3 |
| 12c | Self-slash before any claim | n/a | — | (1 − α)S | (1 − α)S; less if a late claim reserves a bond | (1 − α)S | as v2.3 |
| 13 | Stolen honest key | n/a | SUCCEEDS | SUCCEEDS | SUCCEEDS (accepted; paid after the 50-block escrow) | SUCCEEDS (thief 0.125) | as v2.3 |
| 13 | Spam claims vs withdrawal | n/a | PRICED | PRICED | PRICED (up to stake/bond claims at once) | PRICED | as v2.3 |
| 14 | Slot squatting, one weak claim | n/a | n/a | — / SUCCEEDS | **FAILS** | FAILS | as v2.3 |
| 14 | Slot squatting, all slots + same-block exit | n/a | n/a | — / SUCCEEDS | **SUCCEEDS, priced:** 0.05 per vote period at k = 2, growing; the hunter is shut out for the whole window | **FAILS** (K): withdraw "claim grace"; delay only, 0.11 per vote period | as v2.3 |
| F | Fuzz, 3 × 2,500 steps | — | — | — | 0 invariant violations | 0 violations (5 × 5,000 steps) | 0 violations (5 × 5,000 steps, with issuers) |
| I | High-s twin, cross-key, cross-domain reuse | n/a | (high-s harmless) | same | same | **FAILS** (all rejected) | as v2.3 |
| J | Recycled photo (byte-identical, original older than the forger's anchor) | SUCCEEDS | SUCCEEDS | SUCCEEDS | SUCCEEDS (vote only) | **CAUGHT** objectively (0.125 to the prover) | as v2.3 |
| J | Recycled photo, original younger than ~256 blocks | SUCCEEDS | SUCCEEDS | SUCCEEDS | SUCCEEDS | **ESCAPES** the objective rule (vote only) | as v2.3 |
| J | Mempool attacker tries to slash honest A via prior existence | n/a | n/a | n/a | n/a | **FAILS** (all orderings tried) | as v2.3 |
| J | Honest device that anchors after sharing | n/a | n/a | n/a | n/a | **SUCCEEDS** (assumption violated) | as v2.3 |
| J | Accomplice's prior-existence proof pre-empts a commit | n/a | n/a | n/a | n/a | FAILS after fix D17 (SUCCEEDED in the first draft) | as v2.3 |
| L1 | Forged, foreign, replayed or exiting-issuer endorsement | n/a | n/a | n/a | n/a | n/a | **FAILS** |
| L1 | Third party extracts a level-1 key | n/a | n/a | n/a | n/a | n/a | PAID 0.225 (stake share + bounty) |
| L1 | Owner self-revokes a level-1 key (plain / top-up / reduced stake / after withdrawal) | n/a | n/a | n/a | n/a | n/a | **LOSES** (−0.025 / −0.150 / −0.127 / gas only; needs cap D18) |
| L1 | Issuer colluding with owners | n/a | n/a | n/a | n/a | n/a | POINTLESS (−0.125/key) |
| L1 | Drain an honest issuer whose keys are extractable | n/a | n/a | n/a | n/a | n/a | PRICED (issuer loses 4× attacker's in-protocol cost) |
| L1 | Self-made issuer endorses its own software keys | n/a | n/a | n/a | n/a | n/a | **SUCCEEDS on-chain**; policy treats it as level 0 unless trusted |
| L1 | Issuer that keeps key copies slashes its customers | n/a | n/a | n/a | n/a | n/a | **SUCCEEDS** (+0.125/key; new flaw 1) |

**Invariant.** It was checked after each of the 64 unit tests of v2–v2.2 and the 7,500 v2.2 fuzz steps, and for v2.3 after each of its 19 unit tests and its 25,000 fuzz steps. v2.3 uses the same formula as v2.2. For v2.2: `balance == Σ free stakes + Σ unpaid rewards + Σ unrevealed commit bonds`, `inbox == 0`, `oracle.balance == openBonds == 2 × Σ reserved`, and `Σ reserved == open claims × bond`. It held every time.

## Results: baseline (p01) vs v2 vs v2.1 (detail, from the v2.1 round)
SUCCEEDS = the attack works. FAILS = blocked. PRICED = still possible, but it costs the attacker a stated amount. Numbers come from `output/2026-11-20-run.txt` (v2) and `output/2026-11-20-run-v2_1.txt` (v2.1). Net amounts include gas. When the two v2.1 modes differ, both are given as off / on.

| # | Attack | Baseline (p01) | v2 | v2.1 (AUTO off / on) |
|---|---|---|---|---|
| 1 | Ban evasion, new key | SUCCEEDS (48.7k gas, free) | PRICED: 0.1 ETH stake + 127k gas | PRICED: same |
| 2 | Synthetic content (software key) | SUCCEEDS | SUCCEEDS, then punishable (forger −0.1 / −0.15) | SUCCEEDS, then punishable (forger −0.1; claimant +0.0497) |
| 3a | Copy pending attest calldata | SUCCEEDS (thief = origin) | FAILS (record stays with the honest key) | FAILS (unchanged) |
| 3b | Same hash, thief's device, same block | n/a | SUCCEEDS for `firstKeyOf` | **FAILS: nothing to steal.** Both records stand alone, identical windows, no priority field |
| 3c/d | Front-run register / misuse proof | squatting SUCCEEDS | FAILS | FAILS |
| 4 | Self-report loop / treasury drain | SUCCEEDS (+0.785, 1 ETH drained) | FAILS (−0.25 / 5 cycles) | FAILS (−0.2516 misuse, −0.2530 self-claim / 5 cycles; balance 1.0 → 1.0) |
| 4 | Effective penalty with no open claim | n/a | (1 − α)S | **RESIDUAL by design:** −0.0503 per key = (1 − 0.5) × 0.1 + gas |
| 4b | Double rewards | SUCCEEDS (5 × 0.05) | FAILS (paid once) | FAILS (0.05 / 0.025 once; "claim open", "device busy", "stake < bond") |
| 5a | False claim, watched | SUCCEEDS (one wrong vote) | FAILS (griefer −0.05) | FAILS: griefer −0.0503 both modes; owner +0.025 (off: had to watch and front a bond; on: did nothing). Griefing factor −0.50 (victim gains) |
| 5b | False claim, nobody watching | n/a | SUCCEEDS (owner −0.1, griefer +0.0496) | off: SUCCEEDS (owner −0.1, griefer +0.0496, factor ∞). **on: FAILS** (forced vote; griefer −0.0502, owner +0.025, factor −0.50). Needs an honest vote |
| 6 | Retroactive effect, 100 records | SUCCEEDS / fake stays valid | FAILS (100/100 kept, fake marked) | FAILS (same) |
| 7 | Replay, wrong domain, stale or future anchor | partly FAILS | FAILS | FAILS |
| 7 | Near-duplicate (1-byte edit) | SUCCEEDS | SUCCEEDS | SUCCEEDS (not re-tested; unchanged semantics) |
| 8 | Admin / treasury drain | via oracle SUCCEEDS | FAILS | FAILS (ETH accepted only from the oracle) |
| 9 | Key squatting, claim on an unattested photo | SUCCEEDS | FAILS | FAILS |
| 10 | Withdraw with open, last-minute or flagged claim | n/a | FAILS | FAILS |
| 10c | Attest, unbond, withdraw after 7 days unchallenged | n/a | SUCCEEDS (flaw 3) | **BY DESIGN** (optimistic finality): 0.1 back. `verify` shows stakeAtRisk 0.1 → 0 and withdrawnAtBlock 0 → N. Late claim: reward 0 / "stake < bond" |
| 11 | High-s twin | n/a | harmless | harmless |
| 12 | Forger snipes an open claim | n/a | SUCCEEDS (hunter 0) | **FAILS:** hunter reward 0.05 / 0.025 (+0.025 from the oracle), prover 0, forger loses the full stake. If the claim is rejected the prover gets 0.05 / 0.0625 |
| 12b | Forger front-runs `claimFake` in the mempool | n/a | (same as 12) | **SUCCEEDS** (new flaw 1): sybil +0.05; hunter claim upheld with 0 reward / reverts |
| 13 | Stolen honest key | n/a | SUCCEEDS (thief +0.05) | SUCCEEDS, accepted (level-0 custody) |
| 13 | Spam claims block withdrawal | n/a | PRICED (−0.05 per claim) | PRICED; on: one claim at a time ("device busy") |
| 14 | Claim-slot squatting by the forger | n/a | n/a | off: n/a. **on: SUCCEEDS** (new flaw 2): hunters "device busy" for the whole window, forger exits; cost ≈ 0.026 |

**Invariant.** After every one of the 47 tests: `paprika.balance == Σ stakes + Σ unclaimed rewards`, `inbox == 0`, and `oracle.balance == openBonds`. It held every time.

## What v2.4 still does not solve
- **Level 1 is only as good as the verifier's list of trusted issuers.** Anyone can be an issuer for 1 ETH. Nothing on-chain says which issuers are real manufacturers.
- **For untrusted issuers and level 0, everything in the v2.3 list below still holds.** Synthetic content from software keys is priced, not prevented: (1 − α)S = 0.125 per caught forgery, and only the lock-up if nobody challenges within 30 days.
- **A trusted issuer is a new trust root.** It can rob its customers if it keeps key copies (flaw 1). Its backing ends when it exits (flaw 2). Its hardware can be drained at 4:1 if it is extractable (flaw 3).
- **Level 1 proves only that the key was endorsed.** It does not prove the capture happened inside the hardware: that is level 2, not implemented. A genuine level-1 device pointed at a screen (the analog hole) still produces a valid record.
- **Size.** v2.4 is 354 lines and 17,001 bytes, under the 24,576-byte limit with about 7.5 KB to spare. Complexity keeps growing: issuer accounting adds a third party to the stake priority logic.

## What v2.3 still does not solve (superseded for level 1 by the v2.4 list above)
- **Synthetic content from a level-0 software key: this remains the core problem.** Forgery is priced, not prevented:
  - a forger that self-slashes before any commit loses `(1 − α) × S` = 0.125 ETH;
  - a forgery nobody challenges within 30 days costs only the lock-up + gas.

  At the spec's parameters this deters forgeries worth only a few tens of dollars (spec §8).
- **The objective prior-existence rule catches only byte-identical re-use of a file that was itself attested**, and only when the original is older than the forger's anchor. Re-use within ~256 blocks escapes. The rule wrongly slashes an honest device that anchors after the file was shared. The same-owner check is cosmetic.
- **The vote is still the trust root for everything else** (F-03, F-17). Every claim costs a multi-day DVM vote.
- **Squatting buys delay, at 0.11 ETH per vote period at the minimum stake.** Hunters must react within `CLAIM_GRACE` = 100 blocks of the last settlement.
- **A stolen level-0 key pays the thief** (accepted). Privacy (F-10), per-photo L1 cost (F-12), re-encoding (F-13) and the ERC-20 port are not addressed.
- **Complexity.** The contract grew to 263 lines and 13,273 bytes, against the baseline's 59 lines and 2,995 bytes. Each round fixed the previous round's flaws and introduced subtler ordering rules: D17 was found only by writing test 17f.

## What v2.2 still did not solve (superseded by the v2.3 list above)
- **Synthetic content from a software key.** This is unchanged, and it is the core problem. Forgery is priced, not prevented:
  - **a forger that self-slashes before any commit loses only (1 − α) × S**;
  - **a forgery nobody challenges within `UNBONDING_PERIOD` costs only the lock-up + gas.**
- **Slot squatting by filling every slot.** It is priced, at about 0.025 per slot per vote period, and lets a forger keep a record unchallengeable for the whole window and exit in the same block as the last vote settles.
- **The vote is the trust root.** Every claim goes to a multi-day DVM vote, and a wrong or bought vote flags an honest device (F-17). The question is still subjective (F-03).
- **A stolen level-0 key pays the thief** (accepted).
- **Not addressed at all.** Privacy (F-10), per-photo L1 cost (F-12), re-encoding (F-13), and the ERC-20 bond port.
- **Growth in size and complexity.** Each fix added state and ordering rules; the v2.2 stake priority rule (commit block vs proof block vs reveal sequence vs escrow window) is the subtlest part and the most likely place for a bug that the tests miss. Lines are non-empty, non-comment lines of Solidity; bytes are the deployed bytecode.

| Contract | Lines | Deployed bytes |
|---|---|---|
| PaprikaBaseline (p01) | 59 | 2,995 |
| PaprikaV2 | 157 | 8,704 |
| PaprikaV2_1 | 193 | 9,990 |
| PaprikaV2_2 | 238 | 12,031 |
| PaprikaV2_3 | 263 | 13,273 |
| PaprikaV2_4 | 354 | 17,001 (limit 24,576) |

## What v2.1 still did not solve (superseded by the v2.2 list above)
- **Synthetic content from a software key.** The forger's loss is capped at `(1 − α) × S` per key, because it can self-report first. It is 0 if nobody challenges within the window (optimistic finality, 10c). **A forgery nobody challenges within `UNBONDING_PERIOD` costs the forger only the lock-up of the stake + gas.** Against a high-value deepfake (F-09) that price does not deter.
- **Ban evasion is priced, not prevented.** There is no hardware uniqueness.
- **Claims can still be sniped through the mempool** (12b), and in auto mode the forger can squat the single claim slot (14). Both need protocol changes: claim commit-reveal; stake reserved per open claim; window extension.
- **Auto-dispute moves the trust from watchers to the vote.** Every claim is decided by the DVM (days, voter cost). A bought or wrong vote still flags an honest device (F-17). The adjudication question is still subjective (F-03).
- **A stolen level-0 key pays the thief** (accepted, see above).
- **Not addressed at all.** Privacy and linkability (F-10), one L1 tx per photo (F-12), re-encoding and near-duplicates (F-13), and the ERC-20 bond port.

## Gas (gasUsed, optimizer 200 runs)
| Operation | Baseline p01 | v2 | v2.1 AUTO off | v2.1 AUTO on |
|---|---|---|---|---|
| register | 48,749 | 127,018 | 127,154 | 127,154 |
| attest (relayed) | 70,961 | 86,026 | 63,776 (no `firstKeyOf`) | 63,776 |
| claimFake | 128,243 | 251,579 | 251,643 | 266,827 (+ auto-dispute) |
| settle upheld + flag + slash | 55,271 (resolve "yes") | 162,412 (undisputed) / 120,520 (disputed) | 143,509 (undisputed) | 136,378 (voted) |
| settle upheld with a pending misuse proof | — | — | 119,081 | 112,600 |
| settle rejected | 32,310 (resolve "no") | 65,323 | 104,173 | 95,176 |
| proveKeyMisuse (no claim / pending) | — | 99,220 | 100,554 / 89,753 | 100,554 / 89,765 |
| requestUnbond | — | 51,013 | 51,013 | 51,013 |
| withdraw | — | 35,213 | 38,280 | 38,280 |
| claimCredit | — | 28,557 | 28,557 | 28,557 |

The first transfer to the Store address in a test creates that account, which adds about 25k gas. This inflates "settle rejected" in v2.1.

### Gas, v2.2
| Operation | v2.2 |
|---|---|
| register | 145,849 (larger device struct) |
| attest | 63,742 |
| commitClaim | 67,915 |
| revealClaim (reserve + assertTruth + auto-dispute + bookkeeping) | 385,186 |
| A hunter's total claim cost (commit + reveal) | about 453k gas + 0.05 bond |
| settle upheld + flag + slash | 166,072 |
| settle rejected | 112,435 |
| proveKeyMisuse (flag, escrow) | 93,275 |
| settleStake (after the window) | 68,650 |
| forfeitCommit | 39,253 |
| requestUnbond / withdraw / claimCredit | 51,014 / 38,280 / 28,602 |

### Gas, v2.3 (spec parameters)
| Operation | v2.3 |
|---|---|
| register | 146,111 |
| attest | 63,980 |
| commitClaim / revealClaim | 67,915 / 385,219 |
| settle upheld + flag + slash | 236,547 |
| settle rejected | 131,327 |
| proveKeyMisuse (flag, escrow) | 93,739 |
| provePriorExistence (flag, verdict, escrow) | 92,573 |
| settleStake | 68,724 |
| forfeitCommit | 39,253 |
| requestUnbond / withdraw / claimCredit | 50,992 / 40,419 / 28,602 |

The first transfer to the Store address, or to a fresh account, adds about 25k gas. That inflates the settle numbers in some tests.

### Gas, v2.4
| Operation | v2.4 |
|---|---|
| registerIssuer | 89,523 |
| register, level 0 / level 1 (endorsed) | 146,861 / 181,756 |
| proveKeyMisuse | 116,459 |
| settleStake | 70,895 |
| requestIssuerExit / withdrawIssuerBond | 28,266 / 35,630 |
| attest / commit / reveal | 63,980 / 67,915 / 385,241 |
| settle upheld / settle rejected | 188,926 / 131,327 (they vary by up to ~50k between runs, depending on whether the recipient accounts already exist) |
| withdraw | 40,441 |

## Frozen (v2.3; v2.4 adds the issuer accounting as a fourth place): what a reviewer should attack first
1. **The stake priority and escrow logic in `PaprikaV2_3.sol`.** That is `_trySettle`, `bestP`, `misuseBlock` as "first objective proof", the D17 exception in `revealClaim`, and the `inbox` matching of oracle winnings. This is where ordering bugs live: D17 was one, and was caught only by a targeted test. The fuzz does not check *who* gets paid against an independent model, only conservation and the bounds.
2. **The prior-existence rule's assumptions.** "Anchor fetched before capture" cannot be checked by the contract and is easy for app developers to get wrong. The ~256-block escape and the cosmetic owner check are real limits. Reason about any ordering where a verdict set by an objective proof interacts with claims, slots and the claim grace.
3. **The oracle boundary.** The mock is not OOv3:
   - the bond is native ETH, not ERC-20;
   - `inbox` relies on the oracle paying before it calls back;
   - the callback must never revert, yet loops over open claims (bounded by stake/bond);
   - DVM timing, real burn percentages and minimum bonds are modelled, not tested.

   A port to real UMA must re-verify the callback ordering and gas under a fork.

---

## Final state: v2.5 and Core

### What changed in v2.5 (`contracts/PaprikaV2_5.sol`)
- **The prior-existence rule is withdrawn,** per spec v2.5: `provePriorExistence`, the `PriorExistence` reason, D16 and the D17 reveal exception are removed. The red team showed it cannot be fixed cheaply:
  - R-01: a relayer withholds an honest camera's attestation, records the file under its own key, and collects when the camera re-signs;
  - R-02: the proof names nobody, so anyone can copy it.
- **R-04 fixed.** The contract is now the oracle's asserter, so every oracle payout lands in the contract. On an upheld claim the claimant is **credited**, and collects with `claimCredit`. No settlement step transfers to an arbitrary address any more: only to the contract itself, or the burn address.
- **R-06 fixed.** `verify().stakeAtRisk` is now the **free** stake, which a new challenger can still win. A new field, `reservedForClaims`, holds what is locked at the oracle for open claims.
- **R-08 fixed** (it was cheap). `Flagged(keyId, reason, firstFlag, by)` is emitted for every later decision on a key, so the full history can be read from the logs. `flaggedAtBlock` stays the first flag.
- **Not fixed:**
  - **R-05.** Real UMA takes a whitelisted ERC-20 bond, and its minimum bond can change by governance. This is the reason the vote path is **"tested against a mock only"**: against an oracle with OOv3's non-payable bond interface every `revealClaim` reverts, and that is shown in the regression test.
  - **R-07.** Windows are still counted in blocks.
  - **R-03** no longer applies: the rule it escaped is gone.

### Red-team PoCs ported (test 17 in `test/attacks-v2_5.js`)
| PoC | v2.3 | v2.5 |
|---|---|---|
| R-01a, R-01b, R-02a, R-02b, R-03 | confirmed | **no longer apply**: no prior-existence function in the ABI |
| R-04 (a claimant that refuses ETH blocks settlement) | confirmed | **fails:** settlement succeeds; the refusing contract is credited 0.235 ETH and only its own `collect()` reverts |
| R-05 (real OOv3 bond interface) | confirmed | **still fails to integrate** (not fixed, by decision) |
| R-06 (stakeAtRisk overstated) | confirmed | **fixed:** stakeAtRisk 0.03 (free), reservedForClaims 0.22, reported separately |
| R-07 (block windows) | — | not fixed |
| R-08 (flag history) | — | **fixed:** 3 `Flagged` events for one key (ClaimUpheld first, then KeyMisuse, then ClaimUpheld) |

The reviewer's "what holds" checks (H-1 signature edge cases, H-2 anchors, H-3 oracle boundary, H-4) are covered by tests 7, 11, 16 and 17 and by the fuzz invariants. I did not port them line by line.

### PaprikaCore (`contracts/PaprikaCore.sol`): the smallest sound protocol
**What remains:**
- issuers: bond, endorsement, bounty with the D18 cap, exit;
- `register` at level 0 or level 1, with proof of possession and stake;
- `attest`: relayed, block-hash anchor, low-s, keyId in the message;
- `proveKeyMisuse`: objective and names the challenger. It **pays at once, to the caller**, in the same transaction, so no escrow and no priority rules are needed;
- `requestUnbond` and `withdraw`;
- `verify`.

**What is gone:** the oracle, commit-reveal, claims, dispute bonds, reveal and grace windows, escrow, `credit`/`claimCredit`, verdicts and `inbox`.

**Attacks against Core** (from `test/attacks-core.js`):

| Attack | Core |
|---|---|
| Ban evasion | PRICED (0.25 + 125k gas) |
| Synthetic content | SUCCEEDS. The **only** punishment left is a misuse proof, which needs someone who holds the key |
| Front-running attest / register / misuse proof | FAILS (the copied attest records the honest key) |
| Self-report loop / treasury | FAILS (−0.626 over 5 keys; no treasury) |
| Double reward | FAILS ("already misuse") |
| Griefing an honest device | **Mechanism gone:** nobody can flag a key they cannot sign with, and there are no claims |
| Retroactive effect | FAILS (100/100 records kept) |
| Replay / domain / anchors / malleability / key squatting / admin | FAILS |
| Misuse proof during unbonding | pays 0.125 at once; the owner cannot withdraw a flagged key |
| Exit after the window, then misuse proof | BY DESIGN: flags the key, pays 0 |
| Stolen honest key | SUCCEEDS (thief +0.125; accepted custody risk) |
| Level 1: forged or foreign endorsements | FAILS |
| Level 1: self-revocation | LOSES (−0.025; after withdrawal gas only, because the bounty is capped at the burned part) |
| Level 1: issuer exhaustion | as designed (0.1 × 9, then inactive) |
| Level 1: self-made issuer | SUCCEEDS on-chain (stated limit) |

**Attacks that disappear with the vote path:** everything about claims (4b claim order, 5 griefing by claims, 12 sniping, 14 slot squatting, 15 commit-reveal mechanics, R-04, R-05, R-06, R-07 except the anchor).

**Protections lost with the vote path:**
- **Nothing acts on a specific photo any more:** there are no per-record verdicts. A fake made with a key that never leaks is never punished.
- At level 0 the owner holds the key, so in practice **only the owner (or a thief) can ever slash a level-0 stake**. A level-0 record in Core carries essentially no guarantee, only a refundable deposit.
- Evidence a contract cannot check (an earlier publication, a known AI generator) has no channel.

**Balance invariant:** `balance == Σ stakes + Σ issuer bonds`, checked after every Core test and every fuzz step.

### Compact final table: baseline / v2.5 / Core
| Attack | Baseline (p01) | v2.5 | Core |
|---|---|---|---|
| Ban evasion | SUCCEEDS (free) | PRICED (0.25 stake) | PRICED (0.25 stake) |
| Synthetic content, software key | SUCCEEDS | SUCCEEDS; punishable by misuse proof or upheld vote | SUCCEEDS; punishable **only** by misuse proof |
| Front-running / provenance theft | SUCCEEDS | FAILS | FAILS |
| Self-report / treasury drain | SUCCEEDS (+0.785) | FAILS | FAILS |
| Double reward | SUCCEEDS | FAILS | FAILS |
| Griefing an honest device | SUCCEEDS | FAILS if the vote is honest (forced vote) | mechanism gone |
| Retroactive censorship | SUCCEEDS | FAILS | FAILS |
| Key squatting, replay, wrong domain | SUCCEEDS / partly | FAILS | FAILS |
| Recycled photo (prior existence) | SUCCEEDS | vote only (objective rule withdrawn) | **not addressed** |
| Stolen / extracted key | n/a | pays the finder (0.125, + 0.1 bounty at level 1) | same, paid at once |
| Self-made issuer | n/a | on-chain yes; verifier policy decides | same |
| Issuer that keeps key copies robs customers | n/a | SUCCEEDS (+0.125/key) | SUCCEEDS (+0.125/key) |
| Real UMA integration | n/a | **not working** (R-05; mock only) | not needed |

### Final gas (gasUsed, optimizer 200 runs, osaka)
| Function | v2.5 | Core |
|---|---|---|
| registerIssuer | 89,523 | 89,545 |
| topUpIssuer | — | 35,349 |
| requestIssuerExit / withdrawIssuerBond | 28,266 / 35,652 | 28,177 / 35,464 |
| register, level 0 / level 1 | 146,837 / 181,720 | 124,878 / 159,973 |
| attest (relayed) / with deposit | 63,980 / — | 63,653 / 70,152 |
| proveKeyMisuse | 117,329 (escrow, pays later) + settleStake 70,808 | 61,561 (level 0) / 121,657 (level 1 with bounty), paid at once |
| commitClaim / revealClaim | 67,915 / 385,208 | — |
| settle upheld / rejected (oracle + callback) | 240,939 / 131,333 | — |
| forfeitCommit / claimCredit | 39,342 / 28,602 | — |
| requestUnbond / withdraw | 51,047 / 40,463 | 50,922 / 38,158 |

### Final size
| Contract | Lines (non-empty, non-comment) | Deployed bytes |
|---|---|---|
| PaprikaBaseline (p01) | 59 | 2,995 |
| PaprikaV2 → V2_1 → V2_2 → V2_3 → V2_4 | 157 → 193 → 238 → 263 → 354 | 8,704 → 9,990 → 12,031 → 13,273 → 17,001 |
| **PaprikaV2_5** | 341 | 16,476 |
| **PaprikaCore** | **174** | **8,493** |

### Fuzz results (final run)
**Results.** All runs passed: part A 121 tests, part B 43 tests, 164 in total, 0 failing.

| Fuzz | Seeds × steps | Violations | Keys used per seed | Successes summed over all seeds |
|---|---|---|---|---|
| v2.5 | 5 × 5,000 | 0 | 134–156 | issuerRegister 122, issuerTopUp 114, issuerExit 121, issuerWithdraw 80, misuse 336, withdraw 265, settleStake 54, settle 524; every action above 50 |
| Core | 5 × 5,000 | 0 | 250–295 | attest 2204, register 1350, misuse 818, withdraw 538, unbond 1082, issuerRegister 233, issuerTopUp 256, issuerExit 218, issuerWithdraw 205 |

In both fuzzes ETH was conserved in every seed. The invariants are the same as in v2.4, plus Core's simpler balance formula (`balance == Σ stakes + Σ issuer bonds`).

### What v2.5 still does not solve
- **The vote path does not work with real UMA** (R-05: ERC-20 bonds, a governance-mutable minimum bond). It is tested against a mock only.
- **Synthetic content from a level-0 key is priced, not prevented:** (1 − α)S per caught forgery, 0 if nobody challenges within 30 days. **Recycled photos have no objective check any more.**
- **Remaining residuals:**
  - claims decided by a subjective vote (F-03, F-17);
  - slot-filling delay, at 0.11 per vote period;
  - stolen keys pay the thief;
  - an issuer that keeps key copies can rob its customers;
  - level-1 backing ends when the issuer exits;
  - block-denominated windows (R-07).
- **Complexity** stays high (341 lines). The stake priority and escrow logic is the least trusted part.

### What Core gives up and what it gains
- **Gives up:**
  - any judgement about a specific photo (no claims, no verdicts, no recycled-photo check);
  - any punishment of a forger whose key never leaks;
  - therefore, almost all meaning of level 0. A level-0 record in Core says "a staked, self-asserted key signed this hash in this block window", nothing more.
  - Core's value comes from **level 1 with an issuer the verifier trusts**: the claim becomes "a key a known manufacturer vouched for, not (yet) shown extractable, signed this hash in this window". The bounty makes disclosure of an extracted key rational.
- **Gains:**
  - no oracle, so no R-05, no ERC-20, no governance-mutable bond, no vote to bribe;
  - none of the ordering machinery where every bug of this project lived (D17, R-04, sniping, slot squatting, escrow priority);
  - payouts in the same transaction;
  - half the code and bytecode (174 lines, 8.5 KB vs 341 lines, 16.5 KB), and cheaper registration and misuse proofs;
  - the only chain assumptions left are the P-256 precompile and `blockhash`.

### Frozen: what a reviewer should attack first
1. **Core and v2.5: the level-1 trust model.** It covers how issuers generate and endorse keys (copies kept at the factory rob customers), the off-chain trusted-issuer list, the bounty cap, and keys that outlive their issuer's bond. Every remaining value of Core rests here.
2. **Core and v2.5: the chain assumptions.** The precompile at `0x100` must have EIP-7951 semantics (on other chains: RIP-7212 address, gas and behaviour), `blockhash` must keep its 256-block window, and the low-s rule must hold. Test on the actual demo chain, not only Hardhat `osaka`.
3. **v2.5 only: the stake priority and escrow logic and the oracle boundary.** That is `_trySettle`, `bestP`, the misuse escrow, `inbox` crediting with the contract as asserter, and the ETH mock against ERC-20 OOv3 (R-05). It is untested against real UMA and is the most likely place for a remaining bug.

