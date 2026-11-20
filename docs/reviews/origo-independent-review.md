# ORIGO: independent review (cryptography, protocol, feasibility)

- **Subject:** repository `/home/tux/crypto` as of 2026-11-20 21:23 CET (read-only; nothing was modified there).
- **Reviewer:** an independent sub-agent given the artefact and the brief, not the authors' opinion of it. Review window 21:23 to 21:45 CET.
- **Evidence tags:** `[CODE]` means read in the repository, with file and line. `[TEST]` means run by me now, with raw output in `origo-e05-reproduction-raw.txt` next to this file. `[ARG]` is a written argument. `[MEMORY]` is a fact about an external system that I did not verify now.
- **Severity scale:** Critical (invalidates a headline claim), High (a judge can use it to break a stated property), Medium (a real weakness to fix or state), Low (hygiene).

---

## 0. Summary

The circuit is small, correct as written, and does what its comment says. I found no
under-constrained witness, no missing domain separation between leaf, node and tag hashes, and no
public-input malleability (§1.3). Most of the risk is in what the design claims *around* the
circuit:

1. Unlinkability depends on device **public** keys staying secret. Public keys are not secret by
   construction, and the planned fallback (publishing a signature) would reveal the key through
   ECDSA key recovery (O-01).
2. Revocation is retroactive and deanonymising. A literal reading of the brief's "retroactive
   censorship" applies to ORIGO's own revocation (O-02).
3. Governance is a 2-of-3 registrar quorum on top of manufacturers that act as CAs. The SPOF
   sentence of slide 10 ("a compromised CA invalidates millions of devices") still describes
   ORIGO (O-03).
4. On-chain verification at about 4.1 M gas per photo is fine for a demo but cannot carry
   camera-scale volume (O-04).
5. The contract that has to enforce D-04 (time bound) and the de-duplication rule does not exist
   yet. Writing it naively leaves several concrete traps (O-06, O-07).

The e05 result **reproduces** on this machine: identical verification key, valid proof accepted
on-chain, both negative cases rejected (§5).

Starting at 22:30, the overnight plan does not fit as scheduled: it needs about 12 to 15 hours
of serial work and about 9.5 are available. A minimal honest version fits if UI scope is cut and
the work runs in parallel (§4).

---

## 1. The statement actually proven

### 1.1 Relation (from `experiments/e05-evm-onchain-verifier/circuit/src/main.nr`)

Public inputs (six BN254 field elements, `main.nr:58-64`): `m_hi, m_lo, root_hi, root_lo, tag_hi, tag_lo`.
Each 32-byte value `X` is encoded as `X = to_be_bytes16(X_hi) || to_be_bytes16(X_lo)` (`main.nr:15-25`).

Private inputs: `pk_x, pk_y ∈ {0..255}^32`, `signature ∈ {0..255}^64`, `path ∈ ({0..255}^32)^10`, `path_is_right ∈ {0,1}^10`.

The proof establishes (with H = SHA-256):

```
R_ORIGO = { (m, root, tag ; pk, σ, path, b) :
   m_hi, m_lo, root_hi, ... < 2^128                       (to_be_bytes::<16>, main.nr:17-18)
   ECDSA-P256.Verify(pk, e = m, σ) = 1, with σ = (r, s) in low-s form   (main.nr:74)
   MerkleRoot_10( H(0x00 || pk_x || pk_y), path, b ) = root,
        node = H(0x01 || left || right)                      (main.nr:77-81)
   tag = H(0x02 || pk_x || pk_y || m)                        (main.nr:84) }
```

Note that `m` enters ECDSA as the already-hashed value `e`. Off-circuit, `m = SHA-256(payload)`
and the device signs `payload` with ECDSA-SHA256 (`prove.mjs:30-52`). Binding `m` to an image
digest and a block hash therefore happens **only off-circuit**: the contract recomputes
`m = SHA-256(payload)` from the fields it is given. That contract does not exist yet, and in the
spike `payload` is a placeholder string (`prove.mjs:50`:
`'ORIGO spike | image digest | block number | block hash'`). So D-04 (time bound) is so far
**not implemented anywhere**. Only the mechanism it would rely on has been shown.

### 1.2 Check against DECISIONS

