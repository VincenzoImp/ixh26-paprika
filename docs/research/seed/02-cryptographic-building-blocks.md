# Seed 02 — Cryptographic building blocks for Paprika v2

**Scout report, 2026-11-20, 21:37–22:10 CET.** Scope: which primitives would make the
stake-and-challenge photo attestation in [`../../../spec/PROTOCOL.md`](../../../spec/PROTOCOL.md)
cryptographically interesting and sound, beyond "a hash and a signature". Audience: the team,
before facing academic cryptographers (IXH26 Track 1, criterion "CRYPTO VISION").

## How to read the tags

- `[SOURCE]` — page opened today (2026-11-20) by the main session or a sub-agent; URL plus a short
  verbatim quote. `[SOURCE](abstract)` — only the abstract/landing page was read; numbers are
  as the abstract states them. `[SOURCE](metadata)` — only bibliographic metadata (Crossref, dblp).
- `[SECONDARY]` — search-engine summary, third-party page, or a sub-agent's reading of a PDF that
  the main session did not reopen.
- `[MEMORY]` — unverified recollection; listed separately at the end and not used for claims.
- `[ANALYSIS]` — our own reasoning; no citation behind it. `[TESTED]` — run tonight in
  `experiments/p07-equivocation-extraction/`.
- Three sub-agents did parallel look-ups (sections 2, 3, 4–6, 8). The main session reopened a
  sample of their claims (EIP-7951 gas/bounds/malleability text; Base benchmark numbers;
  Fujisaki–Suzuki; ePrint 2026/1717 timings; zk-img abstract) and all were confirmed, except
  that the zk-img timing numbers are not on the arXiv abstract page (the sub-agent read them in
  the PDF: kept as `[SECONDARY]`). Everything in section 1 was opened by the main session.
- ePrint PDFs return HTTP 403 to scripted downloads here; ePrint numbers come from abstracts.

---

## 1. Self-enforcing key custody: "if the key leaks or is misused, anyone can take the money"

### 1.1 References

**1a. Kiayias, A., Tang, Q. "How to Keep a Secret: Leakage Deterring Public-key Cryptography."
ACM CCS 2013, pp. 943–954. DOI 10.1145/2508859.2516691. ePrint 2013/845.**
`[SOURCE]` https://eprint.iacr.org/2013/845 — "We introduce leakage-deterring public-key
cryptographic primitives to address this problem." (Proceedings title, per CCS 2013 / Edinburgh
listing: "How to keep a secret: leakage deterring public-key cryptosystems"; the ePrint title ends
in "Cryptography". Cite the proceedings title with the DOI.)
*Establishes:* a key owner embeds private, valuable data into the public key such that anyone given
any (even partially working) implementation of the secret-key functionality can recover that data;
sharing or leaking the key therefore costs the owner. Formalised for encryption, signatures and
identification.
*Paprika use:* this is exactly the shape of Paprika's `EXTRACTED` bounty, with the "embedded secret"
replaced by an on-chain stake: whoever holds the signing capability can take `αS`. Paprika's
version is simpler and weaker in one respect (the deterrent is economic and only reaches holders
who can sign the specific `EXTRACTED` message, i.e. full signing capability), stronger in another
(no trusted setup; the payout is automatic). Cite as closest conceptual prior art.

**1b. Kiayias, A., Tang, Q. "Traitor Deterring Schemes: Using Bitcoin as Collateral for Digital
Content." ACM CCS 2015, pp. 231–242. DOI 10.1145/2810103.2813698.**
`[SOURCE]` https://www.research.ed.ac.uk/en/publications/traitor-deterring-schemes-using-bitcoin-as-collateral-for-digital/
— "We put forth a new cryptographic primitive called a Traitor Deterring Scheme (TDS)." and "The
distinguishing feature of a TDS is that secret-keys are issued only after the users provide some
private information".
*Establishes:* multi-user generalisation of 1a; explicitly proposes a cryptocurrency deposit as the
collateral that a leaked key unlocks.
*Paprika use:* the "stake as collateral that the leaked key releases" idea is **theirs (2015)**.
Paprika must not claim it as new; it can claim an instantiation with standard P-256 device keys,
an on-chain precompile and no issuer.

**1c. Ruffing, T., Kate, A., Schröder, D. "Liar, Liar, Coins on Fire! Penalizing Equivocation By
Loss of Bitcoins." ACM CCS 2015, pp. 219–230. DOI 10.1145/2810103.2813686.**
`[SOURCE]` implementation README https://github.com/real-or-random/accas — "If the user creates two
assertions that assert two different statements in the same context, then everybody can extract
the user's secret assertion key from the two assertions." and "based on Elliptic Curve Cryptography
on the curve secp256k1, i.e., it is compatible with Bitcoin keys." Bibliographic data
`[SECONDARY]` (dblp/Semantic Scholar via search). The author PDF host
(publications.cispa.saarland) refused the connection.
*Establishes:* "accountable assertions": statement-in-context signatures where equivocation (two
statements, same context) reveals the secret key, which is also the key controlling a Bitcoin
deposit, so equivocation forfeits the deposit. Construction from Merkle trees and chameleon hashes
`[SECONDARY]` (described this way by later papers in search results; the README lists
`chameleonhash.cpp`).
*Paprika use:* the direct ancestor of "two different photos under the same counter reveal the
key". Paprika's committed-nonce variant (1.3) is the same idea with a much simpler ECDSA-native
mechanism; cite RKS as prior art.

**1d. Poettering, B., Stebila, D. "Double-authentication-preventing signatures." ESORICS 2014,
LNCS 8712, pp. 436–453, DOI 10.1007/978-3-319-11203-9_25; full version Int. J. Inf. Sec. 16(1),
2017. ePrint 2013/333.**
`[SOURCE]` https://eprint.iacr.org/2013/333 — on signing two messages for the same subject, "enough
information is revealed to allow anyone to compute valid signatures on behalf of the signer."
(LNCS volume number from search; one source says 8713 — check before printing.)

**1e. Bellare, M., Poettering, B., Stebila, D. "Deterring Certificate Subversion: Efficient
Double-Authentication-Preventing Signatures." PKC 2017 (per search), ePrint 2016/1016.**
`[SOURCE]` https://eprint.iacr.org/2016/1016 — "signing two messages with the same first part and
differing second parts reveals the signing key." and "several orders of magnitude more efficient
than prior DAPS".

**1f. Derler, D., Ramacher, S., Slamanig, D. "Short Double- and N-Times-Authentication-Preventing
Signatures from ECDSA and More." IEEE EuroS&P 2018. ePrint 2017/1203.**
`[SOURCE](abstract)` https://eprint.iacr.org/2017/1203 — "generically construct provably secure DAPS
from a large class of discrete logarithm based signatures" (Schnorr, DSA, EdDSA, "the widely used
ECDSA signature scheme"); "we generalize DAPS to any N>2 ... (NAPS)"; "this efficiency comes at the
cost of a reduced address space." **Mechanism not read** (PDF blocked). Follow-ups: Derler,
Ramacher, Slamanig, "Generic Double-Authentication Preventing Signatures and a Post-Quantum
Instantiation", ProvSec 2018, ePrint 2018/790 `[SECONDARY]`; Poettering, "Shorter
double-authentication preventing signatures for small address spaces", AFRICACRYPT 2018, ePrint
2018/223 `[SOURCE](abstract)`.
*Paprika use:* **DAPS from ECDSA already exists in the literature (2018).** If the team presents
"equivocation reveals the ECDSA key", it must cite 1c–1f. "N-times" (NAPS) is the right name for
"at most L photos per epoch".

