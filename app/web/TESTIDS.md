# Test ids of the Paprika web UI

Every control and status element of `index.html` carries a stable `data-testid`. Rows created at run time carry
the ids marked "(many)": select them with `getByTestId(...).first()`, `.nth(i)` or a filter.
Buttons are disabled while an action runs (`busy-indicator` visible) and whenever their action is not possible yet.
`app/e2e/demo.e2e.mjs` and `app/e2e/screens.mjs` drive the whole demo with these ids.
`window.paprikaState` exposes the page state (read-only use).

## Whole page

| Test id | Element |
|---|---|
| `fatal-message`, `fatal-title`, `fatal-reason`, `fatal-howto-text`, `fatal-howto`, `fatal-retry` | Full-page message: no deployment, library or chain (retries by itself), or no secure context (SSH tunnel command with the real port) |
| `error-banner` (class `info` for a notice), `error-message`, `btn-dismiss-error` | Banner: revert reason of a failed action, or a notice (e.g. "The chain was restarted or Paprika was redeployed ...") |
| `busy-indicator` | Visible while an action runs |
| `tab-photographer`, `tab-verifier`, `tab-accuser` | Actor tabs (`#photographer`, `#verifier`, `#accuser`) |
| `view-photographer`, `view-verifier`, `view-accuser` | The three views (the shown one has class `on`) |
| `footer` | One-line footer |

## Header, parameters, protocol map

| Test id | Element |
|---|---|
| `balance-photographer`, `balance-accuser`, `balance-store` | WETH balances, e.g. `1.5 WETH` |
| `delta-photographer`, `delta-accuser`, `delta-store` | Change caused by the last action (ETH wrapped into WETH counts as paid); empty if none |
| `header-credit-photographer`, `header-credit-accuser` | `+ 0.5 WETH credit`; empty if none |
| `chain-status` (`data-block`), `chain-dot` (class `off` when the chain stops answering), `chain-label` | Connection indicator |
| `params-panel` | "Parameters & contracts" (right end of the protocol map row; closed by default) |
| `param-bond`, `param-photo-window`, `param-reveal-window`, `param-fee`, `time-zone` | B, T_photo, T_reveal, f (set by UMA), the zone of the shown times (inside the panel; B and T_photo also in the map) |
| `contracts-panel`, `params-toggle` | The panel and its toggle |
| `token-symbol`, `addr-token`, `addr-paprika`, `addr-oo`, `addr-store`, `chain-block`, `local-time` | Inside the contracts panel (addresses: full value in `data-full`, click expands) |
| `protocol-map` (`data-step` = current step) | Protocol map strip |
| `map-register`, `map-attest` (shows B), `map-challenge` (shows T_photo; lit for commit, reveal, vote, outcome), `map-refund`, `map-verify`, `map-revoke` | Map steps (class `cur` = step of the last action, `seen` = done earlier) |

## Explainer and timeline (right column)

| Test id | Element |
|---|---|
| `explainer` (`data-step` = current title), `explainer-kicker` ("How it works" before any action, then "What just happened") | Explainer card |
| `explainer-step`, `explainer-text`, `explainer-why`, `explainer-chain` | Step name, what happened, why the rule exists, grouped transactions (wrap + approve + attest in one expandable line; 7 vote tx in one line) |
| `activity-log` (class `showraw` with raw calls), `activity-log-table`, `activity-row` (many; `data-hash`) | Timeline, one row per action group |
| `timeline-raw-toggle`, `timeline-empty` | Raw call names on/off; empty-state text |

## Photographer

| Test id | Element |
|---|---|
| `register-card` (class `done` once registered: one line), `btn-register`, `btn-generate-key` ("new key", shown once a key is registered; the old key stays saved), `device-status` (`data-status` = `none` / `active` / `flagged`), `flag-note`, `old-keys` | ① Register |
| `device-key-id`, `device-pubkey`, `device-owner`, `register-tx` (`data-hash`), `register-block` | ① Details |
| `capture-preview` (class `mirror` when mirrored), `capture-placeholder`, `capture-tag` ("Live camera" / "Still: ..."), `camera-video` | ② Big preview |
| `btn-start-camera`, `btn-take-photo` ("Take a selfie"), `btn-retake`, `btn-attest` ("Sign & attest (locks B)"), `btn-new-photo` ("Take another photo", after a success) | ② Main flow (one primary visible at a time) |
| `btn-choose-file`, `input-capture-file` (hidden; `setInputFiles` works), `btn-sample-image`, `toggle-mirror` (off by default), `mirror-note` | ② Alternatives and mirror |
| `camera-hint` | Only when the camera is unavailable (not https / localhost) |
| `capture-file-name`, `capture-warning` (non-image), `attest-refusal` + `attest-why` (why Sign & attest is refused: flagged key, already attested; never shown for the photo just attested), `btn-new-key-attest` (flagged key: register a new key in one click), `capture-result-box`, `capture-result` ("✓ Recorded on chain · B locked"), `capture-result-detail` | ② Status lines |
| `capture-details`, `capture-hash`, `capture-anchor-block`, `capture-anchor-hash`, `capture-signature`, `record-window`, `record-deposit`, `record-locked-until`, `capture-txs` | ② Details (collapsed) |
| `deposits-table`, `deposits-empty`, `deposit-row` (many; `data-photo-hash`, `data-state`), `deposit-key` (many), `deposit-state` (many; "open · until HH:MM", "not proven fake · refundable", "challenge period over · refundable", "… · refunded", "under accusation", "proven fake"; full times in `title`), `deposit-when` (many) | My photos |
| `btn-refund` (many; `data-photo-hash`; visible only when refundable, disabled otherwise), `btn-download` (many; photos attested in this session; keeps the file type) | Row buttons |
| `deposits-credit`, `btn-deposits-withdraw` | Credit and Withdraw |
| `clock-time`, `btn-advance-time` (enabled only when an attested photo is still in its challenge period and no accusation is open), `advance-why` | Demo clock |
| `btn-revoke`, `revoke-why`, `revoke-status`, `revoke-tx` | ⑥ Revoke |

