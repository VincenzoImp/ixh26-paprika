# Paprika: trust assumptions and limits

This document states what Paprika depends on and what it cannot do. Terms and symbols (`B`, `T_photo`, `T_reveal`,
`f`) are defined in [protocol.md](protocol.md). The reason for each rule is in [design-rationale.md](design-rationale.md).

## Trust assumptions

| Party | What Paprika assumes |
|---|---|
| UMA | The token-holder vote answers each accusation correctly, under the rule "true and publicly verifiable" ([UMIP-170](https://github.com/UMAprotocol/UMIPs/blob/master/UMIPs/umip-170.md)). UMA keeps accepting the token and the identifier that the deployment uses |
| The chain | The chain keeps records, orders transactions and stays available. It offers the P-256 precompile. Its block hashes are not predictable |
| The key holder | The key holder keeps the private key secret. The key holder signs only real captures. If the key leaks, the key holder revokes it |

Nobody else is trusted. There is no manufacturer, no certificate authority, no committee and no administrator.

### What UMA can and cannot do

| Question | Answer |
|---|---|
| Who decides? | The holders of the UMA token, by a public vote |
| How long does it take? | On a real network UMA returns results ["within 48-72 hours"](https://docs.uma.xyz/developers/resolving-disputes) |
| Can the vote err? | Yes. A wrong "true" marks a genuine record Fake, takes `B` from its depositor and flags the device. A wrong "false" leaves a fake attested and takes `B` from the accuser |
| Can the vote be captured? | A party with enough votes can steer a decision. The security of the vote is UMA's |
| What bounds the damage? | One vote concerns one record. UMA cannot delete records, touch other records or change the rules |
| Who sets `f` and the minimum bond? | UMA. The deployer chooses `B`, which cannot be below UMA's minimum bond |

## Limits

| Limit | In plain words |
|---|---|
| No proof of physical origin | A key can sign any file, including a generated image. Nothing proves that a camera sensor or secure hardware is involved. Any account can register a key and attest a file it did not take |
| Only fakes with public evidence | The vote accepts an accusation only if the evidence is publicly checkable, for example the same image published before block `a`. A fake that leaves no such evidence stays attested |
| Only within `T_photo` | A commitment must come before the end of the challenge period. After the refund, nothing is at stake |
| The deposit bounds the punishment | See the next section. The expected loss of a forger lies between `p × f × B` and `p × B` |
| A flagged party can return | Registration is free. A flagged party registers a new key at no cost. It loses only the deposit of the proven record and the history of the old key |
| Self-accusation caps the loss | A forger that expects to be caught accuses itself first from a second account, with the real evidence. Its loss is `f × B`, not `B` |
| Capital locked in proportion to use | An account that attests `N` photos keeps `N × B` locked for at least `T_photo + T_reveal`. A large `B` excludes depositors with little capital |
| Linkable records | Anyone can list the records of one key and see the account that registered it and each depositor |
| Exact-file matching | The record matches one exact file. A resized, recompressed or cropped copy has a different photo hash and no record |
| A photographed screen | A device that photographs a fake image on a screen produces a normal record |
| The vote takes days and can err | Every accusation goes to a vote. Each vote takes days on a real network. A wrong vote affects one record and one key |
| A blocked accuser can lose its bond | A forger that holds its own commitment can reveal first when an honest reveal appears. The honest reveal then fails with "accusation open". If the vote outlasts the honest commitment's `T_reveal`, that commitment expires and loses `B`. Each such block costs the forger `f × B` |
| Evidence lives off the chain | The chain stores only the evidence hash. The accuser must publish the evidence where voters can find it |
| Open lists | Any account with a free key can attest a well-known file, at a refundable `B` each. `attestersOf` then lists every such key, and the verifier must judge each key |
| The contract cannot be patched | There is no owner and no upgrade. A fix needs a new deployment, and records do not move to it |
| No post-quantum signatures | Device keys are ECDSA on P-256. A large quantum computer could forge them |

## How much the deposit protects

Let `p` be the probability that someone proves the fake within the challenge period.
Let `G` be what the fake earns its forger.

- A forger that is caught loses `B`.
- A forger that expects to be caught can accuse itself first. It then loses only `f × B`.

So the expected punishment lies between `p × f × B` and `p × B`.
The deposit deters a fake only when `G` is below that punishment.

Two consequences follow.

1. The deployer must choose `B` from the value of what the records protect. A small `B` stops only low-value fakes.
   A large `B` excludes depositors who cannot lock `B` for each photo.
2. Nobody knows `p` in advance. Paprika works best where a fake leaves checkable traces, such as recycled or
   already published images.

Paprika fits settings where one fake is worth little and often leaves traces, such as sale listings.
It is not sufficient alone for news, elections or legal evidence.

## What to say, what not to say

Say:

1. A record proves that a registered key signed this exact file between two known blocks, with a deposit at stake.
2. No manufacturer, committee or administrator decides who takes part, and no party can delete a record.
3. A forger whose fake leaves public evidence can lose the deposit, and the accuser who proves it is paid.

Do not say:

1. "Paprika detects fakes."
2. "A record proves that the photo comes from a real camera."
3. "The deposit guarantees that nobody cheats."
