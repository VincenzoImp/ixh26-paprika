# Speaker notes: Paprika

Five minutes: about 35 seconds per slide, 90 seconds for the demo. One running example: Alice
attests a photo, Bob accuses it, UMA decides. Facts come from `docs/protocol.md`,
`docs/design-rationale.md`, `docs/limits.md` and `app/README.md`.

## 1. Paprika: photo origin as a claim with money at stake (30 s)

Apple proves a photo's origin by asking you to trust Apple. Paprika asks you to trust no
manufacturer. Alice signs a claim about her photo and locks money behind it. Anyone, like Bob, can
challenge the claim with public evidence, and UMA's public vote decides who loses the money. We do
not claim that a camera took the photo: that is the price of needing no manufacturer.

## 2. The reference design trusts one company (35 s)

The brief's reference is Apple's design. The sensor and the Secure Enclave sign in hardware,
Apple's CAs certify them, and Apple's servers timestamp, verify and revoke. The cryptography is
sound, but the trust sits in one company, and that causes the three weaknesses in the brief.
Physical origin needs trusted hardware, and trusted hardware needs a manufacturer. We drop the
manufacturer, and we say plainly what that costs.

## 3. The protocol (40 s)

There are four steps. Alice registers her key for free: the key signs her address, so nobody else
can register it first. To attest, the key signs the photo hash with a recent block hash, and Alice
locks a deposit B. Until T_photo after the record, Bob can accuse the photo with an equal bond.
He commits first, then reveals, and UMA votes. The loser loses B, and the winner gets B minus UMA's
fee. If nobody accuses, Alice gets B back and the record stays. Anyone can verify with one read
call. Paprika has no owner and takes no fee.

## 4. What the cryptography proves, and what it does not (40 s)

The key signs the photo hash with the chain, the contract and a recent block hash, and the contract
checks the P-256 signature on chain. A block hash cannot be predicted, so the signature came after
block a. The record sits in block r, so the file existed by then. That window is what makes Bob's
evidence work: if the same image was public before block a, the record is refuted. A record does
not prove a camera, protected hardware, or the time of the scene; the demo key is a software key.
Bob's commitment names his address, so a copy cannot be revealed. Several keys may attest the same
file, and the verifier judges each key.

## 5. Who pays when someone is wrong (45 s)

In UMA's optimistic oracle, an undisputed claim is accepted. A false accusation could therefore win
by silence against a photographer who was not watching. Paprika disputes every accusation at once
with the photo's own deposit, so every case goes to a vote. Voters say yes only if the claim is
true and publicly verifiable, so the burden of proof is on Bob. If the fake is proven, Bob gains B
minus f B. If not, Alice gains it. f is UMA's fee, not ours. The honest limit is that a forger who
expects to be caught can accuse itself first and lose only f B. A forger with an older commitment
can also reveal ahead of Bob; Bob then gets his bond back and no reward, and he can commit again
after the vote. So B must be sized to what
a fake is worth.

## 6. Live demo (90 s)

We follow one file; watch the verdict change. Alice registers a key for free, attests the photo and
locks one WETH. She takes a selfie and presses Sign and attest. The verifier shows "signed, staked, open to challenge". One changed pixel gives no
record. Bob found the same image published before block a. He commits a hash, then reveals.
Paprika opens the case at UMA and disputes it at once. The three demo voters vote yes. Bob gets his
bond back plus Alice's deposit minus UMA's fee, and Alice's key is flagged. Verifying the same file
again shows "proven fake", and the record stays. Everything runs on a local Ethereum chain with
UMA's Optimistic Oracle V3 and voting contracts. The clock is advanced by a button.

## 7. Removed, moved, and not claimed (40 s)

Back to the test. The CA, the central revocation list and the owner are removed. Trust is moved,
not eliminated: it goes to UMA's vote and to the deposit. We do not claim physical origin, fakes
without public evidence, or fakes worth more than the deposit. A flagged forger can return with a
new key; it loses only its deposit and its history. Paprika fits low-value fakes that leave traces,
such as sale listings and recycled photos. Origin becomes a claim that someone pays for when it is
false. Claude Code helped with design, code and slides, under our direction.