**1g. Ethereum consensus slashing (Casper FFG).**
`[SOURCE]` https://ethereum.github.io/consensus-specs/specs/phase0/beacon-chain/ —
`is_slashable_attestation_data`: "(data_1 != data_2 and data_1.target.epoch == data_2.target.epoch)"
(double vote) or "(data_1.source.epoch < data_2.source.epoch and data_2.target.epoch <
data_1.target.epoch)" (surround vote).
*Establishes:* the standard deployed pattern: slashing evidence = two valid signatures on
conflicting statements; no key extraction is needed.

**1h. ECDSA nonce hygiene.** Pornin, T. RFC 6979 "Deterministic Usage of the Digital Signature
Algorithm (DSA) and Elliptic Curve Digital Signature Algorithm (ECDSA)", Informational, August 2013.
`[SOURCE]` https://www.rfc-editor.org/rfc/rfc6979 — "Even slight biases in that process may be turned
into attacks on the signature schemes." Moghimi, Sunar, Eisenbarth, Heninger, "TPM-Fail: TPM meets
Timing and Lattice Attacks", USENIX Security 2020 `[SOURCE]` https://tpm.fail/ — "A local adversary
can recover the ECDSA key from Intel fTPM in 4-20 minutes depending on the access level." (The page
says "256-bit private keys"; it does not name the curve on the landing page.)

**1i. ECDSA with pre-published nonces ("presignatures").** Groth, J., Shoup, V. "On the Security of
ECDSA with Additive Key Derivation and Presignatures." EUROCRYPT 2022, LNCS 13275, pp. 365–396,
DOI 10.1007/978-3-031-06944-4_13; ePrint 2021/1330. `[SOURCE](abstract)`
https://eprint.iacr.org/2021/1330 — presignatures = "the secret and public nonces used in the ECDSA
signing algorithm are precomputed"; "when both variations are combined, there is a cube-root attack
on ECDSA". Couteau, G., Makriyannis, N. "A Note on the Security of ECDSA with Presignatures or
Biased Nonces." ASIACRYPT 2026 (per ePrint), ePrint 2026/2545. `[SOURCE](abstract)`
https://eprint.iacr.org/2026/2545 — some presignature variants "are vulnerable, especially when
combined with raw signing". Neither abstract states a result for plain presignatures without key
derivation and without raw signing; **the security of 1.3 below is therefore an open point we did
not resolve** (see C).

### 1.2 What is sound: three levels of "equivocation is self-incriminating"

Define a **slot-bound capture message**
`m(slot, P) = "PAPRIKA-V2/CAPTURE" ‖ chainId ‖ contract ‖ keyId ‖ slot ‖ P ‖ blockhash(anchor)`,
where `P` is a photo digest or a Merkle root of a batch, and `slot = (epoch, i)` with `i < L`.
"Equivocation" = two valid signatures under `K` on `m(slot, P)` and `m(slot, P')` with `P ≠ P'`.

**Level A — direct equivocation proof (sound today, any hardware key).** The contract receives both
messages' fields and both signatures, recomputes both digests itself, checks both with the 0x100
precompile, checks same `slot`, `P ≠ P'`, and slashes. Security: no honest key is ever slashed
under EUF-CMA of ECDSA-P256-SHA256 plus the device's rule "never two payloads per slot"
(Casper-style, 1g). Cost ≈ 2 × 6,900 gas precompile + calldata + SHA-256 ≈ 40–60k gas `[ANALYSIS]`.
Works with Secure Enclave / Android Keystore / WebCrypto keys because it constrains nothing about
nonces. **This needs no key extraction at all.** It is the honest 2-hour build.

**Level B — "deterministic nonce per counter" rule alone: NOT sound as a deterrent.**
If the device sets `k = HMAC(d, slot)` (RFC 6979-style, keyed by slot), two signatures for the same
slot share `r`, and anyone recovers `d` (`k = (z1−z2)/(s1−s2)`, `d = (s1·k−z1)/r`; try `±s2` because of
low-s normalisation). `[TESTED]` `extract.mjs` step 1. **But a verifier cannot tell which `k` was
used**: `r` is the x-coordinate of an unconstrained point. A dishonest key holder simply uses a fresh
random `k` for the second photo; both signatures verify and nothing leaks (`[TESTED]` step 2). The
rule only binds honest firmware, i.e. it deters nobody who matters. Do not present it as a security
property.

**Level C — committed nonces (DAPS/NAPS-style, sound under an assumption we flag).** At
registration the device commits to the nonce x-coordinates `r_{slot} = x(k_slot·G) mod n` for all
slots (Merkle root `ρ` stored with the key; `k_slot = PRF(seed, slot)`). An attestation for `slot`
is valid only if its `r` equals the committed `r_slot` (Merkle path checked by the contract: ~log₂N
SHA-256 calls). Now any two valid signatures for one slot on different digests share `r` and reveal
`d`; a cheating signer cannot escape by changing `k` (`[TESTED]` step 2: committed-`r` check
rejects the cheating signature, accepts the honest one). The revealed `d` then produces the
**existing** `EXTRACTED` misuse proof naming any challenger (`[TESTED]` step 1, last line), so the
contract needs no new slashing path and no on-chain scalar multiplication.
- What extraction adds over level A: (i) equivocation becomes an instance of *leakage*, so every
  deployment on which `K` is registered (other chains, a level-1 issuer registry) can be slashed
  by anyone, because `EXTRACTED` signatures for each `(chainId, contract)` can be freshly made from
  `d`; (ii) the key is publicly dead, so off-chain verifiers learn it too.
- Costs/limits: N nonces must be precomputed at registration (N scalar multiplications; e.g. 2^16);
  each attestation carries a Merkle path. **Hardware keystores (Secure Enclave, Android Keystore,
  WebCrypto) do not let the caller choose `k`** `[ANALYSIS]`, so level C is only possible with a
  software key or custom secure-element firmware: it does not fit Paprika's "hardware key" story.
- Security caveat: publishing `r_slot` before the message is ECDSA with public presignatures (1i).
  Groth–Shoup's cube-root attack needs additive key derivation as well; Couteau–Makriyannis report
  weaknesses "especially when combined with raw signing". Paprika signs SHA-256 of a structured
  message computed by the signer (not raw digests), uses no key derivation, and each `r_slot` is
  used once by honest devices — **we believe but have not verified** that this sits in the safe
  regime. Say so explicitly if presented.
- Prior art: RKS accountable assertions (1c), DAPS/NAPS (1d–1f). The ECDSA committed-nonce trick is
  at best a simple instantiation of an existing primitive; do not claim novelty.

