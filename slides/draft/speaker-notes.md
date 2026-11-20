# Speaker notes: Paprika

Five minutes: about 40 seconds per slide, 90 seconds for the demo. Source of truth:
`docs/1-come-funziona.md`. Amounts and durations are deployment parameters, so we say `B`,
`T_photo`, `T_reveal` and `f`, not numbers.

## 1. Title (30 s)

Paprika is a public register of photos in which whoever attests a photo puts a device signature
and money behind it. Every attested photo is signed by a registered device and backed by a deposit
that anyone can win by proving the photo fake. We do not claim that the file came from a camera.

## 2. The problem (40 s)

The brief's example is close to a solution but centralised. It has three weaknesses: a single
point of failure, cross-platform lock-in, and retroactive censorship. We wrote our original
proposal as a contract, exactly as described, and attacked it. A pending attestation could be
stolen from the mempool. The treasury could be drained by self-accusation. A device could be
banned over a photo it never attested, or because nobody contested. The three phases stayed, and
every phase was repaired.

## 3. The protocol at a glance (40 s)

Registration is free: the device key signs the owner's address, which proves possession, and a
key can register only once. To attest, the device signs the photo hash together with a recent
block hash, and whoever submits it locks a deposit B. If nobody accuses the photo within T_photo,
the deposit comes back and the record stays. Otherwise the accusation goes through commit, reveal
and a UMA vote. Anyone can verify by hashing the file and asking the contract.

## 4. Removed or moved (45 s)

There is no manufacturer, no committee, no owner and no treasury, and nobody keeps a revocation
list. That single point of failure is removed. Lock-in is removed for vendors; what remains is one
public chain and a node to read it. Records are never erased and flags carry their date. A flag
stops new attestations, and every earlier record keeps its own deposit and window. Trust is moved,
not eliminated: it goes to UMA's vote for accusations, and to the deposit.

## 5. The mechanism (50 s)

The device signs with P-256, and the contract verifies the signature through the precompile. The
block hash inside the signature gives a not-before bound, and the record's block gives a not-after
bound. Accusations are made by commit and reveal because the mempool is public: a one-step
accusation could be copied for the reward, or pre-empted by the forger. The contract asserts each
accusation at UMA's Optimistic Oracle V3 and disputes it with the photo's deposit, so every
accusation goes to a vote. The question is whether the evidence proves the photo is not a genuine
capture, and the answer is yes only if that can be checked publicly. The loser's B goes to the
winner, minus UMA's fee f times B, so accusing yourself always costs f times B. The deposit-bound
key idea comes from Kiayias and Tang and from Ruffing, Kate and Schröder; we only assemble it.

## 6. Demo (90 s)

We register a device for free and attest a photo with deposit B. Verifying shows the block window
and the locked deposit, and changing one pixel gives no record. A true accusation is upheld: the
photo is marked fake and the device is flagged. A false accusation is rejected and the accuser
loses the bond. We then advance time past T_photo and the deposit is refunded. All of this runs on
a local Ethereum chain. UMA's contracts are the real ones; the vote is simulated with UMA's own
mock oracle.

## 7. Limits (45 s)

There is no proof of physical origin: a registered device can sign a generated image. Only fakes
with publicly checkable evidence are caught, and only within T_photo. The deposit bounds the
punishment, and a flagged party can register a new key for free. A forger can accuse itself to cap
its loss at f times B. The vote is UMA's: it takes 48 to 72 hours per accusation on a real network,
and it can err. Paprika suits low-value fakes that leave traces, such as sale listings and recycled
photos; it is not suited to news or legal evidence. Design, code, documentation and slides were
made with Claude Code under the team's direction.
