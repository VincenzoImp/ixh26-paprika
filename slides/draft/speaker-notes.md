# Speaker notes: Paprika, first draft

Five minutes, about 40 seconds per slide, 90 seconds for the demo. Numbers are the ones on the
slides; their sources are in the comments of `deck-draft.tex`. Sources of truth: `docs/1-3`.

## 1. Title (30 s)

Paprika is a public register in which whoever attests a photo puts a signature and money behind
it. A record says that a registered device signed this exact file in a known block window, with a
deposit at stake, and anyone can challenge it. We do not claim that the file came from a camera.

## 2. The problem (40 s)

The brief's example is close to a solution but centralised: a single point of failure,
cross-platform lock-in, retroactive censorship. We wrote our original proposal as a contract,
exactly as described, and attacked it: a ban was evaded for free, a 1 ETH treasury was drained by
self-accusation, a pending attestation was stolen, a device was banned for a photo it never
attested. The three phases stayed; every phase was repaired.

## 3. The protocol (40 s)

Register: the owner locks a 0.25 ETH deposit and the device key signs the owner's address, so
nobody can register someone else's key. Attest: the device signs the file's hash together with a
recent block hash, anyone relays it, and the record says "signed after block A and before block B".
Challenge: an accusation against one photo, or a proof that the key left the device. Anyone
verifies by hashing the file and asking the contract.

## 4. Removed or moved (45 s)

There is no manufacturer, committee, owner or treasury, and no revocation list kept by anyone.
Lock-in is removed for vendors; we still need one public chain and a node to read it. Records are
never erased and flags carry their date, although a key thief can get a device flagged and
verifiers may then distrust its archive. Trust is moved, not eliminated: to a decentralised arbiter
for accusations, and to the deposit.

## 5. The challenge mechanism (50 s)

An accusation starts as a sealed commitment with a 0.11 ETH bond, so the owner cannot see it
coming; then the accuser reveals photo and evidence, and the contract contests it automatically
with the device's deposit, so silence never flags anyone. If the arbiter upholds it, the accuser
gets the bond back plus 0.125 ETH and the owner loses 0.25; if it rejects it, the accuser loses
0.11 and the owner gains 0.055. The second way needs no arbiter: a signature on a message no camera
would sign proves the key is out, and the deposit is split, 0.125 to the prover, 0.125 burned.
Self-accusation always loses; the deposit-bound key idea is Kiayias and Tang's and Ruffing, Kate
and Schröder's, and we only assemble it.

## 6. Demo (90 s)

We register a device with a 0.25 ETH deposit, attest a photo through a relayer, and verify it with
its block window and the deposit at risk. One changed pixel and there is no record. A true
accusation is upheld and the device is flagged; a false one is rejected and the accuser loses the
bond. Verifying again shows that nothing was erased. All of this runs on a local Ethereum EVM
chain, and the arbiter is simulated: we choose the outcome.

## 7. Limits (45 s)

There is no proof of physical origin: a registered device can sign a generated image, and only
fakes that leave public evidence are caught. The deposit deters only low-value fakes, roughly 4 to
190 dollars at an assumed 1 to 50 percent detection probability and 3,000 dollars per ETH. We
depend on the arbiter, 48 to 72 hours per accusation with UMA, and records of one device are
linkable. It suits sale listings, recycled photos and small frauds, not news or legal evidence.
Design, code, documentation and slides were made with Claude Code under the team's direction.
