# Test ids of the Paprika web app

Every control and status element carries a stable `data-testid`. Rows drawn at run time carry the ids marked
"(many)". `window.paprikaState` exposes the page state (read-only use). The end-to-end suites in `app/e2e/` use these
ids with a stand-in for MetaMask (`e2e/fake-metamask.mjs`).

## Shell (every page)

| Test id | Element |
|---|---|
| `nav-verify`, `nav-attest`, `nav-activity`, `nav-explorer` | Navigation (routes `#/verify`, `#/attest`, `#/activity`, `#/explorer`) |
| `page` (`data-page`) | The page area |
| `protocol-toggle` | "Protocol view" switch (also `?protocol=1`) |
| `network-pill` | Network and block number |
| `network-banner` | "Local test network …" (local network only) |
| `account` | Header account area |
| `btn-connect` | "Connect MetaMask" (the only way to connect) |
| `btn-switch-chain` | "Switch to Paprika local" (MetaMask on another chain) |
| `account-button`, `account-name` (Alice / Bob / empty), `account-address`, `account-eth`, `account-claim-badge` | Connected account |
| `account-menu-slot`, `account-menu` | Account menu |
| `menu-address`, `menu-eth`, `menu-weth`, `menu-prepared`, `btn-prepare` | Address, balances, "Prepare account" (wrap + approve once) |
| `menu-credit`, `btn-claim` | Claimable credit |
| `menu-device-key`, `device-status` (`data-status` = `none` / `active` / `flagged`), `btn-register`, `btn-export-device`, `btn-import-device`, `input-import-device`, `btn-revoke` | Device key of this browser |
| `btn-disconnect` | Disconnect |
| `toasts`, `toast` (many; `data-status` = `pending` / `ok` / `failed` / `rejected`; `data-action`), `toast-title`, `toast-text`, `toast-tx` (links to the explorer) | Transaction toasts |
| `<name>-dialog`, `<name>-ok`, `<name>-cancel` for `<name>` = `confirm-attest`, `confirm-commit`, `prepare`, `revoke` | Confirmation dialogs |
| `local-tools`, `local-tools-toggle`, `local-tools-bar`, `clock-time`, `btn-advance-time`, `advance-why`, `btn-vote-fake`, `btn-vote-not-fake` (many: one per open accusation) | Local network tools (local network only) |
| `protocol-drawer`, `protocol-close`, `protocol-map`, `map-<step>`, `explainer`, `explainer-step`, `explainer-text`, `explainer-why`, `explainer-chain`, `params-panel`, `param-bond`, `param-photo-window`, `param-reveal-window`, `param-fee`, `settle-table`, `settle-accuser`, `settle-depositor`, `settle-store`, `settle-expected-*`, `settle-check` | Protocol view drawer |
| `fatal-message`, `fatal-title`, `fatal-reason`, `fatal-howto` | Network unreachable / no secure context |

## Verify (`#/verify`, home)

`verify-dropzone`, `btn-verify-choose-file`, `input-verify-file`, `btn-verify-last`, `verify-file-name`,
`verify-error` (empty file), `verify-warning` (non-image, several files), `verify-status` (`data-state` = `no-record`
/ `attested` / `accused` / `unchallenged` / `fake` / `flagged-fake-proven` / `flagged-key-revoked`; `data-record-state`),
`verify-status-seal`, `verify-status-title`, `verify-status-detail`, `record-scope`, `verify-honest-sentence`,
`verify-attesters`, `verify-hash-compare`, `btn-open-record`, `btn-change-pixel` ("Tamper test"),
`verify-hash`, `recent-records`, `recent-row` (many), `recent-empty`.

## Attest (`#/attest`)

`capture-preview` (class `mirror`), `camera-video`, `capture-placeholder`, `toggle-mirror`, `btn-start-camera`
("Start camera" / "Retake"), `btn-take-photo`, `btn-choose-file`, `input-capture-file`, `btn-sample-image` (local
only), `capture-error`, `capture-warning`, `attest-summary`, `capture-file-name`, `capture-hash`, `attest-device`,
`attest-refusal`, `attest-why`, `btn-new-key-attest`, `attest-prepare-hint`, `btn-prepare-inline`, `btn-attest`,
`attest-blocked` (reason), `capture-result-box`, `capture-result`, `btn-view-record`, `btn-new-photo`.