| Claim | What the circuit gives | Verdict |
|---|---|---|
| D-04 not-before via block hash | Nothing in-circuit. It depends on the contract recomputing `m` from `(digest, n, h, chain, …)` and checking `blockhash(n) == h`. | Sound in principle; unbuilt; traps listed in O-06 |
| D-06 revocation tag | `tag = H(0x02‖pk‖m)`: deterministic per (device, message), so the same device signing the same `m` always yields the same tag. Independent of σ, so ECDSA malleability cannot create a second tag. | Holds as a *revocation* mechanism. Privacy cost in O-01, O-02 |
| D-07 unlinkability | Tags are pseudorandom only to someone who does not know `pk`. The root is public. | Holds only against parties who know neither `pk` nor the batch's leaf list. The anonymity set is one batch (O-05) |

### 1.3 Things I checked that hold

- **Domain separation of the hashes.** Leaf and node preimages are 65 bytes with prefixes 0x00
  and 0x01. The tag preimage is 97 bytes with prefix 0x02. No cross-type collision is possible
  without a SHA-256 collision. `[CODE]`
- **Public-input encoding is canonical.** `to_be_bytes::<16>` rejects values of 2^128 or more:
  I ran a one-line Noir circuit; `x = 2^128+5` fails with "Failed assertion" and `x = 2^128-1`
  passes (`[TEST]`, scratch `tobytes/`). The generated verifier rejects public inputs ≥ p
  (`HonkVerifier.sol:570`, `require(uint256(publicInputs[i]) < P, …)`). So no (m_hi + 2^128)
  or (x + p) aliasing is possible. Whether the Noir range check is a circuit constraint rather
  than only a witness-time assertion is `[MEMORY]` (I believe it is constrained in Noir 1.0).
- **ECDSA low-s.** The circuit accepts only low-s (`e04/README`). σ is private and absent from
  the tag, so high-s/low-s malleability has no effect on the public statement.
- **Path direction bits** are `bool`, so they are constrained to 0 or 1. The depth is fixed.
  Padding leaves are random 32-byte strings (`prove.mjs:38`), so they have no known preimage.
- **The proof is not bound to a submitter**: there is no address and no nonce among the public
  inputs. Copying a proof seen in the mempool yields the identical record. Because the deck says
  records have "no owner", that copy is harmless *unless* the contract records `msg.sender`, pays
  a reward, or uses first-come de-duplication on the digest (O-07).
- **The Merkle root is not bound to a manufacturer in the circuit.** The binding root →
  manufacturer must live in the Registry contract (O-11).

---

## 2. Findings

### O-01 — High — Unlinkability rests on the secrecy of *public* keys, and the planned fallback would destroy it

`tag = H(0x02 ‖ pk ‖ m)` (`main.nr:84`) is a function of public values only. Anyone holding a
candidate set of public keys can link and identify photos: for each attestation, compute
`H(0x02‖pk_i‖m)` for every candidate and compare with the tag. That is 1,024 SHA-256 calls per
photo for a full batch.

Concrete attacks, all `[ARG]`:

- **Manufacturer.** It built the tree, so it holds every leaf. It can *identify*, not only link,
  every photo, because it maps pk → serial number → buyer. It can do this silently, off-chain, at
  any time, including retroactively. DECISIONS D-06 and the deck say "can link". The accurate word
  is "can identify".
