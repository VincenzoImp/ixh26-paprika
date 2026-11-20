# impl/: demo page for Paprika

## What is here

`mock/ui-mock.html` is a **static, clickable mock** of the demo page. It has no back end; it
computes nothing. It exists so the team can agree on the look and the demo story before the real
implementation, and compare it on equal terms with the ORIGO mock in the sibling repository
(same layout, typography and colours). It follows the final protocol in
`docs/1-come-funziona.md`: no manufacturers, no authority, no administrator.

- **Device:** device key, proof of possession, 0.25 ETH deposit, registration transaction.
- **Capture:** recent block as anchor, digest, device signature, relayed by another account,
  record with its block window.
- **Verify:** clean record; one pixel changed (no record); device flagged after an upheld
  accusation (photo marked as proven fake, earlier records still shown); device flagged because
  its key left the device (records shown, archive no longer trusted); "nothing erased" history.
- **Challenge:** (a) accuse a photo: sealed commitment and 0.11 ETH bond, reveal, automatic
  defence with 0.11 ETH of the deposit, simulated arbiter, both outcomes with money flows (part
  of the live demo, arbiter simulated); (b) prove the key left the device: decided by the
  contract, 0.125 ETH to the prover, 0.125 ETH burned.
- What a record shows: this registered device signed this exact file between block A and block B,
  with a deposit at stake. It never shows that the file is a camera capture.
- Hashes, addresses and block numbers are placeholders. Parameters come from
  `docs/1-come-funziona.md`; gas and payouts from `contract/output/2026-11-20-run.txt`.
  Only the registration gas (146,111) is measured there so far; other gas figures are "—".
- `mock/mock-*.png`: one screenshot per screen/state (headless Chromium, 1280 px wide).

## How to open it

Open `mock/ui-mock.html` in any browser, from disk; it uses no network resource. Each state has
its own URL fragment. Demo order: `#device-done` → `#capture-done` → `#verify-ok` →
`#verify-pixel` → `#challenge-leaked` → `#verify-leaked` → `#challenge-commit` →
`#challenge-reveal` → `#challenge-rejected` → `#verify-history`. Other outcome:
`#challenge-upheld` → `#verify-upheld`.

Screenshots were rendered with:

```
docker run --rm -v "$PWD/mock":/w --entrypoint chromium-browser zenika/alpine-chrome \
  --headless --no-sandbox --hide-scrollbars --window-size=1280,1100 \
  --screenshot=/w/mock-verify-ok.png "file:///w/ui-mock.html#verify-ok"
```

## What the real prototype adds

- The `Paprika` contract (`contract/contracts/Paprika.sol`) on a local Ethereum EVM chain
  (Hardhat), with real transactions behind every button: registration, attestation, accusation
  (commit, reveal, automatic defence) and proof that a key left the device.
- Real SHA-256 of the file in the browser and real P-256 signatures by a simulated device key
  (`TEST ONLY — NOT SECRET`).
- `verify` read from the chain: window, device status, flag block and reason, deposit at stake,
  open challenges.
- Still simulated: the device key (software), the chain (local), the arbiter (we choose the
  outcome).
