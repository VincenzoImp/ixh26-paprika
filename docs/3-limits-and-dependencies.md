# 3. Limits and dependencies

Paprika does not depend on device makers. This choice has a price, and here we write it out in
full: what it depends on instead, what it cannot do, and how it compares with ORIGO on exactly
this point. The symbols (`B`, `T_photo`, `T_reveal`, `f`) are explained in
[document 1](1-how-it-works.md).

## Who Paprika depends on

| On whom | Depends? | How |
|---|---|---|
| Device makers | **No** | Nobody certifies the devices. Anyone can register a key |
| A committee or an authority that grants approval | **No** | There is none |
| An administrator of the contract | **No** | The contract has no owner and cannot be changed |
| A treasury or a shared fund | **No** | There is none. The only money is the deposits and bonds of individuals |
| Someone who watches the blockchain to defend honest users | **No** | Every accusation reaches a vote: no photo is condemned because of silence |
| **UMA** | **Yes** | It decides the accusations. It is the main dependency: see below |
| **The blockchain** | **Yes** | It holds records and deposits. It must be a public network for the guarantees to hold |
| **Whoever owns the device** | **Yes** | They must keep the key safe. If it is stolen, they can only revoke it |

### The dependency on UMA

| Question | Answer |
|---|---|
| Who decides, in practice? | The holders of the UMA token, with a public vote |
| How long does it take? | On a real network, 48 to 72 hours for each accusation |
| Can it get it wrong? | Yes. If it accepts a false accusation, a real photo is marked as fake, whoever attested it loses `B` and the device is flagged. The other records stay |
| Can it be corrupted? | Whoever controls enough votes can steer a decision. The security of the vote is UMA's, not ours |
| What limits it? | Each decision concerns a single photo. UMA cannot delete records, cannot touch other photos, cannot change the rules |
| Who sets `f` and the minimum bond? | UMA. We choose `B`, which cannot be below UMA's minimum |
| And in the demo? | The UMA contracts are the real ones, published on a local blockchain. The vote is simulated with the tool that UMA uses on test networks: we enter the outcome ourselves |

In short: **Paprika moves trust from the makers to UMA and to the deposit.** It does not remove
it.

## What Paprika cannot do

| Limit | In plain words |
|---|---|
| **It does not prove that the photo comes from a camera** | A registered device can sign a generated image. This is the direct result of having no makers |
| **It only catches fakes that leave public evidence** | If nobody can prove that the image is fake, the accusation is rejected and the fake stays attested |
| **Only within `T_photo`** | After that time the deposit has gone back and there is nothing left to take from whoever attested |
| **The penalty is limited by the deposit** | Whoever attests a fake risks at most `B`. If the fake earns them more, the deposit does not stop them |
| **Whoever fears being caught can limit the loss** | They can accuse themselves, with the real evidence, before someone else does: they lose `f×B` instead of `B` |
| **The ban is cheap** | Registering is free: whoever is flagged comes back with a new key. They lose the deposit on that photo and the device's history |
| **Capital locked in proportion to use** | Whoever attests N photos keeps N × `B` locked for the time `T_photo` |
| **A device's photos can be linked to each other** | Anyone can see which photos a device attested and which account registered it |
| **It only holds for the identical file** | A recompressed or cropped copy is, for the protocol, a different photo |
| **A photo of a screen** | A device that photographs a fake image on a screen produces a normal record |
| **The contract cannot be fixed** | If there is a flaw, a new one must be published |

## How much the deposit protects

Let `p` be the probability that someone proves a fake within `T_photo`, and `G` what the fake
earns whoever attests it.

- Whoever attests a fake and is caught loses `B`.
- If they accuse themselves first, they lose only `f×B`.

So the deposit discourages fakes for which `G` is less than `p × f × B` in the worst case, and
less than `p × B` in the best case.

Two consequences:

1. **`B` must be chosen based on how much the thing being protected is worth.** A small deposit
   stops only low-value fakes. A large deposit shuts out whoever cannot lock that amount for each
   photo.
2. **Nobody knows `p`.** The studies we found say that people and programs are bad at recognizing
   generated images by looking only at the pixels. Paprika works best where a fake leaves
   traces that can be checked: recycled photos, images already published elsewhere.

So Paprika suits settings where a fake is worth little and often leaves traces, such as sale
listings. It is not enough for news, elections or legal evidence.

## Paprika and ORIGO on the dependency on makers

| | ORIGO | Paprika |
|---|---|---|
| Who must exist for the system to say anything | At least one maker that registers the keys of its devices, plus whoever admits the makers (2 registrars out of 3) | Nobody: the contract is enough. For accusations, UMA |
| Who is trusted | The maker: that it registers only real devices and that the keys never leave the hardware | UMA, and the fact that whoever attests has money to lose |
| What a record proves | That a key vouched for by an admitted maker signed | That a registered key signed, with a deposit at stake |
| Link to a real camera | Yes, through the maker's word | No |
| Who can join | Whoever has a device from an admitted maker | Anyone |
| Who revokes | The registrars | UMA for an accused photo; whoever holds the key, for their own key |
| Photo privacy | A device's photos cannot be linked by someone who does not know its key | They can be linked by anyone |
| Main weak point | The dependency on makers and registrars | No proof of physical origin; dependency on UMA |

They are two different answers to the same track. ORIGO gives a stronger guarantee and
accepts trusting the makers. Paprika trusts no maker and accepts a weaker, economic guarantee.

## How to say it, and how not to say it

You can say:

1. A record proves that a registered device signed this exact file within a known time window,
   and that whoever attested it put a deposit at stake.
2. No maker, committee or administrator can decide who takes part or delete a record.
3. Whoever attests a fake that leaves public evidence loses the deposit, and whoever proves it
   gets paid.

You must not say:

1. "Paprika recognizes fakes."
2. "A record proves that the photo comes from a real camera."
3. "The deposit guarantees that nobody cheats."