- **ECDSA public-key recovery.** From any single (message, signature) pair one can recover
  `pk` up to about two candidates (SEC 1 §4.1.6, `Q = r⁻¹(sR − eG)`). DECISIONS D-07 "Fallback"
  (line 168) proposes to fall back to *publishing the device signature*. Each published signature
  reveals `pk`, and then **all past and future zero-knowledge photos of that device** become
  linkable to one another and identifiable. The same happens if the device signature ever leaves
  the device in the clear: C2PA metadata, a delegated or remote prover (the deck says "proving on
  a server"), logs, or a cloud backup.
- **Leaf lists cannot be published.** Publishing a batch's leaves deanonymises the whole batch.
  Yet publishing them is the only way an outsider could audit what a manufacturer enrolled
  (O-09). Privacy and auditability pull in opposite directions here.
- **Other uses of the same key.** If the key is also used for another protocol, such as an
  attestation certificate seen by a server, the holder of that certificate holds `pk`.

**Fix (cheap).** Drop fallback (d). Restate D-07 as "unlinkable to parties who never learn the
device public key; the manufacturer is an opening authority". Never send σ off-device; prove on
the device.

**Fix (better, about 1 to 1.5 h).** The device generates a secret `s` at enrolment. The leaf
becomes `H(0x00 ‖ pk ‖ H(s))` and the tag becomes `H(0x02 ‖ s ‖ m)`. The manufacturer then sees
only `H(s)` and can no longer open photos. The trade-off must be stated: tracing a forging device
then needs `s`, so revocation becomes prospective (see O-02). A leak of `s` costs only privacy,
not authenticity, because σ still requires the hardware key.

### O-02 — High — Revocation is retroactive, deanonymising, and is itself a form of "retroactive censorship"

D-06 and the deck: "Publish a compromised pk: everyone recomputes H(pk‖m) and flags its photos,
**past and future**". The demo plan: "Revoke (2 of 3): **photo turns red**."

- **Censorship.** Whoever controls revocation (the 2-of-3 quorum, fed with `pk` by the
  manufacturer) can mark every historic photo of a chosen device invalid at any time. That is the
  brief's third weakness ("historic photos become unverifiable … if central servers … alter
  public keys"), carried out by a quorum instead of a server. Chain history only records *when*
  it happened.
- **Deanonymisation.** Revocation publishes `pk`. All of that device's photos become publicly
  linked, and identifiable by anyone who can tie `pk` to a person. The victim of a key extraction
  (stolen phone, malware) is publicly deanonymised as a side effect. Example scenario: pressure
  on a manufacturer to "revoke" a journalist's device both invalidates and links that
  journalist's archive.
- **Tracing.** The tags are unlinkable, so no outsider can find which device produced a forgery.
  Only the manufacturer can, by brute-forcing tags against its leaves. The revocation pipeline
  therefore *requires* the manufacturer to act as an opener, which confirms O-01.

**Fix (30 to 45 min in the contract and UI).** Make revocation **time-scoped**. Each revocation
and root deactivation stores an effective block `B_rev`. A photo attested at block `a < B_rev`
keeps the status "valid when attested; device revoked at block B_rev (after this photo)". A
"compromised since" block may be set earlier only with an explicit, logged reason. Show amber,
not red. Optionally make prospective-only the default and reserve retroactive revocation for
proven extraction. This turns the weakness from "reintroduced" into "moved to a public,
time-stamped, contestable decision".

### O-03 — High — Governance: a 2-of-3 registrar quorum over manufacturer-CAs is a consortium, not decentralisation

(D-05, `docs/DECISIONS.md` §D-05.) `[ARG]`

- **Collusion (2 of 3).** Two registrars can admit a fake manufacturer, which then mints unlimited
  anonymous attestations. Because of the zero-knowledge layer these forgeries are
  indistinguishable from genuine ones. They are attributable only to the batch root, and only
  after the fact.
- **Loss of liveness.** If two of the three keys are lost, the registry freezes forever: no new
  manufacturer, no revocation, no deactivation. Nothing in D-05 covers registrar rotation,
  recovery or timelocks.
- **The literal SPOF sentence survives.** "A compromised CA invalidates millions of devices." In
  ORIGO the CA is each manufacturer's enrolment authority. If it is compromised, the only remedy
  is to deactivate its roots, which invalidates every device of that manufacturer. If
  deactivation is not time-scoped (O-02), it also invalidates all their past photos.
- **Who are the three?** D-05 itself says this is "a governance question we do not solve".
  Academic judges will ask that question first.

**Replacement options**, ordered by value/effort for tonight:

1. **Permissionless registry plus verifier-chosen curators (1 to 1.5 h).**
   - Any manufacturer can register itself and its roots in an append-only log, with no gatekeeper.
   - Any address can act as a *curator* and publish endorsements or revocations of manufacturers
     and roots, each time-scoped.
   - A verifier chooses which curators it follows, and the UI shows the verdict "according to
     curators X, Y".
   - The 2-of-3 multisig survives as one curator among several.
   - This matches how trust lists actually work (browser root programs, C2PA trust lists
     `[MEMORY]`). It removes the gatekeeper and the liveness SPOF. It is also honest, because
     trust is plural and explicit rather than hidden behind a quorum.
2. **Keep the m-of-n quorum but harden it.** Use a larger n. Put a timelock (for example 48 h,
   publicly visible) on admissions and revocations. Let the quorum rotate registrar keys. Add
   per-root effective blocks so that compromise from time T only affects roots after T.
3. **Stake and slash, or a DAO.** This is more "web3", but it is weak against well-funded
   attackers and too much to build tonight. Spec only.

### O-04 — High (for deployment claims) — Cost and throughput of per-photo on-chain verification

Measured: verifier deployment 3.86 M gas; `verify` about 4.08 M gas (`[TEST]` e05, reproduced).
The full attestation adds payload hashing, the registry look-up, an O(R) loop of SHA-256 over
revoked keys of the batch, and storage (about 20 to 50 k), so roughly 4.2 M gas.

- **Ethereum L1 `[MEMORY]`.** With a block gas limit of roughly 36 to 60 M, that is about 9 to
  14 attestations per block, so roughly 65 to 100 thousand per day for the whole world. At
  1 to 10 gwei and about $3,000/ETH, the cost is roughly $13 to $130 per photo. Global photo
  volume is billions per day `[MEMORY]`.
- **L2 or app-chain `[MEMORY]`.** About cents per photo, but throughput is still bounded, and
  about 9.5 kB of calldata per proof costs data-availability fees.

**Consequence.** The deck's line "the chain does the verifying" is true for the demo but is not a
deployment path for "any device". It needs either opt-in attestation (for example newsrooms), or
batching: recursive aggregation of N proofs into one on-chain verification, or an off-chain
verifier set that posts a Merkle root of verified attestations, with on-chain verification on
dispute. The deck mentions "cheaper batched attestations" under "Road ahead". Add one honest line
with the throughput number.

### O-05 — Medium — The anonymity set is one batch, and the public root reveals manufacturer and batch

`root` is a public input (`main.nr:61-62`), so every photo discloses its batch. A real batch is
one manufacturer, one model and one production run: at most 1,024 devices here, and in practice
often far fewer active ones. In the spike only 16 of the 1,024 leaves are real devices. Combined
with metadata (time window, location in the image, the uploader), 1,024 is a weak anonymity set.
Apple's design hides even the model from viewers, because only Apple's signature is visible.

**Fix.** Prove membership in a two-level tree, `leaf → batch root → registry root of all active
roots`, and publish only the registry root. Cost: one extra Merkle path of SHA-256 in the circuit,
plus a contract that maintains the root-of-roots, about 1 to 2 h. If this is not done tonight,
state it as a limit.

### O-06 — Medium — Block-hash not-before: implementation traps and semantic limits

The contract is not written yet. These need to be correct the first time.

- **Zero-hash trap.** `blockhash(n)` returns `0` for `n ≥ block.number` and for `n < block.number − 256`.
  A contract that only checks `blockhash(n) == h` accepts a payload that a device signed with
  `h = 0` and an arbitrary `n`. Concretely: sign weeks in advance with `h = 0` and
  `n = N_future`, then submit when `block.number == N_future`. `blockhash(N_future)` is still 0,
  so the record says "signed after block N_future", which is a **false not-before**.
  **Required:** `n < block.number && block.number − n ≤ 256 && h != 0 && blockhash(n) == h`.
- **256-block window `[MEMORY]`.** That is about 51 min at 12 s blocks, about 8.5 min at 2 s,
  and about 1 min at 0.25 s (Arbitrum-like). An offline device cannot attest later at all: its
  signature is welded to an expired hash, and re-signing loses the earlier bound.
  **Fix:** a `checkpoint()` function anyone can call, which stores `blockhash(block.number−1)` in
  a mapping, or EIP-2935 history storage (8,191 blocks `[MEMORY]`). Devices then sign a
  checkpointed hash.
- **Signing time, not capture time.** The bound is on when the signature was made, not when the
  light hit the sensor. On keystore-level devices the app chooses what is signed, so an old or
  AI-generated image can be signed later with a fresh hash. Only sensor-level signing that
  includes `h` in the sensor digest gives a capture bound, and that requires sensor support for
  an external nonce. Apple's sensor signs a digest that includes a timestamp (C-010), so some
  hardware supports this, but not "any device".
- **Local single-node chain.** The operator mines blocks and therefore knows block hashes before
  anyone else, so "unpredictable block hash" holds only on a chain with independent producers.
  The not-before claim is **vacuous in the demo**. Say so.
- **Cross-deployment replay.** The deck's `m` includes "chain". Also include the contract address
  and a protocol/version label. Otherwise a proof is valid on any deployment that uses the same
  root, and on forks for pre-fork block hashes.

### O-07 — Medium — "One record per image digest" enables squatting by any registered device

Deck slide 5, check 6: "digest not already recorded"; slide 3: "one record per image digest".

**Attack.**
1. Alice's attestation transaction sits in the public mempool, with the digest, payload and proof
   in calldata.
2. Mallory owns any genuine registered device, or an extracted key. She signs Alice's digest with
   a *newer* block hash and proves it in 0.8 s on a server, or 4.7 s on one core (§5).
3. She submits with a higher fee.

**Result.** Mallory's record wins. Alice's reverts as a duplicate. The record shows Mallory's
batch, which may belong to another manufacturer, and a later not-before. That is denial of
attestation plus degradation of the time claim. The same works without the mempool for any photo
published before it was attested.

**Fix (minutes).** Key records by `tag` (or by `m`), allow several attestations per digest, and
let verifiers show them all. The earliest not-after is the meaningful "existed before". Also do
not record `msg.sender` as an owner.

### O-08 — Medium — No domain separation in what the device signs

The device signs `payload` with plain ECDSA-SHA256, and the deck's formula is
`m = H(digest ‖ n ‖ h ‖ chain)`. There is no protocol label and no version. If the same hardware
key ever signs other SHA-256 messages, there is a cross-protocol confusion risk. Examples are a
generic "sign this hash" keystore API or passkey-style assertions (the latter is low risk because
of its structure). Also, without a fixed-length encoding, field boundaries can be ambiguous.

**Fix.** Use `payload = "ORIGO-v1" ‖ chainid ‖ contract ‖ digest ‖ n ‖ h` with fixed-width
fields (`abi.encodePacked` of fixed types) and a dedicated key per purpose. About 15 min.

### O-09 — Medium — The manufacturer can forge without being caught, and enrolment cannot be audited

The manufacturer can insert "phantom" leaves whose secret keys it holds. Their attestations are
valid, unlinkable, and indistinguishable from real devices. No outsider can detect phantom
leaves without the leaf list, and publishing the list breaks privacy (O-01). The guarantee
therefore reduces to: "some key that manufacturer X put into batch R signed this digest". D-01
admits "the manufacturer must be trusted to enrol only real devices". The deck slide 7 limit
"the hardware root of trust stays with manufacturers" should say explicitly "and a manufacturer
can mint undetectable forgeries".

**Partial mitigations (spec only).** Commit to the batch size. Allow per-device inclusion checks.
Attach hardware-vendor attestation of each key, proven in zero knowledge (heavy). Use rate
limits (O-13 idea).

### O-10 — Medium-High (for "authentic photo origin" in practice) — What is attested is "a registered key signed this exact file"

- **Keystore-level devices** (D-01 option b): the app, not the sensor, chooses the digest. On a
  rooted or virtual-camera phone, any pixels can be signed (D-01 says so). The statement gives
  *key* provenance, not *capture* provenance.
- **Exact file only.** No development and no edits (D-08), while the brief says "modern cameras
  already post-process every image" (slide 2, R-05). Worse in practice: the first re-encode by
  any messenger or social platform breaks verification. Most photos people actually see would
  therefore verify as "unknown".
- **A screen re-photographed** yields a genuine attestation (D-10).

These are stated limits, which is correct. They cap the "authentic photo origin" claim and should
appear in the first 30 seconds of Q&A preparation. Pointing to verifiable-transformation proofs
(C-028) as the road ahead is the right answer.

### O-11 — Low-Medium — Root registry semantics (to be enforced in the contract)

The circuit does not bind `root` to a manufacturer. The contract must:

- make roots **globally unique**, so that a deactivated root cannot be re-registered by another
  accredited manufacturer and "revived", and one manufacturer cannot claim another's root;
- make deactivation permanent;
- record for each root the manufacturer and the block at which it was registered, so that
  O-02-style scoping is possible.

### O-12 — Medium — Proving on a phone is unmeasured

Fresh measurements on this server (`[TEST]`, raw file, x86 server cores, not a phone):

| Setting | Proving time |
|---|---|
| 32 threads | 0.79 to 0.85 s |
| Pinned to 4 cores | 1.56 s |
| Pinned to 1 core | 4.72 s |

This makes laptop-class proving in a few seconds plausible. Memory was not measured. Mobile
Barretenberg exists `[MEMORY]`, but no phone figure may be claimed. If σ and `pk` are sent to a
proving server, O-01 applies in full.

### O-13 — Medium — Extracted keys give unlimited anonymous forgeries with no rate limit

Tags differ for every message, so a stolen key can attest any number of images. Nothing on-chain
can notice. Apple's central service can at least observe per-device behaviour (it maintains a
running per-sensor score, apple-reference §4). ORIGO deliberately cannot.

