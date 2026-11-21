# Test ids of the Paprika web UI

Every control and status element of `index.html` carries a stable `data-testid`. Rows created at run time carry
the ids marked "(many)": select them with `getByTestId(...).first()`, `.nth(i)` or a filter.
Buttons are disabled while an action runs (`busy-indicator` visible) and whenever their action is not possible yet.
`app/e2e/screens.mjs` drives the whole demo with these ids and is a working example.

## Whole page

| Test id | Element |
|---|---|
| `fatal-message`, `fatal-title`, `fatal-reason`, `fatal-howto-text`, `fatal-howto` | Full-page message: no deployment, library, chain, or no secure context (WebCrypto) |
| `error-banner`, `error-message`, `btn-dismiss-error` | Banner with the revert reason of the last failed action |
| `busy-indicator` | Visible while an action runs |
| `tab-photographer`, `tab-verifier`, `tab-accuser` | Actor tabs (links to `#photographer`, `#verifier`, `#accuser`) |
| `view-photographer`, `view-verifier`, `view-accuser` | The three views (the shown one has class `on`) |
| `footer` | One-line footer |

## Header

| Test id | Element |
|---|---|
| `balance-photographer`, `balance-accuser`, `balance-store` | WETH balances, e.g. `1.5 WETH` |
| `delta-photographer`, `delta-accuser`, `delta-store` | Change caused by the last action (ETH wrapped into WETH counts as paid); empty if none |
| `header-credit-photographer`, `header-credit-accuser` | Credit waiting in Paprika, e.g. `+ 0.5 WETH credit`; empty if none |
| `chain-status` (`data-block`), `chain-dot` (class `off` when the chain stops answering), `chain-label` | Connection indicator |
| `params-panel`, `params-toggle` | Collapsible "Protocol parameters and contracts" (closed by default) |
| `param-bond`, `param-photo-window`, `param-reveal-window`, `param-fee`, `token-symbol` | Parameters read from the chain |
| `addr-token`, `addr-paprika`, `addr-oo`, `addr-store` | Short addresses (full value in `data-full`, `title`; click expands) |
| `chain-block`, `local-time` | Block number and chain time (inside the panel) |

## Explainer and timeline (right column)

| Test id | Element |
|---|---|
| `explainer` (`data-step` = current step title) | "What just happened" |
| `explainer-step`, `explainer-text`, `explainer-why`, `explainer-chain` | Step name, what happened, why the rule exists, transactions of the action |
| `activity-log` (class `showraw` when raw calls shown), `activity-log-table`, `activity-row` (many; `data-hash`) | Readable timeline; grouped voter rows ("UMA voters: 3 vote commits") |
| `timeline-raw-toggle`, `timeline-empty` | Checkbox for raw call names; empty-state text |

## Photographer

| Test id | Element |
|---|---|
| `btn-register` | Register the device (creates a key first if there is none) |
| `btn-generate-key` | "use a new key" link |
| `device-status` (`data-status` = `none` / `active` / `flagged`) | Device line |
| `device-key-id`, `device-pubkey`, `device-owner`, `register-tx` (`data-hash`), `register-block` | Details |
| `capture-preview`, `capture-placeholder`, `capture-file-name` | Photo preview |
| `btn-start-camera`, `btn-take-photo`, `btn-choose-file`, `input-capture-file` (hidden; `setInputFiles` works), `btn-sample-image` | Photo sources |
| `camera-hint` | Shown only when the camera is unavailable (not https / localhost) |
| `btn-attest`, `capture-result` | Sign & attest; one-line result |
| `capture-details`, `capture-hash`, `capture-anchor-block`, `capture-anchor-hash`, `capture-signature`, `record-window`, `record-deposit`, `record-locked-until`, `capture-txs` | Details |
| `deposits-table`, `deposits-empty` | "My photos" |
| `deposit-row` (many; `data-photo-hash`, `data-state`), `deposit-state` (many; chip), `deposit-when` (many) | One row per record of the Photographer |
| `btn-refund` (many; `data-photo-hash`), `btn-download` (many; only for photos attested in this session) | Row buttons |
| `deposits-credit`, `btn-deposits-withdraw` | Credit and Withdraw |
| `clock-time`, `btn-advance-time` | Demo clock: chain time; advance by T_photo + T_reveal + 1 s |
| `btn-revoke`, `revoke-why`, `revoke-status`, `revoke-tx` | Revoke this device key |

## Verifier

| Test id | Element |
|---|---|
| `verify-dropzone` (accepts dropped files), `verify-placeholder`, `verify-file-name` | Drop zone |
| `btn-verify-choose-file`, `input-verify-file` (hidden; `setInputFiles` works), `btn-verify-last` | Other ways to load a file |
| `verify-status` | Verdict card. `data-state` = `idle` / `no-record` / `attested` / `accused` / `unchallenged` / `fake` / `flagged-fake-proven` / `flagged-key-revoked`; `data-record-state` = `none` / `attested` / `accused` / `refunded` / `fake` |
| `verify-seal`, `verify-title`, `verify-detail` | Verdict texts |
| `verify-honest-sentence`, `verify-block-a`, `verify-block-b` | "What this record shows: ..." (hidden when no record) |
| `btn-change-pixel` | Change one pixel and verify again |
| `verify-record` (Details), `verify-hash`, `verify-record-device`, `verify-device-status`, `verify-window`, `verify-photo-state`, `verify-deposit`, `verify-records-count` | Details |
| `verify-other-records`, `verify-other-table`, `verify-other-row` (many) | Other records of a flagged device |

## Accuser

| Test id | Element |
|---|---|
| `accuse-step-1` … `accuse-step-4` (class `done` / `cur`) | Stepper |
| `accuse-panel-commit`, `select-accuse-photo` (option value `photoHash|keyId`), `btn-refresh-records`, `input-evidence`, `btn-commit`, `commit-status` | Step 1 |
| `commit-commitment`, `accuse-secret`, `accuser-address`, `commit-tx` | Step 1 details |
| `accuse-panel-reveal` (class `off` before the commit), `btn-reveal`, `reveal-status`, `reveal-photo`, `reveal-assertion-id`, `reveal-tx` | Step 2 |
| `accuse-panel-vote` (class `off` before the reveal), `btn-vote-fake`, `btn-vote-not-fake` | Step 3 |
| `vote-phases`, `vote-phase-commit`, `vote-phase-reveal`, `vote-phase-settled` (class `run` / `done`) | Vote progress |
| `accuse-panel-settle` (hidden until the vote), `settle-outcome` (`data-outcome` = `fake-proven` / `not-proven`) | Step 4 |
| `settle-accuser`, `settle-depositor`, `settle-store` | Money moved (measured) |
| `settle-formula-*`, `settle-expected-*` (`accuser`, `depositor`, `store`) | Rule with B and f; expected amounts |
| `credit-accuser`, `credit-photographer`, `btn-withdraw-accuser`, `btn-withdraw-photographer` | Credits and Withdraw |
| `btn-accuse-verify`, `btn-accuse-new`, `vote-tx` (hidden; all vote tx hashes) | Next actions |
