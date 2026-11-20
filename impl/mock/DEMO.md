# Paprika live demo: the 90-second click path

The screenshots in this folder (`mock-<screen>-<state>.png`) show each step. The parameters B,
challenge period and reveal period are read from the contract; say "B", not a number.

| # | Click | Audience should notice |
|---|---|---|
| 1 | **Device → Register (free)** (~10 s) | The device signs a proof of possession; registration costs nothing and **no manufacturer or authority approves the device**. The tx appears in the activity log. |
| 2 | **Capture → Take photo, sign & submit** (~15 s) | The recent block hash is read *before* the shot; the device signs photo hash + block hash; approve + attest lock **B**. The record has a block window and "deposit locked until …". The Photographer's balance drops by B. |
| 3 | **Verify this photo** (~10 s) | Green: attested, deposit locked, can still be accused. Read the honest sentence aloud: *a registered device signed this exact file between block A and block B, and a deposit was at stake.* It does not claim a camera capture. |
| 4 | **Negative case 1: One pixel changed** (~5 s) | No record: the hash differs. |
| 5 | **Accuse → Commit** (~10 s) | Only a hash goes on chain, with bond B: **nobody can tell which photo is accused**. Accuser's balance drops by B. |
| 6 | **Reveal** (~10 s) | The contract asserts the accusation to UMA's real Optimistic Oracle V3 and disputes it at once with the photo's deposit: every accusation goes to a vote. |
| 7 | **Negative case 2: "Evidence does not prove it"** (~10 s) | Vote simulated with UMA's mock oracle. False accusation rejected: accuser −B; depositor +(B − f×B); UMA Store +f×B. Balances strip moves accordingly. |
| 8 | **Advance time by one challenge period → Deposits** (~10 s) | Demo control on the local chain. The Refund buttons become active; the photo shows "unchallenged" and B goes back. The record stays. |
| 9 | **Open the activity log** (~10 s) | Every step above is a transaction with a hash on the local chain. |

Optional if time remains: **"Evidence proves the fake"** (accuser gets B back + (B − f×B);
photo marked fake, device flagged, earlier records still listed), and **Revoke key** (device
flagged, no money moves).

Say plainly: the device key is software, and UMA's token-holder vote is simulated (we enter the
outcome). Contracts, signatures, deposits and payouts are real, on a local Ethereum chain.