**One-time / few-time hash signatures.** With Lamport/WOTS, signing two different messages under
one one-time key reveals extra preimages; a forger can then sign messages whose bits/digits lie
between the two — partial, not full, key revelation `[ANALYSIS]`. Usable as a PQ "equivocation is
costly" device but it does not cleanly feed `EXTRACTED` (the `EXTRACTED` digest is unlikely to be
coverable). Not recommended tonight.

**Rate-limiting meaning of slots.** With `i < L` per epoch and `L` proportional to stake (RLN's
"messageLimit = amount / MINIMAL_DEPOSIT", section 2), slots give an honest, checkable claim:
*a key can produce at most L unslashable attestations per epoch*. This bounds what one leaked key or
one key farm can attest per unit of stake and time, which `p·S > G` alone does not.

---

## 2. RLN, Semaphore, and unlinkable-but-accountable alternatives

**2a. Rate-Limiting Nullifier (RLN), docs and V2 spec.** `[SOURCE]`
https://rate-limiting-nullifier.github.io/rln-docs/ — "RLN (Rate-Limiting Nullifier) is a
zk-gadget/protocol that enables spam prevention mechanism for anonymous environments." From the doc
sources (rln_in_details.md, sub-agent `[SOURCE]`): "identityCommitment = Poseidon(a_0)", "A(x) = a_1 *
x + a_0", "a_1 = Poseidon(a_0, externalNullifier, messageId)", "externalNullifier = Poseidon(epoch,
rln_identifier)", and "if we use the same messageId twice, we'll share two different points from our
first-degree polynomial, and therefore it'll be possible to recover the secret key." Rate limit:
"0 ≤ messageId < userMessageLimit". Contract (smart_contract.md): "the registry and slashing are the
only mechanisms that happen on-chain", "messageLimit = amount / MINIMAL_DEPOSIT", Groth16 verifier,
withdrawal "freezePeriod" against front-run self-withdrawal.
Repos: github.com/Rate-Limiting-Nullifier/rln-contract, circom-rln; noir-rln listed as WIP.
**Constraint count and verification gas: not found.** Vac RFC 32 (RLN-V1) / RLN-V2 pages: host
returned HTTP 502, not opened.

**2b. Taheri-Boshrooyeh, S., Thorén, O., Whitehat, B., Koh, W.J., Kilic, O., Gurkan, K.
"WAKU-RLN-RELAY: Privacy-Preserving Peer-to-Peer Economic Spam Protection." IEEE ICDCSW 2022,
arXiv:2207.00117.** `[SECONDARY]` (sub-agent read abstract and PDF): proof generation "≈ 0.5s on an
iPhone 8" for group size 2^32; verification "≈ 30ms"; registration "40k gas".

**2c. Semaphore.** `[SOURCE]` https://docs.semaphore.pse.dev/ — "Semaphore V4 is out"; benchmarks
page: "Semaphore v4 support tree depths from 1 to 32". Gas and timing numbers are images only: **not
read**.

**2d. Camenisch, J., Hohenberger, S., Kohlweiss, M., Lysyanskaya, A., Meyerovich, M. "How to Win the
Clone Wars: Efficient Periodic n-Times Anonymous Authentication." ACM CCS 2006, DOI
10.1145/1180405.1180431; ePrint 2006/454.** `[SOURCE](abstract)` (sub-agent) — "lets a user
anonymously authenticate at most n times in a single time period"; cheating users can be identified
and traced. The academic precursor of RLN-V2. Cite this, not only RLN.

**2e. Fujisaki, E., Suzuki, K. "Traceable Ring Signature." PKC 2007; ePrint 2006/389.**
`[SOURCE]` https://eprint.iacr.org/2006/389 — signing a second opinion on the same tag means "the
identity of the member is immediately revealed." No manager needed.

**2f. Liu, J.K., Wei, V.K., Wong, D.S. "Linkable Spontaneous Anonymous Group Signature for Ad Hoc
Groups." ACISP 2004; ePrint 2004/027.** `[SOURCE](abstract)` — "No group secret, therefore no group
manager". Linking does not identify.

**2g. Group signatures with opening.** Chaum & van Heyst, "Group Signatures", EUROCRYPT 1991
`[SOURCE](metadata)`; Bellare, Micciancio, Warinschi, "Foundations of Group Signatures...", EUROCRYPT
2003 `[SOURCE](metadata)`; Boneh, Boyen, Shacham, "Short Group Signatures", CRYPTO 2004
`[SOURCE](abstract)` https://crypto.stanford.edu/~dabo/pubs/abstracts/groupsigs.html — "approximately
the size of a standard RSA signature with the same security."

**2h. Anonymous credentials with revocation.** Tsang, Au, Kapadia, Smith, "Blacklistable anonymous
credentials: blocking misbehaving users without TTPs", ACM CCS 2007 `[SOURCE](metadata)`;
Camenisch & Lysyanskaya, EUROCRYPT 2001 (optional anonymity revocation) `[SOURCE](metadata)`.

**2i. Camenisch, J., Shoup, V. "Practical Verifiable Encryption and Decryption of Discrete
Logarithms." CRYPTO 2003; ePrint 2002/161.** `[SOURCE](abstract)` (sub-agent) — "the first verifiable
encryption system that provides chosen ciphertext security and avoids inefficient cut-and-choose
proofs ... key escrow." Abstract does not mention threshold decryption.

**2j. ZK proofs of P-256 ECDSA in Noir.** Noir stdlib `std::ecdsa_secp256r1::verify_signature` is a
backend black box; "only the low-s form of a signature is accepted"; the hash "is used as given"
`[SOURCE]` (sub-agent, noir-lang source/docs). Benchmark: Nadolinski, "Benchmarking ZKP Systems for
Passkey ECDSA Verification", Base blog, 2025 `[SOURCE]` https://base.org/blog/benchmarking-zkp-systems
— proving "Noir ~2.1s" (c7i.2xlarge, 8 vCPU), "Noir ~0.6s" (c7i.8xlarge); average verification gas
Noir 2,396,575, SnarkJS 347,665, Gnark 407,664. Gate count of the black box: not found.

**Is "staked, anonymous, rate-limited device" coherent for Paprika?** `[ANALYSIS]`
- *Coherent part:* registration = stake + identity commitment in a Merkle tree; each attestation =
  ZK proof of membership + nullifier for `(epoch, messageId)` + Shamir share; exceeding the rate
  reveals `a_0`, and anyone presenting `a_0` slashes (contract checks `Poseidon(a_0)` is a member).
  This removes limit 4 of the spec (linkability) and keeps the objective rate-limit slashing.
- *What breaks:* (1) the hardware key disappears unless the circuit also verifies a P-256 signature
  on `H` by a key committed at registration (≈2 s proving, ≈2.4M gas per attestation with the
  UltraHonk verifier vs ≈30k today; or Groth16 at ≈350k gas but a 2M-constraint circuit). (2) the
  per-key history (flag time, time-scoped trust, stake amount per key) is lost by design: a verifier
  cannot apply "records before the flag" policies to an anonymous record unless the record carries
  something linkable. (3) the **subjective** path has nobody to slash: an upheld "fake" claim on an
  anonymous record needs an *opener*: group-signature opening (2g) or verifiable encryption of the
  identity commitment to a threshold key (2i), opened only on an upheld oracle verdict. That is the
  honest threshold-crypto use (section 7), and it adds a trusted committee.
