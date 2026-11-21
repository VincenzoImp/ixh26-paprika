# Test ids of the Paprika web UI

Every control and status element of `index.html` carries a stable `data-testid`. Rows created at run time
carry the ids marked "(many)"; select them with `getByTestId(...).filter(...)` or `.nth(i)`.
Buttons are disabled while a transaction is pending, and whenever their action is not possible yet.

## Whole page

| Test id | Element |
|---|---|
| `fatal-message`, `fatal-reason` | Full-page message when `/deployment.json`, the library or the chain cannot be reached |
| `error-banner`, `error-message`, `btn-dismiss-error` | Red banner with the reason of the last failed action (revert reason), and its Dismiss button |
| `busy-indicator` | Visible while an action is running |
| `tab-device`, `tab-capture`, `tab-verify`, `tab-accuse`, `tab-deposits`, `tab-revoke` | Tabs (links to `#device`, ...) |
| `view-device`, `view-capture`, `view-verify`, `view-accuse`, `view-deposits`, `view-revoke` | The six views (the shown one has class `on`) |
| `footer` | REAL / SIMULATED footer |
| `activity-log`, `activity-log-toggle`, `activity-log-table`, `activity-row` (many) | Collapsible activity log; one row per transaction (`data-hash` = tx hash) |

## Header

| Test id | Element |
|---|---|
| `chain-status` (`data-block`), `chain-block` | Chain bar, latest block number |
| `addr-paprika`, `addr-oo` | Short addresses (full address in `title`) |
| `param-bond`, `param-photo-window`, `param-reveal-window`, `param-fee`, `token-symbol` | Parameters read from the contract |
| `balance-photographer`, `balance-accuser`, `balance-store` | Token balances, e.g. `90 TT` |
| `delta-photographer`, `delta-accuser`, `delta-store` | Change caused by the last action, e.g. `−10 TT` (empty if none) |
| `local-time` | Chain time of the latest block |
| `btn-advance-time` | Demo control: advance by challenge period + reveal period + 1 s |

## Device

`device-key-id` (full 0x id), `device-pubkey`, `device-owner`, `device-status` (`data-status` = `none` / `active` /
`flagged`), `btn-generate-key`, `btn-register`, `device-steps`, `device-step-key`, `device-pop-owner`,
`register-tx` (`data-hash`), `register-block`, `btn-goto-capture`.

## Capture

`capture-preview`, `capture-placeholder`, `capture-file-name`, `btn-start-camera`, `btn-take-photo`,
`btn-choose-file`, `input-capture-file` (hidden `<input type=file>`: use `setInputFiles`), `btn-sample-image`,
`btn-attest` (sign and submit the loaded photo), `capture-steps`, `capture-anchor-block`, `capture-anchor-block-text`,
`capture-anchor-hash`, `capture-hash`, `capture-signature`, `capture-approve-tx`, `capture-attest-tx`
(`data-hash`), `capture-attest-block`, `capture-record` (class `dim` until a photo is attested), `record-hash`
(full hash in `title`), `record-device`, `record-window`, `record-deposit`, `record-locked-until`,
`record-block-a`, `record-block-b`, `btn-download-photo`, `btn-goto-verify`.

## Verify

`verify-dropzone` (accepts dropped files), `verify-placeholder`, `verify-file-name`, `verify-hash`,
`btn-verify-choose-file`, `input-verify-file` (hidden file input), `btn-verify-last`, `btn-change-pixel`,
`verify-status` (verdict box), `verify-seal`, `verify-title`, `verify-detail`, `verify-record`,
`verify-record-hash`, `verify-record-device`, `verify-device-status`, `verify-window`, `verify-photo-state`,
`verify-deposit`, `verify-records-count`, `verify-honest-sentence`, `verify-block-a`, `verify-block-b`,
`verify-other-records`, `verify-other-table`, `verify-other-row` (many).

`verify-status` has `data-state` =
`idle` | `no-record` | `attested` | `accused` | `unchallenged` | `fake` | `flagged-fake-proven` | `flagged-key-revoked`,
and `data-record-state` = the raw record state (`none` | `attested` | `accused` | `refunded` | `fake`).

## Accuse

`accuse-step-1` … `accuse-step-4` (class `done` / `cur`), `select-accuse-photo` (option value =
`photoHash|keyId`), `btn-refresh-records`, `input-evidence`, `accuse-secret`, `btn-commit`, `btn-reveal`,
`btn-accuse-new`, `accuser-address`, `accuse-panel-commit`, `commit-commitment`, `commit-tx`, `commit-block`,
`commit-status`, `accuse-panel-reveal`, `reveal-tx`, `reveal-photo`, `reveal-assertion-id`, `accuse-panel-vote`,
`btn-vote-fake`, `btn-vote-not-fake`, `accuse-panel-settle`, `settle-outcome` (`data-outcome` = `fake-proven` /
`not-proven`), `settle-row-fake`, `settle-row-not-proven` (class `hl` on the outcome), `settle-accuser`,
`settle-depositor`, `settle-store` (measured), `settle-formula-accuser`, `settle-formula-depositor`,
`settle-formula-store`, `settle-expected-accuser`, `settle-expected-depositor`, `settle-expected-store`, `vote-tx`,
`credit-accuser`, `credit-photographer`, `btn-withdraw-accuser`, `btn-withdraw-photographer`, `btn-accuse-verify`.

## Deposits

`deposits-table`, `deposit-row` (many; `data-photo-hash`, `data-state`), `deposit-state` (many, inside a row),
`btn-refund` (many; `data-photo-hash`), `deposits-empty`, `deposits-credit`, `btn-deposits-withdraw`,
`btn-deposits-refresh`.

## Revoke key

`revoke-device`, `revoke-message`, `btn-revoke`, `revoke-result` (class `dim` until revoked), `revoke-tx`,
`revoke-status`, `btn-revoke-verify`.

## Added

`header-credit-photographer`, `header-credit-accuser` (credit in Paprika next to each wallet balance, header);
`revoke-why` (why Revoke is disabled, e.g. device already flagged).