**Possible improvement (spec, "vision").** Use k-times anonymous authentication or a
rate-limiting nullifier: at most k attestations per epoch per device, with the nullifier
`H(s, epoch, j)` for `j < k`. Over-use then becomes detectable, and with secret-sharing nullifiers
the key is revealed (RLN-style `[MEMORY]`). This would answer a cryptographer's "what about key
extraction?" with an actual mechanism. It requires the device secret `s` from O-01.

### O-14 — Medium — Process and document consistency that judges will notice

- **D-12 is stale.** It still says "`xrpl` 5.3.0 for the ledger … No web framework, no Solidity"
  (DECISIONS line 187), which contradicts the D-02 revision.
- **D-05 and D-06 still use XRPL wording.** "credential deletion for manufacturers" (line 146);
  "native to the ledger and tested e03".
- **The `verify` demo mode is impossible as defined.** AGENTS.md line 75 says "from a clean
  clone … re-verifies stored attestations against transactions already on the ledger". On
  Hardhat's ephemeral in-process chain no transaction outlives the process. Either deploy to a
  public testnet, or redefine `verify` as a deterministic replay (fixed test keys → same
  addresses → re-run).
- **PLAN wording.** "Never cut: real ledger transactions", "fresh ledger hash" and "anchor
  transaction being validated" are XRPL-era wording. The PLAN's own interpretation of EVAL-01
  ("real transactions on testnet, not mocks") is weakened by a local chain.