- *Verdict:* a credible "future work" slide with a precise design; not tonight's build (Noir RLN is
  WIP upstream; proof-of-ECDSA-in-circuit is heavy). Traceable ring signatures (2e) are the
  manager-free alternative for the objective path only.

---

## 3. Proofs about the challenge itself: can subjective disputes become objective?

**3a. Prior on-chain existence — objective today, contract-checkable, no new primitive.**
`[ANALYSIS]` If `records[H][B].recordedBlock < records[H][A].anchorBlock` for keys `A ≠ B`, then the
exact bytes `H` were on-chain before `A`'s anchor block existed. If a genuine capture by `A` happens
after its device saw `blockhash(anchorA)` (the capture rule), `A` cannot have captured `H`: slash `A`.
No honest key can be framed: framing `A` needs `H` before `anchorA`, i.e. a SHA-256 collision or
prior knowledge of a photo not yet taken; mempool front-running cannot help because a copy seen in
`A`'s transaction is necessarily recorded after `anchorA`. Strict inequality is required. This turns
the spec's own example of a "subjective" claim ("the same image was published before
`anchorBlock`") into an objective one whenever the earlier publication is on this chain (or
timestamped on another verifiable ledger: then a light-client proof is needed). Cost: one function,
two storage reads.

**3b. Proofs that an image is a permitted transformation of an attested original.**
- Naveh, A., Tromer, E. "PhotoProof: Cryptographic Image Authentication for Any Set of Permissible
  Transformations." IEEE S&P 2016, pp. 255–271 (DOI 10.1109/SP.2016.23 `[SECONDARY]`).
  `[SECONDARY]` (sub-agent read author PDF https://cs-people.bu.edu/tromer/photoproof/photoproof-oakland16.pdf):
  "proof verification takes mere milliseconds, but at present the creation of proofs is too slow
  for many applications"; 128×128 image: 306 s prove, 12.5M constraints.
- Kang, D., Hashimoto, T., Stoica, I., Sun, Y. "ZK-IMG: Attested Images via Zero-Knowledge Proofs to
  Fight Disinformation." arXiv:2211.04775 (2022). `[SOURCE](abstract)` — "zk-img is the first system
  to be able to transform HD images on commodity hardware, securely and privately". Numbers
  `[SECONDARY]` (PDF): 720p single transforms "as little as 7.8 seconds to prove"; with hidden
  input "up to 617 s and peak memory usage up to 102 GB".
- Datta, T., Chen, B., Boneh, D. "VerITAS: Verifying Image Transformations at Scale." ePrint
  2024/1066 (IEEE S&P 2025 per Crossref, seed 02-academic A3). `[SOURCE](abstract)` — "the first to do
  so for realistically large images (30 megapixels)"; 90 MB image, camera-side signer "just over
  thirteen minutes".
- Dziembowski, S., Ebrahimi, S., Hassanizadeh, P. "VIMz: Private Proofs of Image Manipulation using
  Folding-based zkSNARKs." PoPETs 2025; ePrint 2024/1063. `[SOURCE](abstract)` — proofs "less than 11
  KB for all resolutions"; 8K images, 10 GB peak memory.
- Della Monica, P., Visconti, I., Vitaletti, A., Zecchini, M. "Trust Nobody: Privacy-Preserving
  Proofs for Edited Photos with Your Laptop." IEEE S&P 2025; ePrint 2024/1074. `[SOURCE](abstract)` —
  30 MP resize/crop "in about 41 minutes employing less than 4 GB of RAM".
- Zhang, Y., Zhou, M., Bünz, B. "Verifiable Compression of Images." ePrint 2026/1717 (preprint).
  `[SOURCE]` https://eprint.iacr.org/2026/1717 — "We can prove the JPEG compression of an FHD(1080p)
  image in 47s in the Poseidon mode and in 2s in the fast mode."; fast mode "requires the C2PA to use
  a polynomial commitment (e.g., KZH)". (Sub-agent: the paper also reports a forgery gap in VIMz and
  a fix — `[SECONDARY]`.)
- Dittmer, S., Lu, S., Model, K., Near, J. "ZK-JPEG: Zero-knowledge Image Editing and Compression."
  SCN 2026; ePrint 2026/2039. `[SOURCE](abstract)` — "proves an image was correctly compressed from a
  secret, committed input." No numbers in abstract.
*Paprika use:* defines an objective dispute "image `I'` is (or is not) a permitted transform of a
record `H`": a *defender* (owner) can prove a published edit derives from an attested capture,
turning "is this crop genuine?" into a SNARK check. Limitation: Paprika's `H` is SHA-256 of a file;
these systems commit to pixels with SNARK-friendly hashes or polynomial commitments, so the device
would need to sign such a commitment too (a second digest field in the capture message). Not
tonight; a correct "level 2 / future" slide. On-chain verification of such proofs: not measured.

**3c. Perceptual hashing in ZK.** No paper computing pHash/PDQ/NeuralHash inside a SNARK found.
Closest: Awan, M., Collomosse, J. "Soft Redaction of Image Provenance via Zero-Knowledge Proofs",
arXiv:2608.07063 (2026) `[SOURCE](abstract)` (sub-agent): L2 distance proofs over committed perceptual
fingerprints. Attacks: Jain, S., Crețu, A.-M., de Montjoye, Y.-A., "Adversarial Detection Avoidance
Attacks...", USENIX Security 2022 `[SOURCE]` (sub-agent) — "more than 99.9% of images successfully
attacked while preserving the content of the image"; Struppek et al., "Learning to Break Deep
Perceptual Hashing: The Use Case NeuralHash", FAccT 2022 `[SECONDARY]`. *Verdict:* a ZK proof of
"perceptual distance < d" would be objective but the predicate is adversarially weak in both
directions (evasion and collision). Not a sound basis for slashing.

**3d. Proof that an image came from model+seed (zkML).** zkCNN (Liu, Xie, Zhang, CCS 2021, ePrint
2021/673) `[SOURCE](abstract)`: "88.3 seconds" (VGG16). Chen, Waiwitlikhit, Stoica, Kang, "ZKML: An
Optimizing System for ML Inference in Zero-Knowledge Proofs", EuroSys 2024 `[SECONDARY]` (sub-agent,
PDF): "a small latent text-to-image Stable diffusion model", 19.5M parameters, prove 3600.57 s on a
128-vCPU/1 TB machine; unclear whether one denoising step. zkLLM (Sun, Li, Zhang, CCS 2024,
arXiv:2404.16109) `[SOURCE](abstract)` (sub-agent): 13B LLM inference in under 15 minutes.
*Verdict:* proving full production diffusion generation is not feasible today (no published system).
Moreover it only helps an accuser who has the model and seed, i.e. essentially never. No use.

