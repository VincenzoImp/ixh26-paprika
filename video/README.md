# Paprika video

On YouTube: https://youtu.be/YXVzxmXqm5s

`paprika.mp4`: 1920x1080, about 2 minutes, English narration. Made from the slides and screenshots of the running web app; voice synthesised with Piper (voice `en_US-ryan-high`), assembled with ffmpeg.

## Narration

- *slide 1* — This is Paprika. Every photo becomes a signed claim, with money at stake. Anyone can challenge it, and an open vote decides.
- *slide 2* — How do we prove that a photo came from a real sensor? The obvious answer is hardware keys, certified by trusted manufacturers. But one compromised manufacturer can invalidate millions of devices. Paprika trusts no manufacturer. We assume that a fake can be exposed with public evidence, and we make exposing it pay.
- *slide 3* — It works in four steps. A device registers its key, for free. To attest a photo, the device signs the photo's hash together with a recent block hash, and the photographer locks a deposit. Anyone can verify the file by reading the chain. And anyone can challenge it. The accuser commits, then reveals, with an equal bond. UMA's open vote decides, and the loser pays. If nobody challenges in time, the deposit comes back.
- *app: 04-attest-camera-live* — Here is the app. Alice connects MetaMask and takes a selfie.
- *app: 06-attest-done* — She signs and attests it. One confirmation, and the record is on chain.
- *app: 08-verify-signed-and-staked* — Anyone can verify the photo, with no wallet. It was signed between two blocks, with a deposit at stake.
- *app: 09-verify-tamper-no-record* — Change a single pixel, and the record is gone.
- *app: 10-bob-accuse-form* — Bob believes a photo is fake. He attaches public evidence, commits, and reveals.
- *app: 13-under-accusation-vote-pending* — Paprika sends the case to UMA's optimistic oracle, and the voters decide.
- *app: 23-record-proven-fake* — The evidence holds. The photo is marked as a proven fake, the device is flagged, and Bob earns the deposit.
- *app: 22-explorer-tx-refund-decoded* — Every step is a real transaction, readable in the built-in explorer.
- *slide 4* — So Paprika removes the three weaknesses of a centralised design. No single trust root. Any device, any verifier. And permanent records that nobody can erase.
- *closing* — Paprika. Photo origin that no single company can switch off. Built by team Sexy Plushies.
