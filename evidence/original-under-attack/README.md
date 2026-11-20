# The first version, put to the test

**In short.** Here the original proposal was written as a contract, *exactly* as it was
described, and then attacked with 24 tests. It shows what was wrong: it is the proof behind
every line of [`docs/2-what-changed.md`](../../docs/2-what-changed.md).

Main results: the ban is avoided for free with a new key; any file can be attested; a pending
attestation can be stolen; someone who accuses themselves drains the treasury; a device is
banned for a photo that was never attested.

To run it again: `npm install && npx hardhat test`. The rest of this file is the original English text.

---

# p01: Paprika baseline, attack tests

## Purpose
Evidence for a design review. `contracts/PaprikaBaseline.sol` implements `/home/tux/crypto2/proposal/PAPRIKA.md` as literally as possible, and `test/attacks.js` tries a list of attacks against it on a local in-process Hardhat chain. `contracts/MockOracle.sol` stands in for UMA: a claim is filed with a fee, and the test plays the token-holder vote by resolving it true or false. This is not a product and not a redesign.

## How to run
```
npm install && npx hardhat test
```
Tested with Node 26.4, npm 12, hardhat 2.29.x, ethers 6, solc 0.8.28 (Hardhat downloads it). Raw output of the final run: `output/2026-11-20-run.txt`. npm blocked the native `keccak` install script; the pure-JS fallback is used, and it has no effect on results.

Default parameters: attestation fee 0.001 ETH, oracle fee 0.01 ETH, reward 0.05 ETH, treasury seeded with 10 ETH, which stands in for fees already collected. Attack 4 sweeps the parameters and seeds 1 ETH. Every test runs under both ban readings (`banInvalidatesPast` = false / true, a constructor flag).