**3e. Watermark-detection proofs.** Fairoze, Garg, Jha, Mahloujifar, Mahmoody, Wang,
"Publicly-Detectable Watermarking for Language Models", ePrint 2023/1661 (IACR CiC 2024)
`[SOURCE](abstract)` (sub-agent): "the detection algorithm contains no secret information" (text
only). Adelsbach & Sadeghi, "Zero-Knowledge Watermark Detection and Proof of Ownership", Information
Hiding 2001 `[SECONDARY]`. Zhang, Edelman, Francati, Venturi, Ateniese, Barak, "Watermarks in the
Sand: Impossibility of Strong Watermarking for Generative Models", ICML 2024, arXiv:2311.04378
`[SOURCE](abstract)` (sub-agent). Google DeepMind, "SynthID-Image: Image watermarking at internet
scale", arXiv:2510.09263 `[SOURCE](abstract)` (sub-agent), proprietary detection. *Verdict:* a
*present* public watermark could support an objective "this record is AI-generated" claim (if the
generator uses a publicly verifiable, signature-based watermark); an *absent* watermark proves
nothing (Watermarks in the Sand). Only positive evidence; none exists for images with public
detection today that we verified.

---

## 4. Timestamps and anchoring

- Haber, S., Stornetta, W.S. "How to time-stamp a digital document." J. Cryptology 3(2):99–111, 1991
  `[SOURCE](metadata)` (Crossref, via sub-agent).
- Abadi, A., Ciampi, M., Kiayias, A., Zikas, V. "Timed Signatures and Zero-Knowledge Proofs —
  Timestamping in the Blockchain Era." ACNS 2020, DOI 10.1007/978-3-030-57808-4_17; ePrint 2019/644.
  `[SOURCE](abstract)` — "a fine-grained treatment of the different timestamping guarantees, namely
  security against postdating and backdating attacks" (quote from seed 02 verification). **The right
  formal frame for Paprika's two-sided bound**: `anchorBlock` gives security against backdating of the
  signature, `recordedBlock` against postdating.
- Landerreche, E., Stevens, M., Schaffner, C. "Non-interactive Cryptographic Timestamping based on
  Verifiable Delay Functions." FC 2020, DOI 10.1007/978-3-030-51280-4_29; ePrint 2019/197
  `[SOURCE](abstract)` — "any forged timestamps by the adversary are now limited to within a certain
  time-window".
- Bonneau, J., Clark, J., Goldfeder, S. "On Bitcoin as a public randomness source." ePrint 2015/1015
  `[SOURCE](abstract)` — "We formalize the use of Bitcoin as a source of publicly-verifiable
  randomness." (bias resistance bounded by the attacker's stake/block reward).
- Alpturer, K., Weinberg, S.M. "Optimal RANDAO Manipulation in Ethereum." AFT 2024, arXiv:2409.19883
  `[SOURCE](abstract)` — "RANDAO manipulation is possible in Ethereum if an adversary controls the
  proposers assigned to the last slots in an epoch."
- drand quicknet `[SOURCE]` (live API, sub-agent): `"period":3`, `"schemeID":"bls-unchained-g1-rfc9380"`.
- EIP-2935 (historical block hashes from state) `[SOURCE]` https://eips.ethereum.org/EIPS/eip-2935:
  Final, `HISTORY_SERVE_WINDOW` 8191, in Pectra; `BLOCKHASH` itself stays at 256. EIP-4788 (beacon
  root) Final, 8191-slot ring buffer `[SOURCE]` (sub-agent).

`[ANALYSIS]` for Paprika:
1. *What block hashes give:* unpredictability, not unbiasability. Paprika needs only "nobody could
   compute this signature before block b0 was published", which holds against everyone except the
   producer of b0 (and builders), who knows it seconds earlier. Bias (RANDAO, 4) is irrelevant to a
   not-before bound; it matters only if the hash were used as a lottery.
2. *Limits:* the bound is on the **signature**, not on the photo's existence (the spec states this
   correctly); a reorg can move the anchor; on a low-validator sidechain the producer set is small,
   so "unpredictable" means "unpredictable to non-producers"; the window is 256 blocks unless
   EIP-2935 is available on the target chain (check: unknown for the XRPL EVM sidechain).
3. *drand as not-before:* signing a drand round value gives a chain-independent not-before
   evidence with 3 s granularity; on-chain check needs BLS12-381 on G1 with RFC 9380 hash-to-curve
   (EIP-2537 precompiles give pairings; hash-to-curve cost not measured). Not tonight.
4. *VDF:* only needed for non-interactive timestamping without a chain; Paprika has a chain. No use.

---

## 5. On-chain P-256 and passkeys

- **EIP-7951 "Precompile for secp256r1 Curve Support".** `[SOURCE]` https://eips.ethereum.org/EIPS/eip-7951
  (reopened by main session): Final; "a precompile at the address `0x100`"; "The 6900 gas cost does
  not maintain compatibility with L2s"; "Both `r` and `s` MUST satisfy `0 < r < n` and `0 < s < n`";
  "secp256r1 ECDSA signatures are not required to be non-malleable per NIST FIPS 186-5 standard";
  "Applications requiring non-malleability should implement additional checks at the application
  layer." Input 160 bytes `h‖r‖s‖qx‖qy`. In Fusaka (EIP-7607 `[SOURCE]` sub-agent): mainnet activation
  2025-12-03 21:49:11 UTC.
- **RIP-7212** `[SOURCE]` (sub-agent) https://github.com/ethereum/RIPs/blob/master/RIPS/rip-7212.md:
  Final, 3450 gas, 0x100; "Wrapper libraries SHOULD add a malleability check by default". L2s:
  Polygon PIP-27 `[SOURCE]`; Arbitrum ArbOS 32 "Bianca" `[SOURCE]`; OP Stack/Base/zkSync
  `[SECONDARY]`. XRPL EVM sidechain: responds at 0x100, 27,370 gas per call measured
  (`/home/tux/crypto/docs/research/seed/VERIFICATION.md` row 12–13).
- **WebAuthn Level 3** (W3C Recommendation, 2026) `[SOURCE]` (sub-agent) https://www.w3.org/TR/webauthn-3/:
  signature over "authenticatorData || hash", hash = SHA-256 of the client data JSON; challenge is
  "The base64url encoding of pkOptions.challenge"; ES256 signature "MUST be encoded as an ASN.1 DER
  Ecdsa-Sig-Value" (convert to `r‖s`, normalise low-s if a library requires it).
- **Libraries** `[SOURCE]` (sub-agent): OpenZeppelin `P256.sol` (since v5.1; "disallows signatures
  where the `s` value is above `N/2`") and `WebAuthn.sol` (since v5.5.0, 2025-10-31; hashes
  `sha256(authenticatorData || sha256(clientDataJSON))`; deliberately skips origin/rpIdHash/counter
  checks); OZ audit list includes v5.1 and v5.5/v5.6 reviews (coverage of these files inferred, PDFs
  not read). Daimo p256-verifier: Veridise audits 2023 (P256 and WebAuthn), "about 330k gas" in
  Solidity. base/webauthn-sol: audit PDF present (auditor not identified), rejects high-s.
  FreshCryptoLib: "(FCL has no audit)".
