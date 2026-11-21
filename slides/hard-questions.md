# Likely questions, with short answers

Facts come from `docs/protocol.md`, `docs/design-rationale.md` and `docs/demo.md`.

**What does the P-256 signature add over staking money on a hash?**
It binds the record to a device key: a copied transaction cannot change who signed. The key builds
a public history that verifiers can read. The block hash inside the signature gives a time window.

**What does the block hash prove?**
Nobody can predict a block hash, so the signature was made after block `a`. The record sits in
block `r`, so the file existed by then. No timestamp server is involved.

**Why commit-reveal?**
Pending transactions are public. The commitment hides the target photo and names the accuser, so
nobody can copy or front-run a challenge.

**Why UMA?**
UMA's Optimistic Oracle V3 is a deployed, open dispute system with a public token-holder vote. Its
rule accepts a claim only if it is "true and publicly verifiable". Paprika disputes every accusation
at once, so each one goes to a vote.

**Why equal deposit and bond?**
UMA requires the asserter and the disputer to stake the same amount. Each side risks `B`, and the
winner receives the loser's `B` minus UMA's fee.

**Who controls the contract?**
Nobody. It has no owner, no admin key and no upgrade path. The parameters are fixed at deployment.

**What evidence can voters check?**
Public evidence. For example, the same image was published before block `a`, or the image can be
regenerated from a known model.

**How does this answer "any device"?**
Any device that can sign with P-256 can register, free, with no approval from anyone. Phones and
secure elements already use P-256.

**What would you build next?**
Deployment on a public chain. Unlinkable records using a zero-knowledge proof of membership. Batched
attestations.
