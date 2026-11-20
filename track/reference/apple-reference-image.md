# Apple Reference Image — technical notes on the official reference

- **Source (primary):** Apple Security Research blog, *"Apple Reference Image: A New Approach for
  Verified Photography"*, by Apple Security Engineering and Architecture (SEAR) and Camera & Photos,
  dated **September 15, 2026**. <https://security.apple.com/blog/apple-reference-image>
- **Accessed:** 2026-11-20. Raw HTML and extracted text are cached locally (not versioned, Apple's
  copyright) in `references/cache/apple-reference-image.{html,txt}`; re-create with
  `scripts/fetch_sources.sh`. SHA-256 of the cached HTML:
  `8696f84b29f0002d812e933c0e2c59a0aad8dffb8fa363e0381296efa74d8a37`.
- **Status of these notes:** `[CONFIRMED]` — every statement below was read directly in the cached
  text by the author of M1 (Claude, see `AI_DISCLOSURE.md`). Line numbers `L…` refer to
  `references/cache/apple-reference-image.txt`. **Read the cached original before relying on any
  detail**; this is a digest.
- **Caveat:** this is a vendor blog post, not a specification. It describes intent and architecture;
  it omits formats, exact message encodings and proofs. Claims such as "no other commercially
  available system meets these requirements" are Apple's own.

## 1. What it is

An opt-in camera mode ("Reference mode") debuting on the **main camera sensor of iPhone 18 Pro and
iPhone 18 Pro Max** (L15). It yields a "securely timestamped reference image that accurately
reflects what was captured by the iPhone's camera sensor" (L15).

## 2. Apple's three stated requirements (L21–27)

| Requirement | Apple's definition (paraphrased closely) |
|---|---|
| **Semantic authenticity** | The reference image faithfully shows what the sensor captured; transformations from raw pixels to the viewable image must be **publicly verifiable**. |
| **Resilience to compromise** | Authenticity must survive sensor tampering, common cryptographic attacks, and software jailbreak of the device; fraudulent images, if any, **can be revoked**. |
| **Privacy preservation** | An outside observer **cannot determine whether any pair of reference images were taken by the same device**; image contents are not exposed to Apple or anyone else. |

These three are a ready-made yardstick: a decentralised protocol should say, for each, whether it
matches, exceeds or gives up on Apple's level, and why.

## 3. Apple's critique of prior art (L11, L33, L39, L61)

- C2PA-based approaches "attach provenance metadata *after* capture" and certify edit history from
  then on; this is "vulnerable to compromise at any point in the editing chain" and can tie the
  image to a public identity (device or person).
- Signing only at the end of the software pipeline is vulnerable to pixel injection on the sensor
  transport and to OS compromise. Signing only raw sensor values does not give a viewable image.
- OS-provided timestamps "plainly fall short".
- Other systems require a photographer/institution credential, which endangers anonymity.

## 4. Protocol, step by step

### 4.1 Set-up at manufacturing (L73–77)

1. The **sensor** generates its own **ECDSA P-256** key pair on first initialisation and never
   releases the private key. The factory recording station reads the public key, signs it with a
   **factory CA**, and records key and certificate in the device's **hardware manifest**.
2. The **Secure Enclave Processor (SEP)** generates a key certified by Apple's **Basic Attestation
   Authority (BAA)** under a **separate CA**.
3. A **third CA** signs the **device manifest**, binding the sensor key and the BAA-attested SEP key
   as belonging to the same iPhone.
4. In use: **APNs** (push-notification heartbeat) delivers an up-to-date **RFC 3161 timestamp
   token**, "signed with ECDSA P-256 over SHA-256"; the device keeps the most recent one. Globally
   "on average every 15 minutes" (L39).

### 4.2 Capture (L81–87)