- **WebCrypto** `[SOURCE]` (sub-agent) https://www.w3.org/TR/WebCryptoAPI/: `extractable` "indicates
  whether or not the raw keying material may be exported by the application"; the spec "places no
  normative requirements on implementations as to how the underlying cryptographic key material is
  stored" — **non-extractable ≠ hardware-backed**. ECDSA output is raw `r‖s`.

`[ANALYSIS]` Paprika use: a passkey (platform authenticator) is a real hardware-held P-256 key
available tonight in a browser. Device signs the capture message as the WebAuthn challenge:
`challenge = SHA-256(capture message)`; the contract rebuilds `clientDataJSON` (or checks that the
supplied JSON contains the expected base64url challenge and `"type":"webauthn.get"`) and verifies with
`WebAuthn.sol`. Caveats: (1) the "capture pipeline" is then *any page of that RP*, so the user can
always produce an `EXTRACTED` signature: misuse proof degrades to "self-report"; (2) synced passkeys
are not device-bound (exportable to a cloud keychain) `[MEMORY]`; (3) the signed bytes are
`authenticatorData ‖ SHA-256(clientDataJSON)`, so the domain label must be inside the challenge, not
at the start of the signed bytes; (4) WebCrypto non-extractable keys are a weaker demo (no hardware
guarantee).

---

## 6. Batching and scalability

`[ANALYSIS]` with `[SOURCE]` numbers:
- **Merkle batching (realistic tonight).** Device signs one capture message whose payload `P` is the
  root of a Merkle tree of photo digests (domain-separated leaves/nodes: `0x00‖H`, `0x01‖L‖R`, as
  `p04-combined-critical-path/contracts/OpenRegistry.sol` already does). One P-256 verification per
  batch; each photo's record is `(root record, index, path)`; per-photo inclusion verified off-chain
  or lazily on-chain (log₂B SHA-256). Combined with slots (1.2 level A), a batch root per slot makes
  off-chain batches accountable: two roots for one slot are slashable.
- **ECDSA aggregation:** no standard aggregate for ECDSA `[MEMORY]` (none found). Schnorr/EdDSA
  half-aggregation exists: Chalkias, Garillot, Kondi, Nikolaenko, "Non-interactive half-aggregation
  of EdDSA and variants of Schnorr signatures", CT-RSA 2021, ePrint 2021/350 `[SOURCE](abstract)`
  (sub-agent) — "compress ... to roughly half their naive size". No precompile, no device support.
- **BLS aggregation:** EIP-2537 Final, in Pectra; pairing "32600*k + 37700" gas `[SOURCE]` (sub-agent).
  Aggregate of n signatures on *distinct* messages needs n+1 pairings ≈ 32.6k gas per photo plus
  hash-to-curve: **more** gas per photo than a 6,900-gas P-256 precompile call, and no phone holds a
  BLS key in hardware. Not worth it.
- **Validity-rollup aggregation:** prove n P-256 verifications in one SNARK (Noir black box ≈ a few
  seconds per signature on a laptop per 2j; verification ≈ 2.4M gas UltraHonk / ≈350k Groth16 per
  proof). Pays off only for large n; not tonight.

---

## 7. MPC / threshold / FHE: honest uses

`[ANALYSIS]`
- **Threshold opener (honest, conditional).** Only if records become anonymous (section 2): each
  record carries a verifiable encryption (2i) of the identity commitment under a threshold key held
  by a committee; the committee decrypts only after an upheld oracle verdict, enabling the
  subjective slash. Adds a trust assumption (t-of-n committee); it is the standard
  "accountable anonymity" construction (group signatures with opening, 2g).
- **Threshold time-lock (drand tlock) for sealed commitments** (Gailly, Melissaris, Romailler,
  "tlock: Practical Timelock Encryption from Threshold BLS", ePrint 2023/189, seed 02-academic D10
  `[SECONDARY]`): would let a photographer commit to a photo whose content is revealed later. A plain
  hash commitment already does this for Paprika; tlock adds only forced reveal. Marginal.
- **DKG / threshold-ECDSA co-signing service for devices:** no honest use at level 0 — it moves trust
  from the device key to a committee and does not prove capture.
- **FHE:** no honest use found. Private dispute evidence is better served by commit-and-reveal or ZK.

---

## 8. Post-quantum

- FIPS 204 (ML-DSA, Final 2024-08-13) `[SOURCE]` (sub-agent, Table 2): ML-DSA-87 public key 2592 B,
  signature 4627 B; ML-DSA-44 1312 B / 2420 B. FIPS 205 (SLH-DSA) Final, sizes not extracted.
- Composite `id-MLDSA87-RSA3072-PSS-SHA512` is in RFC 10073 (November 2026)
  (`/home/tux/crypto/docs/research/seed/VERIFICATION.md` row 24) — matches Apple's ML-DSA-87 + RSA-3072
  pair (per `apple-reference-image.md`, not reopened here).
- On-chain costs: EIP-8051 "Precompile for ML-DSA signature verification", **Draft**, 4500 gas,
  ML-DSA-44 only, expanded public key 20512 bytes `[SOURCE]` (sub-agent). EIP-7619 Falcon-512
  precompile, Draft, "1465 base units of gas" `[SOURCE]` (sub-agent). ZKNOX ETHFALCON (Solidity,
  "not audited: DO NOT USE IN PRODUCTION"): 3.8M gas NIST Falcon verify, 1.4M EVM-friendly variant,
  447,047 on an experimental branch `[SOURCE]` (sub-agent). No deployed chain precompile for any PQ
  signature found. SLH-DSA / WOTS on-chain gas: not searched.

`[ANALYSIS]` What would change in Paprika: the device key type (ML-DSA-87 or a composite), the
precompile (none deployed: Solidity verifiers cost ~10⁶ gas, or verify inside a SNARK), and the
committed-nonce trick (1.2 level C) has no analogue (ML-DSA is Fiat–Shamir with aborts; DAPS from
symmetric primitives exists, 1f follow-up 2018/790). Level A equivocation proofs and the `EXTRACTED`
bounty carry over unchanged to any EUF-CMA signature. The block-hash time bounds are hash-based and
unaffected; historical records signed with ECDSA stay meaningful only because they were *anchored*
before a quantum adversary existed (the chain witnesses the time of signing) — a real argument for
anchoring.

---

## Synthesis

### A. Ranked upgrades (crypto value ÷ effort tonight)

