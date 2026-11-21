# Speaker notes: Paprika (3 minutes, slides and demo)

## 1. Paprika (20 s)

We are Team Sexy Plushies. Paprika gives photo origin with no manufacturer and no central
authority. Every photo is a signed claim with money at stake. Anyone can challenge it, and an open
vote decides.

## 2. Who do you trust? (25 s)

How do we prove that a photo came from a real sensor? The usual answer is hardware keys certified
by manufacturers. But one compromised manufacturer invalidates millions of devices. We do not
trust manufacturers. We assume that a fake can be exposed with public evidence, and we make
exposing it pay.

## 3. How Paprika works (50 s)

Alice registers her device key for free. To attest a photo, the device signs the photo hash
together with a recent block hash. The chain checks this P-256 signature, and Alice locks a deposit
B. Anyone can verify by hashing the file and reading the chain. Bob can challenge the photo. He
commits first, then reveals, and locks an equal bond. UMA's open vote decides, and the winner takes
both stakes minus UMA's fee. If nobody challenges within the challenge period, Alice gets B back.
The block hash fixes a time window, and commit-reveal stops anyone from copying a challenge.

## 4. Three weaknesses, three constraints (30 s)

The brief's reference design has three weaknesses: a single point of failure, cross-platform
lock-in, and retroactive censorship. Paprika meets the inverse of each. There is no single trust
root: no manufacturer, no CA and no owner. Any device can register, and anyone can verify. Records
are permanent, because the contract has no owner and no delete function.

## 5. Demo and close (45 s)

[Live: take a photo, sign and attest, verify.] The photo is signed, one WETH is at stake, and anyone
can challenge it for one hour. This runs Paprika and UMA's oracle and voting contracts on a local
Ethereum chain. Photo origin that no single company can switch off. Thank you.