## Verifier

| Test id | Element |
|---|---|
| `verify-dropzone`, `verify-placeholder`, `verify-file-name`, `verify-warning` (non-image; several files dropped) | Drop zone |
| `btn-verify-choose-file`, `input-verify-file` (hidden; `setInputFiles` works), `btn-verify-last` | Other ways to load a file |
| `verify-status` (full width, headline 34 px; class `none` grey for no record, `bad` red only for proven fake) | Verdict. `data-state` = `idle` / `no-record` / `attested` ("Signed and staked · open to challenge") / `accused` / `unchallenged` ("Signed · N accusation(s) rejected · deposit returned", "Signed · never accused · …") / `fake` / `flagged-fake-proven` ("Not judged · its key is flagged") / `flagged-key-revoked` ("Not judged · its key was revoked …"); `data-record-state` = raw state |
| `verify-seal`, `verify-title`, `verify-detail` | Verdict texts |
| `verify-shows` (one box), `verify-honest-sentence`, `verify-block-a`, `verify-block-b`, `verify-not-shown` ("Not shown: that a camera took this photo, or who took it.") | Shown with every record |
| `verify-hash-compare` | "SHA-256 before … → after …" after a pixel change |
| `btn-change-pixel` | Change one pixel and verify again (images only) |
| `verify-attesters`, `verify-attester-row` (many) | One line per key when several keys attested the file |
| `verify-record` (Details), `verify-hash`, `verify-record-device`, `verify-device-status`, `verify-depositor`, `verify-window`, `verify-photo-state`, `verify-deposit`, `verify-accusations`, `verify-records-count` | Details |
| `verify-other-records`, `verify-other-table`, `verify-other-row` (many) | Other records of a flagged key |

## Accuser

| Test id | Element |
|---|---|
| `accuse-step-1` … `accuse-step-4` (class `done` / `cur`) | Stepper |
| `accuse-panel-commit`, `uma-question`, `uma-question-key` | UMA's question (no double negative) and the burden-of-proof rule |
| `open-accusations`, `open-accusation-row` (many), `btn-pick-accusation` (many; `data-assertion`) | Open accusations on the chain that the page is not showing; pick one to vote on (never switched silently) |
| `select-accuse-photo` (only photos open to challenge now, newest first; value `photoHash|keyId`), `accuse-not-accusable` (why others are not offered), `btn-refresh-records`, `input-evidence` | Commit form |
| `btn-commit`, `btn-accuse-new` (disabled while a commitment can still be revealed), `accuse-new-why`, `btn-forfeit` (burn an expired bond), `commit-status`, `reveal-deadline` (countdown, chain time) | Commit actions and status |
| `commit-commitment`, `accuse-secret`, `accuser-address`, `commit-tx` | Commit details |
| `accuse-panel-reveal` (class `off` before the commit), `btn-reveal` (disabled once the next block would be too late), `reveal-status` ("Bond returned: …" when no accusation opened), `reveal-photo`, `reveal-assertion-id`, `reveal-tx` | Reveal |
| `accuse-panel-vote` (class `off` before the reveal), `btn-vote-fake` ("Voters say FAKE (evidence proves it)"), `btn-vote-not-fake` ("Voters say NOT PROVEN") | UMA vote |
| `vote-phases`, `vote-phase-commit`, `vote-phase-reveal`, `vote-phase-settled` (inline text; class `run` / `done`) | Vote progress |
| `accuse-panel-settle` (hidden until the vote; scrolled into view), `settle-outcome` (`data-outcome` = `fake-proven` / `not-proven`), `settle-summary` (one line: who lost, who won, how much) | Outcome |
| `settle-accuser`, `settle-depositor`, `settle-store` | Money moved (measured) |
| `settle-formula-*`, `settle-expected-*` (`accuser`, `depositor`, `store`), `settle-check` ("Measured on chain = expected by the rule ✓") | Rule, expected amounts, self-check |
| `credit-accuser`, `credit-photographer`, `btn-withdraw-accuser`, `btn-withdraw-photographer`, `btn-accuse-verify`, `vote-tx` (hidden) | Credits and next actions |

## Notes (acceptance fixes)

- The timeline (`activity-log-table`) is kept per deployment in this browser and restored after a reload.
- A refused (empty) file clears the previously loaded photo: `btn-attest` is then disabled.
- Votes are serialised per assertion by the server (`POST /vote-lock`); a second window waits, then shows the outcome.
- A non-image file shows a "No preview" note (class `nopreview`) in `capture-preview` / `verify-dropzone`.
