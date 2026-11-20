# Speaker notes: Paprika v2, first draft

Five minutes, about 40 seconds per slide, 90 seconds for the demo. Numbers are the ones on the
slides; their sources are in the comments of `deck-draft.tex`. Spec revision: v2.5.

## 1. Title (30 s)

Paprika is a registry of staked device keys with an open challenge, run by a contract that has no
owner. Read the claim as written: a key signed a photo digest inside a block window, a stake stood
behind the key and is forfeited when evidence against it is accepted, and everything decided about
the key since is public. We do not claim that the photo came from a camera; for a self-registered
key the guarantee is economic.

## 2. The problem (40 s)

The brief's example is close to a solution but centralised: a single point of failure,
cross-platform lock-in, retroactive censorship. Our starting idea was simpler than what we present,
and on a local chain we broke it: a 1 ETH treasury drained in 21 self-report cycles, one ban erased
100 of 100 earlier records, a copied transaction stole the origin. For each weakness we ask: is it
removed, or only moved?

## 3. The protocol (40 s)

An account registers a P-256 device key with a stake; at level 0 that is all, at level 1 a bonded
issuer, a device maker, also endorses the key. The device signs the photo digest with a recent
block hash, anyone relays it, and the contract checks the signature. Anyone verifies by hashing the
file and reading the chain. Anyone can challenge in two ways: a proof of key misuse, which the
contract checks by itself, or a claim decided by vote.

## 4. Removed or moved (45 s)

The contract has no owner, no administrator, no upgrade path and no treasury, so that single point
is removed; but claims move to the oracle's token vote, and at level 1 every issuer a verifier
trusts is a trust root. Lock-in is removed for vendors; we still depend on one chain, a node, and
at level 1 on the verifier's own issuer list. Retroactive censorship is narrowed, not removed:
records are never erased and flags are dated, but whoever steals a key can prove its misuse and
make its whole archive distrusted.

## 5. The idea (50 s)

The device signature is checked on-chain with the P-256 precompile; the block hash inside it gives
a not-before bound, the record's block a not-after bound. A capture key never signs anything else,
so a signature on the "extracted" domain, naming the challenger, shows the key left its pipeline:
the contract flags it with no vote. Other claims go to a vote that is always contested, so far
tested only against an oracle mock. A third objective rule was tried, broken by an independent
review with running exploits, and withdrawn. At level 1 the issuer's bounty is smaller than the
owner's burned stake, so revoking your own key loses money. With a 0.25 ETH stake, deterrence covers
forgeries worth roughly 4 to 40 dollars at an assumed 1 to 10 percent detection probability; the
deposit-bound key idea is Kiayias and Tang's and Ruffing, Kate and Schröder's, and we only assemble it.

## 6. Demo (90 s)

We register a simulated device key with a 0.25 ETH stake, sign a photo, let a relayer record it,
and verify it with its block window. One changed pixel and there is no record. Then the key leaks:
anyone proves misuse, the device is flagged, half the stake goes to the challenger and half is
burned, and the old records stay visible, marked. Verifying again shows the flag's block and
reason next to the earlier records. The demo runs on a local Ethereum EVM chain. The screenshot is a static mock-up whose
labels predate the current parameters.

## 7. Limits and deployment (45 s)

A level-0 record does not prove physical origin, and level 1 only as far as the issuer is honest
and trusted; the stake bounds the punishment, not the damage; claims wait days for a vote; records
of a key are linkable; a photographed screen gives a genuine record; P-256 is not post-quantum. The
demo runs on a local Ethereum EVM chain with software keys and simulated issuers; no public
network is used. As a deployment estimate: the precompile answered on 12 public networks, and on
the XRPL EVM sidechain an attestation would cost under a hundredth of a cent, but UMA is not
deployed there. Design, code, documentation and slides were made with Claude Code
under the team's direction; the log is in the repository.
