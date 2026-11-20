# Binding a public key to a real capture device, and making Sybil devices costly: prior art for Paprika

Written 2026-11-20, 21:24-22:00 CET, for IXH26 Track 1. Research for the "Device registration" step of `proposal/PAPRIKA.md`.

**Tags.** `[SOURCE]`: primary source opened today (2026-11-20), with a short verbatim quote. `[SOURCE] (abstract)`: only the abstract was read. `[SECONDARY]`: blog, news, search snippet, or a seed file from `/home/tux/crypto/docs/research/seed/` that I did not re-open. `[MEMORY]`: my own recollection, not checked, kept apart. `[INFERENCE]`: my reasoning. All access dates are 2026-11-20. Two parts (DePIN in section 2, ZK/membership and photo provenance in sections 4-5) were collected by helper agents. I kept their tags, but I did not re-open every URL myself (see the claims table).

**The problem in one sentence.** In Paprika as written, `register(pubkey)` accepts any key, so a "device" is whatever holds a private key. A laptop can mint 10,000 of them for gas only. Banning one key then costs the attacker one new registration. Every option below changes either **what a registered key means** (cryptographic admission) or **what a ban costs** (economic admission), or both.

---

## 1. Hardware key attestation that already ships

### 1.1 Android Key Attestation / StrongBox / Remote Key Provisioning

