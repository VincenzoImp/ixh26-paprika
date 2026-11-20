# impl/: demo page for Paprika v2

## What is here

`mock/ui-mock.html` is a **static, clickable mock** of the demo page for Paprika v2 (spec
revision v2.5, contract `PaprikaCore` / `PaprikaV2_5`). It has no back end; it computes nothing. It exists so the
team can agree on the look and the demo story before the real implementation, and compare it on
equal terms with the ORIGO mock in the sibling repository (same layout, typography and colours).

- **Device:** register a key at assurance level 0 (self-registered, economic guarantee only) or
  level 1 (endorsed by a bonded issuer, with its bond and counters "keys endorsed / keys flagged
  for misuse"); proof of possession; 0.25 ETH stake; registration transaction.
- **Capture:** anchor block, digest, device signature, relayer, record `[not-before, not-after]`.
- **Verify:** clean level-0 record; level-1 record whose outcome depends on the verifier's
  "trusted issuers" list; one pixel changed; key flagged for misuse (both policies distrust the
  whole archive); record with an upheld claim (policies diverge); "nothing erased" with event log.
- **Challenge:** two panels: proof of key misuse (level 0: 0.125 to the challenger, 0.125
  burned; level 1: plus the issuer's 0.1 bounty), and a claim by vote (commit, reveal, automatic
  contest, simulated vote, both outcomes with money flows), marked "not in the live demo: oracle
  mock". The proof of prior existence (v2.3–v2.4) was withdrawn in v2.5 and is not shown.
- Hashes, addresses and block numbers are placeholders. Gas comes from the v2.4 gas table in
  `experiments/p03-paprika-v2-hardened/README.md` (v2.5 not yet measured). Costs on public networks come from `experiments/p05-chain-options`
  (computed there for v2's 86,026-gas attest, so they are upper bounds). "—" means not measured.
- `mock/mock-*.png`: one screenshot per screen/state (headless Chromium, 1280 px wide).

## How to open it

Open `mock/ui-mock.html` in any browser, from disk; it uses no network resource. Each state has
its own URL fragment, e.g. `ui-mock.html#verify-l1x`, `#challenge-commit`. Demo order:
`#device-done` → `#capture-done` → `#verify-ok` → `#verify-pixel` → `#challenge-misuse` →
`#verify-misuse` → `#challenge-commit` → `#challenge-pending` → `#challenge-rejected` →
`#verify-history`. Extra states: `#device-done1`, `#verify-l1`, `#verify-l1x`,
`#challenge-misuse1`, `#challenge-upheld`, `#verify-upheld`.

Screenshots were rendered with:

```
docker run --rm -v "$PWD/mock":/w --entrypoint chromium-browser zenika/alpine-chrome \
  --headless --no-sandbox --hide-scrollbars --window-size=1280,1100 \
  --screenshot=/w/mock-verify-ok.png "file:///w/ui-mock.html#verify-ok"
```

## What the real prototype adds

- `PaprikaCore` / `PaprikaV2_5` deployed on a local Ethereum EVM chain (Hardhat, hardfork osaka,
  P-256 precompile at `0x100`), with real transactions behind the device, capture, verify and
  misuse-proof buttons. The claim-by-vote path runs only against an oracle mock and is not part of
  the live demo.
- Real SHA-256 of the file in the browser; real P-256 signatures by simulated device keys and
  real issuer endorsements by simulated issuers (`TEST ONLY — NOT SECRET`).
- `verify(H, keyId)` read from the chain (level, issuer, stake at risk, withdrawal block), and the
  trusted-issuer policy applied in the page.
- Still simulated: device keys, issuers, the chain (local), the oracle vote.
