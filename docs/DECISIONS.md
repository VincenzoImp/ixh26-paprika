# Decisions

One record per structural choice: the question, the options, the evidence, the choice, and what
would make us change it. Evidence tags follow `AGENTS.md`; claim IDs refer to
`docs/research/claims-ledger.md`, experiment IDs to `experiments/`, finding IDs (`F-xx`) to
`docs/reviews/paprika-redteam.md`.

**Status: PROPOSED on 2026-11-20, awaiting the team's approval.** The starting point is the
original proposal (`proposal/PAPRIKA.md`), called "the baseline" below. Each record says what the
baseline does, why that fails, and what replaces it. The resulting protocol, "Paprika v2", is
specified in `spec/PROTOCOL.md`.

## Summary

| ID | Question | Baseline | Proposed choice | Main evidence |
|---|---|---|---|---|
| P-01 | What does a record claim? | "Attested as non-tampered" | A signed, time-bounded statement by a staked key, with assurance levels; level 0 is an economic guarantee, not proof of physical origin | F-01; p01 attack 2 |
| P-02 | How is a device admitted? | A bare public key, free | Key with proof of possession and a slashable stake; a key registers once, ever; optionally endorsed by a bonded issuer (level 1) | p01 attacks 1, 9; p03; p04 |
| P-03 | Who signs and who submits a record? | The account sends `SHA(photo)` | The device key signs (P-256); the contract verifies; anyone relays | p00; p01 attack 3; p03 |
| P-04 | Time bounds | Block of the transaction only | Recent block hash inside the signed message (not-before) plus the block of the record (not-after) | p03 |
| P-05 | Fees, treasury, rewards | Fee to a treasury; reward in ETH | No treasury; reward is a share of the slashed stake, the rest is burned; optional per-photo deposit into the stake | p01 attack 4; F-04 |
| P-06 | Who decides a ban, on what? | UMA answers "is photo A fake?" | An objective proof of key misuse decided by the contract; evidence-based claims with commit and reveal, always contested, decided by an optimistic oracle | C-P01…C-P03; p01 attacks 5, 10; p02; p03; p06 |
| P-07 | What does a ban do? | Unspecified | A prospective flag with its block and reason; records are never erased; the verifier applies a policy | p01 attacks 5, 6; F-06 |
| P-08 | Governance | Unspecified | Immutable contract, no owner, no administrator | F-14; p01 attack 8 |
| P-09 | Privacy | Not addressed | Linkable records, stated as a limit; private variant named as the path forward | F-10 |
| P-10 | Which chain? | "Ethereum account" | Local EVM chain with the P-256 precompile for the demo; public options compared in p05 | p00; p05 |
| P-11 | Stated limits | — | Re-photographed screens, exact-digest matching, post-quantum, cost per photo | — |
| P-12 | Prototype stack | — | Solidity with Hardhat and ethers, Node.js standard library, plain HTML | p00–p03 |

## P-01 — What a record claims, and "any device"

**Baseline.** The proposal presents an attestation as showing a photo is "non-tampered, for
example non-ai generated".

**Why it fails.** The contract sees a 32-byte hash. A registered key attests random bytes
labelled "AI image" and `verify` returns true (`[TEST]` p01 attack 2). Nothing ties the key to a
sensor (F-01).

**Options.** (a) Keep the claim and rely on bans to make it true after the fact. (b) Narrow the
claim to what the chain can prove, and add assurance levels: 0 = self-registered key with stake,
1 = key admitted by a bonded device maker, 2 = sensor-level signing. (c) Require hardware
attestation for every device.

**Choice: (b).** Level 0 keeps the proposal's defining property, that any device can join without
anyone's permission, and states its guarantee honestly: a known stake is at risk under public
conditions. Levels 1–2 are where a cryptographic link to hardware can exist; they need a device
maker, as every hardware root does. The reference contract implements levels 0 and 1 (revision
v2.4), with issuers simulated.

**Limits we state.** A level-0 record does not prove physical origin. This is the main gap
between this design and the brief's "cryptographic guarantees of physical origin" (slide 2).

**Would change if** the team decides the submission must give a hardware-rooted guarantee with
privacy: then this design merges with the sibling one (see `docs/COMPARISON.md`).

## P-02 — Admission of a device

**Baseline.** "An Ethereum account needs to register it, with its own public key. The
registration fails if the device is banned."

**Why it fails.** A banned party registers a fresh key for about 49k gas and no deposit
(`[TEST]` p01 attack 1). Anyone can register someone else's public key and get it banned
(`[TEST]` p01 attack 9).

**Options.** (a) Bare key. (b) Key, proof of possession bound to the registering account, and a
stake locked for an unbonding period. (c) Admission signed by bonded issuers. (d) A zero-knowledge
proof of a phone's hardware attestation chain at registration (seed: device-identity report, A3;
not buildable tonight).

