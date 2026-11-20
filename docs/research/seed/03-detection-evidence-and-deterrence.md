# 03 — Detection, objective evidence, and deterrence (p and G)

**Date:** 2026-11-20. **Scope:** evidence base for the two empirical quantities in
`spec/PROTOCOL.md` §8.5 (`p · S > G`): **p** = probability that a fake is caught *with evidence a
third party can check*, **G** = what one accepted fake is worth to the attacker.

**Tags.** `[SOURCE]` = opened today (URL, 2026-11-20, short verbatim quote). `[SOURCE] (abstract)` =
only the abstract/landing page was read. `[SECONDARY]` = news, blogs, search snippets.
`[MEMORY]` = unverified recollection, kept separate. `[INFERENCE]` = analysis by the author of
this note (Claude), to be attacked. Quotes are kept short; where a full-text quote was extracted
with `pdftotext` from the PDF, it is marked "(full text)".

---

## 1. Can anyone tell? (pixel-based detection)

### 1a. Human accuracy

| Study | Status | Headline number (from the paper) |
|---|---|---|
| Nightingale & Farid, "AI-synthesized faces are indistinguishable from real faces and more trustworthy", *PNAS* 119(8) e2120481119, 2022 | `[SOURCE]` (full text via Europe PMC XML, PMC8872790) | "The average accuracy is 48.2% (95% CI [47.1%, 49.2%]), close to chance performance of 50%" (exp. 1). With training/feedback: "The average accuracy improved slightly to 59.0%". Synthetic faces rated "7.7% more trustworthy". StyleGAN2 faces. |
| Frank et al., "A Representative Study on Human Detection of Artificially Generated Media Across Countries", IEEE S&P 2024, arXiv:2312.05976 | `[SOURCE]` (full text, arxiv.org/pdf/2312.05976) | 3,002 participants, USA/Germany/China: "the average detection accuracy of participants is below 50% for images and never exceeds 60% for the other media types"; participants "performed even worse than random guessing for images." |
| Microsoft AI for Good Lab, "How good are humans at detecting AI-generated images?", arXiv:2507.18640 (2025) | `[SOURCE]` (full text, arxiv.org/pdf/2507.18640) | "approximately 287,000 image evaluations by over 12,500 global participants … overall success rate of only 62%"; on AI images specifically 63%. Authors: "It is fair to assume that our results likely overestimate nowadays people's ability". Portraits better than landscapes (abstract: "struggled significantly with natural and urban landscapes"). Generators: DALL-E 3, SD3, SDXL, Midjourney v6 etc. |

**Takeaway.** A lay juror judging pixels is at or near coin-flip; the best case (trained, large
quiz) is ~60%, and the studies use 2022–2024 generators.

### 1b. Automated detectors: lab vs wild

- **AIGIBench**, Li et al., "Is Artificial Intelligence Generated Image Detection a Solved
  Problem?", arXiv:2505.12335 — `[SOURCE]` (full text): detectors "despite their high reported
  accuracy in controlled settings … suffer significant performance drops on real-world" data; under
  perturbations "their F.Acc. [fake-image accuracy] drops significantly (often below 35%)" while
  real-image accuracy stays ≥90%; "CNNDetection achieves a high R.Acc. of 99.0% on clean images, but
  its F.Acc. drops sharply to 0.8% under JPEG compression" (JPEG QF 50).
- **NTIRE 2026 Challenge on Robust AI-Generated Image Detection in the Wild**, arXiv:2604.11487 —
  `[SOURCE] (abstract)`: 108,750 real + 185,750 generated images from 42 generators, 36
  transformations (crop, resize, compression, blur); 20 valid final teams; scored by ROC AUC.
  Winning scores not read.
- **AI-GenBench** (arXiv:2504.20865) trains on older generators and tests on newer ones (36
  generators) — `[SECONDARY]` (search snippet). **DailyBench** (arXiv:2607.24016): "JPEG
  compression suppresses high-frequency traces" — `[SECONDARY]`.
