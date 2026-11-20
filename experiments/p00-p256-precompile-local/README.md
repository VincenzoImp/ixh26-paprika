# p00 — P-256 signature precompile on the local Hardhat chain

- **Question:** can a contract on the demo chain verify a P-256 (secp256r1) signature natively,
  without a zero-knowledge proof and without a Solidity big-number library?
- **Feeds:** the hardened Paprika design (device signature checked by the contract) and the
  "proof of key misuse" slashing path.
- **Method:** `check.js` generates a P-256 key with Node's `crypto`, signs a random message, and
  calls address `0x…0100` with `hash ‖ r ‖ s ‖ x ‖ y` (160 bytes), once valid and once with the last
  byte of the public key changed, under three hardfork settings.
- **Run:** `npm install && npm run check` (Hardhat 2.29.2, Node 26.4).
- **Raw output:** [`output/2026-11-20-run.txt`](output/2026-11-20-run.txt)

## Result `[TEST]`

| Hardfork setting | Valid signature | Tampered key | `eth_estimateGas` (includes 21,000 base + calldata) |
|---|---|---|---|
| `osaka` | returns `1` | returns empty | 30,436 |
| `prague` | returns empty (no precompile) | empty | 27,370 |
| `cancun` | returns empty (no precompile) | empty | 23,549 |

Gas figures vary by a few tens of gas between runs because the key and message are random (zero bytes in calldata are cheaper).

With `hardfork: "osaka"` the local chain verifies P-256 signatures at address `0x100`. The
difference between the `osaka` estimate and the others on the same calldata is consistent with a
precompile cost of a few thousand gas.

## Limits

One key, one message, one run. Says nothing about which public networks expose the precompile;
that needs a source or a read-only call per network (the sibling repository's experiment `e01`
did the read-only call for the XRPL EVM sidechain).