1. User switches to Reference mode → the sensor **reboots** into a secure reference mode that
   accepts **one input** from the OS: a **SHA-256 digest** to embed at a fixed location in the
   frame's metadata. The digest is computed from **the most recent secure timestamp, the device
   manifest, and the device's secure boot manifest**.
2. The sensor digitises the frame; **frame + embedded digest are signed together inside the sensor**
   with the sensor private key → (σₛ in the deck's notation).
3. OS-derived metadata (digital zoom factor, exposure, lens parameters) is collected. A
   **commitment to the sensor signature together with this metadata** is signed by the **SEP** with
   the BAA-attested key → (σₑ).
4. A **SHA-256 commitment to the SEP signature** is sent to the timestamp service, which returns a
   signed token = **upper bound**. If offline, a background process retries later and inserts the
   token when it succeeds ("the tightest interval the circumstances allow").
5. Pixels, both signatures, timestamps, metadata, device manifest and secure boot manifest are
   stored as the **secure digital negative in DNG format**. It can stay on device indefinitely and
   can be **shared undeveloped**.

### 4.3 Development in Private Cloud Compute (L91–99)

1. Device uploads the negative to **PCC**. PCC recomputes the embedded digest; verifies the sensor
   signature and its chain to the **sensor CA**; verifies the SEP signature and chain to the **BAA
   CA**; verifies the device-manifest signature and chain to the **manifest CA**; confirms sensor
   and SEP **belong to the same device**.
2. **Timestamp fallbacks:** if the lower bound fails verification PCC substitutes **March 31, 2026**
   ("the feature didn't exist before that date"); if the upper bound is missing/invalid PCC
   substitutes **the current development time in PCC**.
3. **Confidence score:** "a neural network with **hidden weights**" checks that the image "has the
   physical characteristics expected of raw output from our sensors".
4. PCC develops the negative (demosaicing, tone mapping, related corrections), compresses to
   **JPEG**, hashes it. The hash is the value to be signed **and** supplies the bits of the
   **photo GUID**.
5. PCC sends **photo GUID, raw hash, confidence score, sensor ID** to a **companion service**, which
   records them, updates the sensor's **running confidence score**, and checks the sensor is not
   revoked.
6. PCC submits the commitment to **Apple's signing service**, which signs with a composite
   **`MLDSA87-RSA-3072-PSS-SHA512`** scheme. The signature is embedded in the JPEG.
7. The negative is then moved to the deleted-photos folder (purged after 30 days unless recovered).

### 4.4 Display / verification (L57, L63, L101)

- The client verifies the final JPEG signature and checks the **photo GUID against the current
  revocation list** before showing the image.
- "Apple devices fetch updated revocation lists on a regular cadence"; final checks use **on-device
  lists**, so the viewer never reveals which photo it is looking at.
- Revocation granularity: **individual photos** and **all photos from a specific sensor**. If a
  low-scoring sensor is revoked, PCC stops signing its images.

### 4.5 Privacy mechanisms (L61–65)

- **No photographer credential**; the final image is signed by **Apple's signing service**, not by
  a device key → no public link between two photos from the same sensor.
- PCC: "not even Apple can access image data". PCC builds are recorded in an **append-only
  transparency log**, binaries are publicly inspectable, devices only talk to nodes that attest to
  a logged build (L43).
- The revocation service keeps a **private** record of photo GUID ↔ sensor.
- Timestamp requests go over **Oblivious HTTP** (the service does not learn device IPs).
  Revocation/signing calls originate from within PCC.

### 4.6 Post-quantum rationale (L55)

Reference images are published assets that must stay verifiable "in perpetuity", hence a composite
signature (RSA-3072 + ML-DSA-87) on the *final* image. Note that the **sensor, SEP and timestamp
signatures are classical ECDSA P-256**; only the final published signature is post-quantum.

## 5. Where trust is concentrated (analysis by the M1 author — `[INFERENCE]`, to be attacked)

| Function | Who holds it in Apple's design | Evidence |
|---|---|---|
| Admitting a sensor as genuine | Factory CA (Apple) | L73 |
| Binding sensor ↔ device | Manifest CA (Apple) | L75 |
| Attesting the SEP | BAA CA (Apple) | L75 |
| Time (both bounds) | Apple timestamp service (RFC 3161) via APNs / OHTTP | L39, L77, L85 |
| Verifying the capture evidence | PCC (Apple-operated, publicly auditable builds) | L91 |
| Developing raw → JPEG | PCC | L95 |
| Plausibility check of the raw | PCC neural network, **hidden weights** (not publicly verifiable) | L95 |
| Final signature that viewers check | Apple signing service (single key holder) | L97 |
| Revocation decisions and lists | Apple companion/revocation service (private records) | L57, L63, L97 |
| Verification by viewers | Apple clients with Apple-distributed lists | L101 |

Two properties worth keeping in mind when decentralising:

- The **central signing service is also what provides unlinkability**: viewers see only Apple's
  signature, never a device key. Removing the central signer without thought **breaks privacy**
  (per-device signatures are linkable). Any decentralised replacement must restore unlinkability by
  other means.
- The **device-side evidence (the DNG) is self-contained and shareable undeveloped** (L87). The
  chain sensor → SEP → manifest is verifiable by anyone who trusts the three CA roots; the
  centralisation is in *who holds the roots, the clock, the revocation and the final signature*,
  not in the capture step itself.

## 6. Deck ↔ blog differences

| Topic | Deck (`TRACK.md`) | Apple blog | Consequence |
|---|---|---|---|
| Privacy / unlinkability | Not mentioned | One of three core requirements | A design that ignores it is weaker than the "centralised" baseline on a property Apple advertises. |
| Revocation | "Central Certificate Revocation Lists… if the central server is unreachable, attestation fails" (slide 8) | Lists of photo GUIDs and sensors; fetched periodically; checked on-device | The deck simplifies. Offline *viewing* works with a stale list; *development/signing* needs Apple online. |
| "A compromised CA invalidates millions of devices" (slide 10) | Stated | Not stated by Apple | Organisers' argument, plausible for the factory/manifest CAs. |
| Timestamp fallbacks | Not mentioned | Lower bound → 2026-03-31; upper bound → PCC time | Offline capture is supported with degraded time bounds. |
| Timestamp transport | "regularly delivered" | APNs heartbeat, ~15 min average; OHTTP for requests | Detail for the freshness design. |
| Confidence score | "authenticity score of sensor and pipeline integrity" | Neural network with **hidden weights**; running per-sensor score drives revocation | A security-through-obscurity component; hard to decentralise transparently. |
| PCC verifiability | "executes verifiable operations on confidential data" | Transparency log of builds + attestation | The "verifiable" part rests on TEE attestation + auditable binaries. |
| Final signature | "ML-DSA-87 + RSA-3072" | `MLDSA87-RSA-3072-PSS-SHA512`, by a separate signing service | Consistent. |
| Photo GUID | Not mentioned | Derived from the JPEG hash; key for revocation | Detail. |
| Device scope | "the mobile device" | Only iPhone 18 Pro / Pro Max main sensor | Shows how narrow the hardware base is today. |
| Undeveloped negatives | Not mentioned | DNG can be shared undeveloped | Third parties could verify/develop negatives themselves. |
| Capture "Mode I/II" | Kickers of slides 6–7 | No such terminology | Probably pagination. |

## 7. Things the blog does not say (do not assume them)

- No data formats, certificate profiles, or the exact byte layout of what is signed.
- No description of how the sensor proves it captured *light from a real scene* rather than a
  re-photographed screen (the "analog hole"); the only related mechanism mentioned is the
  hidden-weights confidence score.
- No statement about video, other lenses, third-party verification tools, or openness of the
  verification keys/roots to non-Apple verifiers.
- No formal security model or proofs.
