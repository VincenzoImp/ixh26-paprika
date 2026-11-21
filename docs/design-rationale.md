# Paprika: why each rule exists

Each section states one rule of [`Paprika.sol`](../contract/contracts/Paprika.sol), the attack or failure that the
rule stops, and what the rule costs. Terms and symbols (`B`, `T_photo`, `T_reveal`, `f`) are defined in
[protocol.md](protocol.md).

## 1. Proof of possession at registration

**Rule.** `register` accepts a key only with the key's signature over a message that names the sender.

**Attack stopped.** A public key is public. Without the signature, any account can register another party's key.
A key registers only once, so the real holder can never register it.
A copy of a pending registration sent from another address also fails, because the signed message names the sender.

**Cost.** One P-256 signature on the device and one signature check on the chain.

## 2. Device signature checked on the chain

**Rule.** `attest` accepts a record only with the key's signature over the capture message.
The message contains a label, the chain identifier, the contract address, `keyId`, the photo hash and a block hash.

**Attack stopped.**

1. Without a signature, a record is only data that an account sends. An account that sees the pending transaction
   can send the same photo hash first, under its own device. With the signature, a copied transaction can only
   change the depositor. The record still names the key that signed.
2. The chain identifier and the contract address stop the replay of a signature on another chain or deployment.
3. The labels `PAPRIKA/REGISTER`, `PAPRIKA/CAPTURE` and `PAPRIKA/REVOKE` stop the reuse of one kind of signature as another.
4. The low-s rule gives each signature exactly one valid form.

**Cost.** The chain must offer the P-256 precompile (EIP-7951). On a chain without it, every signature fails.

## 3. Block hash in the signed message, and the record block

**Rule.** The device signs the hash of a recent block `a`. The contract accepts only one of the 256 blocks before the
current block. The record stores `a` and the record block `r`.

**Attack stopped.** Without a lower bound, a record says only "the file existed before block `r`".
A signature made at any earlier time can then be sent at any later time, and the record looks recent.
Nobody can predict a block hash, so the signature was made after block `a`.
The record exists in block `r`, so the signature was made before block `r`.
The window `[a, r]` is at most 256 blocks long. No timestamp server is needed for either bound.

**Cost.** The device must read a recent block hash before it signs. The record must reach the chain within 256 blocks.
The window bounds the signature, not the scene: the key holder can still sign an older file.

## 4. A deposit per photo, not a fee or a treasury

**Rule.** Each record locks `B` from its depositor. The deposit stays tied to that record.

**Attack stopped.**

1. Without a cost, an account can fill the registry with records for the price of gas.
2. A fee must go somewhere. A treasury needs a manager, who is a single point of failure.
   A reward pool can be drained: a forger attests a fake, accuses it from a second account, and collects the reward.
3. With a deposit, the reward for a proven fake is that record's own deposit. There is no shared fund to drain.

**Cost.** An account that attests `N` photos keeps `N × B` locked for at least `T_photo + T_reveal`.
Honest depositors pay gas and the cost of locked capital, and nothing more.

## 5. Refund only after the challenge period

**Rule.** `refund` succeeds only when the record is Attested and `now > accusableUntil + T_reveal`.

**Attack stopped.** A commitment made at the last second of the challenge period can be revealed up to `T_reveal` later.
If the refund came earlier, a depositor could take the deposit back between that commitment and its reveal.
The accusation would then find nothing at stake. A refund is also impossible while the record is Accused.

**Cost.** Every deposit stays locked for `T_reveal` more than the challenge period.

## 6. Accusation bound to an existing record

**Rule.** A reveal names one record (photo hash, `keyId`). The record must exist and must not be Refunded.
The commitment must be made at or after the record block, and no later than `accusableUntil`.

**Attack stopped.**

1. A device cannot be flagged for a photo it never signed.
2. A record cannot be accused after its deposit went back, when nothing is at stake.
3. Nobody can place a commitment before a record exists and hold it in reserve against that record.
4. A Fake record cannot be accused again. A deposit is lost once.

**Cost.** An accuser must act within the challenge period of that record.

## 7. A bond for the accuser

**Rule.** The accuser locks `B` at the commitment.

**Attack stopped.** Without a bond, accusing costs only gas. Every accusation forces a vote and blocks the record
for days. A griefer could then block any record at almost no cost. With the bond, a rejected accusation costs
the accuser `B`, and the depositor receives `B − f × B`.

**Cost.** An honest accuser needs `B` and risks it if the vote goes against the evidence.

## 8. Commit-reveal

**Rule.** An accusation takes two transactions. The commitment hides the target. The reveal comes at least one block
later and within `T_reveal`. The commitment includes the accuser's address.

**Attack stopped.** A pending transaction is visible to everyone before it is mined.

1. A one-step accusation can be copied and sent first under another name, to take the reward.
2. The forger is one of those who can copy it. It would accuse itself with the same evidence and lose only `f × B`.
3. A copied commitment is useless: the reveal recomputes it from the sender's address.
4. A party that sees a reveal pending cannot get in first: it needs a commitment from an earlier block.

**Cost.** Two transactions and at least one block of delay. An unrevealed commitment loses `B` to the burn address.
The bond is burned because the target is hidden: no depositor is known to receive it.
A forger that already holds its own commitment can still reveal first. The honest accuser then gets its bond
back but no reward. See [limits.md](limits.md).

## 9. The contract disputes each accusation at once

**Rule.** In the same transaction as the reveal, the contract asserts the accusation at OOv3 with the accuser's bond,
and disputes it with the record's deposit.