- **Spike config.** `hardhat.config.js:7` sets `allowUnlimitedContractSize: true`. The verifier
  fits (17,623 B), but the final contracts must be tested with this flag off, or the "deploys on
  any EVM chain" claim is untested.

### O-15 — Low — Local single-node chain as "decentralised blockchain"

Acknowledged in D-02. In the demo every on-chain guarantee is simulated, including immutability,
censorship resistance and the unpredictability of the block hash. When the laptop closes, all
records vanish, which is literally weakness 3.

**Cheap upgrade.** As a stretch item after 05:00, deploy once to a public EVM testnet. The XRPL
EVM testnet fits the event (its precompiles answered, C-022) and has a faucet `[MEMORY]`; Sepolia
is an alternative. Then put 2 or 3 real transaction hashes in the README and the deck. That is
about 1 to 1.5 h including faucet risk. Skip it if the faucet fails.

### Things that hold (stated plainly)

- The zero-knowledge relation is correctly constrained for what it claims (§1.1 to §1.3).
- The proof is zero-knowledge for the EVM target: the generated contract is `BaseZKHonkVerifier`.
- Verification is public and deterministic. With the stored proof, the vk and the public inputs,
  anyone can re-verify off-chain without the deployer, so lock-in on the *verify* side is
  genuinely removed.