| # | Upgrade | Construction | Security claim | Cost | Backing | ~Time |
|---|---|---|---|---|---|---|
| 1 | **Objective "prior existence" slash** | `proveNotFresh(H, A, B)`: slash `A` if `records[H][B].recordedBlock < records[H][A].anchorBlock`, `A≠B` | Under SHA-256 collision resistance, blockhash unpredictability and the capture rule ("device saw anchor before capture"), no honest key is slashable; moves the spec's main subjective example to the objective path | ~2 SLOADs; ~30 lines + tests | §3a (analysis); timestamp frame: Abadi et al. ACNS 2020 | 1 h |
| 2 | **Slot-bound capture messages + equivocation proof + stake-proportional rate limit** | add `keyId‖slot` to the capture message, `slot=(epoch,i)`, `i < L(S)`; `proveEquivocation(two msgs, two sigs)` → slash | EUF-CMA ⇒ only the key holder can equivocate; a key yields ≤ L unslashable attestations per epoch | ≈2×6,900 gas + hashing per proof | Casper slashing (1g); Clone Wars (2d); RLN messageLimit (2a) | 1.5–2 h |
| 3 | **Merkle batching under slots** | device signs a batch root per slot; leaves `0x00‖H`, nodes `0x01‖L‖R` | one signature per batch; equivocation over roots stays slashable, so off-chain batches are accountable | one precompile call per batch; log₂B hashes per inclusion | §6 | 1–1.5 h (after 2) |
| 4 | **Digest and malleability hygiene** | enforce low-s (or document why malleability is harmless), include `keyId` in capture message, length-tagged encoding, never accept a digest from calldata | removes the traps in C | trivial | EIP-7951 text; RIP-7212; OZ P256.sol | 30 min |
| 5 | **Committed-nonce ECDSA (DAPS-style): equivocation reveals the key** | registration stores Merkle root of `r_slot`; attestation must use `r = r_slot`; two payloads in one slot ⇒ anyone extracts `d` ⇒ existing `EXTRACTED` proof on every deployment | equivocation ≡ leakage; sound against cheating signers (unlike a mere nonce rule); presignature security in this exact regime **unverified** (1i) | N scalar mults at registration; Merkle path per attestation; software keys only | RKS CCS 2015; Poettering–Stebila; Derler–Ramacher–Slamanig EuroS&P 2018; `[TESTED]` p07 | 2 h (demo exists; contract check new) |
| 6 | Passkey device (WebAuthn) | challenge = SHA-256(capture msg); OZ `WebAuthn.sol` | real hardware key in a browser; `EXTRACTED` degrades to self-report | ~WebAuthn parsing gas | §5 | 2 h |
| 7 | Anonymous rate-limited devices (RLN) + threshold opener | §2 verdict | unlinkability with objective rate slashing; subjective slash needs an opener | ≈2.4M gas/attestation with in-circuit P-256 | §2, §7 | spec only |
| 8 | Transformation proofs (VerITAS/SPEG family) | device signs a SNARK-friendly commitment too | objective "is an allowed edit of record H" | minutes of proving per image | §3b | spec only |

### B. The strongest crypto idea, stated carefully

*Stake-backed leakage deterrence for a signing key, with equivocation as a form of leakage.* Bind a
standard signing key `K` (ECDSA-P256) to a public bounty `S` that **any** holder of signing capability
for `K` can claim by producing a signature under `K` on a domain-separated message that names the
claimant; honest capture pipelines never sign that domain. Then (i) under EUF-CMA no honest key is
ever slashed; (ii) any party to whom the key leaks, or is sold, can defect for `αS` with no
cooperation from the owner (a whistleblower game: sharing the key with `m` parties creates `m`
potential defectors); (iii) with slot-bound messages, equivocation within a slot is slashable by a
two-signature proof, and with committed nonces it *reveals the key*, so equivocation reduces to
leakage and propagates to every deployment where `K` is staked; (iv) on-chain anchoring makes records
made before the flag time-scoped and still meaningful.
**Assumptions:** EUF-CMA of ECDSA-P256-SHA256; exclusive use of `K` for this protocol (no other
signing oracle over attacker-chosen digests); unpredictability of the anchor block hash; rational
key holders; for (iii-key-reveal) security of ECDSA with public per-slot presignatures in the
non-raw-signing regime (not verified). **It does not prove capture**: a staked software key can
attest synthetic bytes (spec limit 1).
**Closest prior art (do not claim these):** leakage-deterring PKC (Kiayias–Tang CCS 2013);
cryptocurrency collateral for leaked keys (Kiayias–Tang CCS 2015); equivocation reveals a key that
controls a deposit (Ruffing–Kate–Schröder CCS 2015); DAPS (Poettering–Stebila ESORICS 2014;
Bellare–Poettering–Stebila PKC 2017) and DAPS/NAPS from ECDSA (Derler–Ramacher–Slamanig EuroS&P 2018);
n-times anonymous authentication (Camenisch et al. CCS 2006) and RLN; Casper FFG slashing; IKP's
automatic responses to CA misbehaviour (seed 02-academic C22). **What may be new** (claim modestly):
the composition for camera-attestation keys with no issuer, using the deployed P-256 precompile;
the "proof of prior on-chain existence" objective slash (3a); and the explicit separation of what
is objective (key misuse, equivocation, prior existence) from what stays subjective.

### C. Soundness traps a cryptographer would catch

1. **Never verify a caller-supplied digest.** ECDSA without the hash is existentially forgeable
   (pick `u1,u2`, set `R=u1G+u2Q`, `r=x(R)`, `s=r/u2`, `z=u1·s`). The contract must compute the digest
   from the full message itself. `PaprikaV2.sol` does this today (lines 53, 67, 81) — keep it so,
   especially in any new "batch" or "WebAuthn" path where it is tempting to pass a hash.
2. **Malleability.** EIP-7951 accepts both `(r,s)` and `(r,n−s)` (`[TESTED]` p07 step 3). Harmless
   while records are keyed by `(H,keyId)`; fatal if anything is keyed by the signature bytes, or if
   an equivocation proof only checks "two different signatures" instead of "two different
   payloads". Enforce low-s or compare payloads. Noir's P-256 black box *rejects* high-s; WebCrypto
   and Secure Enclave may output high-s: normalise.
3. **What exactly is signed.** The capture message does not contain `keyId` or a slot; binding to
   the key is only implicit through verification. Add `keyId` (defence against key-substitution
   style issues and for clean equivocation semantics) and a slot. `abi.encodePacked` is unambiguous
   here only because every field after the label is fixed-length and labels are distinct and not
   prefixes of each other; add a version byte and keep it that way (a variable-length field in a
   future message would break it). Note: the p07 demo label `PAPRIKA-V2/CAPTURE-SLOT` *has*
   `PAPRIKA-V2/CAPTURE` as a prefix; it is still unambiguous only because the two messages have
   different fixed total lengths (134 vs 171 bytes). For a real change, use a new version label
   (`PAPRIKA-V3/...`) or length-prefix the label.
4. **Key exclusivity.** The objective path is sound only if no other software signs arbitrary
   digests with `K`. Hardware keystores and passkeys generally sign whatever the app asks; an app
   bug that exposes a "sign this" oracle lets anyone obtain an `EXTRACTED` signature → wrongful
   slash. State it as an assumption; for WebAuthn keys `EXTRACTED` means "the user signed it".
5. **Nonce handling.** "Deterministic nonce per counter" is not a verifier-checkable property
   (§1.2 level B). Biased nonces leak keys (RFC 6979; TPM-Fail recovered 256-bit ECDSA keys from
   TPMs in minutes). If level C is used: hash-then-sign only (no raw signing), no key derivation,
   one use per `r_slot` (1i).