**Choice: (b) for level 0 and (c) for level 1.** Proof of possession removes key squatting and
front-running of registration; the stake turns a flag from a nuisance into a loss. An issuer locks
a bond and signs an endorsement of the key; when a misuse proof against that key is paid, the
challenger also receives a bounty from the issuer's bond. Admission of issuers is open: no
committee decides who is a device maker, and a verifier brings its own list of trusted issuers.

**Why the owner's stake stays at level 1.** In the combined spike (p04) an owner could prove
misuse of its own device and collect the issuer's bounty. With the owner's stake in place and the
bounty capped at the burned part of that stake, self-revocation loses in every case tested
(`[TEST]` p03, v2.4: plain, after a top-up, with stake reserved by open claims, after withdrawal).

**Limits we state.** Evasion is priced, not prevented: a new identity costs a new stake. A stake
excludes people who cannot lock capital. Anyone can become an issuer for the bond and endorse its
own software keys; an issuer that keeps copies of the keys it endorses can prove misuse against
its own customers and collect their stake share; an issuer's backing ends when it exits
(`[TEST]` p03, v2.4). A trusted issuer is a trust root, as a manufacturer is in any design.

## P-03 — Who signs, who submits

**Baseline.** The device "sends SHA(Photo)"; the registered key is never used.

**Why it fails.** An observer copies a pending transaction and is recorded as the origin; the
honest transaction reverts (`[TEST]` p01 attack 3).

**Options.** (a) Account-signed transaction only. (b) Device key on secp256k1, checked with
`ecrecover`. (c) Device key on P-256, checked through the precompile at `0x100`; any account
relays the signed record.

**Evidence.** The local chain verifies P-256 signatures natively under the `osaka` hardfork
setting: valid accepted, tampered rejected, about 30k gas for the bare call including the
transaction base cost (`[TEST]` p00). P-256 is the curve of phone secure hardware and of the keys
in Apple's design (sibling repository, claim C-009).

**Choice: (c).** The record is bound to the key that signed it, so a copied transaction changes
nothing, and the device needs no funded account. Each `(photo digest, key)` pair has its own
record; a second device attesting the same digest gets a separate record with its own time bounds.

**Limits we state.** The precompile must exist on the target chain (p05).

## P-04 — Time bounds

**Baseline.** Only the block of the transaction: the photo existed before it.

**Choice.** The signed message includes `blockhash(anchorBlock)`; the contract rejects a zero
hash, so the anchor is one of the latest 256 blocks. The signature was therefore made after
`anchorBlock` and recorded at `recordedBlock`.

**Limits we state.** The bound is on the time of signing, not of capture: at level 0 nothing stops
signing an old file today. The window is at most 256 blocks. A block proposer can influence a
block hash slightly; it cannot know it far in advance.

## P-05 — Fees, treasury and rewards

**Baseline.** The device pays a fee to a treasury; a successful claimant "gets ETH as a reward".

**Why it fails.** One party controls a device and a claimant account, attests anything, accuses
itself and collects. With fee 0.001, oracle fee 0.01 and reward 0.05 ETH the attacker nets
+0.785 ETH from a 1 ETH treasury; the treasury drains whenever the reward exceeds the attestation
fee (`[TEST]` p01 attack 4). The same device can be rewarded for repeatedly (`[TEST]` p01
attack 4b).

**Options.** (a) Reward from the treasury. (b) Reward only from the slashed stake of the device
concerned, share `α < 1`, remainder burned; no treasury. (c) As (b), plus an optional per-photo
deposit added to the stake.

**Choice: (c).** A self-reporter recovers `αS` of a slashed `S`: a loss for every `α < 1`. With no
treasury there is nothing to drain and nobody to hold its key. Gas is the spam fee.

**Limits we state.** The reward that motivates honest challengers is capped by the stake, which is
also the barrier to entry: the two pull in opposite directions. Because an owner can slash itself
first, the effective penalty is `(1−α)S` (C-P20). With `S = 0.25` ETH and `α = 0.5` the stake
deters forgeries worth a few to a few tens of dollars (`[DERIVED]` C-P21, p06).

## P-06 — Who decides, and on what evidence

**Baseline.** "A user claims photo A of device B is fake"; UMA decides.

**Why it fails.**
- The question is the one the brief calls undecidable: generated images are "indistinguishable
  from genuine camera captures" (slide 2).
- UMA's own rule for this kind of assertion says to return 1 only "if the claim is true and
  publicly verifiable" and 0 "if the claim cannot be unambiguously resolved" (`[SOURCE]` C-P01).
  A contested "this photo is fake" claim should therefore fail.
- An uncontested assertion is accepted after the liveness period (`[SOURCE]` C-P02): an honest
  device is banned by default unless someone posts a bond to defend it.
- A contested claim takes two to three days to resolve by token-holder vote (`[SOURCE]` C-P03).
- In the baseline a claim is not even checked against a record: a device is banned over a photo
  it never attested (`[TEST]` p01 attack 10).

**Options.** (a) UMA with the original question. (b) Kleros jurors. (c) An m-of-n committee.
(d) Only proofs a contract can check. (e) (d) for what can be proven, plus an optimistic oracle
restricted to claims that rest on public evidence.

