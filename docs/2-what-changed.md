# 2. What changed from the first version, and why

The first version is in [`proposal/PAPRIKA.md`](../proposal/PAPRIKA.md), unchanged.
The final version is explained in [1. How it works](1-how-it-works.md).

## In short

**The idea is the same.** Three phases (registration, attestation, ban), open to everyone, based on
economic incentives, decided by UMA, with no central authority and no manufacturers.

**The details of each phase changed**, because in the first version each one had a hole that
could be exploited. We found them by writing the contract exactly as the proposal describes it and
trying to attack it: the tests are in
[`evidence/original-under-attack/`](../evidence/original-under-attack/).

| Phase | How much it changed |
|---|---|
| 1. Registration | Same idea. In addition, the device must sign the request |
| 2. Attestation | Now the device signs. The fee becomes a deposit that comes back |
| 3. Ban | Same idea: someone accuses, UMA decides, whoever is right is rewarded. The rules on money, timing and effects change |

The symbols (`B`, `T_photo`, `T_reveal`, `f`) are explained in document 1.

## Phase 1 — Registration

> *First version:* "To register a device, an Ethereum account needs to register it, with its own
> public key. The registration fails if the device is banned."

| What was wrong | What happened in the test | How it is now |
|---|---|---|
| Knowing a public key was enough to register it | Anyone could register someone else's key, get it banned and make it unusable forever | The device must **sign** the request: only whoever really holds the key can register |

**Kept as it was:** registering is free, and a banned device cannot register again.

**A limit that remains, and that is worth knowing.** Since registering is free, someone who gets
banned can create a new key and come back. The ban costs them the deposit of the accused photo and
the history of the device, not access. The real punishment is the per-photo deposit of phase 2.

## Phase 2 — Attestation

> *First version:* "The device takes a picture. It asks for attestation to be recorded. The smart
> contract saves the attestation if the device is not banned." With a fee paid to the treasury.

| What was wrong | What happened in the test | How it is now |
|---|---|---|
| The device sent only the photo hash: its key signed nothing | Someone watching the network copied the request before it was confirmed and sent it in their own name. They appeared as the author, and the honest request was rejected | The device **signs** the photo hash. The contract checks the signature. Copying the request does not change who signed |
| We only knew that the photo existed *before* a certain block | You could attest today a photo that was years old | The device also signs the **hash of a recent block**: the record says "signed *after* block A and *before* block B" |
| The fee went into a treasury, from which rewards were paid | Someone who accused themselves emptied the treasury (see phase 3). And someone would have had to manage it | Instead of the fee there is a **deposit `B` for each photo**. It does not go into a treasury: it stays tied to that photo. It comes back after `T_photo` if nobody accuses it; it goes to whoever accuses it if the fake is proven |

**Why a deposit and not a fee.** A fee must end up somewhere: in a treasury (which someone manages
and which can be emptied) or destroyed. A deposit holds back spam just as well, because whoever
attests many photos must keep a lot of money locked, but it does not create a common fund and it
costs nothing to honest people.

## Phase 3 — Ban

> *First version:* "A user claims an irregular device exists. The claim is checked in decentralized
> fashion (in this example using UMA but it could be something else). Ban and a reward are issued
> or not depending on the case."

UMA stays the judge. But the first version left almost all the practical questions open.

| What was wrong | What happened in the test | How it is now |
|---|---|---|
| The reward was paid from the treasury | A single person controlled a device and an accuser account: they attested anything, accused themselves and collected, emptying the treasury | The reward is **the deposit of the accused photo**. Accusing yourself always makes you lose the UMA fee |
| The accusation was not tied to a record | A device was banned for a photo it had never attested | You can only accuse a photo that this device attested, and within `T_photo` |
| The same device could be rewarded more than once | Several rewards for a single photo | A deposit is lost only once |
| The accuser paid a "UMA fee" | In UMA there is no fee for the accuser: there is a bond, which is lost if you are wrong | The accuser locks a **bond `B`**, equal to the deposit. They lose it if the accusation is rejected |
| In UMA a claim that nobody disputes counts as true | An honest device whose owner was not watching got banned | The contract takes the accusation to UMA and **disputes it at the same moment** with the photo's deposit: every accusation goes to a vote |
| The accusation was visible to everyone before it was confirmed | Anyone could copy it and send it in their own name; even whoever had attested the fake, to limit the loss | The accusation is made in **two steps (commit–reveal)**: first the fingerprint, then the data |
| It was not written what happens to photos already attested after a ban | If the ban deleted them: a single mistake made all the honest photos of that device impossible to verify. If it did not delete them: the photo judged fake stayed "attested" like the others | The accused photo is **marked as fake**. The device is **flagged** and no longer attests. The other photos stay as they were. Nothing is deleted |
| It was not written who controls the contract | Whoever controlled the judge could move the treasury's money | The contract **has no owner** and cannot be changed. There is no treasury |

### How we use UMA, in practice

UMA works like this: someone makes a claim and puts up a bond; if someone disputes it by putting up
an equal bond, a vote decides; whoever loses leaves their bond, which goes to the winner minus a
fee for UMA.

In the final version:

1. The claim taken to UMA is the **accusation**: "the attached evidence proves that this photo is
   not a real capture". The bond is the accuser's.
2. The contract **disputes it right away** with the photo's deposit. This is why deposit and bond
   must be equal: UMA requires it.
3. UMA votes. Under its rules it answers yes only to what can be checked publicly.
4. UMA pays the winner; the contract marks the photo and flags the device, or leaves everything as
   it was.

We chose that what must be proven is the accusation, not the photo. If it were the other way
round, whoever attests would have to prove that their photo is real, which nobody can do, and any
accusation would win.

### The question asked to UMA

The first version asked: *"is photo A fake?"*. Looking only at the pixels, a well-made fake cannot
be told apart: the track itself says so ("indistinguishable from genuine camera captures").
This is why the question became: *"does the attached evidence prove it?"*. An accusation is
accepted only when it brings evidence that anyone can check, for example the same image already
published before the date of the record. A fake that leaves no evidence of this kind is not caught.

### Key revocation (new)

It was not in the first version. Whoever holds a device's key can get the device flagged with a
signature. This is for the owner whose key was stolen or copied: without it, a stolen key would
stay active.

## What did not change

- The three phases and their order.
- Anyone can register a device, for free and without asking anyone for permission.
- No device manufacturer, no authority that accredits, no committee.
- The contract rejects registration and attestation of a banned device.
- Anyone can accuse, and whoever is right is rewarded.
- UMA decides.
- Security rests on economic incentives.

## The three weaknesses from the track, before and after

| Weakness (slide 10) | First version | Final version |
|---|---|---|
| Single point of failure | No authority that certifies, but a treasury and a contract where nobody knew who held the keys | No owner, no treasury, no revocation list kept by someone. The dependence on UMA for accusations remains |
| Cross-platform lock-in | Removed: anyone registers and verifies | Removed, as before |
| Retroactive censorship | Depended on what the ban did, which was not written | Records are not deleted; decisions have a date and concern one photo at a time |