6. **Front-running `firstKeyOf`.** Anyone watching the mempool can copy `H`, sign it with their own
   staked key and win `firstKeyOf[H]` in the same or an earlier block. `firstKeyOf` must not be
   presented as priority evidence; use rule 3a (strictly before the other's anchor) or
   commit-then-reveal.
7. **Time semantics.** `anchorBlock` bounds the *signature*, not the capture or the photo's
   existence; the spec says this, keep the pitch consistent. Block producers know the anchor hash
   early; reorgs; `BLOCKHASH` covers 256 blocks only (EIP-2935 gives 8191 where deployed).
8. **Cross-chain replay.** Covered by `chainId ‖ contract` in every message; but the *same key*
   registered on two deployments shares fate only through key extraction (level C) — level A proofs
   are per deployment.
9. **Retirement and leaks.** `proveKeyMisuse` accepts retired keys (status ≠ None) — good: an owner
   cannot retire, then sell the key without risk until `withdraw`. After withdrawal the stake is
   gone, so a key sold after exit is free: verifiers must treat records of withdrawn keys by their
   recorded block, and the unbonding period is the real deterrence window.
10. **Proof of possession** binds `owner` but not `MIN_STAKE` or the registration block; fine, but
    note the PoP signature is itself a signature on a non-capture domain: the `EXTRACTED` claim
    "no capture pipeline signs this domain" must exclude `REGISTER` explicitly (it does, labels
    differ).

---

## Claims table

| # | Claim | Tag | Where |
|---|---|---|---|
| 1 | Kiayias–Tang leakage-deterring PKC, CCS 2013, DOI 10.1145/2508859.2516691, ePrint 2013/845 | SOURCE | §1a |
| 2 | Kiayias–Tang Traitor Deterring Schemes, Bitcoin as collateral, CCS 2015 pp. 231–242 | SOURCE | §1b |
| 3 | Ruffing–Kate–Schröder accountable assertions, CCS 2015 pp. 219–230; two assertions in one context reveal the key; secp256k1 | SOURCE (README) / SECONDARY (biblio) | §1c |
| 4 | DAPS reveal signing capability on double signing; ESORICS 2014 / IJIS 2017 | SOURCE | §1d |
| 5 | DAPS/NAPS from ECDSA, EuroS&P 2018, ePrint 2017/1203 | SOURCE (abstract) | §1f |
| 6 | Casper double/surround vote conditions | SOURCE | §1g |
| 7 | Nonce bias attacks (RFC 6979 text); TPM-Fail 4–20 min key recovery | SOURCE | §1h |
| 8 | Presignatures + additive derivation: cube-root attack; raw signing risk | SOURCE (abstract) | §1i |
| 9 | Nonce reuse extracts P-256 key; extracted key forges EXTRACTED proof; uncommitted nonce rule evaded; committed-r check works; (r,n−s) verifies | TESTED | p07 |
| 10 | RLN share/slashing formulas, messageLimit = amount/MINIMAL_DEPOSIT | SOURCE (sub-agent) | §2a |
| 11 | WAKU-RLN-RELAY 0.5 s iPhone 8 proof, 30 ms verify | SECONDARY | §2b |
| 12 | Clone Wars n-times anonymous authentication CCS 2006 | SOURCE (abstract, sub-agent) | §2d |
| 13 | Traceable ring signature reveals identity on second signature per tag | SOURCE | §2e |
| 14 | Noir P-256 ~2.1 s (8 vCPU); 2,396,575 gas verify (Noir) | SOURCE | §2j |
| 15 | SPEG: 1080p JPEG compression proof 47 s / 2 s (fast mode needs polynomial-commitment C2PA) | SOURCE | §3b |
| 16 | VerITAS 30 MP; VIMz <11 KB; Trust Nobody 41 min | SOURCE (abstract) | §3b |
| 17 | zk-img 7.8 s / 617 s / 102 GB | SECONDARY | §3b |
| 18 | Perceptual hash evasion >99.9% | SOURCE (sub-agent) | §3c |
| 19 | ZKML small diffusion 3600 s, 128 vCPU | SECONDARY | §3d |
| 20 | ACNS 2020 timed signatures; FC 2020 VDF timestamping | SOURCE (abstract + Crossref) | §4 |
| 21 | EIP-7951: Final, 0x100, 6900 gas, no low-s requirement; Fusaka 2025-12-03 | SOURCE | §5 |
| 22 | RIP-7212: 3450 gas; Polygon, Arbitrum ArbOS 32 | SOURCE (sub-agent) | §5 |
| 23 | WebAuthn signs authData‖SHA-256(clientData); DER signature | SOURCE (sub-agent) | §5 |
| 24 | WebCrypto non-extractable ≠ hardware-backed | SOURCE (sub-agent) | §5 |
| 25 | OZ WebAuthn.sol since v5.5.0; FCL unaudited; Daimo ~330k gas, Veridise audits | SOURCE (sub-agent) | §5 |
| 26 | EIP-2537 pairing 32600k+37700 | SOURCE (sub-agent) | §6 |
| 27 | ML-DSA-87 pk 2592 B, sig 4627 B | SOURCE (sub-agent) | §8 |
| 28 | EIP-8051 Draft 4500 gas ML-DSA-44; ETHFALCON 1.4–3.8M gas unaudited | SOURCE (sub-agent) | §8 |
| 29 | "Prior on-chain existence" slash is sound under stated assumptions | ANALYSIS | §3a |
| 30 | BLS aggregation costs more gas per photo than the P-256 precompile | ANALYSIS from SOURCE numbers | §6 |

## Could not verify / not found

- Mechanism of the DAPS-from-ECDSA construction (ePrint 2017/1203 PDF blocked): whether it is the
  committed-nonce idea of §1.2 level C. Assume it may be.
- Security of ECDSA with public per-slot presignatures *without* key derivation and without raw
  signing: neither Groth–Shoup nor Couteau–Makriyannis abstracts settle it.
- Ruffing–Kate–Schröder paper text (author host refused connection); construction details are from
  the README and search summaries.
- RLN circuit constraint count and verification gas; Vac RFC 32 / RLN-V2 pages (HTTP 502); Semaphore
  V4 gas (images only); Noir P-256 black-box gate count.
- PhotoProof proof size; VerITAS / Trust Nobody / ZK-JPEG proof sizes; whether ZKML's diffusion
  figure covers one or all denoising steps.
- Any SNARK computing pHash/PDQ in-circuit (none found); any full diffusion generation proof (none).
- OP Stack / Base / zkSync activation of RIP-7212 (secondary only); whether the XRPL EVM sidechain
  supports EIP-2935.
- On-chain gas of SLH-DSA / WOTS / Lamport verification; FIPS 205 sizes.
- Auditor of base/webauthn-sol; scope of OZ audits for P256/WebAuthn.
- On-chain cost of verifying a drand quicknet signature (hash-to-curve on G1).

### [MEMORY] items (unverified, not used for claims)

- No standard aggregate signature scheme for ECDSA exists.
- Synced passkeys are exportable via cloud keychains, hence not device-bound.
- WebAuthn `signCount` is often 0 for synced passkeys, so it is not a usable monotonic counter.
- spartan-ecdsa (Personae Labs) targets secp256k1.
- Hardware keystores (Secure Enclave, Android Keystore, WebCrypto) do not expose caller-chosen ECDSA
  nonces (stated as analysis in §1.2; consistent with their APIs as recalled, not rechecked).