- Not-after via the attestation block is sound on a public chain.
- D-04's "a stale hash only weakens the bound" is correct, once the zero-hash trap (O-06) is
  closed.
- Most limits (manufacturer trust, edits, screens, not post-quantum, server proving) are already
  stated, which is to the team's credit. The gaps are O-01 and O-02 (privacy and revocation are
  overstated) and O-03 ("decentralised").

---

## 3. The three weaknesses of slide 10, read literally

| Weakness (slide 10 text) | ORIGO | Verdict |
|---|---|---|
| **SPOF:** "Apple maintains central revocation lists. A compromised CA invalidates millions of devices." | The revocation list is public on-chain and changed by 2 of 3 registrars. Each manufacturer is still a CA for its devices; if it is compromised, all its roots must be deactivated, which still means millions of devices for a big vendor (and their past photos too, unless time-scoped). If two of three registrar keys are lost, the registry freezes. | **Moved and reduced, not removed.** The blast radius shrinks from all of Apple to one manufacturer, or one batch with time-scoped roots. A single authority becomes a small quorum. |
| **Lock-in:** "Non-Apple devices cannot natively verify claims without relying on Apple servers." | Verification uses an open contract, open data and an open verifier; anyone with chain access (or the stored proof and vk) verifies. On the capture side, any P-256 device of an admitted manufacturer is covered. | **Removed for verification** (with the caveat that you need a node or RPC, and on a public chain any node will do). **Partly moved for capture:** admission depends on the registrars' discretion (O-03), and keystore-level devices depend on OS app-integrity services. |
| **Retroactive censorship:** "Historic photos become unverifiable if central servers shut down or alter public keys." | Records and roots sit in an append-only history, and nobody can alter a registered root. Revocation as specified, however, flips *past* photos to invalid and deanonymises them, on the decision of a quorum plus the manufacturer. Long-term verification needs a public chain with archive history. In the demo the chain disappears with the process. | **Removed against "servers shut down / keys altered"** on a public chain. **Reintroduced** through retroactive revocation and deactivation (O-02) unless status is time-scoped. **Present in the demo** (local chain). |

