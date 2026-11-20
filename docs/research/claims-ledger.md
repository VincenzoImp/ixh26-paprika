# Claims ledger

The claims that the design, the comparison or the deck rely on. Tags are defined in `AGENTS.md`.
"Re-checked" means the main session opened the source or the raw output itself on 2026-11-20;
claims that only a sub-agent read are marked "(via sub-agent)" and count as `[SECONDARY]` until
re-checked. Claim IDs of the sibling repository (`C-0xx`) are not repeated here.

## Tested here

| ID | Claim | Tag | Evidence |
|---|---|---|---|
| C-P10 | Hardhat's in-process chain with `hardfork: "osaka"` verifies P-256 signatures at `0x100`: valid returns 1, tampered returns empty | `[TEST]` re-checked | `experiments/p00-*/output/` |
| C-P11 | On the proposal implemented literally: ban evasion costs about 49k gas and no deposit; random bytes are attested; a pending attestation is stolen; self-reporting drains the treasury (+0.785 ETH of 1 ETH at fee 0.001, oracle fee 0.01, reward 0.05); a device is banned over a photo it never attested | `[TEST]` re-checked (24 passing) | `experiments/p01-*/output/` |
| C-P12 | Hardened contract v2: 15 tests pass; register 127k gas, attest 86k; treasury drain, double reward, key squatting, attestation theft, retroactive erasure no longer succeed; synthetic content from a software key still does | `[TEST]` re-checked (15 passing) | `experiments/p03-*/output/2026-11-20-run.txt` |
| C-P13 | v2 flaws found by test: owner takes the reward of an open claim through a misuse proof; first-attester field can be front-run; unwatched honest device loses to an uncontested claim | `[TEST]` (via sub-agent; pass count re-checked) | same |
| C-P14 | UMA Optimistic Oracle V3, deployed code on a local fork of Sepolia: undisputed claim → ban; disputed and rejected → claimant −400 USDC, disputer +200; disputed and upheld → ban. `claimFake` about 346k gas | `[TEST]` (via sub-agent) | `experiments/p02-*/output/` |
| C-P15 | The P-256 precompile answers correctly on 12 public networks including XRPL EVM mainnet and testnet; UMA OOv3 code is present on all of them except XRPL EVM | `[TEST]` (via sub-agent, read-only probe) | `experiments/p05-*/output/` |
| C-P16 | Combined design on a local chain: zero-knowledge attestation under a bonded issuer's root (4.2M gas), revocation only by a proof of key misuse (198k gas) paying 0.25 ETH from the issuer's bond; forged, copied or capture-domain signatures are rejected | `[TEST]` re-checked (9 passing) | `experiments/p04-*/output/` |
| C-P17 | The sibling repository's on-chain verification (e05) reproduces on this machine: same verification key, `verify` true at about 4.08M gas, negative cases revert | `[TEST]` (via sub-agent) | `docs/reviews/origo-e05-reproduction-raw.txt` |

| C-P18 | Hardened contract, revisions v2 to v2.4: 121 tests pass across all suites; randomised stateful tests (5 seeds × 5,000 steps for v2.3 and v2.4) report no invariant violation | `[TEST]` re-checked (pass count) | `experiments/p03-*/output/2026-11-20-run-v2_4.txt` |
| C-P19 | Level 1: an owner that proves misuse of its own endorsed key loses in the four cases tested; an issuer that keeps key copies can slash its customers; anyone can become an issuer for the bond | `[TEST]` (via sub-agent) | same, `README.md` section v2.4 |
| C-P23 | Independent review of v2.3: the prior-existence rule lets a relayer slash an honest camera (+0.1247 ETH to the relayer); its proof can be copied; malformed and replayed signatures are all rejected; with no precompile the contract rejects everything | `[TEST]` (via sub-agent, 12 PoC tests) | `experiments/p08-*/output/`, `docs/reviews/paprika-v2_3-redteam.md` |

## Read at the source

| ID | Claim | Tag | Source and quote |
|---|---|---|---|
| C-P01 | UMA's rule for truth assertions: 1 only if true and publicly verifiable; 0 if it cannot be resolved | `[SOURCE]` re-checked | UMIP-170, https://github.com/UMAprotocol/UMIPs/blob/master/UMIPs/umip-170.md — "Return the `1` value if the claim is true and publicly verifiable." "If the claim cannot be unambiguously resolved, voters should return the `0` value." |
| C-P02 | Default liveness of an assertion is two hours; shorter is not recommended | `[SOURCE]` re-checked | https://docs.uma.xyz/developers/setting-custom-bond-and-liveness-parameters — "The default liveness window is two hours." |
| C-P03 | A disputed assertion is resolved by vote within 48–72 hours | `[SOURCE]` re-checked | https://docs.uma.xyz/developers/resolving-disputes — "the results returned within 48-72 hours (depending on when the dispute was raised during the DVM voting cycle)" |
| C-P04 | Pixel signs each image with a key used once | `[SOURCE]` re-checked | https://blog.google/security/pixel-android-trusted-images-c2pa-content-credentials/ — "Each key and certificate is used to sign exactly one image." |
| C-P05 | Android attestation keys leak and are revoked; newer provisioning allows per-device revocation | `[SOURCE]` re-checked | https://developer.android.com/privacy-and-security/security-key-attestation — "Discovery of attestation keys on social media or other public sites." "you can target the revocation to a single device" |
| C-P06 | Leakage-deterring public-key cryptography exists as a primitive (Kiayias, Tang; ACM CCS 2013; ePrint 2013/845) | `[SOURCE] (abstract)` re-checked | https://eprint.iacr.org/2013/845 |
| C-P07 | Equivocation penalised by loss of a deposit through "accountable assertions" (Ruffing, Kate, Schröder; ACM CCS 2015, pp. 219–230) | `[SOURCE] (abstract)` re-checked | https://doi.org/10.1145/2810103.2813686 |
| C-P08 | EIGEN whitepaper separates objective, intersubjective and non-attributable faults and excludes subjective ones | `[SOURCE]` (via sub-agent, quote re-opened by that agent) | `seed/01-*`, section 3 |
| C-P09 | Human accuracy at telling synthetic from real images: 48.2% on faces (Nightingale and Farid, PNAS 2022); about 62% overall (Microsoft study, arXiv:2507.18640) | `[SOURCE]` (via sub-agent) | `seed/03-*`, section 1 |

## Derived

| ID | Claim | Tag | Assumptions |
|---|---|---|---|
| C-P20 | An owner can always slash its own key first, so the effective penalty of a forger is `(1−α)S` | `[DERIVED]`, confirmed by `[TEST]` p03 | The owner holds the key; rewards are a share `α` of the stake |
| C-P21 | A stake `S` deters forgeries worth up to about `p(1−α)S`; at `S = 0.1` ETH and detection probability 1–10% that is a few to a few tens of dollars | `[DERIVED]` (via sub-agent model) | `experiments/p06-*`: ETH price, `p`, `q` are assumptions, not measurements |
| C-P22 | No one can flag, through the objective path, a key they cannot sign with | `[DERIVED]`, confirmed by `[TEST]` p03 and p04 | ECDSA P-256 is unforgeable; the contract computes every digest itself |

## Not verified, not to be used in deliverables

- Market capitalisation, staked supply and voter concentration of UMA (search snippets only).
- Details of the two 2025 Polymarket disputes beyond what reputable reporting states.
- Faucet limits of the XRPL EVM testnet.
- Everything listed under "could not verify" in the reports of `docs/research/`.
