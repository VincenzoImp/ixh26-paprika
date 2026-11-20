# p07 — Equivocation that reveals the key (demonstration, not part of the protocol)

- **Question:** could a device-signature rule make double use of a slot self-incriminating, so
  that it feeds the protocol's existing proof of key misuse?
- **Feeds:** a possible later upgrade named in `docs/research/seed/02-cryptographic-building-blocks.md`
  (synthesis A, item 5). Nothing in `spec/PROTOCOL.md` depends on it.
- **Method:** `extract.mjs` signs two different capture messages for the same slot with the same
  ECDSA nonce, recovers the private key from the two signatures, and uses it to sign the
  `EXTRACTED` message. It then shows that a nonce rule which is merely followed by honest firmware
  is not enough: the verifier has to check each signature's `r` against a nonce point committed at
  registration. Last, it shows that `(r, n − s)` verifies as well as `(r, s)`.
- **Run:** `npm install && npm run run` (Node 26.4, `@noble/curves` 1.2.0, `@noble/hashes` 1.3.2).
- **Raw output:** [`output/2026-11-20-run.txt`](output/2026-11-20-run.txt)

## Result `[TEST]`

| Check | Result |
|---|---|
| Two valid signatures in one slot with the committed nonce | The private key is recovered; it signs a valid `EXTRACTED` message naming the challenger |
| Signer ignores the nonce rule, verifier does not check it | Second signature still valid; nothing can be extracted |
| Verifier checks `r` against the committed nonce point | The cheating signature is rejected, the honest one accepted |
| High-`s` twin of a signature | Verifies when the verifier has no low-`s` rule |

## Limits

- The demonstration needs a key whose nonce the caller chooses: phone and browser keystores do
  not allow that, so this applies to software keys only.
- Whether ECDSA stays unforgeable when nonce points are published in advance, in exactly this
  setting, was not established here (the research report lists it under "could not verify").
- The message labels are those of an early draft, not of revision v2.3.