**Choice: (e)**, reached in five tested revisions (`spec/PROTOCOL.md` §11).
- *Proof of key misuse.* Anyone who presents a signature by the device key on the `EXTRACTED`
  domain, naming themselves, takes a share of the stake. No vote. It cannot be used against a key
  one does not hold (`[DERIVED]` C-P22, `[TEST]` p03). The idea of a deposit that whoever holds
  the key can take is not ours: C-P06, C-P07.
- *Proof of prior existence: tried and withdrawn.* The same digest recorded by another owner's
  key before this record's anchor block, checked from contract storage. An independent review
  broke it with a running exploit: a relayer records the honest camera's file under its own key,
  withholds the camera's record until the anchor expires, and collects when the camera signs
  again (`docs/reviews/paprika-v2_3-redteam.md`, R-01, R-02). Removed in v2.5.
- *Claim by vote.* Commit, reveal, contested automatically with the device's stake, decided by
  the oracle. Kept because the proposal's idea of open, rewarded challenge is worth keeping and
  some fakes leave public evidence a contract cannot read.

**What the revisions taught us** (`[TEST]` p03, `[DERIVED]` p06). Every fix to the vote-based path
opened a new gap, while the objective path held from the first version: with an optimistic default
an unwatched honest device lost to any false claim (griefing factor 226 in the model); contesting
every claim closed that and let an owner squat the claim slot; commit and reveal closed the
front-running of claims and left the pre-emptive self-slash; and the contract as tested would
not work against the real oracle, whose bonds are ERC-20 and whose minimum can change (R-05). This matches the literature: slashing
is well founded for objectively attributable faults and not for subjective ones (C-P08).

**Limits we state.** The vote-based path does not detect well-made synthetic images. It takes
two to three days per claim (`[SOURCE]` C-P03) and its security is the oracle's. The oracle we
model is not deployed on the XRPL EVM sidechain (`[TEST]` C-P15). The prototype runs an oracle
mock on a local chain: no real vote takes place; the real contracts were exercised on a local
fork (`[TEST]` C-P14).

**Would change if** the team prefers the smallest sound protocol: drop the vote-based path. The
protocol then needs no oracle, runs unchanged on XRPL EVM, and loses the only mechanism that acts
on evidence a contract cannot read.

## P-07 — What a ban does

**Baseline.** Unspecified. Under "the ban invalidates earlier attestations", one wrong verdict
makes 100 of 100 earlier honest records unverifiable; under "the ban blocks only new ones", the
photo judged fake still verifies (`[TEST]` p01 attacks 5 and 6).

**Choice.** A flag, with the block at which it was set and its reason (`KeyMisuse`,
`ClaimUpheld`). The contract keeps
returning every record with its time bounds; the disputed record carries its verdict. Verifiers
choose between a strict and a time-scoped policy (`spec/PROTOCOL.md` §6).

**Why.** Erasing records by vote would rebuild the third weakness in the brief, "retroactive
censorship" (slide 10), with a token vote in place of Apple's servers.

## P-08 — Governance

**Choice.** The contract has no owner, no administrator, no pause and no upgrade path; the oracle
address and all parameters are fixed at deployment.

**Limits we state.** A bug cannot be patched; moving to a new contract is a social process.

## P-09 — Privacy

**Baseline and choice.** Every record of a key is public and linked to the owner's account. We
state it as a limit. The Apple reference lists unlinkability among its requirements (sibling
repository, track notes), so on this property the design is behind the reference.

**Path forward.** Anonymous staked membership with rate-limiting nullifiers, or a zero-knowledge
proof of membership as in the sibling design (seed 02).

## P-10 — Chain

**Choice for the demo.** A local Ethereum EVM chain, as the team decided: Hardhat's in-process
chain with `hardfork: "osaka"`, which provides the P-256 precompile (`[TEST]` p00). No public
network is used.

**Public networks.** The precompile answers on all 12 networks probed, XRPL EVM mainnet and
testnet included; one attestation (about 64–86k gas) costs about 0.00006 USD on XRPL EVM and
about 0.23 USD on Ethereum at the prices sampled (`[TEST]` C-P15, p05). The `blockhash` window is
about 25 minutes on XRPL EVM and under a minute on Base. The objective paths need nothing else, so
they can run on the XRPL EVM testnet; the vote-based path cannot use UMA there.

**Limits we state.** A single-node development chain gives none of the guarantees of a public
one: the demo shows the mechanism.

## P-11 — Stated limits

- A genuine device pointed at a screen yields a genuine record.
- Exact-digest matching: a re-encoded or cropped copy is a different photo.
- ECDSA P-256 is not post-quantum.
- One transaction per photo.

## P-12 — Prototype stack

Solidity 0.8.28 with Hardhat 2.29 and ethers 6, Node.js 26 standard library for hashing and
P-256, a plain HTML page for the demo. Each was run on this machine in p00–p03.
