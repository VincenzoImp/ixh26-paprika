# Speaker notes: Paprika (3 minutes, slides and demo)

## 1. Paprika (20 s)

We are Team Sexy Plushies. Paprika gives photo origin without manufacturers or a central authority.
Every photo is a signed claim with money at stake. Anyone can challenge it, and an open vote
decides.

## 2. Three weaknesses, three constraints (30 s)

The brief's reference design is Apple's. It has three weaknesses: a single point of failure, where
a compromised CA invalidates millions of devices; cross-platform lock-in; and retroactive
censorship. We turned each weakness into a design constraint. There is no single trust root. Any
device registers and anyone verifies. Records are permanent. Meeting the first constraint means one
thing: no manufacturer in the trust chain.

## 3. How Paprika works (45 s)

Alice registers her device key for free. To attest a photo, the device signs the photo hash
together with a recent block hash, and Alice locks a deposit B. Anyone can verify by hashing the
file and reading the chain. Bob can challenge the photo with evidence. He commits first, then
reveals, and locks an equal bond. UMA's open vote decides, and the loser pays the winner. If nobody
challenges the photo, Alice gets her deposit back.

## 4. Why it holds (35 s)

No manufacturer or CA approves keys, so there is no root to compromise, and one vote touches only
one photo. Any P-256 key can register, and anyone can verify with one read call to any node. The
contract has no owner and no delete function, and every decision is dated on chain. The
cryptography is concrete. The device signs with P-256, and the chain checks the signature. The
block hash in the signature fixes a time window. Commit-reveal stops anyone from copying a
challenge. The key intuition is that origin becomes a claim someone pays for if it is false.

## 5. Demo and close (50 s)

[Live: take a photo, sign and attest, verify.] The photo is signed, one WETH is at stake, and it is
open to challenge. That is Paprika and UMA's oracle and voting contracts on a local Ethereum chain.
Photo origin that no single company can switch off. Thank you.