## Spec gaps and the reading chosen
| # | Gap in the text | Reading chosen |
|---|---|---|
| G1 | What identifies a "device" | `deviceId = keccak256(pubKey)`. The registering account is stored as owner. |
| G2 | Must the registrant prove it holds the key? | No. The text asks for no proof of possession or manufacturer certificate, so any bytes are accepted as a key. |
| G3 | Re-registering an already registered key | Reverts ("already registered"). The first registrant owns the key. |
| G4 | Who sends or signs the attestation | The owner account sends `attest(deviceId, hash)`. The device key signs nothing, because the text never mentions a signature. |
| G5 | One hash attested once, or by several devices | Once. The first writer wins and later attempts revert. (An overwrite reading would let anyone take over the origin later. That reading is not tested.) |
| G6 | Does a ban invalidate earlier attestations? | Both readings are tested. `ban-blocks-future-only`: `verify` ignores bans. `ban-invalidates-past`: `verify` returns false for every hash of a banned device. |
| G7 | Fee amount, whether registration costs anything | Fixed attestation fee. Registration is free, since the text puts a fee only on attestation. |
| G8 | Where the reward comes from and how large it is | A fixed `reward`, paid from the treasury (this contract's balance) and capped at the balance. The ban still applies when the treasury is empty. |
| G9 | Checks on a claim | None on-chain. Anyone can claim against any (photo, device) pair, including unattested photos and devices that are already banned. The oracle alone decides. |
| G10 | Who can withdraw the treasury | Nobody. The text defines no withdrawal, so the only outflow is rewards. The oracle fee goes to the oracle, not the treasury. |
| G11 | Is the account behind a banned device blocked? | No. Only the key is banned (the text says "the device is banned"). |
| G12 | Appeal, unban, time limits | None (not in the text). |

## Results
SUCCEEDS = the attack works against the baseline. Numbers are from `output/2026-11-20-run.txt`.

| # | Attack | Reading | Result | Numbers |
|---|---|---|---|---|
| 0 | Positive path | both | works | A false claim does nothing; a true claim bans the device and pays the reward. The banned photo still verifies only under future-only. |
| 1 | Ban evasion (new key, same or new account) | both | SUCCEEDS | New registration costs 48.7k gas and no ETH fee. The owning account is not blocked. |
| 2 | Synthetic content (random bytes labelled "AI image") | both | SUCCEEDS | `verify` = true. The contract only ever sees 32 bytes. |
| 3 | Front-running (copy pending hash, higher gas price) | both | SUCCEEDS | The thief's device is recorded as origin and the honest tx reverts. Cost: 0.001 ETH + gas. |
| 4 | Self-report loop: (attest, oracle, reward) = (0.001, 0.01, 0.05) | both | SUCCEEDS | 1 ETH treasury drained in 21 cycles. Attacker net +0.785 ETH. |
| 4 | (0.001, 0.05, 0.05) | both | profit FAILS, drain SUCCEEDS | Attacker net -0.055 ETH. Treasury still drained. |
| 4 | (0.01, 0.1, 0.05) | both | profit FAILS, drain SUCCEEDS | Attacker net -1.51 ETH. Treasury still drained. |
| 4 | (0.03, 0.001, 0.05) | both | SUCCEEDS | Drained in 50 cycles. Attacker net +0.938 ETH. |
| 4b | Double-dip (5 "yes" claims, same device and photo) | both | SUCCEEDS | 5 rewards paid (0.25 ETH). |
| 5 | Griefing an honest device (5 rejected claims, then 1 wrong "yes") | future-only | SUCCEEDS (ban) | Griefer spends ~0.0507 ETH on the 5 rejected claims and ends at -0.011 ETH net after the paid one. 0/30 past attestations invalidated; all future attestations blocked. |
| 5 | same | invalidates-past | SUCCEEDS | 30/30 past attestations invalidated. |
| 6 | Retroactive effect on 100 earlier honest photos | future-only | FAILS | 100/100 still verify, but so does the judged-fake photo itself. The ban has no effect on past fakes. |
| 6 | same | invalidates-past | SUCCEEDS | 0/100 still verify. |
| 7 | Same hash twice (same device / other device) | both | FAILS | Reverts "already attested". |
| 7 | Unregistered key, or someone else's deviceId | both | FAILS | Reverts "unregistered" / "not device owner". |
| 7 | Near-duplicate (1-byte edit) | both | SUCCEEDS | Gets a new, valid attestation. |
| 8 | Direct treasury withdrawal | both | FAILS | No such function exists, and fees are locked. |
| 8 | Treasury moved through the oracle | both | SUCCEEDS | Whoever controls resolution releases the treasury in reward-sized steps. |
| 9 | Key squatting (register an honest device's public key first) | both | SUCCEEDS | The honest owner gets "already registered". After a self-claim the key is banned permanently. |
| 10 | Claim against a photo the device never attested | both | SUCCEEDS | Device banned. There is no on-chain link check. |

Self-report formula, ignoring gas, per cycle with a fresh key each time: attacker profit = `reward - attestFee - oracleFee`, and treasury change = `attestFee - reward`. The treasury drains whenever `reward > attestFee`, whether or not the attacker profits. The attacker profits when `reward > attestFee + oracleFee + ~254k gas`. Nothing in the proposal prevents this: the oracle answers truthfully ("yes, it is fake"), so this is not an oracle failure. With real UMA a correct assertion gets its bond back, which pushes the effective oracle fee toward zero and widens the profitable region. This is an inference; it was not tested here.

### Gas (gasUsed, optimizer 200 runs)
| Operation | future-only | invalidates-past |
|---|---|---|
| register | 48,749 | 48,737 |
| attest | 70,961 | 70,985 |
| claimFake (includes oracle request) | 128,243 | 128,267 |
| resolve "no" | 32,310 | 32,310 |
| resolve "yes" + ban + reward | 55,271 | 55,271 |

## What the baseline needs to resist these (one line each, no redesign)
1. Ban evasion: device identity that is costly to obtain again (registration must cost something or be bound to hardware), and the ban must cover the controlling party, not just the key.
2. Synthetic content: some evidence of capture beyond a bare hash. A hash says nothing about where the bytes came from.
3. Front-running: an attestation bound to the device (a device signature over the hash, or commit-reveal) so that copying the calldata gains nothing.
4. Self-report loop: a reward that cannot exceed what the claimed device itself put at stake, plus claimant/device independence or a bonded registration.
4b. Double-dip: at most one reward per device (or per photo); reject claims against banned devices.
5. Griefing: a stake or defence path for the accused device, and a claimant bond large enough relative to the harm.
6. Retroactive effect: a defined scope for a ban (which attestations it affects). Neither literal reading is acceptable: one censors 100 honest photos, the other leaves the judged fake valid.
7. Near-duplicates: an explicit statement of what "the same photo" means. Exact-hash matching cannot catch edits.
8. Treasury: an explicit rule for treasury outflows and who governs them. Today the oracle's voters control it implicitly.
9. Key squatting: proof of possession of the device key at registration.
10. Unlinked claims: a check that the claimed photo was attested by the claimed device.