---

## 4. Feasibility by 08:00

Work starts at about 22:30 to 23:00, leaving about 9 to 9.5 h of wall time. The estimates below
are for one strong coding agent with humans in parallel. They include debugging but no polish.

| # | Item | Hours | Notes and risks |
|---|---|---|---|
| 1 | `Registry` contract: registrars m-of-n proposals, manufacturers, roots (unique, effective block), revoked keys with effective block | 1.0–1.5 | Simple; keep the multisig minimal (approve count) |
| 2 | `Attestations` contract: payload → `m` (sha256 precompile), blockhash checks (O-06), root active, hi/lo split, verifier call, revoked-tag loop, record keyed by tag, events | 1.0–1.5 | **Highest technical risk:** byte-exact agreement of `m` and hi/lo halves between Node, circuit and Solidity. Write one cross-check test first |
| 3 | Hardhat tests incl. negatives (bad proof, wrong root, inactive root, stale/zero/future hash, revoked device, duplicate tag, 1-of-3 change) | 1.0 | Never cut |
| 4 | Core library / CLI: device sim, batch builder, `nargo execute` + `bb prove` wrapper, deploy script, attest, revoke, verify by reading events | 2.0–2.5 | Mostly glue; prove.mjs and spike.js are 70% of it |
| 5 | Web UI: capture (or sample image), verify, tamper, revoke, registry view | 2.0–3.0 | Mock exists; camera capture and registry view are cuttable |
| 6 | `spec/PROTOCOL.md` (statement, roles, messages, assumptions, threat model, limits) | 1.0–1.5 | Humans can draft it from DECISIONS plus this review in parallel |
| 7 | Second review plus fixes | 0.5–1.0 | |
| 8 | Deck update, script, demo script, recorded fallback (screen capture), defence sheet, briefing | 2.0–2.5 | Humans, in parallel from 01:00 |
| 9 | Final pass: clean-clone run, claim audit, AI disclosure, push | 0.75–1.0 | |
| | **Total serial** | **about 11.5–15.5 h** | |

**Verdict.** PLAN.md's schedule assumed a start at 18:30, with contracts finished by 20:30. From
22:30 it is **not achievable as written**: about 4 hours late, against roughly 2 hours of buffer.
It becomes achievable if two conditions hold:

- **Parallel work.** The agent does items 1 to 4. Humans or a second agent do 6 and 8 from the
  start. UI work starts only once the CLI flow is green, with a gate at about 03:00.
- **Cuts.** Apply these early, in this order:
  - live camera (use bundled sample images);
  - the registry screen;
  - the UI itself, if needed: a terminal demo with coloured checks plus a recorded video is
    acceptable;
  - a public testnet deploy is a stretch goal only.

The critical path is items 1 to 4: about 5 to 6.5 h, which brings the team to about 04:00 to
05:00.