**Attack stopped.** In OOv3, an assertion that nobody disputes before its liveness ends is accepted as true.
If the contract only asserted, a false accusation would win by silence. The victim would be any depositor who
was not watching the chain. With the immediate dispute, every accusation goes to UMA's token-holder vote.

**Cost.** Every accusation waits for a vote. On a real network UMA returns results
["within 48-72 hours"](https://docs.uma.xyz/developers/resolving-disputes). There is no fast path for a clear fake.

## 10. The burden of proof is on the accusation

**Rule.** The claim sent to UMA is "this photo is not a genuine capture by that device", with the evidence hash.
Under [UMIP-170](https://github.com/UMAprotocol/UMIPs/blob/master/UMIPs/umip-170.md), voters answer true only if the
claim is "true and publicly verifiable".

**Failure stopped.** The other question, "is this photo genuine?", has no proof. Generated images are
"indistinguishable from genuine camera captures" (the [IXH26](https://www.decifris.it/ixh26/) Track 1 brief, slide 2). No depositor could prove it, so every accusation
would win. With the burden on the accusation, an accusation without public evidence fails.

**Cost.** A fake that leaves no public evidence is not caught.

## 11. One open accusation per photo, and the extension of the challenge period

**Rule.** A reveal that arrives while the record is Accused opens no accusation. Its commitment is closed and its bond
is credited back. When the vote rejects an accusation, `accusableUntil` grows by the time the record spent Accused.

**Attack stopped.**

1. The deposit is the dispute stake of the open accusation. It cannot cover a second accusation at the same time.
2. Without the extension, a forger could accuse its own fake with no evidence. The vote takes days.
   Nobody else can accuse the record meanwhile. The challenge period runs out, and the forger takes the deposit back.
   With the extension, each such round costs the forger `f × B` and gains it no time.

3. The waiting accuser does not lose its bond to a vote that outlasts its `T_reveal`.
   It gets the bond back and can commit again after the vote, inside the extended challenge period.

**Cost.** False accusations delay an honest refund by the vote time of each one.
Each costs the griefer `B` and pays the depositor `B − f × B`.
A forger that holds its own earlier commitment can get its accusation in first. The honest accuser then loses
only the reward, not the bond.

## 12. Flags do not erase records

**Rule.** A flag changes only the device status, with the reason and the block. Records keep their states.
`verify` returns `flaggedAtBlock` and `recordedBeforeFlag`.

**Failure stopped.** If a flag erased records, one wrong vote or one stolen key would make every photo of that
device unverifiable. That is retroactive censorship. If a flag left no mark, a verifier could not tell old
records from new ones. With the flag block, the verifier sees which records came before the flag.
Each other record keeps its own deposit and its own challenge period, so each is judged on its own.

**Cost.** Records that a compromised key made before the flag stay Attested until someone accuses them.

## 13. Key revocation

**Rule.** The key holder can flag its own device with a signature over a message that names the sender.
No vote and no money are involved.

**Failure stopped.** Without revocation, a copied or stolen key stays Active, and the thief makes records in the
holder's name. A copy of a pending revocation from another address fails.

**Cost.** A thief who holds the key can also revoke it. The holder then registers a new key.
Records that the thief made before the revocation stay, marked as made before the flag.

## 14. No owner, and immutable parameters

**Rule.** The contract has no owner, no administrator function and no upgrade path.
`B`, `T_photo`, `T_reveal`, the oracle and the token are set once, at deployment. The contract accepts no ETH.

**Attack stopped.** An administrator key could change the parameters, replace the oracle or move the locked deposits.
That key would be a single point of failure and a target.

**Cost.** A flaw cannot be patched. A fix needs a new deployment, and records do not move to it.

## 15. Payments as credits

**Rule.** Refunds and payouts add to a credit. Each account withdraws its own credit with `withdrawCredit`.

**Attack stopped.** Some accounts cannot receive a token transfer, for example a blocked address or a contract that
rejects it. If the contract paid inside the UMA callback, that failure would revert UMA's settlement.
The accusation could then never close. With credits, such an account blocks only its own withdrawal.

**Cost.** One extra transaction for each account that wants its tokens.

## 16. Equal deposit and bond

**Rule.** One value, `B`, is both the deposit and the bond.

**Failure stopped.** In OOv3 the disputer must stake the same bond as the asserter. The contract asserts with the
accuser's bond and disputes with the record's deposit, so the two must be equal. The stakes are also symmetric:
each side risks `B`, and the winner receives `B − f × B` from the loser.

**Cost.** One value sets two incentives. A large `B` deters forgers more, and also deters accusers.
A small `B` does the reverse.

## The three weaknesses of the brief

The brief (slide 10) lists three weaknesses of a centralised system. The table states what Paprika removes and what
it only moves. Paprika does not remove trust. It moves trust to UMA's vote and to the deposit.

| Weakness | What Paprika removes | What Paprika moves |
|---|---|---|
| Single point of failure: central revocation lists; a compromised certificate authority invalidates millions of devices | No certificate authority, no revocation list, no operator. A flag concerns one key. Only the key holder or a vote on one record can set it | Trust goes to UMA's vote, which can err or be captured. A wrong vote harms one record and one key, not all devices |
| Cross-platform lock-in: other devices cannot verify without the vendor's servers | Any device with a P-256 key can register, free. Any party verifies with a read call to any node | The verifier needs access to the chain. The device needs network access to read a recent block hash |
| Retroactive censorship: historic photos become unverifiable if servers shut down or keys change | No function deletes or edits a record or a key. There is no owner. Flags carry their block, so older records stay checkable | Records live as long as the chain does. A vote can still mark one record Fake, if the accusation was committed inside its challenge period |
