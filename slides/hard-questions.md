# Hard questions, with short honest answers

For the 2 minutes of questions. Facts come from `docs/protocol.md`, `docs/design-rationale.md`,
`docs/limits.md`, `contract/output/cases.md` and `app/README.md`. Not claim-audited.

**1. Registration is free and the key can be anywhere. What does the P-256 signature add over
"stake B on a hash and let UMA arbitrate"?**
Four things (design-rationale §2-3).
(a) The record is bound to the key. A front-runner who copies `attest` changes only who paid the
deposit; the record still names the honest key.
(b) A key builds a public history, and it can be flagged or revoked.
(c) The signed block hash gives a not-before bound. That bound is what lets "this image was public
before block a" refute a record.
(d) A verifier can choose to trust only keys it knows, for example keys held in hardware, and
Paprika does not stop that.
The signature does not prove a camera.

**2. A forger who expects to be caught loses only f·B. What B would you deploy, and how do you know p?**
The expected punishment lies between p·f·B and p·B, where p is the probability of being caught.
With the demo values (B = 1 WETH, f = 0.5), a fake is deterred only if its gain is below
p × 0.5 WETH, in the worst case. Nobody knows p in advance; it is an assumption. The deployer must
size B to what a fake is worth in the target market. A large B also deters honest depositors and
accusers.

**3. Why would anyone monitor and accuse? The accuser nets B − f·B, and a forger with an older
commitment can reveal first.**
That is the weakest incentive in the design, and we say so. If the forger reveals ahead of Bob, Bob
gets his bond back and no reward: any reveal while an accusation is open on the same photo opens
nothing and returns the bond. If the forger reveals the real evidence, the fake is proven and the
forger loses f·B; its key is flagged. If the forger reveals junk, the vote rejects it, the forger
loses f·B, the challenge period is extended, and Bob can commit again. So the forger can cap its
own loss, but it cannot save the fake from a determined accuser. Monitoring pays only where B is large compared with the effort.

**4. What exactly do voters judge? "Not a genuine capture by that device" means little when the
device is any key.**
Voters judge the claim under UMA's UMIP-170 rule: yes only if it is "true and publicly
verifiable". The burden of proof is on the accuser, by design, because "this photo is genuine" has
no proof (design-rationale §10). Typical evidence: the same image public before block a; the image
regenerated exactly from a known model and seed. A generated image with no public trace is not
caught.

**5. The track asks for guarantees of authentic photo origin for any device. You give none. Why is
this an answer to the track?**
A guarantee of physical origin needs trusted hardware, and trusted hardware needs a manufacturer.
The brief criticises exactly that centralisation. Paprika keeps every part that needs no
manufacturer: the device signature, the time window and the public record that nobody can erase.
It adds an economic penalty.
We trade a stronger guarantee for the removal of the manufacturer, and we say so on slide 1.

**6. UMA is a token-weighted vote. What does one corrupt vote cost compared with B? And does every
refund wait 48-72 h under griefing?**
We did not measure the cost of corrupting UMA's vote; its security is UMA's, not ours. The damage
from one vote is bounded: one record, one key, at most B, and no record is erased. Griefing is
priced: N false accusations cost the griefer N·B and pay the depositor N·(B − f·B). They do delay
the refund by the vote time of each accusation: 3 to 4 days per vote with UMA's mainnet phase
length, as measured in `contract/output/cases.md`. One more risk: if UMA's vote misses quorum
in too many rounds, UMA deletes the request; the record stays Accused and both stakes stay locked
in UMA's oracle until UMA governance acts (docs/limits.md). In the demo, time cannot be advanced
while an accusation is open, so this cannot happen there.

**7. Cameras post-process and platforms recompress. An exact SHA-256 match breaks on the first
upload. Why not a perceptual hash?**
An exact hash keeps the claim sharp and the vote decidable. A perceptual hash would make "same
image" a matter of judgement and would allow engineered collisions. A recompressed copy has no
record; that is a stated limit. Signed derivatives, where a record points to a parent record, are
future work.

**8. Which chain? The anchor needs unpredictable block hashes and a P-256 precompile.**
The contract needs the P-256 precompile (EIP-7951) and block hashes that nobody can predict, within
256 blocks. On Ethereum, a proposer can bias a block hash slightly but cannot know it far ahead. On
rollups where a sequencer produces the blocks, the sequencer may know a hash early, which weakens
the not-before bound. The demo runs on a local Ethereum chain; we have not chosen a production
chain.

**9. Why commit-reveal?**
Pending transactions are public. A one-step accusation could be copied by a front-runner, or the
forger could pre-empt it. The commitment hides the target and names the accuser, so only the
accuser can reveal it. An unrevealed commitment can be forfeited by anyone, and its bond is burned.

**10. Why equal bonds?**
UMA's Optimistic Oracle requires the disputer to stake the same bond as the asserter. Paprika
asserts with Bob's bond and disputes with Alice's deposit, so both are B. Each side risks B, and the
winner receives B − f·B from the loser.
