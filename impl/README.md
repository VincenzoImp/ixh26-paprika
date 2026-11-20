# impl/: Paprika demo app

## What is here

`mock/ui-mock.html` is a **static, clickable preview of the live demo app**: the screens the team
will click through in the 90-second demo. It has no back end and computes nothing. It follows the
final protocol in `docs/1-come-funziona.md` and keeps the visual language of the ORIGO mock in
the sibling repository.

- **Header on every screen:** local Ethereum chain, block number, Paprika and UMA Optimistic
  Oracle V3 addresses; parameter chips (B, challenge period, reveal period, UMA fee f), marked
  "set at deployment" (the app reads them from the contract; the mock shows placeholders);
  balances in a test ERC-20 token for Photographer, Accuser and UMA Store; local time with the
  demo control "Advance time by one challenge period".
- **Device:** key, proof of possession, free registration. **Capture:** block hash, photo hash,
  device signature, token approval + attest with deposit B, record with block window and lock
  time. **Verify:** attested; one pixel changed; under accusation; unchallenged (deposit
  returned); proven fake; device flagged (fake proven / key revoked) with other records listed.
  **Accuse:** commit, reveal, UMA vote (simulated with UMA's mock oracle), settle with the flows
  in B and f. **Deposits:** refunds enabled after the period, one refunded. **Revoke key:** no
  money moves. **Activity log** of the session's transactions on every screen.
- `mock/mock-<screen>-<state>.png`: one screenshot per state.
- `mock/DEMO.md`: the 90-second click path and what the audience should notice.

## How to open it

Open `mock/ui-mock.html` in a browser, from disk (no network). Each state has a URL fragment,
e.g. `#capture-done`, `#verify-pixel`, `#accuse-vote`, `#accuse-rejected`, `#deposits-advanced`.

Screenshots were rendered with:

```
docker run --rm -v "$PWD/mock":/w --entrypoint chromium-browser zenika/alpine-chrome \
  --headless --no-sandbox --hide-scrollbars --window-size=1280,1200 \
  --screenshot=/w/mock-verify-ok.png "file:///w/ui-mock.html#verify-ok"
```

## What the real app adds

- Real transactions against `contract/contracts/Paprika.sol` and UMA's Optimistic Oracle V3
  contracts deployed on a local Ethereum chain; parameters and balances read from the chain.
- Real SHA-256 of the file in the browser and real P-256 signatures by a software device key.
- The UMA vote entered through UMA's mock oracle; time advanced with the local chain's
  time-travel call.
- Simulated: the device key (software) and UMA's token-holder vote (outcome entered by us).