## Record (`#/record/<photoHash>[/accuse][?key=<keyId>]`)

`record-hash`, `btn-copy-link`, `record-verdict` (same `data-state` values as `verify-status`), `record-verdict-title`,
`record-verdict-detail`, `btn-skip-wait` (local), `btn-vote-fake-inline`, `btn-vote-not-fake-inline` (local),
the one contextual action: `btn-reveal` / `btn-refund` / `btn-claim-record` / `btn-accuse`, `record-action-why`,
`record-lifecycle` (`data-current`), `record-details`, `record-depositor`, `record-scope`, `btn-download`,
`record-history`, `history-row` (many), `record-accusations`, `accusation-row` (many; `data-open`),
`accusation-open`, `settle-outcome` (`data-outcome` = `fake-proven` / `not-proven`), `evidence`, `evidence-link`,
`evidence-text`, `evidence-hash-ok`, `evidence-missing`.
Accuse panel: `accuse-panel`, `accuse-stepper`, `accuse-step-1` … `accuse-step-4` (class `done` / `cur`),
`uma-question`, `input-evidence`, `btn-evidence-file`, `input-evidence-file`, `btn-evidence-example` (local),
`btn-commit`, `commit-why`, `reveal-deadline`, `btn-forfeit`, `vote-waiting`, `reveal-status` ("Bond returned …"),
`accuse-done`, `btn-accuse-new`.

## My activity (`#/activity`)

`activity-empty`, `deposits-credit`, `btn-deposits-withdraw` (Claim), `activity-tab-records`,
`activity-tab-accusations`, `activity-tab-txs`, `deposits-table`, `deposit-row` (many; `data-photo-hash`,
`data-state`), `record-state-chip` (many), `btn-refund` (many), `deposits-empty`, `accusations-table`,
`my-accusation-row` (many), `my-transactions`, `my-tx-row` (many).

## Explorer (`#/explorer`, `#/tx/<hash>`, `#/block/<n>`, `#/address/<a>`, `#/device/<keyId>`)

`explorer-search`, `btn-explorer-search`, `explorer-blocks`, `explorer-block-row` (many), `explorer-txs`,
`explorer-tx-row` (many), `tx-page`, `tx-hash`, `tx-status`, `tx-from`, `tx-call` (`data-method`, e.g.
`Paprika.attest`), `tx-events`, `tx-event` (many; `data-event`, e.g. `Attested`), `tx-open-record`, `tx-missing`,
`block-page`, `address-page`, `device-page`.

## Added in the staging-3 / design pass

- Shell: `local-tools-toggle` is now a header button ("Local network tools"); the bar `local-tools-bar` opens in the page
  flow under the banner (never over content) and has `local-tools-close`. It holds only the chain clock
  (`clock-time`, `btn-advance-time`, `advance-why`); the vote chips live next to the waiting vote.
- `btn-switch-chain` reads "Wrong network · Switch to Paprika local"; the `network-pill` turns rose then.
- `toast-close`; ok and rejected toasts close by themselves after 6 s, failed ones stay.
- Dialog confirm labels: `confirm-attest-ok` "Attest in MetaMask", `confirm-commit-ok` "Commit in MetaMask",
  `prepare-ok` "Prepare in MetaMask", `revoke-ok` "Revoke in MetaMask" (danger, focus on Cancel),
  `forfeit-dialog` / `forfeit-ok` / `forfeit-cancel` (danger).
- Record: `record-bad-link` (malformed link), the action and `record-action-why` sit inside `record-verdict`;
  `record-scope` under the lifecycle; `record-accusation-count` ("1 committed by you (hidden until you reveal)");
  `settle-money` (three cells: accuser, depositor, UMA fee); accuse panel `commit-pending`, `btn-discard-pending`,
  `commit-error` ("Add the evidence first…"), `vote-in-progress`; stepper labels "1 Commit" … "4 Settled".
- Menu: `btn-claim` shown only when the credit is above 0; My activity's claim is "Claim to wallet".