- **What is attested.** The chain shows that a key lives in a TEE or StrongBox and has the listed properties (purpose, algorithm, auth requirements, the calling app's package and signing certificate in `attestationApplicationId`, and `RootOfTrust` with verified-boot state and bootloader lock). Google's wording [SOURCE] https://developer.android.com/privacy-and-security/security-key-attestation: if the root is Google's and nothing is revoked, "you know that: 1. Your key is in hardware that Google believes to be secure; and 2. It has the properties described in the attestation certificate."
- **Trust root.** A Google root. Before 2026 this was RSA-4096 (`SERIALNUMBER=f92009e853b6b045`). Since 1 February 2026 there is a new ECDSA P-384 root, "Key Attestation CA1" [SOURCE] same page: "The following root certificate will begin signing attestation certificate chains on February 1, 2026." (From the PEM shown there, I read the curve OID as secp384r1 and the signature as ecdsa-with-SHA384 `[INFERENCE]`.) Leaf keys can be P-256 (supported by the EIP-7951 precompile).
- **Revocation is Google's alone.** There is a JSON status list at `android.googleapis.com/attestation/status` [SOURCE]: "Attestation keys can be revoked for a number of reasons, including mishandling or suspected extraction by an attacker."
- **Known breaks.** Google itself documents leaked attestation keys [SOURCE] same page: "Leaks are discoverable in a number of ways, including: ... Discovery of attestation keys on social media or other public sites." Revocation "Typically ... will happen within several days of discovery, but may take longer". Leaked factory "keyboxes" used to pass Play Integrity "STRONG" on rooted phones are a known community practice [SECONDARY] (for example https://hacktricks.wiki/en/mobile-pentesting/android-app-pentesting/play-integrity-attestation-bypass.html; I did not read it in depth). Google's fix is RKP [SOURCE]: "For devices that launch with Android 16, the system supports only RKP ... RKP prevents key leakage because the system does not program keys directly onto the device ... If you must revoke a key, you can target the revocation to a single device."
- **Attestation is not capture.** A rooted or emulated device cannot produce a valid hardware chain unless a key has leaked. But an honest attested phone can still sign a photo of a screen, or frames injected into the camera pipeline. Attestation covers the key and the boot/app state. It does not cover the sensor data path `[INFERENCE]`, which matches seed 01 `[SECONDARY]`.
- **Ban-evasion primitive that already exists.** Play Integrity "device recall" [SOURCE] https://developer.android.com/google/play/integrity/device-recall: "You can reliably recall the custom data again later when your app is installed on the same device, even after the device is reset." It gives 3 bits per device, kept on Google's servers, and is in beta. This is exactly "ban survives a factory reset", but Google is the custodian.
- **On-chain verification.** I found no production Solidity verifier for Android Key Attestation chains (search, [SECONDARY]). The nearest analogue is Automata's on-chain Intel DCAP verifier, which checks a vendor X.509 attestation chain on the EVM [SOURCE] https://github.com/automata-network/automata-dcap-attestation: "Full quote verification executed directly onchain (EVM)". Gas: "~4M with RIP-7212 precompile, ~5M without". With ZK: "RiscZero Groth16: 522k gas", "SP1 Groth16: 493k gas". Android chains (ASN.1 parsing, RSA-4096 or P-384, an extension in a non-leaf certificate) are comparable in shape. So expect several million gas for direct verification, or about 0.5M gas plus under a minute of zkVM proving `[INFERENCE]`.

### 1.2 Google Pixel 10 C2PA (best-documented phone design)

[SOURCE] https://blog.google/security/pixel-android-trusted-images-c2pa-content-credentials/:
- "On Pixel, C2PA claim signing keys are generated and stored using Android StrongBox in the Titan M2 security chip."
- "Android Key Attestation allows Google C2PA CAs to verify that private keys were indeed created inside" secure hardware.
- **Important for Paprika:** "Each key and certificate is used to sign exactly one image." and "No two images ever share the same public key". Google states the goal that "no image or group of images can be related to one another."
- "Pixel developed an on-device, offline TSA."

**Consequence `[INFERENCE]`.** The best shipping design deliberately has **no long-lived device key**. You cannot "ban device B" by key, because the key changes on every shot. Only the CA (Google) can stop issuing to a device. Paprika's per-device ban model conflicts with the privacy choice of the leading vendor. Section 4 discusses fixes (nullifiers, DAA-style blocklisting).

### 1.3 Apple App Attest / DeviceCheck

- **What is attested.** A Secure Enclave key belongs to a genuine instance of your app on genuine Apple hardware. Server-side checks [SOURCE] https://developer.apple.com/tutorials/data/documentation/devicecheck/validating-apps-that-connect-to-your-server.json: "Verify the validity of the certificates using Apple's App Attest root certificate"; "Create the SHA256 hash of the public key in `credCert` with X9.62 uncompressed point format, and verify that it matches the key identifier"; "Verify that the authenticator data's `counter` field equals `0`."
- **Anti-Sybil hook** [SOURCE] same page: "The attestation statement also contains a receipt that you can use later in a server-to-server call to request a fraud assessment metric from Apple." and "You use the metric to examine the number of attested keys for a specific device." Apple can therefore tell you how many keys one device has minted, but only through an Apple server call. That works against off-chain Sybils but cannot be done by a contract.
- **Curve.** The credential key is P-256 and the App Attest root is P-384 `[MEMORY]`; the page I read does not state this.
- **On-chain.** `amiller/dsmack` claims "App Attest verification in Solidity and a Noir proof circuit" [SOURCE] https://github.com/amiller/dsmack (README; gas not stated). `a00012025/zk-app-attest` verifies App Attest inside RISC Zero and checks the proof on Sepolia [SECONDARY] (search summary). Both are hackathon or research grade.
- **Limits.** Jailbroken devices: Apple does not document a guarantee here. Treat it as unknown. A genuine app can still be fed a photo of a screen `[INFERENCE]`.

### 1.4 TPM 2.0 (EK / AK / IDevID / IAK) and DAA

- [SOURCE] TCG, "TPM 2.0 Keys for Device Identity and Attestation" v1.10 r9 (https://cdn.trustedcomputinggroup.org/production/TPM_2_0_Keys_for_Device_Identity_and_Attestation_v1_10r9_pub_cc6dfc7b0c.pdf; PDF text extracted locally): "the EK and EK Certificate resident in the TPM as installed by the TPM manufacturer"; "Both IAK and IDevID certificates are signed by the device OEM's CA." "An IDevID/IAK supports non-repudiation of device transactions while an LDevID/LAK can support privacy of a user."
- **Trust root.** Many TPM vendor CAs, with no single root. That is good for decentralisation and bad for verifier complexity. The classic flow needs a Privacy CA, or DAA.
- **DAA.** This is a group-signature-style anonymous attestation with blocklisting of extracted keys [SECONDARY] (seed 01/02, citing ePrint 2007/194: "our scheme provides a method to revoke a TPM even if the TPM private key is unknown"; I did not re-open it). This is the right *shape* for "anonymous but bannable" (see 4).
- **Camera relevance.** PCs and webcams: the USB/MIPI camera path is outside the PCR measurements `[INFERENCE]`.

### 1.5 Dedicated cameras with C2PA

| Maker | What holds the key | Who certifies | Source / tag |
|---|---|---|---|
| Leica (M11-P, SL3-S) | secure chipset | "securely issued by our partner, the Federal German Printing House" | [SOURCE] https://contentauthenticity.org/blog/content-credentials-arrives-in-the-leica-sl3-s-camera ("With the certificate and private key safely stored in the secure chipset") |
| Sony (Alpha 1 II, 9 III, 7S III, 7 IV ...) | "securely held in the hardware chipset"; adds 3D depth data against re-photographed screens; per-camera paid licence; Sony validation site | Sony | [SECONDARY] search summary of sony.net/cas and Sony press releases (https://authenticity.sony.net/camera/ did not render for me) |
| Nikon Z6 III | firmware 2.00 C2PA (Aug 2025), suspended | Nikon | see incident below |
| Canon, Samsung | Samsung has a root on the Trust List, see below; Canon: not checked | — | [SECONDARY] seed 01 |
| Google Pixel 10 | StrongBox / Titan M2 | Google C2PA CAs | [SOURCE] section 1.2 |

**C2PA Trust List (re-checked raw today).** I downloaded https://raw.githubusercontent.com/c2pa-org/conformance-public/main/trust-list/C2PA-TRUST-LIST.json; `ListIssueDateTime` is "2026-11-20T18:42:23Z". Entities found: Adobe, Aretiico, Castlabs, DigiCert, Encypher, Google ("Google C2PA Root CA G3", "Google C2PA Mobile A/B 1P ICA G3"), Huawei, Huanyu Trust, Irdeto, NETLOCK, RealReel, SSL.com, Samsung ("Samsung C2PA Root CA G1"), Snowball, Tauth, Trufo, TrustAsia, Verimago, Whole Earth Labs, Xiaomi, vivo. **No string "Leica", "Sony", "Nikon" or "Canon" appears** [SOURCE] (raw JSON, string search). One coalition maintains it as a JSON file in a GitHub repository. That makes it the natural "registry to decentralise" `[INFERENCE]`.

**Incidents.**
- **Nikon Z6 III (2025).** [SOURCE] https://hackerfactor.com/blog/index.php?/archives/1078-Vulnerability-Reporting.html: the researcher Horshack could get "any file signed by the camera"; Nikon "temporarily suspended" signing, then revoked its certificate; as of 19 Sept 2025 "Every Content Credentials service still says the pictures that are signed using a revoked certificate are still valid and trusted." The mechanism (multiple-exposure mode with a foreign RAW as the first frame) is reported by PetaPixel [SECONDARY]. Lesson: **the key was not extracted. A genuine key signed the wrong input, and revocation did not propagate.**
- **Nikon Image Authentication (2011).** [SOURCE] https://blog.elcomsoft.com/2011/04/nikon-image-authentication-system-compromised/: ElcomSoft could "extract the original signing key from a Nikon camera"; "an asymmetric RSA-1024 algorithm", "a SHA-1 hash function"; "All current models that include Image Authentication are affected." The same page: "Back in 2010, ElcomSoft performed a security analysis of Canon's proprietary image authentication system" and "a major security flaw exists in Canon's implementation."

**Summary of section 1 `[INFERENCE]`.** Every shipping attestation answers "is this key in genuine vendor hardware running genuine software?" None answers "did photons hit this sensor?". Every one roots in one vendor CA, and that vendor controls revocation. Verifying on-chain is possible but heavy: millions of gas directly, about 0.5M via a zkVM. The cheap pieces are the leaf P-256 signatures, at 6,900 gas through EIP-7951 ([SOURCE] https://eips.ethereum.org/EIPS/eip-7951: "a precompile at the address 0x100 ... with a gas cost of 6900 gas"; status "Final"; "This EIP supersedes RIP-7212").

---

## 2. Decentralised / crypto-economic device identity (DePIN)

Items marked `[SOURCE]*` were read by a helper agent through a summarising fetch tool. I re-opened only the ones marked `[SOURCE] (re-checked)`.

| System | How a device key is admitted | What stops fake/virtual devices | How devices are banned, who decides | Incidents |
|---|---|---|---|---|
| **Helium** (historical, HIP-19) | Makers approved by a committee: "Approval of new manufacturers is by the Manufacturing Compliance Committee (MCC)"; onboarding codes "exclusively issued by the Helium Foundation"; PoC hotspots "subject to the ECC608 chip or other security implementation requirement" [SOURCE] (re-checked) https://github.com/helium/HIP/blob/main/0019-third-party-manufacturers.md | Secure element plus maker gatekeeping plus maker stake [SOURCE]/[SECONDARY] | MCC "may vote to remove a manufacturer's key for cause", but "Removing any Hotspots associated with that manufacturer is not currently possible" [SOURCE] (re-checked). Hotspots: a denylist published on GitHub, applied by validators (HIP-40) [SECONDARY]; "There is no single way to determine whether a Hotspot is spoofing", "additions to the denylist are never automatic" [SOURCE]* HIP-66 | GPS/RF spoofing farms. Denylist reported at 41,544 hotspots (Feb 2022) while spoofing continued [SECONDARY] https://cassiopeia.hk/next-wave-of-fake-helium-hotspots-on-lantau-island/ ; a proposal to denylist 65,000+ more [SECONDARY] |
| **Helium** (today, IoT) | "Onboarding is permissionless and the same for every Hotspot"; "Add Hotspot: 50,000 Data Credits (USD $0.50)" [SOURCE] (re-checked) https://docs.helium.com/hotspot-makers | Fees exist "to prevent nuisance attacks, such as a bad actor spamming the network with large numbers of invalid Hotspots" [SOURCE]* HIP-80 | as above | — |
| **IoTeX ioID** | Device firmware signs a registration message; the owner submits it. "The DID's private key is stored in the device's secure element or flash" [SOURCE]* https://iotex.io/blog/ioid-on-chain-device-identity-for-verifiable-depins/ | Per-project registry ("Each DePIN will have its own unique ioID registry"); nothing protocol-level against virtual devices [SOURCE]* | No ban governance found | none found |
| **peaq** | Machine signs its own DID attributes, or a proxy does; P-256 keys "widely supported by secure elements, TPMs, passkeys"; "Bind each public key to the intended machine identity through an authenticated enrollment flow" [SOURCE]* https://docs.peaq.xyz/peaqchain/build/advanced-operations/p256-signature-verification | Left to the integrator | none found | none found |
| **Nodle Click** | No device registry; relies on the phone: "leverage the secure system built into your smartphone"; uploads Content Credentials to a chain and IPFS [SOURCE]* https://contentauthenticity.org/blog/community-story-click | C2PA at capture (phone attestation) | none found | none found; chain (Ethereum vs Nodle vs ZKsync) inconsistent across sources [SECONDARY] |
| **Numbers / Capture** | Creator's wallet key signs (EIP-191), not a device key [SOURCE]* https://docs.captureapp.xyz/capture-sdk/asset-signature-verification/ | No device attestation stated [SOURCE]* | none found | none found |
| **WeatherXM** | Station keys in a secure element / TrustZone, signed firmware [SECONDARY]; "Every data point produced by a station is cryptographically signed at the source" [SOURCE]* https://docs.weatherxm.com/introduction | Data Quality algorithm, Proof of Location | Rewards withheld, not a ban [SECONDARY] | none found |
| **Hivemapper Bee** | Only "approved Open Camera device[s]" [SOURCE]* https://docs.hivemapper.com/honey-token/map-data-structure-and-verification/ | Reputation ramp: "Each new Bee starts with low trust and gradually builds credibility" [SOURCE]* | Company ToS ("banishment from the Service") [SECONDARY] | none found |
| **DIMO** | Licensed manufacturer mints; "a manufacturer asks the secure element of the device to provision a key"; manufacturer license bond 100,000 $DIMO plus a per-device fee [SECONDARY] (docs 404/redirect) | Licence check in the AdLicenseValidator contract; user pairing signed by the device secure element [SECONDARY] | none found | none found |
| **World Orb** | "Private keys are generated on the secure element directly and never leave"; "The 'Orb Registry' refers to the set of active Orbs currently endorsed by World Foundation" [SOURCE]* https://whitepaper.world.org/advancing-decentralization | Signed captures, backend uniqueness; self-declared trust: "The World Foundation could sign malicious firmware" [SOURCE]* | Foundation removes Orbs / offboards operators [SECONDARY] | Operator multi-signup exploit (Forbes 2023), stolen operator credentials (TechCrunch 2023), World ID resale [SECONDARY] |

**What DePIN learned (relevant to Paprika) `[INFERENCE]` from the above.**
1. No network that resisted fakes accepted a bare key. Each chains the device key to an issuer: a maker key (Helium), a manufacturer licence plus a secure element (DIMO), or a vendor-certified SE in a foundation registry (World). peaq and ioID only verify signatures, and they leave admission to the integrator. That is exactly Paprika's current state.
2. When Helium went permissionless, the fallback was **fees** (HIP-80) plus **after-the-fact denylisting**. Detection was statistical and never automatic.
3. **Ban at the issuer level as well as the device level.** Helium could revoke a maker key but not remove that maker's existing devices. Paprika should support "revoke issuer X ⇒ all keys admitted under X are suspended" from day one.
4. Bans must be enforced where value or trust is consumed. Helium denylisted hotspots kept earning where the denylist was not applied [SECONDARY]. For Paprika: the *verifier* (the read path) must check the ban state at verification time, not only at registration. This also matches the Nikon/C2PA revocation-propagation failure (1.5).
5. Mature networks prefer **graduated trust** (Hivemapper reputation ramp, WeatherXM quality scores) over a binary ban.

---

## 3. Stake/bond-based Sybil resistance

### 3.1 Bonds and optimistic disputes (UMA, what Paprika already uses)

[SOURCE] https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work: "A proposer bond that is refundable if the proposal is deemed correct"; "Correct disputes are rewarded with a portion of the forfeited proposer bond"; "If no dispute is sent during the challenge period, the proposal is settled as correct"; DVM: "stakers commit secret votes during a 24-hour commit period" (then a 24h reveal); "Disputes resolve when a minimum 65% majority of staked UMA is cast in favor of a single outcome."

**Implication for Paprika `[INFERENCE]`.** In Paprika the claimant pays and the *device* loses nothing except its registration. A UMA-style flow only deters when the **accused party has a bond that is forfeited**. As written, the reward to the claimant must come from the treasury, which means honest fee payers subsidise bounty hunting.

### 3.2 Token-curated registries: why they largely failed

- [SOURCE] (abstract) Asgaonkar and Krishnamachari, "Token Curated Registries - A Game Theoretic Approach", arXiv:1809.01756: "there are conditions under which the outcome may not be entirely predictable", and "everyone voting for accept and everyone voting for reject could both be Nash Equilibria outcomes."
- adChain (2018). In its first week, curators challenged and rejected facebook.com and nytimes.com on taste, not on the objective listing criterion. Tabarrok argues that voters converge on what they expect others to vote, not on the truth, and that the mechanism needs a signal that is correct more than about 2/3 of the time [SECONDARY] (search summary of https://medium.com/@alex.tabarrok/when-can-token-curated-registries-actually-work-%C2%B9-2ad908653aaf; fetch returned 403). Goldin ("TCR 1.0") warned that parameters can be pushed into unworkable states and that a well-funded adversary can buy the vote [SECONDARY].
- **Lesson for Paprika `[INFERENCE]`.** "Is photo A fake?" is a *subjective* question of the adChain kind. Voters cannot observe the scene. A UMA vote on it is a Schelling game with no focal truth. Disputes must instead rest on **objectively checkable evidence** (section B).

### 3.3 Proof of personhood

- Kleros Proof of Humanity: "a Sybil-resistant registry of humans" that combines "social verification with video submission" [SOURCE] https://docs-legacy.kleros.io/products/proof-of-humanity (deposit amounts not shown on that page).
- World ID / Orb: see section 2.
- Use in Paprika: limit the number of *active device bonds per human* (for example k devices per World ID or PoH nullifier). Ban evasion then costs a new human identity, not a new key `[INFERENCE]`.

### 3.4 Who posts the bond, and when a ban deters (inequalities, `[INFERENCE]`)

Notation: `B` = bond forfeited on a successful dispute; `p` = probability that a given fake is caught and proven; `V` = value an attacker extracts per fake before the ban; `n` = fakes signed before the first successful dispute; `C_reg` = cost of a fresh admissible identity (new bond, plus new hardware if admission is hardware-rooted, plus new human if capped per person); `F` = fee per attestation.

1. **The ban deters the attacker** only if the expected loss per identity exceeds the gain: `n·V < C_reg + B` with `C_reg` paid again after each ban. With a bare key, `C_reg ≈ gas` and the ban is a nuisance.
2. **Challengers participate** only if `p·r − (1−p)·d_lost − cost_evidence > 0`, where `r` is the challenger's reward (paid from `B`, not from the treasury) and `d_lost` is the challenger's dispute bond. This needs `B` large relative to evidence-gathering costs.
3. **No griefing of honest devices**: the challenger's bond `d` must exceed the expected damage of a frivolous dispute to the honest device (downtime, legal costs), and the false-positive rate of the adjudicator must be low. That again requires objective evidence.
4. **Manufacturer bond per batch** `B_m` deters a manufacturer from minting fake device keys only if `B_m > (keys sold to attackers) × (price per fake key)`. Slashing the batch bond must also not be cheaper for the manufacturer than policing its own supply chain. A batch bond also internalises key-extraction risk: the maker that shipped extractable keys pays. This is how Helium charges makers (section 2).
5. **Per-device user bond**. This prices out the poor and casual users. It conflicts with "any device" and with the privacy of whistle-blowers. Making it small and refundable after a quiet period is the usual compromise.

---

## 4. Privacy-preserving membership and ZK attestation

Items marked `[SOURCE]*` were read by a helper agent. I personally re-checked EIP-7951 and the Automata DCAP gas figures.

**On-chain signature and chain cost (the floor).**
- EIP-7951 `P256VERIFY` at `0x100`, 6,900 gas, Final; it supersedes RIP-7212 (3,450 gas on L2s) [SOURCE] (re-checked) https://eips.ethereum.org/EIPS/eip-7951. Solidity fallback: daimo p256-verifier, "Verifying a signature costs about 330k gas" [SOURCE]* https://github.com/daimo-eth/p256-verifier. No precompile for P-384, which the Android 2026 root and (from memory) Apple's root use `[MEMORY]`.
- Full vendor attestation chain on-chain (Intel DCAP, the closest analogue): "~4M with RIP-7212 precompile, ~5M without"; zkVM wrappers 493k-569k gas, proving "<30s" to "<2 min" [SOURCE] (re-checked) https://github.com/automata-network/automata-dcap-attestation.

**Anonymous membership with nullifiers (Semaphore / RLN).**
- Semaphore: "a zero-knowledge protocol that allows you to cast a message ... as a provable group member without revealing your identity" [SOURCE]* https://docs.semaphore.pse.dev/. v4 uses "Circom Groth16, and snarkjs", Poseidon, LeanIMT, EdDSA on Baby Jubjub identities [SOURCE]* https://github.com/zkspecs/zkspecs/blob/main/specs/3-semaphore-v4/README.md. Public outputs include `nullifier` = H(secret, scope).
- Gas: the Groth16 verify floor is about 181k (pairing) [SECONDARY]; about 200-300k in total is commonly cited [SECONDARY]; the exact v4 figure **could not be verified**. LeanIMT insert about 143k-252k gas [SECONDARY]. Proof size: a Groth16 proof is 256 bytes `[MEMORY]`.
- RLN: "a zk-gadget/protocol that enables spam prevention mechanism for anonymous environments" [SOURCE]* https://rate-limiting-nullifier.github.io/rln-docs/. Over-use of the per-epoch quota reveals the secret, which can then be slashed. **This is the closest primitive to "anonymous device that loses its bond if it misbehaves."**
- **Fit for Paprika `[INFERENCE]`.** Admit the device commitment into a Merkle group (after attestation or bond). Each photo carries a proof "I am in the group" plus `nullifier = H(device_secret, epoch)` or a per-photo tag. Photos are unlinkable, the ban is enforced by blocklisting a revealed identity commitment, and a rate limit stops one key from flooding. Caveat: a Semaphore identity is a software EdDSA key on Baby Jubjub, which secure elements do not support. The proof must therefore *also* show a P-256 signature by the hardware key (see below), or the anonymity layer detaches from the hardware.

**Group signatures / DAA / EPID.**
- DAA: "This scheme was adopted by the Trusted Computing Group as the method for remote authentication of a hardware module" [SOURCE]* (abstract) https://eprint.iacr.org/2004/205. EPID adds revocation "even if the TPM private key is unknown" (signature-based revocation) [SECONDARY] (seed; abstract page title confirmed by the agent, https://eprint.iacr.org/2007/194).
- This is the textbook "anonymous but bannable hardware" primitive, but its pairing-based verification on the EVM is not off-the-shelf `[INFERENCE]`. BBS credentials (IETF draft-irtf-cfrg-bbs-signatures [SOURCE]*) need BLS12-381 (EIP-2537) on-chain `[MEMORY]`.

**Ring signatures over a manufacturer batch.** This is possible in principle: sign as "one of the N keys in batch b". Sizes grow with N, or require a ZK set-membership instead. Gajland-Janneck-Kiltz 2024: "for rings of size two, our ring signatures are only 1236 bytes" [SOURCE]* (abstract) https://eprint.iacr.org/2024/890 (post-quantum). For the EVM, Merkle membership in ZK is the practical form `[INFERENCE]`.

**ZK proofs of P-256 signatures and certificate chains.**
- circom-ecdsa-p256: 1,972,905 constraints, proving "26" (likely seconds) on an AMD 7700x [SOURCE]* https://github.com/privacy-scaling-explorations/circom-ecdsa-p256.
- Noir stdlib has a secp256r1 ECDSA verifier [SOURCE]* https://noir-lang.org/docs/noir/standard_library/cryptographic_primitives/ecdsa_sig_verification. A browser benchmark gives Noir UltraHonk P-256 verify in "2.06s" on an M1 and "~6s" on Android [SOURCE]* https://github.com/vladfdp/p256-proving-benchmark.
- Certificate chains in ZK already in production for *people*: zkPassport (Noir, DSC→CSCA chain) [SOURCE]* https://github.com/zkpassport/circuits; Self/OpenPassport (ICAO key list, zk-SNARKs, on-chain hub on Celo) [SOURCE]*/[SECONDARY]; Anon Aadhaar ("can also be verified on EVM-based blockchains") [SOURCE]*; zk-email (DKIM in ZK) [SOURCE]*. Warning from the zkPassport ecosystem: one admin key reportedly controls the verifier and the CSCA registry [SECONDARY]. **The registry of accepted roots is itself the trust point.**
- **Directly on-topic.** Apertrue `circuits`: a Noir/UltraHonk proof of "a valid C2PA signature from a trusted device", with the X.509 chain checked in-circuit (RSA-2048/4096, P-256/384) and the CA in a Merkle trust list. Early project (1 star), Aztec testnet [SOURCE]* https://github.com/Apertrue/circuits. App Attest in Solidity plus Noir: amiller/dsmack [SOURCE] (README) https://github.com/amiller/dsmack.
- **Practicality on EVM today `[INFERENCE]`.** Verifying one P-256 leaf signature: trivial (6.9k gas). Verifying a full Android/Apple/C2PA chain once at registration: feasible through a zkVM or Noir proof at about 0.3-0.6M gas, with seconds to minutes of proving. Doing it directly in Solidity costs several million gas because of RSA-4096 and P-384. Per-photo anonymous membership: about 0.2-0.3M gas per photo with Groth16, so batch it or keep it off-chain and anchor roots.

---

## 5. Photo-provenance-on-blockchain systems and papers

| System / paper | What it anchors | Trust root | Tag |
|---|---|---|---|
| Numbers Protocol / Capture | Nid (IPFS CID) "with the initial Commit and AssetTree on the blockchain" | Creator wallet key plus app | [SOURCE]* https://docs.numbersprotocol.io/introduction/numbers-protocol/defining-web3-assets/assetization-process/ |
| Nodle Click | C2PA manifest plus hash on a chain, file on IPFS; "Content is auto C2PA certified before you sign it" | Phone secure hardware / C2PA cert | [SOURCE]* https://www.nodle.com/click-app |
| Truepic Lens | On-device C2PA signing under Truepic's CA; no blockchain | Truepic CA plus platform attestation | [SECONDARY] |
| Starling Lab | "Integrity proofs from the capture step are registered on consensus-based ledgers" | Capture device / secure enclave plus multiple ledgers | [SOURCE]* https://starlinglab.org/starling-framework/ |
| ProofMode | OpenPGP signature per file; hash to "Opentimestamps" (Bitcoin); now C2PA | Per-install PGP key, plus Play Integrity / App Attest | [SOURCE]* https://proofmode.org/blog/three-layers |
| WITNESS "Ticks or it didn't happen" (2019) | Policy report; warns about blockchain-anchored fakes becoming "automatically trusted" | — | [SOURCE]* https://lab.witness.org/ticks-or-it-didnt-happen/ |
| PhotoProof (Naveh, Tromer, S&P 2016) | PCD proof that an image is a permissible transformation of a signed original | Signing camera | [SOURCE]* https://cs-people.bu.edu/tromer/photoproof/ |
| ZK-IMG (Kang et al. 2022) | ZK proofs of HD image transformations | Attested camera assumed | [SOURCE]* (abstract) https://arxiv.org/abs/2211.04775 |
| VIMz (2024) | Folding-based proofs of edits on images up to 8K | Signed original | [SOURCE]* (abstract) https://eprint.iacr.org/2024/1063 |
| VerITAS (Datta, Chen, Boneh 2024) | Proof of valid edits; "a 90 MB image in just over thirteen minutes" | C2PA-signing camera | [SOURCE]* (abstract) https://eprint.iacr.org/2024/1066 |
| zk-Cinema (2026) | ZK video provenance from a camera C2PA signature | C2PA camera | [SOURCE]* (abstract) https://eprint.iacr.org/2026/1598 |
| Verifiable Compression of Images (2026) | JPEG compression proofs "while proving validity of the C2PA signature on the original image" | C2PA signer | [SECONDARY] (seed VERIFICATION #23, abstract-level) ePrint 2026/1717 |
| **Birthmark Standard** (Ryan, 2026) | Sensor-derived keys from "non-uniformity correction (NUC) maps and PRNU patterns"; "anonymized authentication certificates proving sensor authenticity without exposing device identity"; records "stored on a consortium blockchain operated by journalism organizations" | Manufacturer/sensor plus journalism consortium | [SOURCE] (abstract, re-checked) https://arxiv.org/abs/2602.04933. **The closest academic analogue to Paprika.** Its trust model (consortium, anonymity set > 1,000) is the thing to compare against. |
| C2PA security analysis (Golaszewski, Krawetz, Sherman et al. 2026) | "the current C2PA specifications fail to achieve their claimed security goals" | — | [SOURCE]* (abstract) https://arxiv.org/abs/2604.24890 |

---

## A. Ranked shortlist: replacements for Paprika's registration step

All of these are `[INFERENCE]` built on the sourced facts above. The order runs from smallest change to strongest.

### A1. Bonded registration with an optional per-human cap (smallest change)
- **Mechanism.** `register(pubkey)` becomes `payable`. It locks a bond `B`, which the dispute slashes to the challenger. It is refundable after a quiet period when the device retires. Optionally, at most `k` active devices per proof of personhood (World ID / PoH nullifier).
- **What a registered key means.** "Someone has `B` at risk that this key behaves." It does **not** mean the key is in a camera.
- **Trust root and who can corrupt it.** Nobody gates entry. A rich attacker buys entries. The dispute oracle (UMA voters) decides bans.
- **Any device.** Yes, including devices with no secure hardware. It is the only option that is fully universal.
- **On-chain cost.** One storage write plus value transfer; trivial.
- **One-night prototype.** Yes, easily.
- **Unsolved.** No link to hardware. Deterrence holds only if `n·V < B + C_reg` (section 3.4). "Is photo A fake?" stays subjective, with the adChain/TCR failure mode.

### A2. Issuer-signed admission: a registry of bonded issuers (makers or attestation bridges)
- **Mechanism.** The contract keeps an `issuers` registry. Each issuer is a P-256 key plus a batch bond `B_m` plus a declared device class and assurance level. `register(pubkey, issuerId, sig_issuer(pubkey ‖ class ‖ batch))` is checked with `P256VERIFY` (6,900 gas, EIP-7951).
- **Who an issuer can be.** (a) A camera maker key, as in Leica/Sony/DIMO/Helium-HIP-19. (b) An "attestation bridge" service that verified an Android Key Attestation / App Attest chain off-chain and signs the result. (c) A low-assurance "software" issuer for devices without secure hardware, which needs a bigger registrant bond.
- **Revocation.** Revoking an issuer suspends all its keys after time `t`. This fixes Helium's "Removing any Hotspots associated with that manufacturer is not currently possible."
- **What a registered key means.** "Issuer X, who has `B_m` at stake, vouches that this key is in device class C."
- **Trust root.** The issuer set, plural and permissionless to join with a bond. A single issuer can corrupt only its own batch, and its own bond pays for that.
- **Any device.** Yes, via tiers. Verifiers see the assurance level, not just a yes/no.
- **One-night prototype.** Yes. Simulate two "makers" with P-256 keys (WebCrypto/openssl), plus one "Android bridge" that is honestly labelled as a mock. The demo shows that issuer revocation cascades.
- **Unsolved.** Issuers are trusted for their batch. A bridge is an oracle. It still does not attest the sensor data path (the Nikon Z6 III lesson: a genuine key can sign foreign input).

### A3. Verify the vendor attestation chain itself at registration (ZK or zkVM)
- **Mechanism.** Registration submits a proof that `pubkey` has a valid Android Key Attestation chain to a Google root (with StrongBox/TEE, a locked bootloader, the app's package ID, and a fresh challenge = the registrant's address), or an App Attest chain to Apple's root, or a C2PA device certificate chaining to an on-chain copy of the C2PA Trust List. The proof is verified by a Noir/Groth16 or zkVM verifier.
- **What a registered key means.** "Google/Apple/a C2PA CA asserts that this key is in genuine secure hardware running our capture app."
- **Trust root.** Google, Apple, or the C2PA CAs. Each is a single vendor and corruptible by it. Leaked keyboxes are a known bypass (Google documents leaks; RKP narrows it for Android 16+ devices). The list of accepted roots on-chain becomes a governance point (compare the zkPassport single admin key [SECONDARY]).
- **Any device.** No. Only modern Android with TEE/StrongBox, iOS, and C2PA cameras. Others fall back to A1/A2.
- **On-chain cost.** About 0.5M gas via zkVM (Automata DCAP analogue: 493k-569k), or several million gas directly. Proving takes seconds to minutes.
- **One-night prototype.** Not end to end. Feasible: capture a real Android attestation chain and verify it off-chain with Google's Kotlin library, then show a *mock* on-chain verifier interface. Present it honestly as "the interface plus a measured gas analogue".
- **Unsolved.** Pixel uses per-image keys ("Each key and certificate is used to sign exactly one image"), so there is no stable device key to ban. Attestation does not cover the sensor path. Revocation depends on vendor CRLs.

### A4. Anonymous, rate-limited, bannable membership (strongest)
- **Mechanism.** Admission by A2 or A3 inserts an identity commitment into a Semaphore/RLN Merkle group. Each attestation carries a ZK proof of membership plus `nullifier = H(secret, epoch)` and an RLN share.
  - Exceeding the rate reveals the secret, and the bond is slashed automatically.
  - A dispute that wins can blocklist the commitment. This needs either an opening authority, or making misbehaviour self-revealing (RLN, or equivocation: two different photos for the same `(device, counter)`).
- **What a registered key means.** "An admitted, bonded, non-banned device made this photo." Photos are unlinkable, matching Pixel's privacy choice and the WPF/C2PA privacy criticism.
- **Trust root.** As in A2/A3, plus the circuit and trusted setup (Groth16).
- **Any device.** As in A2.
- **On-chain cost.** About 0.2-0.3M gas per proof (Groth16 [SECONDARY]); batch or anchor off-chain.
- **One-night prototype.** Partially. Semaphore v4 contracts and JS exist, so membership plus nullifier can be demonstrated. Binding the Semaphore identity to the *hardware* P-256 key in-circuit (about 2-26 s of proving, from the benchmarks above) is not a one-night task.
- **Unsolved.** Hardware-to-identity binding in ZK. Banning without linkability needs self-revealing misbehaviour. The trusted setup.

**Recommendation for tomorrow `[INFERENCE]`.** Implement **A2 with A1 as its "software tier"**. Present A3 as the documented path for the "bridge" issuer, and A4 as future work. This answers "generalises to any device" (tiers) and "no single point of failure" (many bonded issuers, none required). It is also demo-able in one night.

---

## B. Is the hybrid (cryptographic admission + bonded decentralised revocation) coherent?

**Verdict: yes. It is the pattern DePIN converged on**: Helium (maker keys + fees + denylist), DIMO (licensed manufacturers + bond + SE keys), World (vendor-certified SEs + foundation registry). Paprika can improve on them by making revocation bonded and on-chain instead of foundation-run. The two layers answer different questions. Admission answers "can a key enter cheaply?", and only cryptography plus issuer cost make Sybils expensive. Revocation answers "who leaves, and who pays?", and there economics fits, because no one can cryptographically detect a lying camera.

**Who posts the bond.**
- **Issuer, per batch (primary).** It internalises the dominant real failure modes: firmware that signs foreign input (Nikon Z6 III, 2025), extractable keys (Nikon 2011, Canon 2010), leaked attestation keys (Android). The party that can fix them pays. It scales to millions of devices without per-user capital.
- **Registrant, per device (small, refundable).** It prices spam, covers the software tier, and gives the challenger something to win for single-device misbehaviour. It must stay small, or "any device / any user" fails.
- **Challenger (dispute bond).** It deters griefing; this is the UMA pattern.
- Rewards come from the slashed bond, **not from the fee treasury**.

**Objective evidence a dispute can rest on.** Prefer evidence that the contract checks itself, so there is no vote.
1. **Key compromise proof.** Anyone who can sign a fresh challenge with a registered device key that should be non-extractable proves compromise. The contract checks the signature, then slashes and bans automatically.
2. **Equivocation.** Two different `SHA(photo)` values signed for the same `(device, monotonic counter)`. This needs a counter in the signed payload; App Attest already has a counter.
3. **Replay.** A "new" attestation whose hash, or whose signed C2PA ingredient, is already on-chain under an earlier timestamp or another device.
4. **Issuer over-issuance.** More keys than the declared batch size, or the same hardware serial / attestation challenge used twice.
5. **External revocation.** The attestation certificate appears in Google's status list with `KEY_COMPROMISE`. This needs an oracle relay, but the fact is objective.
6. **Reproducible exploit (semi-objective).** A recipe that makes a purchased unit of that model sign arbitrary input, as in Nikon Z6 III. This goes to the UMA vote, but against the **issuer's** bond, and leads to a model or batch suspension.
7. **"Photo A is fake" (subjective).** Keep it only as a last resort with higher bonds. Its outcome should be a *flag* or a downgrade, not a ban. This avoids the adChain Schelling failure and Paprika's own "retroactive censorship" requirement.

**Two design rules from the evidence.**
- Bans have an **effective-from time**. Photos attested before the ban keep their record, annotated, so there is no retroactive censorship.
- Verifiers check ban state **at read time**. C2PA validators kept showing revoked Nikon images as trusted, and Helium hotspots kept earning where the denylist was not shipped.

---

## Unverified recollections (kept apart, `[MEMORY]`)
- The App Attest credential key is P-256 and the Apple App Attestation root is P-384.
- A Groth16 proof (BN254) is 256 bytes, verified with a pairing check of about 200k gas or more.
- BBS/BLS12-381 on-chain verification needs EIP-2537 precompiles (activated with Pectra).
- RSA-4096 signature verification on the EVM is feasible through the MODEXP precompile at moderate cost, but ASN.1/X.509 parsing in Solidity dominates the cost.

## Could not verify
- Exact Semaphore v4 verification gas; Noir P-256 gate count; constraint counts for zk-email / Anon Aadhaar / zkPassport.
- Primary Sony documentation (page did not render); Canon C2PA status; Samsung capture-time signing.
- DIMO docs (404/redirect, all [SECONDARY]); HIP-40 (HTTP 503).
- Spoofing incidents for IoTeX, peaq, Nodle, Numbers, WeatherXM, Hivemapper, DIMO: none found.
- An on-chain verifier for Android Key Attestation: none found. For Apple: only research or hackathon repos.
- Which L1 fork activated EIP-7951 (seed says Fusaka, 3 Dec 2025; not rechecked).
- Whether App Attest gives any guarantee on jailbroken devices.

---

## Claims table

`*` = read by a helper agent through a summarising fetch tool, not re-opened by me.

| # | Claim | Source | Tag |
|---|---|---|---|
| 1 | Android attestation proves the key "is in hardware that Google believes to be secure" | developer.android.com/privacy-and-security/security-key-attestation | [SOURCE] |
| 2 | New Google ECDSA attestation root signs from 1 Feb 2026 | same | [SOURCE] |
| 3 | Google documents leaked attestation keys found "on social media or other public sites"; revocation within "several days" | same | [SOURCE] |
| 4 | RKP-only for Android 16 launch devices; revocation targetable "to a single device" | same | [SOURCE] |
| 5 | Play Integrity device recall: 3 bits per device that survive reset; beta | developer.android.com/google/play/integrity/device-recall | [SOURCE] |
| 6 | Pixel: StrongBox/Titan M2 keys; one key per image; on-device TSA | blog.google/security/pixel-android-trusted-images-c2pa-content-credentials/ | [SOURCE] |
| 7 | App Attest: Apple root, counter = 0, receipt → fraud metric counting attested keys per device | developer.apple.com (DeviceCheck JSON) | [SOURCE] |
| 8 | TPM: EK installed by TPM maker; IAK/IDevID signed by OEM CA | TCG Keys for Device Identity v1.10 r9 PDF | [SOURCE] |
| 9 | Leica: key in secure chipset; certificates from the Federal German Printing House | contentauthenticity.org Leica SL3-S post | [SOURCE] |
| 10 | Sony: keys "securely held in the hardware chipset"; 3D depth data | sony.net/cas (via search) | [SECONDARY] |
| 11 | C2PA Trust List (issued 2026-11-20T18:42Z): no Leica/Sony/Nikon/Canon entries; Google and Samsung roots present | raw GitHub JSON | [SOURCE] |
| 12 | Nikon Z6 III signed arbitrary files; certificate revoked; validators still showed revoked images as trusted (19 Sept 2025) | hackerfactor.com 1078 | [SOURCE] |
| 13 | Nikon 2011: RSA-1024 key extracted; Canon flaw 2010 | blog.elcomsoft.com 2011/04 | [SOURCE] |
| 14 | EIP-7951 P256VERIFY at 0x100, 6,900 gas, Final, supersedes RIP-7212 (3,450) | eips.ethereum.org/EIPS/eip-7951 | [SOURCE] |
| 15 | On-chain DCAP verification ~4-5M gas; zkVM 493k-569k gas | github.com/automata-network/automata-dcap-attestation | [SOURCE] |
| 16 | No production on-chain Android attestation verifier found | web search | [SECONDARY] (negative result) |
| 17 | dsmack: App Attest verification in Solidity plus Noir | github.com/amiller/dsmack | [SOURCE] (README) |
| 18 | UMA bonds, challenge period, 24h+24h vote, 65% threshold | docs.uma.xyz | [SOURCE] |
| 19 | TCR voting has multiple equilibria (accept-all / reject-all) | arXiv 1809.01756 | [SOURCE] (abstract) |
| 20 | adChain rejected facebook/nytimes; Tabarrok 2/3 condition | Tabarrok Medium (403) | [SECONDARY] |
| 21 | Helium HIP-19: MCC approves makers; Foundation issues keys; ECC608; hotspots of a removed maker cannot be removed | github.com/helium/HIP 0019 | [SOURCE] |
| 22 | Helium today: permissionless onboarding, $0.50 + $0.50 in DC | docs.helium.com/hotspot-makers | [SOURCE] |
| 23 | Helium denylist "never automatic"; HIP-80 fee against invalid-hotspot spam | HIP-66, HIP-80 | [SOURCE]* |
| 24 | Helium denylist 41,544 by Feb 2022, spoofing continued | cassiopeia.hk | [SECONDARY] |
| 25 | World Orb: SE-generated keys; Foundation-endorsed Orb registry; "could sign malicious firmware" | whitepaper.world.org | [SOURCE]* |
| 26 | World operator/sign-up incidents 2022-23 | Forbes, TechCrunch, BiometricUpdate | [SECONDARY] |
| 27 | DIMO: manufacturer licence, 100,000 $DIMO bond, SE-provisioned keys | docs.dimo.org / dimo.zone | [SECONDARY] |
| 28 | IoTeX ioID / peaq: signature checks, admission left to the integrator | docs.iotex.io, docs.peaq.xyz | [SOURCE]* |
| 29 | Hivemapper: approved devices only; new Bees start with low trust | docs.hivemapper.com | [SOURCE]* |
| 30 | WeatherXM: data signed at source; Data Quality algorithm | docs.weatherxm.com | [SOURCE]* |
| 31 | Nodle Click: relies on the phone's secure system; C2PA plus chain plus IPFS | contentauthenticity.org community-story-click | [SOURCE]* |
| 32 | Numbers/Capture signs with the creator wallet, no device attestation | docs.captureapp.xyz | [SOURCE]* |
| 33 | Semaphore v4 = Circom Groth16, Poseidon, LeanIMT, Baby Jubjub EdDSA | zkspecs Semaphore v4 | [SOURCE]* |
| 34 | Semaphore verify gas ~200-300k | third-party / code comments | [SECONDARY] |
| 35 | RLN = anonymous spam prevention | rate-limiting-nullifier.github.io | [SOURCE]* |
| 36 | DAA adopted by TCG | ePrint 2004/205 | [SOURCE]* (abstract) |
| 37 | circom-ecdsa-p256: 1,972,905 constraints, ~26 s proving | PSE repo | [SOURCE]* |
| 38 | Noir P-256 verify ~2 s on M1, ~6 s on Android (browser) | vladfdp/p256-proving-benchmark | [SOURCE]* |
| 39 | daimo P-256 Solidity verify ~330k gas | daimo-eth/p256-verifier | [SOURCE]* |
| 40 | Apertrue: Noir proof of a C2PA signature from a trusted device, X.509 chain in-circuit | github.com/Apertrue/circuits | [SOURCE]* |
| 41 | Birthmark Standard: sensor-derived keys, anonymized certificates, journalism consortium blockchain | arXiv 2602.04933 | [SOURCE] (abstract) |
| 42 | VerITAS: 90 MB image edit proof in ~13 min | ePrint 2024/1066 | [SOURCE]* (abstract) |
| 43 | C2PA "fail to achieve their claimed security goals" | arXiv 2604.24890 | [SOURCE]* (abstract) |
| 44 | Proof of Humanity: Sybil-resistant registry via social verification plus video | docs-legacy.kleros.io | [SOURCE] |