- Detector false-positive rate matters for the dispute path: a detector that labels real photos
  fake would let griefers slash honest keys. `[INFERENCE]`

**Takeaway.** No published detector is reliable on unseen generators after ordinary platform
re-encoding; adversarial post-processing makes it worse. And any detector with hidden weights (cf.
Apple's confidence score, §3) cannot be a public, checkable standard of evidence.

### 1c. Watermarks (SynthID and others)

- **What they prove.** A detected watermark proves (probabilistically) that a cooperating generator
  produced the image. Absence proves nothing (open-source models do not watermark). SynthID claims
  robustness "to stand up to modifications like cropping, adding filters, changing frame rates, or
  lossy compression" — `[SOURCE]` https://deepmind.google/models/synthid/. Detection is via
  Google's portal/Gemini, i.e. a vendor oracle, not a public algorithm. `[SOURCE]` same page.
- **Removal.** UnMarker, Kassis & Hengartner, IEEE S&P 2025, arXiv:2405.08363 — `[SECONDARY]`
  (search; abstract not opened): "the first universally-effective data-free, black-box, and
  query-free attack against defensive watermarking". IEEE Spectrum, 7 Aug 2025 — `[SOURCE]`
  https://spectrum.ieee.org/ai-watermark-remover: Kassis claimed it "successfully removed 79 percent
  of watermarks" on SynthID images; update 15 Aug 2025: Google DeepMind said internal testing found
  the rate "significantly lower". Disputed number — cite both.
- **Forgery.** Müller et al., "Black-box forgery attacks on semantic watermarks for diffusion
  models"; "Watermarks Attack Watermarks" (arXiv:2605.16796) — `[SECONDARY]` (titles only). A
  forged watermark on a real photo would make a genuine capture look generated → griefing vector
  against honest keys if watermarks were accepted as evidence. `[INFERENCE]`
- Removal attacks may themselves leave detectable traces (AUROC 0.9994 for UnMarker outputs,
  arXiv:2605.09203) — `[SECONDARY]`.

### Conclusion for p (pixel-based)

`[INFERENCE]` p from pixel judgement is ≈ 0 for a well-made synthetic image of a non-public scene
(a car dent, an item for sale, a face): humans guess, detectors collapse under re-encoding, and
watermarks are absent in open models and removable in closed ones. p is meaningfully above zero only
when the fake contradicts **public, external facts**: (i) a recycled/near-duplicate image with an
earlier publication, (ii) a claimed public event that verifiably did not happen (the Pentagon image
was denied by officials within the hour, §4), (iii) a leaked or extracted key (objective path),
(iv) a cooperating-vendor watermark that survived (weak, vendor-dependent).

---

## 2. What evidence is objective (no pixel judgement)?

| Evidence type | What it shows | Robustness / attacks | Contract can check? | Lay juror from public data? |
|---|---|---|---|---|
| **Signature on `EXTRACTED` domain** (protocol message 3) | Key is usable outside the capture pipeline | Cryptographic | **Yes** (already implemented) | n/a |
| **Leaked device/attestation keys in the wild** | The attestation root is not hardware-bound any more | Google's public revocation list: today **1,791 revoked entries, 1,765 with reason `KEY_COMPROMISE`, 26 `SOFTWARE_FLAW`** (`[SOURCE]` https://android.googleapis.com/attestation/status, fetched and counted 2026-11-20, e.g. `"6681152659205225093" : { "status": "REVOKED", "reason": "KEY_COMPROMISE" }`). Forum guides on using leaked/"banned" keyboxes to pass Play Integrity exist (`[SECONDARY]` droidwin, XDA). | Partly: a contract can check a signature by the leaked key over a challenge (= message 3), or an oracle can post the revocation list; it cannot read Google's list natively | Yes, if the leaked key file is public |
| **Earlier publication** (same or near-duplicate image dated before `anchorBlock`) | The bytes existed before the capture window | Exact match: robust. Near-duplicate via perceptual hash: **evadable and collidable**. Jain, Cretu, de Montjoye, USENIX Security 2022 (arXiv:2106.09820): "more than 99.9% of images successfully attacked while preserving the content" (black-box, DCT-based hashes) — `[SOURCE] (abstract)`. Struppek et al., FAccT 2022 (arXiv:2111.06628) on NeuralHash: adversary can "manipulate the hash values by applying slight changes in images", "forcing or preventing hash collisions" — `[SOURCE] (abstract)`. | Exact digest: yes, if the earlier item is itself anchored on-chain (`firstAttester[H]`) or in a timestamped log. Perceptual similarity: no (needs judgement, collidable) | **Yes** — "here is the same picture on a site archived on date X" is the strongest juror-checkable evidence (archive.org snapshot, earlier on-chain record). Attackers evade by using fresh images. |
| **Metadata contradictions** (EXIF time/GPS vs anchor window; impossible lens/model) | Inconsistency | Metadata is attacker-controlled and trivially edited; C2PA researchers altered GPS and timestamps undetected (§5) | Only for fields *inside the signed record* (e.g. claimed time outside `[b0,b1]`) | Sometimes; weak |
| **Sensor fingerprint (PRNU)** | Image came / did not come from a given sensor | Forgeable: fingerprint-copy attack (Goljan, Fridrich, Chen, IEEE TIFS 6(1), 2011, which also proposed the "triangle test" defence); improved copy attack defeating the triangle test (Li et al., arXiv:1707.07795) — `[SECONDARY]` (titles/snippets). Needs reference images from the device; degraded by compression/resizing. Cannot show "this is not a capture" if the attacker re-photographs a screen with the genuine sensor. | No | No (expert forensic tool) |
| **Reproducibility from model + seed + prompt** | The image is a generator output | Only works if the attacker used a deterministic, public model and the challenger knows the seed/prompt (practically only via a leak or a confession) | Not practical on-chain (heavy compute); an oracle could re-run | Yes in principle (re-run open source code), rare in practice `[INFERENCE]` |
| **Official denial of a public event** | The depicted event did not occur | Strong for public events (Pentagon case), useless for private scenes | No | Yes |
| **Vendor watermark detection** | A cooperating generator made it | See §1c: removable, forgeable, vendor oracle | No | No (vendor portal result only) |

---

## 3. The analog hole (re-photographing a screen or print)

- **Apple Reference Image** (see `/home/tux/crypto/track/reference/apple-reference-image.md`,
  Apple blog 15 Sept 2026): the only related mechanism is a "neural network with hidden weights"
  that checks the raw "has the physical characteristics expected of raw output from our sensors",
  feeding a per-sensor running confidence score that can lead to revocation of the sensor. The
  blog describes no explicit screen-recapture detector. `[SOURCE via team notes]`
- **Scoop**, Liu, Farrukh, Amiri Sani, Agarwal, Tsudik, USENIX Security 2025 — `[SOURCE] (abstract)`
  https://www.usenix.org/conference/usenixsecurity25/presentation/liu-yuxin: compares hardware depth
  with RGB-estimated depth; "Scoop achieves as high as ≈ 95% accuracy on the iPhone and 74%
  accuracy on the Samsung phone" (78 recapture scenarios). Proposes putting depth info into the
  provenance metadata.
- **Dual-pixel disparity** (ACM CCS 2025 poster, doi 10.1145/3719027.3760711): 100% on recaptures
  in a proof of concept — `[SECONDARY]`. Patents "Systems and methods for detecting image recapture"
  (US 11037284 etc.) use depth/flatness, motion, aliasing — `[SECONDARY]`, assignee not verified.
- **Pure image-based recapture detection does not generalise.** DAST-DG, arXiv:2407.17170 —
  `[SOURCE]` https://arxiv.org/html/2407.17170v1: within-dataset accuracy 99.77% (NTU-ROSE),
  but cross-domain (train NTU-ROSE+ICL, test Mturk with 129 screens) accuracy **57.24%** with recall
  18.35% for the proposed method; baselines 50–57%.
- `[INFERENCE]` Multi-sensor consistency (depth, IMU, dual-pixel) is the only promising family, it
  is device-specific, and it must run *inside* the trust boundary at capture (level 2 in the spec)
  to mean anything; a level-0 software key cannot attest it. The verdict of such a check is not
  re-checkable by a third party unless the raw depth data is published (privacy cost).

---

## 4. What is a fake worth (G)?

| Case | Number | Status |
|---|---|---|
| Fake "explosion near the Pentagon", 22 May 2023 | "The S&P 500 briefly dropped a modest 0.3%"; spread "just after the U.S. stock market opened for trading at 9:30 a.m."; officials: "There is NO explosion or incident" | `[SOURCE]` AP Fact Focus via https://www.yahoo.com/news/fact-focus-fake-image-pentagon-212249619.html. The "$500 billion" market-cap swing (TheStreet) and Dow −85 pts (MIT AI Incident DB #543) are `[SECONDARY]`. Attacker's *profit* is unknown; no trading gain was attributed. |
| UK insurance fraud, 2024 | £1.16bn detected, 98,400 claims, average fraudulent claim **£11,800**; 2025: £1.34bn, average **£14,300**; motor 51,700 claims / £576m | `[SECONDARY]` (ABI press releases via search; abi.org.uk returned 403) |
| Photo-manipulated motor claims ("shallowfakes") | Allianz: such incidents "increased by 300% between 2021-22 and 2022-23"; one case: van photo taken from social media, faked bumper damage plus invoice "for more than £1,000"; Zurich: fake plates on written-off cars, "extract significant sums of money because these cars are total losses" | `[SECONDARY]` (Guardian, 2 May 2024, via PetaPixel/copies; Guardian blocked fetch) |
| Romance scams (US, 2023) | FTC: $1.14bn reported, median loss **$2,000** per person | `[SECONDARY]` (FTC blog "Love Stinks", via search) |
| All US fraud reports, 2024 | median loss **$497**; imposter scams median $800 | `[SECONDARY]` (FTC Data Book 2024 snippet; PDF download blocked) |
| Deepfake video conference (Arup, Hong Kong, Jan 2024) | HK$200m ≈ **US$25.6m** in 15 transfers | `[SECONDARY]` (CNN 16 May 2024, SCMP; CNN fetch returned 451). Video, not photo, but shows the ceiling for a single fake in a targeted fraud. |
| Election disinformation | No case found with a monetised G for a fabricated *image* | not found |

**Ranges for comparison (`[INFERENCE]`, order of magnitude):**
- Marketplace listing / single consumer scam: US$100–2,000 per victim; aggregates over victims
  until the key is flagged.
- Social proof / dating: ~US$2,000 median per victim, tail to six figures.
- Insurance claim: ~US$1,000–20,000 typical (ABI average ≈ £12–14k), total-loss vehicles higher.
- News / market-moving: attacker gain unbounded and unobservable (short positions, political value);
  externality up to a $-hundreds-of-billions momentary market swing.
- Legal evidence: unbounded (custody, liberty, civil damages).

---

## 5. How existing provenance systems fail in practice

- **Nikon Z6 III (2025).** C2PA signing added in firmware 2.00 (27 Aug 2025); researcher
  "Horshack" got the camera to sign an AI-generated image (a pug flying a jet) by feeding a crafted
  NEF as the first frame of a multiple exposure; Nikon confirmed the issue on 4 Sept 2025, suspended
  the service, and invalidated all certificates issued since launch — `[SECONDARY]` Digital Camera
  World, 24 Sept 2025 (opened; it paraphrases rather than quotes Nikon), PetaPixel 22 Sept 2025,
  Nikon Rumors 21 Sept 2025. Nikon notice text as quoted by press: "the authenticity credentials
  attached to these images are no longer valid and cannot be used as proof of provenance" —
  `[SECONDARY]`; the Nikon primary notice was **not found** (nikon.co.jp URL guessed → 404).
  PetaPixel: suspension only blocked new certificates; existing users could keep signing while
  not syncing — `[SECONDARY]`.
- **Revoked certificate still shown valid.** Golaszewski, Krawetz, Sherman et al., arXiv:2604.24890
  (27 Apr 2026) — `[SOURCE]` https://arxiv.org/html/2604.24890v1: for the Nikon-signed AI image,
  "Over six months later, Adobe Inspect … reports the signature as valid"; "Neither conforming
  validator reports the revocation." Note: this paper dates the revocation November 2025; press
  dates it September 2025 — date discrepancy unresolved.
- **Same authors, IACR ePrint 2026/804** — `[SOURCE] (abstract)` https://eprint.iacr.org/2026/804:
  "Inadequate certificate revocation policies cause conforming validators to accept manifests signed
  with known-compromised certificates, violating all security goals"; "generators and validators
  fail to agree on the signature's trusted timestamp"; "the conformance program certifies products
  without technical review". Also: GPS altered in a Pixel 10 Pro image, not detected by a conforming
  validator; an Arizona Secretary of State pilot image "validated in January 2025, but fails to
  validate a year later" (expiry) — `[SOURCE]` arXiv:2604.24890.
- **Stripping by platforms.** Tim Bray (Sept 2025): very few Content Credentials exist on the web
  because social and publishing pipelines strip metadata — `[SECONDARY]`. A Washington Post test
  (reported Oct 2025, eight platforms; only YouTube showed a disclosure) — `[SECONDARY]`, original
  not found.

**Implication for post-hoc revocation (`[INFERENCE]`).** In practice revocation (a) arrives weeks
after the compromise (Nikon: ~4 weeks from launch to revocation, signing still possible meanwhile),
(b) is not honoured by deployed validators for months, (c) cannot date the compromise, so every
earlier signature becomes doubtful. Paprika v2's design already reflects this: the flag is
on-chain (no stale CRL — every verifier reads the same state), the `KeyMisuse` policy distrusts
all records of the key, and `anchorBlock` gives an unforgeable lower time bound. What the chain
cannot fix is (c) for `DisputeUpheld`, and the latency between misuse and someone noticing. Do not
market revocation as protection for the window before the flag.

---

## 6. Photojournalism and legal use

- **Reuters / Canon / Starling Lab pilot (2023)** — `[SOURCE]`
  https://starlinglab.org/case-studies/reuters-canon-deploy-verifiable-photo-newswire/: camera
  assigns "a time, date, and location, then digitally hash and sign that set of information"; the
  hash covers raw pixels and EXIF; the backend "registers the asset immutably across several public
  blockchains" (OpenTimestamps/Bitcoin, Avalanche, Numbers, LikeCoin); every newsroom edit logged
  and anchored (Hedera), because the chain "is easily broken the moment a photo enters the newsroom
  pipeline"; goal: a "mathematically provable edit log". → Newsrooms want: device identity,
  time and place at capture, and a chain of custody through permitted edits (crop, colour).
  Paprika v2 has the first two partially (time window, key) and none of the edit chain (limit 9.5).
- **US Federal Rules of Evidence** — `[SECONDARY]` (law-firm/blog summaries of Advisory Committee
  agenda books on uscourts.gov; primary PDFs not opened): proposed Rule 707 (machine-generated
  evidence must satisfy Rule 702 reliability) was published for comment Aug 2025 and withdrawn for
  further study in May 2026; draft Rule 901(c) on deepfakes (opponent shows enough to support a
  finding of fabrication, then proponent must show authenticity "more likely than not") was kept
  in reserve and never published. As of autumn 2026 no FRE specifically addresses deepfakes.
  → Courts authenticate through witnesses and chain of custody; a provenance record is at most
  supporting evidence whose reliability must be explained.

---

## Synthesis

### Use-case table (`[INFERENCE]`, built on the numbers above)

Deterrence condition: `S > G / p`. ETH price is not verified here; the team should plug in the
day's price (a 1 ETH stake is in the low thousands of US$ `[MEMORY]`).

| Use case | Typical G | Realistic p, with which evidence | Stake for p·S > G | Verdict |
|---|---|---|---|---|
| Marketplace listing | $100–2,000 per victim (FTC median fraud loss $497 `[SECONDARY]`), summed over victims before flag | Recycled photos: moderate–high (0.3–0.8) via earlier publication; fresh synthetic: ≈0 | Recycled: ~$0.2–7k → **0.1–1 ETH can matter**; synthetic: none suffices | **Plausible** against stolen/recycled photos; hopeless against fresh synthetic |
| Social proof / dating | ~$2,000 median per victim (FTC 2023), tail ≫ | Stolen profile photos: moderate via reverse search; AI faces: ≈0 (humans 48.2%) | $3–10k for stolen photos | **Marginal** (1 ETH borderline); hopeless vs AI faces |
| Insurance claim | ~£12–14k average detected fraudulent claim (ABI) | Insurer investigation + earlier publication (social-media van case); fresh synthetic damage ≈0.1? | $30k–150k+ | **Marginal**: 0.1–1 ETH irrelevant; useful only as an extra signal next to fraud law; the not-before bound (`anchorBlock`) does help, because it rules out photos taken before the policy or the claimed loss date |
| News / elections | Unbounded, unobservable (market swing; political value) | High for fabricated *public events* (official denial) but evidence comes after the damage; low for staged/private scenes | Not boundable | **Hopeless** as deterrence; useful as an origin/time label and for after-the-fact attribution |
| Legal evidence | Unbounded | Forensic exam; analog hole open; level-0 proves nothing physical | Not boundable | **Hopeless** as deterrence; value lies in tamper-evident time bounds and a record of who attested what |

### Three things the team can say honestly

1. "A Paprika record proves that a specific registered key signed this exact file inside a known
   block window, and shows publicly how much money stands behind that key and whether anyone has
   since proven it misused."
2. "Key extraction and re-use of an already published image are caught by evidence that a contract
   or any juror can check, and the stake makes those specific frauds unprofitable when the gain per
   key is small — for example recycled marketplace or profile photos."
3. "The stake is a public, verifier-weighted number: a verifier should treat a record as worth at
   most what is at stake behind it, and the protocol tells them exactly what that is."

### Three things the team must never say

1. "Paprika detects AI-generated or fake images" (pixel detection is near chance for humans and
   collapses for detectors in the wild; the dispute path is not a detector — spec §5).
2. "A recorded photo is a genuine camera capture" (level 0 proves no physical origin; a genuine
   device pointed at a screen yields a genuine record — spec §9.1, §9.7).
3. "The stake guarantees deterrence / insures victims" (it bounds punishment, not damage; for news,
   elections, legal evidence and most insurance claims G exceeds any realistic stake divided by p).

---

## Claims table

| # | Claim | Number | Tag | Source |
|---|---|---|---|---|
| C1 | Humans vs StyleGAN2 faces | 48.2% accuracy; 59.0% with training; 7.7% more trustworthy | `[SOURCE]` full text | PNAS 10.1073/pnas.2120481119 (Europe PMC PMC8872790) |
| C2 | Humans, 3 countries, images | below 50% | `[SOURCE]` full text | arXiv:2312.05976 (IEEE S&P 2024) |
| C3 | Real-or-Not quiz | 62% overall, 63% on AI images, ~287k evaluations, 12.5k participants | `[SOURCE]` full text | arXiv:2507.18640 |
| C4 | Detector fake-accuracy under perturbation | often <35%; CNNDetection 0.8% under JPEG QF50 | `[SOURCE]` full text | arXiv:2505.12335 |
| C5 | NTIRE 2026 in-the-wild benchmark | 42 generators, 36 transforms | `[SOURCE] (abstract)` | arXiv:2604.11487 |
| C6 | SynthID removal by UnMarker | 79% (claimed), disputed by Google DeepMind | `[SOURCE]` | spectrum.ieee.org/ai-watermark-remover |
| C7 | Perceptual hash evasion | >99.9% of images | `[SOURCE] (abstract)` | arXiv:2106.09820 (USENIX Sec 2022) |
| C8 | NeuralHash collisions/evasion | qualitative | `[SOURCE] (abstract)` | arXiv:2111.06628 (FAccT 2022) |
| C9 | Android attestation revocations | 1,791 entries, 1,765 KEY_COMPROMISE | `[SOURCE]` counted | android.googleapis.com/attestation/status |
| C10 | Depth-based recapture detection | ≈95% iPhone, 74% Samsung | `[SOURCE] (abstract)` | USENIX Sec 2025, Scoop |
| C11 | Image-only recapture, cross-domain | 57.24% acc., recall 18.35% | `[SOURCE]` | arXiv:2407.17170 |
| C12 | Pentagon fake | S&P −0.3% briefly | `[SOURCE]` (AP via Yahoo) | yahoo.com/news/fact-focus-fake-image-pentagon-212249619.html |
| C13 | UK fraud average claim | £11,800 (2024), £14,300 (2025) | `[SECONDARY]` | ABI via search |
| C14 | Allianz shallowfake rise | +300% (2021-22 → 2022-23) | `[SECONDARY]` | Guardian 2 May 2024 via copies |
| C15 | Romance scam median | $2,000 (2023) | `[SECONDARY]` | FTC via search |
| C16 | Arup deepfake | US$25.6m | `[SECONDARY]` | CNN/SCMP via search |
| C17 | Nikon Z6 III signed AI image; certificates revoked | Sept 2025 | `[SECONDARY]` | DCW, PetaPixel, Nikon Rumors |
| C18 | Revoked Nikon cert shown valid >6 months later (Adobe Inspect) | — | `[SOURCE]` | arXiv:2604.24890 |
| C19 | C2PA validators accept compromised certificates | — | `[SOURCE] (abstract)` | IACR ePrint 2026/804 |
| C20 | Reuters/Canon/Starling: capture hash+sign, multi-chain registration, edit log | — | `[SOURCE]` | starlinglab.org case study |
| C21 | FRE 707 withdrawn May 2026; 901(c) in reserve | — | `[SECONDARY]` | law blogs citing uscourts.gov agenda books |

## Could not verify

- Nikon's own notice (primary page not found; text known only from press quotes). Exact revocation
  date: September 2025 (press) vs November 2025 (arXiv:2604.24890).
- ABI, Guardian, CNN, FTC Data Book primaries (403/451/blocked/HTML instead of PDF); numbers are
  `[SECONDARY]`.
- UnMarker's own numbers (paper not opened; only IEEE Spectrum's report and Google's dispute).
- NTIRE 2026 winning AUC; AI-GenBench temporal-generalisation numbers.
- PRNU-attack success rates (titles/snippets only).
- Who holds US patents 11037284 etc.; VeraSnap's "~97%" claim (vendor blog).
- The Washington Post platform-stripping test (original article not found).
- Any monetised G for an election image fake (none found).
- Specific Android keybox leak incidents (dates, vendors): only the revocation list (primary) and
  forum/blog guides (secondary) were seen.
- `[MEMORY]`: ETH price in Nov 2026; insurers' internal detection rates for photo fraud (no public
  p figure found anywhere — p remains unmeasured).