**Top risks.**
1. Encoding mismatch for `m` and the hi/lo halves between Node, Noir and Solidity. Mitigate with
   a single test vector checked in all three, written first.
2. Hardhat `blockhash` semantics. Automine makes one block per transaction, and the current
   block's hash is 0.
3. UI scope creep.
4. Presenters unable to defend O-01 and O-02, which are where cryptographers will push.
5. Recording the fallback video late.

**Minimal honest and impressive version.** Contracts with the O-06, O-07 and O-11 checks, and
time-scoped revocation. Full negative test suite green. A CLI or one-page flow: capture a sample →
prove → attest → verify → tamper (rejected) → revoke with 2 of 3, where the old photo shows
"valid when attested, revoked later" → second photo unlinkable. A 2-page spec with the exact
relation (§1.1), the assumptions, and the privacy statement corrected per O-01. A 7-slide deck
with the throughput number and the corrected limits. A recorded run.

---

## 5. Reproduction of e05 (`[TEST]`, raw output in `origo-e05-reproduction-raw.txt`)

Copied e05 (with `node_modules`) to `/home/tux/crypto2/scratch/e05`, then ran `node prove.mjs`,
`npx hardhat compile` and `npx hardhat run spike.js` (2026-11-20 21:25 CET). This produced fresh
random device keys and a new proof.

| Quantity | Saved (16:27 UTC) | Re-run (20:25 UTC) |
|---|---|---|
| Proving (×3) | 793, 918, 788 ms | 794, 846, 786 ms |
| Proof / public inputs / vk | 9,536 / 192 / 1,888 B | identical; **vk byte-identical** (`cmp`) |
| Verifier runtime / deploy gas | 17,623 B / 3,862,422 | identical |
| `verify` valid | true, 4,083,799 gas | true, 4,083,750 gas |
| Tampered public input / corrupted proof | reverted / reverted | reverted / reverted |

Extra measurements: proving with `taskset` pinned to 1 core took 4,723 ms (twice); pinned to
4 cores, 1,560 and 1,564 ms. The single-core proof verifies natively. Additionally, a one-line
Noir test shows that `to_be_bytes::<16>` rejects 2^128+5 (scratch `tobytes/`).

**Conclusion.** The e05 claims reproduce on this machine.

---

## 6. Improvements (best value/effort first)

1. **Time-scoped revocation and root deactivation** (O-02, O-03, weakness 3). About 45 min.
   Store an effective block. Past attestations keep "valid when attested". The UI shows amber
   "revoked after", not red. This converts "reintroduced censorship" into a public, dated,
   contestable act.
2. **Contract hygiene for time and identity** (O-06, O-07, O-08, O-11). About 45 min.
   - `n < block.number`, at most 256 blocks back, `h ≠ 0`, `blockhash(n) == h`;
   - payload `"ORIGO-v1" ‖ chainid ‖ contract ‖ digest ‖ n ‖ h` at fixed width;
   - records keyed by tag, several per digest allowed;
   - globally unique, permanently deactivatable roots.
3. **Governance: permissionless registry plus verifier-chosen curators** (O-03, the word
   "decentralised"). About 1 to 1.5 h. The 2-of-3 multisig becomes one curator. Each verdict is
   "according to curators X, Y". Without code, put at least a timelock and registrar rotation in
   the spec.
4. **Correct the privacy claims** (O-01, O-05, O-09). About 20 min of docs:
   - drop fallback (d);
   - "unlinkable to anyone who does not know the device public key; the manufacturer can
     identify";
   - "anonymity set = one batch";
   - "a manufacturer can mint undetectable forgeries".

   If time allows, implement the device-secret tag `H(0x02‖s‖m)` with leaf `H(pk‖H(s))`, about
   1 to 1.5 h including regenerating the verifier.
5. **One honest scalability line plus one real public-testnet transaction** (O-04, O-15). About
   10 min for the slide line: about 10 attestations per L1 block, and the path is
   aggregation/recursion. About 1 h, stretch only, for an XRPL EVM testnet or Sepolia deploy with
   transaction hashes in the README.

Spec-only "vision" items for Q&A: two-level root-of-roots membership (O-05); rate-limiting
nullifiers for extracted keys (O-13); a checkpoint contract for offline devices (O-06); proofs of
development and edits (C-028).
