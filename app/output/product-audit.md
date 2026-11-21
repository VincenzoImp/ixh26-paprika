# Paprika web app: product audit and target design

Scope: `app/web/` as of the working tree of 2026-11-21 (wallet-per-role work in progress), the 22 screens in
`app/output/screens/`, and a live run on spare ports (1440×900 and 1024×768). No product file was changed.

## 1. Summary

The app is correct, honest and well tested, and the visual language works (ink outlines, thick card bottoms,
pastel fills, the big verdict seal). It looks like a demo for one structural reason: **it is organised around
personas, not around one user**. Three persona tabs, three people's balances in the header, an always-on tutorial
column, formulas and "Expected vs Measured" rows on screen, and "Demo:" buttons mixed in with product actions all
say "this is a simulation of several people driven by one presenter". Real dApps (Uniswap, Snapshot, UMA's oracle
app, Etherscan) have one connected account, an account menu, toasts with explorer links, and shareable pages for
objects (pool, proposal, assertion, tx).

Target design in one sentence: **one wallet per window, action-based navigation (Verify, Attest, Activity,
Explorer), a shareable record page as the centre of the product, an optional "Protocol view" drawer for the jury,
a built-in explorer for the local chain, and a clearly separated "Local network tools" bar that only exists on
chain 31337.** The demo uses two browser windows side by side: Alice (left) and Bob (right).

Team principle applied throughout: clean and simple, one primary action per screen, details on demand. §3b decides
every element on screen today (keep or remove, place, priority, reason). Today's Photographer and Accuser tabs show
about 45-50 elements each; the target screens show 8-14.

The protocol library already supports this: it keeps role names internally (`setSigner(ctx, role, signer)`), so
one wallet can be set as signer for both `photographer` and `accuser`. Every function of `Paprika.sol` is open to
every account, so a UI that lets one account attest *and* accuse is the honest one.

## 2. Model of use (decided)

**Decision: one connected user per window. No personas in the UI.** The demo shows two people as two windows.

| Option | Credible as a product | 90-second demo | Verdict |
|---|---|---|---|
| A. Persona tabs, one presenter holds every wallet (today) | No: a real dApp never shows other people's wallets or lets you act "as" them. Cryptographers read it as "one key signs everything" even when it does not | Easy, one window | Reject |
| B. One user, account switcher inside the page wallet (MetaMask-style "Account 1 / Account 2") | Yes | One window, but who is acting is a small chip; the audience loses track | Fallback only |
| **C. One user per window; Alice and Bob in two windows side by side** | Yes: exactly how Snapshot or Uniswap are shown | Clear: left = Alice, right = Bob. Money moves in two account menus at once. Sharing a record URL from one window to the other shows the "anyone can verify / accuse" property physically | **Chosen** |

Why C convinces cryptographers: two separate key holders are visibly separate (two origins, two localStorages,
two addresses); the accuser is "anyone with the link", not a tab; the verifier needs no wallet at all (Verify works
disconnected); the UMA voters are visibly *not* the user (they live in the local tools bar, labelled as simulated).

How to get two independent wallets on one laptop: the in-page wallet lives in `localStorage`, which is per origin.
Open Alice at `http://localhost:5173/` and Bob at `http://127.0.0.1:5173/` (both are secure contexts, WebCrypto and
camera work), or use a second Chrome profile / incognito for Bob. Note: the in-page wallet key name must no
longer contain a role (`wallet-photographer`), just `wallet`.

User actions (what the protocol allows any account to do), mapped to the UI:

| Protocol function | UI location |
|---|---|
| `register` | Account menu → Device key → "Register this device" (also offered inline the first time you attest) |
| `attest` | Attest page |
| verify (read) | Verify page (home); Record page |
| `commitClaim` / `revealClaim` | Record page → "Accuse" (a 2-step flow on the record page) |
| `refund` | Record page and Activity (button appears when refundable) |
| `withdrawCredit` | Account menu "Claimable … [Claim]" and Activity |
| `revokeKey` | Account menu → Device key → danger zone |
| `forfeitCommitment` | Activity → My accusations (expired commitment row) |
| UMA vote, clock, faucet | Local network tools bar (not user actions) |

## 3. Demo-isms, with decisions

Keep = leave as is; Change = replace as stated; Disclose = move behind the Protocol view drawer or a "Learn more"
disclosure; Local = move into the Local network tools bar (exists only on chain 31337).

| # | Element today | Why it reads as a demo | Decision |
|---|---|---|---|
| 1 | Persona tabs "Photographer / Verifier / Accuser" | Personas, not actions | **Change** to nav: Verify · Attest · Activity · Explorer. Accuse is an action on a record page, not a tab |
| 2 | Header balance boxes "PHOTOGRAPHER 0 WETH / ACCUSER 0 WETH / UMA FEES (STORE)" | Shows other people's wallets | **Change**: your own balance in the account button; UMA's fee shown in the outcome card and Explorer → Contracts; deltas become a toast ("−1 WETH deposit locked") |
| 3 | Persona intro banners ("**Photographer**: sign a photo with your device key…", "The **Verifier** is anyone…") | Tutorial voice | **Change** to a page title and one subtitle line: "Attest a photo · locks 1 WETH, returned after 1 h if nobody proves it fake" |
| 4 | Protocol map strip "① Register (free) → ② Attest … ⑥ Revoke" under the header | Slide on a product | **Change** into a per-record lifecycle stepper on the record page (Attested → Challenge period → Refundable → Refunded, with the Accused/Fake branch). The global map moves to the Protocol drawer |
| 5 | "Parameters & contracts" dropdown with `B`, `T_photo`, `T_reveal`, `f` | Paper notation in the header | **Disclose**: symbols only in the Protocol drawer; plain values in Explorer → Contracts ("Deposit 1 WETH · Challenge period 1 h · Reveal period 15 min · UMA fee 50 % of the loser's stake · immutable, no owner") |
| 6 | "What just happened" card, always on, right column | Tutorial | **Disclose** in the Protocol drawer (on for the jury, off by default) + "What this did on chain" in the tx page |
| 7 | "How it works · Paprika in three lines" | Tutorial | **Disclose**: Protocol drawer empty state and the About page |
| 8 | Right-column Timeline "seen by this browser", "raw calls" checkbox | Local log, not chain data | **Change**: Activity page (my transactions, from chain logs filtered by my address) + Explorer (all transactions, decoded). "raw calls" becomes the decoded-input block of the tx page |
| 9 | Sticky footer "Everything runs on a local Ethereum chain… Demo shortcuts…" | Disclaimer on every screen; costs 30-60 px | **Change** to a thin network banner shown only on chain 31337: "Localhost test network · test ETH has no value · UMA voters are simulated" (like Etherscan's testnet banner). Keep the honesty, drop the word "demo" |
| 10 | In-page wallet strip "Photographer's wallet · BROWSER WALLET · 0x… · 5 ETH · 0 WETH · Get test ETH (local faucet) · switch wallet · Local chain: test ETH has no value." | Wallet UI inside content, per persona | **Change** to header "Connect wallet" button + account menu (§4). Faucet: account menu item and "insufficient funds" empty state, local only |
| 11 | Circled step numbers ①②③ on card titles | Tutorial numbering | **Change**: remove; the pages are the steps |
| 12 | Chips "FREE", "LOCKS B" in card titles | Notation | **Change** to a cost line above the primary button: "Cost: 1 WETH deposit (refundable) + gas" |
| 13 | "Sign & attest (locks 1 WETH)", "Commit (lock bond B)", "Reveal and send to UMA" | Mixed notation | **Change**: "Attest photo", "Commit accusation", "Reveal & send to UMA vote"; amounts in the confirmation modal |
| 14 | "Voters say FAKE (evidence proves it)" / "Voters say NOT PROVEN" in the Accuser view, "run by the demo server" | The user casting UMA's vote | **Local**: "Resolve UMA vote (simulated voters): Fake proven / Not proven". The accusation shows "Waiting for UMA vote · 48-72 h on mainnet" |
| 15 | "Demo: skip to end of challenge + reveal period" + "DEMO CONTROL · LOCAL CHAIN ONLY" box inside My photos | Demo control inside product card | **Local**: tools bar + an inline dashed chip "⏩ Skip wait (local)" next to the countdown it skips (§6) |
| 16 | Outcome table with rows "Money moved (measured) / Rule `−B`, `B kept + (B − f×B)` / Expected", "Measured on chain = expected by the rule ✓" | Test-harness output | **Change**: outcome card in words: "Accusation rejected · Bob lost his 1 WETH bond · Alice received 0.5 WETH (claimable) · UMA kept 0.5 WETH fee". **Disclose** the rule/expected/measured check in the Protocol drawer (jury loves it; users do not need it) |
| 17 | "Change one pixel and verify again" (big primary button) | Demo trick | **Keep, demote**: secondary link "Tamper test: change one pixel" under the verdict. It is the best 5 seconds of the demo; it must not be the main CTA |
| 18 | "Last attested photo" (Verifier) | Relies on presenter state | **Change** to "Verify my last photo" (only when you attested one in this browser) + a "Recent records" list on Verify home |
| 19 | Accuse photo `<select>` "0e1d…a890 · key 0xea2b…92ac · blocks 34–37 · open until …" + "↻" button | Picking a hash from a dropdown | **Change**: "Accuse" button on the record page (route `/#/record/<hash>/accuse`); the record is already chosen. Auto-refresh on new block; drop "↻" |
| 20 | Evidence prefilled "https://example.org/evidence · same image published before block a · 2026-11-21" | Fake data | **Change**: empty field, placeholder "Link to public evidence (URL)", helper "Only its SHA-256 goes on chain". Local only: "Use example" link |
| 21 | "UMA's voters will decide … UMIP-170 … The accuser must prove it." purple box | Long rule text | **Keep, compress** to one callout line + "Learn more" disclosure |
| 22 | Accuser stepper "1 · Commit hidden, bond B · 2 · Reveal sent to UMA · …" | Fine pattern, notation in sub-labels | **Keep** as the accusation progress stepper (like a bridge): Commit → Reveal → UMA vote → Settled; sub-labels in words |
| 23 | Separate "① Register the device key" card first on the page | Onboarding as a step | **Change**: if no key, Attest shows "This browser has no device key yet · Create & register (free)" inline; key management in account menu → Device key |
| 24 | Revoke card "⑥ Key lost or stolen? Revoke it (no money moves)" on the main page | Rare action in the main flow | **Change**: account menu → Device key → danger zone "Revoke key" with a typed confirmation |
| 25 | "Credit waiting in Paprika" in My photos + "Withdraw (Accuser)" + "Withdraw (Photographer)" in the outcome | Persona duplication | **Change**: one "Claimable 0.5 WETH · Claim" in the account menu (badge on the account button) and in Activity |
| 26 | Hashes: `0e1d…a890` (no 0x), `0x6e49…8303 +2`, full hashes in some places, no copy | Inconsistent | **Change**: one helper, `0x0e1d…a890`, copy icon, full value on hover; group "+2" becomes "3 transactions" in Activity |
| 27 | Dates "2026-11-21 03:33:18 (chain time)", "until 03:33", "(GMT+1)" | Raw | **Change**: relative ("in 58 min", "2 min ago"), exact on hover; chain time vs wall clock shown once, in the network badge tooltip on local |
| 28 | File line "selfie-1795224764047.jpg · 18138 bytes" + "The attested file is always the true camera image, never mirrored." + "Mirror preview" checkbox | Debug text | **Change**: "selfie.jpg · 18 KB"; mirror toggle as an icon on the camera preview; note into its tooltip |
| 29 | Generated "PAPRIKA sample image" rectangles; "use a sample image" | Fake data | **Local**: offer "Use sample image" only on chain 31337; live demo uses the real camera |
| 30 | Timeline row "Demo operator: Faucet: test ETH from the operator · signed by the demo server (0xf39f…2266)" | Operator jargon | **Change**: "Local faucet sent you 5 ETH" with a "Local network" tag |
| 31 | Red sticky error banner with "Dismiss"; global busy overlay | Not standard | **Change**: toasts + inline field errors; per-button spinner |
| 32 | Fatal screen "Paprika cannot reach the local chain … cd app && npm start" | Dev text on a user page | **Keep** for local (it is useful), title "Can't reach network Localhost (31337)"; commands under "Developer instructions" disclosure |
| 33 | Verdict hero (seal + big title: "Signed and staked · open to challenge", "Proven fake", "Not judged · its key was revoked at block 80") | - | **Keep**: this is the product's best element. Reuse it on the record page |
| 34 | "What this record shows / Not shown" box on Verify | Honest, needed | **Keep**, one line each |
| 35 | Page title "PAPRIKA · signed photos with money at stake · local Ethereum chain" | Demo title | **Change**: "Paprika · photo provenance on Ethereum" |
| 36 | Uppercase letter-spaced 11 px labels on every card title and table header | Slide look, low legibility | **Change**: sentence case 16 px bold card titles; uppercase only for table headers and chips |

## 3b. Element inventory: every element on screen today

Team principle applied: clean and simple, fewest elements per screen, **one primary action per screen**, details
on demand. For every element of `index.html` (plus the wallet strip built in `app.js`): does it need to exist,
where it goes, its priority, why.

Priority: **1** = the primary element or action of its screen (one per screen); **2** = secondary, visible;
**3** = on demand (disclosure, hover, menu, drawer); **4** = another page; **-** = removed.
Places: *Drawer* = Protocol view drawer (§5); *Menu* = account menu; *Local* = Local network tools (§6);
*Record* = record page; *Tx* = tx page.

**One primary action per screen**

| Screen | The one primary action | Everything else |
|---|---|---|
| Verify (home) | Drop / choose a file | "Open record →" after the verdict (2); tamper test link (3) |
| Attest | "Attest photo" (before a photo: "Take photo") | Choose file (2); mirror icon (3) |
| Record | Contextual, exactly one: "Refund deposit" if refundable and mine; else "Claim" if I have credit; else "Accuse" if open to challenge; else none | Copy link (2); details (3) |
| Accuse (on record) | The current stepper step only: "Commit accusation" → "Reveal & send to UMA vote" | Evidence field (2); commitment details (3) |
| Activity | "Claim" when claimable; else none | Row actions (2) |
| Explorer | Search | Lists (2) |

**Global (header, chrome)**

| Element (testid) | Keep? | Place | Prio | Reason |
|---|---|---|---|---|
| Fatal screen (`fatal-*`) | Keep | Full page | 1 | Needed when the network is down; commands under a "Developer instructions" disclosure (3) |
| Error banner (`error-banner`) | Remove | → toasts | - | Failures go to a toast and inline next to the control |
| Busy overlay (`busy-indicator`) | Remove | → button spinner + pending toast | - | Blocks the whole page for one action |
| Logo "PAPRIKA" | Keep | Header left | 2 | Identity; links to Verify |
| Tagline "signed photos · money at stake · anyone can challenge" | Remove | `#/about` | 4 | Marketing line on every screen |
| Persona tabs | Replace | Header nav: Verify · Attest · Activity · Explorer | 2 | Actions, not personas |
| Balance boxes Photographer / Accuser / UMA Store (+ delta, credit, header wallet) | Remove | Own balance → account button (2); deltas → toast; UMA fee → outcome card and Explorer | - | Other people's wallets do not belong in a user's header |
| Chain status "local chain · block N" | Keep, restyle | Header right, network pill | 2 | Standard; chain time in its tooltip (3) |
| Protocol map ①…⑥ | Move | Record page lifecycle (2) + Drawer (3) | 3 | Tutorial strip; useful per record |
| "Parameters & contracts" panel | Move | Drawer (symbols) + Explorer → Contracts (plain words) | 3/4 | Reference data, rarely needed |
| Explainer "How it works / What just happened" | Move | Drawer | 3 | Explains the protocol for the jury; noise for a user |
| Timeline + "raw calls" | Move | Activity → Transactions (4); Explorer (4); raw calls → Tx page decoded call | 4 | Chain data, not side-bar chatter |
| Footer disclaimer | Replace | Thin network banner, chain 31337 only | 2 | Honest, but once, short, and only where true |
| New: Connect / account button | Add | Header right | 2 | Standard dApp element |
| New: Protocol view toggle | Add | Header right, small switch | 3 | Off by default |
| New: Local tools pill | Add | Bottom-left, collapsed, chain 31337 only | 3 | Separate from product UI |

**Photographer view → Attest, Activity, Menu**

| Element | Keep? | Place | Prio | Reason |
|---|---|---|---|---|
| Intro banner "Photographer: sign a photo…" | Replace | Page subtitle, one line: "Locks 1 WETH, returned after 1 h 15 min if nobody proves it fake" | 2 | Cost and promise in one line |
| Wallet strip (kind chip, address, ETH, WETH, faucet, switch wallet, note, why) | Move | Menu (3); faucet → Local + Menu on 31337 (3); "why" → helper under the disabled primary button (2) | 3 | Wallet is global, not per page |
| Register card title, "FREE" chip, step ① | Remove as a card | Menu → Device key (3); inline prompt on Attest only when no key (2) | 3 | One-time setup, not a step of every visit |
| Device status "no key yet / Active / Flagged" | Keep | Attest summary card "Device 0xea2b… Active" (2); Menu (3) | 2 | Explains why Attest is blocked |
| "new key" link, "Register a new key (free)" (refusal) | Keep | Menu → Device key; refusal message on Attest when the key is flagged | 3 | Only after a flag |
| Register paragraph "The key (a software P-256 key…)" | Move | (i) tooltip on "Device key" | 3 | Learn-more content |
| Flag note, old keys list | Keep | Menu → Device key | 3 | Rare |
| Register details (key id, public key, owner, signed message, tx, key storage) | Move | Device page `#/device/<keyId>` (4); signed message → Drawer (3) | 4 | Reference |
| Capture card title "② Take a photo and attest it" + "LOCKS B" chip | Replace | Page H1 "Attest a photo" | 1 | The page is the step |
| Camera preview + placeholder | Keep | Attest, main area | 1 | Core |
| "Start camera" / "Take a selfie" / "Retake" / "Take another photo" | Keep (one at a time) | Under the preview | 1 | One state-dependent button visible |
| "Sign & attest (locks 1 WETH)" | Keep, rename "Attest photo" | Summary card | 1 | The primary action |
| "choose a file" | Keep | Under preview, text link | 2 | Alternative input |
| "use a sample image" | Keep, local only | Under preview, text link | 3 | Fake data outside localhost |
| "Mirror preview" checkbox + "never mirrored" note | Replace | Icon on the preview; note in its tooltip | 3 | Setting, not content |
| File name "selfie-1795….jpg · 18138 bytes" | Keep, reformat | Summary card "selfie.jpg · 18 KB" | 2 | Confirms the input |
| Capture warning, attest refusal | Keep | Inline above the primary button | 2 | Explains a blocked action |
| Result box "✓ Recorded on chain · 1 WETH locked" | Replace | Success toast "Photo attested · View record" → Record page | 2 | The record page is the result |
| Capture details (hash, anchor a, signed message, record window, deposit, txs) | Move | Hash → summary card (2); a, r, deposit → Record details (3); signed message → Drawer (3); txs → Tx page (4) | 3 | Details on demand |
| "My photos" table | Move | Activity → My records | 4 | Not part of attesting |
| "Download" per row | Keep | Activity row menu + Record page | 3 | Needed to share the exact file |
| "Refund" per row | Keep | Record page primary when refundable (1); Activity row (2) | 1/2 | Contextual |
| "Credit waiting in Paprika" + "Withdraw credit" | Replace | "Claimable · Claim" in Menu + Activity top | 2 | One place for credit |
| Demo clock box (chip, chain time, advance button, why) | Move | Local tools (3) + inline dashed chip on the record countdown (2, local only) | 3 | Network facility, not product |
| Revoke card (title ⑥, text, button, why, status, tx) | Move | Menu → Device key → danger zone, typed confirmation | 3 | Rare and destructive |

**Verifier view → Verify (home), Record**

| Element | Keep? | Place | Prio | Reason |
|---|---|---|---|---|
| Intro "The Verifier is anyone with the file…" | Replace | Subtitle "No wallet, no transaction" | 2 | One line |
| Card title "⑤ Verify a file" | Replace | H1 "Verify a photo" | 2 | Page is the step |
| Drop zone + placeholder | Keep | Main | 1 | The primary action |
| "Choose a file…" | Keep | In the drop zone | 1 | Same action |
| "Last attested photo" | Replace | "Verify my last photo", only if this browser attested one | 3 | Presenter shortcut |
| File name | Keep | Under the verdict, small | 3 | Confirms input |
| Verdict (seal, title, detail) | Keep | Top of result; same component on Record | 1 | The answer |
| "What this record shows / Not shown" | Keep | Under the verdict, two short lines | 2 | Honest scope, essential for this jury |
| Hash compare line | Keep | Only after tamper test | 3 | Explains the tamper result |
| "Change one pixel and verify again" | Keep, demote | Text link "Tamper test: change one pixel" | 3 | Strong for the demo, not a main action |
| Verify warning | Keep | Inline | 2 | Error |
| Attesters list (several keys for one file) | Keep | Record page "Attested by" | 3 | Rare |
| Details (SHA-256, key, depositor, window, state, deposit, accusations, count) | Move | Record page Details | 4 | One click away via "Open record →" |
| "Other records of this device · still listed" | Move | Device page `#/device/<keyId>`, linked from the flagged verdict | 4 | Only relevant for a flagged key |
| New: "Open record →" | Add | Under the verdict | 2 | Path to the shareable page |
| New: "Recent records" list | Add | Below the drop zone, 5 rows | 2 | Gives the home page content without a file |

**Accuser view → Accuse on the Record page**

| Element | Keep? | Place | Prio | Reason |
|---|---|---|---|---|
| Intro "The Accuser is anyone with public evidence…" | Remove | (i) tooltip on "Accuse" | - | Tutorial |
| Wallet strip | Move | Menu | 3 | Global |
| Stepper Commit · Reveal · UMA vote · Outcome | Keep | Top of the Accuse panel | 2 | Progress of a multi-step action |
| Card titles "③ Commit", "Reveal", "UMA vote", "Outcome" (4 cards) | Replace | One panel; only the current step's control is shown, past steps collapse to one line with tx link | 1 | One action at a time |
| UMA question box (UMIP-170) | Keep, compress | One line + "Learn more" | 2 | Tells the accuser the burden of proof |
| Open accusations list | Move | Record page History + Activity → My accusations | 4 | Context belongs to the record |
| Photo `<select>` + "↻" | Remove | Record is chosen by the page | - | Hash dropdowns are not a product |
| "Not offered (cannot be accused now)" | Replace | Record page: "Accuse" disabled with reason | 2 | Reason where the button is |
| Evidence input + "Example" | Keep | Panel, empty with placeholder; "Use example" local only | 2 | Required input |
| "Commit (lock bond B)" | Keep, rename "Commit accusation" | Panel | 1 | Primary at step 1 |
| "Start a new accusation" | Keep | Only after an outcome or failed reveal | 3 | Rare |
| "Burn this expired bond (forfeit)" | Keep | Activity → My accusations row | 3 | Rare |
| Commit status, reveal deadline, new-accusation why | Keep | Stepper sub-line "Reveal before 03:48 (14 min)" | 2 | Deadline matters |
| Commit details (commitment, secret, accuser, tx) | Move | Drawer (formula) + Tx page | 3 | Details on demand |
| Reveal paragraph "Reveal sends the case to UMA…" | Move | Drawer | 3 | Explanation |
| "Reveal and send to UMA" | Keep, rename | Panel | 1 | Primary at step 2 |
| Reveal details (photo, assertion id, tx) | Move | Tx page; assertion id → History row | 4 | Reference |
| Vote paragraph "The vote is cast by three UMA voter accounts…" + "run by the demo server" chip | Replace | Status line "Waiting for UMA vote · 48-72 h on mainnet"; simulation note in Local | 2 | Honest, short |
| "Voters say FAKE" / "Voters say NOT PROVEN" | Move | Local tools + inline dashed chip "⏩ Resolve vote (local) ▾" | 3 | Not a user action |
| Vote phases commit · reveal · settled | Keep | Stepper sub-line while resolving | 2 | Shows progress |
| Outcome title + chip | Keep | Stepper final step + Record verdict | 1 | The result |
| Outcome summary "Voters: NOT PROVEN → Accuser −1 · Photographer +0.5 · UMA fee +0.5" | Keep, in words with addresses | Outcome line | 2 | Who gained/lost |
| Outcome table Measured / Rule / Expected, f note, "Measured = expected ✓" | Move | Drawer | 3 | Proof for the jury, noise for a user |
| Accuser / Photographer credit + 2 Withdraw buttons | Replace | "Claimable · Claim" in Menu (each window shows only its own) | 3 | Persona duplication |
| "Verify the photo" | Remove | The record page already shows the verdict | - | Redundant |
| Vote tx | Move | History row + Tx page | 4 | Reference |

Net effect on screen count: today the Photographer tab shows about 45 controls and texts at once, the Accuser tab
about 50. Target: Attest ≤ 10 visible elements, Verify ≤ 8 before a drop, Record ≤ 14, each with one primary
button.

## 4. Standard dApp elements: status and spec

| Element | Today | Target |
|---|---|---|
| Connect button | Per-persona strip inside content | Header right: "Connect wallet" → modal with two options: "MetaMask" and "Browser wallet (key kept in this page)". After connect, the button shows blockie + `0x1899…3b8e` + `4.98 ETH` |
| Account menu | Missing | Dropdown: full address + copy + "View in explorer"; ETH and WETH balances (exact on hover); "Claimable 0.5 WETH [Claim]"; Device key (status Active/Flagged, key id, Register/Revoke); "Get test ETH" (local only); "Disconnect" |
| Network badge | "● local chain · block 33" | Pill "● Localhost 31337 · #37"; tooltip: RPC, chain time. Sepolia later: "● Sepolia" |
| Wrong network | Switch on connect only (`injectedWallet` calls `wallet_switchEthereumChain`/`wallet_addEthereumChain`) | Listen to `chainChanged`/`accountsChanged`; red badge "Wrong network" + button "Switch to Localhost"; all write buttons disabled with that reason |
| Transaction toasts | Missing (explainer card + error banner) | Bottom-right stack: "Attesting photo… 1 of 3: Wrap ETH (confirm in wallet)" → "Pending · 0x6e49…8303" → "Confirmed in block 37 · View" / "Failed: <plain reason> · View". Auto-dismiss success after 6 s, failures stay |
| Multi-tx progress | Hidden "(3 tx: wrap, approve, attest)" | Uniswap-style stepper inside the confirmation modal: ✓ Wrap 1 ETH → ✓ Approve WETH → ⟳ Attest |
| Confirmation before spending | Missing | Modal for attest and commit: amount, what you get back and when, what you can lose, number of transactions, gas estimate. Refund/claim need no modal |
| Record page with shareable URL | Missing | `/#/record/<photoHash>` (and `?key=<keyId>` when several keys attested the same file); "Copy link" button |
| Explorer view | Missing | §7 |
| Activity ("My records") | "My photos" table only, in the Photographer tab | `/#/activity`: tabs My records · My accusations · Transactions; claimable credit on top |
| Empty states | One-line grey text | Illustration-free card: title + one sentence + one CTA ("No records yet · Attest your first photo →") |
| Loading states | "…" placeholders | Skeleton rows; button spinners; "Reading chain…" in verdict while hashing/reading |
| Amounts | "1 WETH", "0.5 WETH" | Same, tabular figures, sign colour (+ green, − red); exact wei on hover; ETH and WETH both shown in account menu with "Unwrap" |
| Dates | Absolute chain time strings | Relative + exact on hover (§3 #27) |
| Copy buttons | Address click copies silently | Copy icon next to every hash/address; "Copied" micro-toast |
| Short names | `0x1899…3b8e` | Blockie identicon + `0x1899…3b8e` everywhere (same colour in both windows = same account). Optional local nickname (P2). No ENS on chain 31337 |
| Errors in plain words | `REVERT_WHY` map exists and is good | Keep the map; show its text in the failed toast and next to the disabled button; add wallet errors ("You rejected the request in your wallet", "Not enough ETH for gas · Get test ETH") |
| Disabled-with-reason buttons | Present (text under buttons) | Keep: reason as helper text under the button, not only in `title` |

## 5. Explaining the protocol without a tutorial (decided)

**Decision: a "Protocol view" toggle in the header opens a right-side drawer; inline (i) icons for terms; a "What
this did on chain" block on every tx page.** The product stays a product with the drawer closed; the jury sees the
protocol at work with it open.

- Header toggle "Protocol view" (switch). Off by default, persisted in `localStorage`, forced on by `?protocol=1`
  (the presenter's bookmark).
- Drawer (360 px, right, at ≥1280 px wide; below that a collapsible strip under the header showing the step name
  and one line, click to expand). Contents, top to bottom:
  1. Lifecycle map (today's `pmap`), current step highlighted.
  2. Last action: protocol step name, what happened, **why the rule exists** (today's `explain()` text, unchanged:
     it is good), the calls it made (decoded, linked to the tx page).
  3. For outcomes: the rule / expected / measured table and "measured = expected ✓".
  4. Parameters with their symbols (`B`, `T_photo`, `T_reveal`, `f`) and contract addresses.
- (i) icons next to "Deposit", "Challenge period", "Commit", "Reveal", "UMA vote", "Flagged": one sentence tooltip
  and "Learn more" link to `docs/protocol.md` section.
- Tx page: "What this did on chain" = decoded call, decoded events (`Attested`, `Credited`, `AccusationOpened`…),
  token movements. This is where the protocol is visible even with the drawer closed.

## 6. Fast-forward controls (local network only)

Principle: they are **facilities of the local network**, like Hardhat's own console, not features of Paprika.
They must look different from product UI and must not exist on any other network.

- Rendered only when `chainId === 31337` **and** `GET /demo/status` (or a HEAD on `/demo/faucet`) answers. On
  Sepolia the bar, the inline chips, the faucet item and the "sample image" link are not in the DOM.
- **Local network tools bar**: slim bar docked bottom-left (like the Next.js/Vercel dev toolbar), collapsed to a
  pill "⚙ Local network" by default; dashed ink border, lemon fill, monospace label. Expanded:

```
┌ ⚙ LOCAL NETWORK TOOLS · Localhost 31337 · not available on public networks ─────────────── [–] ┐
│ Chain clock  03:51 (1 h 16 min ahead of your clock)   [⏩ Advance… ▾]  (+15 min · +1 h · to refund time) │
│ UMA vote     simulated voters (3 local accounts)      [Resolve: Fake proven] [Resolve: Not proven]   │
│              voters commit ✓ · reveal ✓ · settled ⟳                                                │
│ Faucet       [Get 5 test ETH]                                                                       │
└─────────────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Inline chips where the wait is shown** (the only two places): on the record page next to
  "Refundable in 1 h 15 min" → dashed chip `⏩ Skip wait (local)`; on an accusation "Waiting for UMA vote · usually
  48-72 h on mainnet" → dashed chip `⏩ Resolve vote (local) ▾`. Same dashed style as the bar, so the eye learns
  "dashed = local network facility".
- Every use produces a toast tagged "Local network" and an Activity entry "Clock advanced 1 h 15 min (local
  network)"; the network banner says "UMA voters are simulated".
- Existing safeguards stay: advance is disabled during an open accusation, with the reason as helper text.

## 7. Explorer (recommendation)

(a) **Per-network explorer links.** One config table in `app.js`:

```js
const NETWORKS = {
  31337:    { name: "Localhost", explorer: (k, id) => `#/${k}/${id}`, local: true },               // built-in
  11155111: { name: "Sepolia",   explorer: (k, id) => `https://sepolia.etherscan.io/${k}/${id}` },  // k: tx|address|block
};
```

Every hash, address and block in the app links through it (toasts, record page, account menu, Activity).

(b) **Local chain options:**

| Option | Effort | Reliability tonight | Notes |
|---|---|---|---|
| Otterscan | Not possible as is | - | Needs the `ots_*` JSON-RPC namespace (Erigon, Anvil, Reth). Hardhat 2.29's node does not have it. Switching to Anvil means re-validating the P-256 precompile (`osaka`), UMA deployment and 168 e2e checks |
| Blockscout (Docker) | 1.5-3 h | Low-medium | 5-7 containers (Postgres, backend, frontend, stats, proxy…), ~3 GB images to pull on venue Wi-Fi, 4 GB+ RAM. The Hardhat chain lives in memory: every restart resets to block 0 and the Blockscout DB must be wiped. Decoded calls need contract verification; UMA contracts come precompiled from npm, hard to verify |
| **Built-in Explorer page** | **M, ~45-60 min** (minimal tx page in P0 ~25 min) | **High** | `/rpc` already allows `eth_getLogs`, `eth_getBlockByNumber`, `eth_getTransactionByHash`, `eth_getTransactionReceipt`. `deployment.json` already carries ABIs of `Paprika`, `OptimisticOracleV3`, `VotingV2`, `WETH9`: decode with `ethers.Interface.parseTransaction`/`parseLog`. The local chain has a few hundred blocks: scan all |

**Recommendation for tonight: the built-in Explorer**, labelled "Localhost explorer", with links switching to
Etherscan automatically on Sepolia. Reasons: zero new infrastructure, works offline, decodes Paprika *and* UMA
(Blockscout would not without verification), survives chain restarts, and it is the place where the jury sees
real transactions, blocks and events. Blockscout is a P2 option for a public-testnet deployment (where Etherscan
already exists, so it is not needed).

Explorer routes: `/#/explorer` (latest blocks, latest transactions, Paprika events feed with filters: Records ·
Accusations · Devices · UMA), `/#/tx/<hash>`, `/#/block/<n>`, `/#/address/<addr>` (known labels: Paprika, UMA
OOv3, UMA Store, UMA VotingV2, WETH, "Local faucet", "Simulated UMA voter 1-3"), `/#/device/<keyId>`.

## 8. Target information architecture

Routes (hash router; old `#photographer`/`#verifier`/`#accuser` redirect to `#/attest`, `#/verify`, `#/activity`):

| Route | Page | Needs wallet |
|---|---|---|
| `/#/` = `/#/verify` | Verify a file (home) + Recent records | No |
| `/#/attest` | Camera / file → attest | Yes |
| `/#/record/<photoHash>[?key=<keyId>]` | Record page: verdict, lifecycle, details, actions | No (actions need one) |
| `/#/record/<photoHash>/accuse` | Accusation flow on the record page | Yes |
| `/#/activity` | My records · My accusations · My transactions · Claimable | Yes |
| `/#/explorer`, `/#/tx/…`, `/#/block/…`, `/#/address/…`, `/#/device/…` | Explorer | No |
| `/#/about` | What a record proves / does not, parameters, contracts, docs links | No |

### Header (every page)

```
┌──────────────────────────────────────────────────────────────────────────────────────────────────────┐
│ PAPRIKA   Verify   Attest   Activity   Explorer        [Protocol view ○]  ● Localhost #37  [◉ 0x1899…3b8e · 4.98 ETH ▾] │
├──────────────────────────────────────────────────────────────────────────────────────────────────────┤
│ Localhost test network · test ETH has no value · UMA voters are simulated                 (31337 only) │
└──────────────────────────────────────────────────────────────────────────────────────────────────────┘
 Account menu ▾
 ┌───────────────────────────────────────┐
 │ ◉ 0x1899…3b8e  [copy] [explorer ↗]    │
 │ Browser wallet · Localhost             │
 │ 4.98 ETH      0 WETH  [Unwrap]         │
 │ Claimable 0.5 WETH          [Claim]    │
 │ Device key 0xea2b…92ac · Active   [›]  │
 │ [Get 5 test ETH]   (local only)        │
 │ Disconnect                              │
 └───────────────────────────────────────┘
```

One row, ≤ 64 px high at 1024 px (today it wraps to 157 px). Below 900 px the nav collapses to icons.

### Verify (home)

```
 Verify a photo
 Drop a file to check it against Paprika. No wallet, no transaction.
 ┌───────────────────────────────────────────────────────────────┐
 │                 ⬇  Drop an image here, or [Choose file]        │
 │                 [Verify my last photo]                          │
 └───────────────────────────────────────────────────────────────┘
 After a drop:
 ┌─ ◷ Signed and staked · open to challenge ─────────────────────┐
 │  1 WETH at stake · anyone can accuse for 58 min                │
 │  [thumb]  What it shows: a registered key signed this exact    │
 │           file between block 34 and 37, with a deposit.         │
 │           Not shown: that a camera took it, or who.             │
 │  [Open record →]          Tamper test: change one pixel        │
 └───────────────────────────────────────────────────────────────┘
 Recent records                                       [Explorer →]
 0x0e1d…a890  ◉0x1899…3b8e  Open · 58 min left   2 min ago  →
```

### Attest

```
 Attest a photo
 Locks 1 WETH. Returned after 1 h 15 min if nobody proves it fake.
 ┌───────────────────────────────────────────┐  ┌─ Summary ─────────────────────┐
 │             camera preview      [⇋ mirror] │  │ File      selfie.jpg · 18 KB  │
 │                                            │  │ Hash      0x0e1d…a890 [copy]  │
 │ [Take photo]  or choose file · sample(local)│  │ Device    0xea2b…92ac Active  │
 └───────────────────────────────────────────┘  │ Deposit   1 WETH (refundable)  │
 (no key?) ⚠ This browser has no device key    │ [ Attest photo ]               │
     [Create & register device key · free]      └───────────────────────────────┘
 Confirm modal ─────────────────────────────────────────────
 │ Attest photo 0x0e1d…a890                                    │
 │ You lock 1 WETH. Back to you after the challenge period     │
 │ (1 h + 15 min) unless UMA's voters find it fake.             │
 │ If proven fake you lose it; the accuser gets 0.5 WETH.       │
 │ 3 transactions:  1 Wrap 1 ETH  2 Approve WETH  3 Attest      │
 │                               [Cancel] [Confirm in wallet]   │
```

### Record page (the centre of the product)

```
 Record 0x0e1d…a890 [copy]                                   [Copy link] [Accuse]
 ┌─ ◷ Signed and staked · open to challenge ────────────────────────────────────┐
 │  Anyone can accuse for 58 min · deposit refundable in 1 h 13 min              │
 │                                                   [⏩ Skip wait (local)]      │
 └──────────────────────────────────────────────────────────────────────────────┘
 Lifecycle   ● Attested #37 ── ◐ Challenge period ── ○ Refundable ── ○ Refunded
                                   └─ Accused → UMA vote → Fake / Rejected
 ┌ Details ───────────────────────────┐  ┌ History ─────────────────────────────┐
 │ Photo hash   0x0e1d…a890 [copy]     │  │ Attested by ◉0x1899… · #37 · tx ↗     │
 │ Device key   0xea2b…92ac · Active ↗ │  │ Accused by ◉0x7a3c…  · #40 · tx ↗     │
 │ Signed       between block 34 and 37│  │ UMA vote: not proven · #51 · tx ↗     │
 │ Depositor    ◉0x1899…3b8e ↗          │  │ Refunded · #53 · tx ↗                  │
 │ Deposit      1 WETH locked           │  └──────────────────────────────────────┘
 │ Accusations  1 (rejected)            │
 └─────────────────────────────────────┘
 Accuse (on the same page, /accuse):
 Commit → Reveal → UMA vote → Settled
 UMA's voters say FAKE only on public, checkable evidence. (i)
 Evidence URL [__________________________]  only its SHA-256 goes on chain
 Bond 1 WETH · you lose it if the evidence does not prove it      [Commit accusation]
 After commit: "Reveal before 03:48 (14 min)"                     [Reveal & send to UMA vote]
 After reveal: "Waiting for UMA vote · 48-72 h on mainnet"        [⏩ Resolve vote (local) ▾]
 Outcome: Accusation rejected · ◉Bob −1 WETH · ◉Alice +0.5 WETH claimable · UMA fee 0.5 WETH
```

### Activity

```
 Activity                                          Claimable 0.5 WETH [Claim]
 [My records] [My accusations] [Transactions]
 Photo         Device       State                    Deposit           When
 0x0e1d…a890   0xea2b…92ac  Not proven · refundable  1 WETH locked     5 min ago  [Refund]
 0x9b6c…8f1b   0xea2b…92ac  Open · 41 min left       1 WETH locked     1 min ago  →
```

### Explorer (local) and tx page

```
 Localhost explorer · chain 31337 · block #80          [Search hash / address / block]
 Latest blocks          Latest transactions                         Paprika & UMA events
 #80  1 tx  2 s ago     0x7f5d…ba48  Paprika.revokeKey   ◉0x1899…  [Records|Accusations|Devices|UMA]
 #79  1 tx  9 s ago     0xcd3f…3b1d  Paprika.attest      ◉0x1899…  Attested 0x0e1d… by 0xea2b…
 ───────────────────────────────────────────────────────────────────────────────────────────
 Transaction 0x6e49…8303 [copy]            ✓ Success · block 37 · 2026-11-21 02:33:18 (hover)
 From ◉0x1899…3b8e → To Paprika (0x7a20…814f)       Gas 182,311
 Call   attest(keyId 0xea2b…, photoHash 0x0e1d…, anchorBlock 34, sig 0x…)
 Events Attested(photoHash 0x0e1d…, keyId 0xea2b…, depositor 0x1899…, anchorBlock 34)
        WETH Transfer 1 WETH  0x1899… → Paprika
 What this did on chain (i): recorded the photo, locked the deposit; challenge period until 03:33.
 [Open record →]
```

### Protocol view drawer (toggle on)

```
 ┌ Protocol view ─────────────────────── × ┐
 │ Register → Attest → [Challenge] → Refund │
 │ Verify any time · Revoke any time        │
 │ Last step: Accuse · Commit               │
 │ Only a hash went on chain, with bond B.  │
 │ Why: a pending tx is public; a one-step  │
 │ accusation could be copied…              │
 │ Calls: WETH.deposit · approve · commit ↗ │
 │ B = 1 WETH · T_photo 1 h · T_reveal 15 m │
 │ f = 0.5 (UMA) · contracts ↗              │
 └──────────────────────────────────────────┘
```

## 9. Visual design (keep the language, tighten)

Keep: ink `#14123a` outlines, 4 px card bottoms, paper background, pastel fills, the verdict seal and big verdict
title, the monospace hashes.

Tighten:
1. **Colour meaning.** Pastels today encode personas (peach = Photographer, rose = Accuser, lilac = UMA). Re-map to
   states, consistently on chips, verdicts and toasts: sky = open/attested, lemon = pending/accused, mint =
   refunded/success, rose = fake/failed, lilac = UMA. Dashed lemon = local network facility. Primary buttons ink;
   secondary outline; danger rose.
2. **Typography.** One H1 per page (28 px); card titles sentence case 16 px bold (drop the 11 px uppercase
   letter-spaced labels except table headers); body 16 px (15 today) for projector; helper text 14 px at
   `#14123a` 75 % (the `.d` grey and the orange hint fail contrast on a projector); `font-variant-numeric:
   tabular-nums` on amounts.
3. **Density.** One helper line per control; long explanations go to (i) or the drawer. Cards on Attest drop
   from 4 to 2.
4. **Header.** Single row, ≤ 64 px. Today at 1024 px it wraps to 157 px and the protocol strip adds 60 px: a third
   of a 768 px projector is chrome.
5. **Footer.** Remove the sticky footer (30-60 px).
6. **Consistency.** One hash format, one date format, one amount format, one link style (accent blue for links,
   ink for actions). No `+2` suffixes.
7. **Responsive.** Two windows side by side on a 1920 projector = 960 px each: layout must be single column at
   < 1100 px with no horizontal scroll; Protocol drawer becomes a collapsible strip under the header < 1280 px.
   Test at 960×1000 and 1280×720.
8. **Disabled buttons.** Today grey `#aaa` on pastel is unreadable at distance; use 50 % opacity of the normal
   style plus the reason text below.

## 10. The 90-second demo with the target design

Before: Alice window left (`http://localhost:5173/#/attest?protocol=1`), Bob window right
(`http://127.0.0.1:5173/#/verify?protocol=1`), both connected (browser wallet), both funded from the faucet,
Alice's device key registered, camera permission granted. Projector 1920×1080, each window 960 wide, zoom 110 %.

| Time | Window | Click | On screen | Audience's eye |
|---|---|---|---|---|
| 0:00 | Alice | "Take photo" | Selfie frozen, summary card: hash `0x0e1d…`, device Active, deposit 1 WETH | The hash in the summary |
| 0:07 | Alice | "Attest photo" → modal → "Confirm" | Modal: 1 WETH locked, back after 1 h 15 min unless proven fake, 3 tx stepper ticks ✓✓✓; toast "Photo attested · block 37 · View record" | Stepper, then Alice's account button `−1 WETH` |
| 0:20 | Alice | Toast "View record" → "Copy link" | Record page, verdict "Signed and staked · open to challenge · 58 min"; lifecycle on "Challenge period" | Verdict seal |
| 0:27 | Bob | Paste link in address bar | Same record page in Bob's window, no action needed to read it | "Anyone with the link sees the same record" |
| 0:32 | Bob | Verify tab: drop Alice's downloaded file → then "Tamper test: change one pixel" | Green verdict, then "No record for this file · hash differs" | Two hashes differing in the compare line |
| 0:45 | Bob | Back on record → "Accuse" → evidence URL (paste) → "Commit accusation" → Confirm | Stepper Commit ✓; drawer: "Only a hash went on chain; nobody can tell which photo" | Drawer "why" line |
| 0:55 | Bob | "Reveal & send to UMA vote" | Stepper Reveal ✓, "Waiting for UMA vote · 48-72 h on mainnet" + dashed `⏩ Resolve vote (local)` | The dashed chip: "this is the only simulated part" |
| 1:02 | Bob | `⏩ Resolve vote (local)` → "Not proven" | Phases commit ✓ reveal ✓ settled ✓; outcome "Accusation rejected · Bob −1 WETH · Alice +0.5 WETH claimable · UMA fee 0.5 WETH" | Both account buttons change at once: Bob −1, Alice "Claimable 0.5" badge |
| 1:15 | Alice | Record page: `⏩ Skip wait (local)` → "Refund deposit" | Verdict "Signed · deposit returned: nobody proved it fake in time (not proof it is real)" ; toast "Refunded · View" | Verdict wording |
| 1:23 | Alice | Toast "View" | Tx page: `Paprika.refund(…)`, events `Refunded`, `Credited`, decoded | "Real transaction, decoded" |
| 1:30 | - | - | End. Say: voters simulated, clock advanced, software key; everything else is real transactions | - |

Fallback if the projector is 1280 px or less: one window; Bob in a second tab (Ctrl+Tab), or the account switcher
(P2).

## 11. Prioritised implementation list (about 2 hours for P0)

Keep existing `data-testid`s on moved elements and add a redirect for the old hashes, so the e2e suites (168 + 18
checks) need targeted edits, not a rewrite. Budget ~30 min for e2e updates on top of P0 if they must stay green
tonight.

### P0 (must, ~2 h 15; drop P0-7 to P1 if short)

| # | Task | Effort |
|---|---|---|
| P0-1 | Header: replace persona tabs with nav Verify · Attest · Activity · Explorer (hash router `#/…`, old hashes redirect); remove the three balance boxes, the protocol strip and the sticky footer; network pill; Localhost banner (31337 only). Move My photos + credit into Activity, Revoke + Register into account menu → Device key | M (30 min) |
| P0-2 | One wallet per window: one "Connect wallet" (MetaMask / Browser wallet) that calls `setSigner` for both `photographer` and `accuser`; storage key `wallet` (no role); account menu (address+copy, ETH/WETH, Claimable+Claim, faucet local-only, disconnect); listen to `chainChanged`/`accountsChanged` → "Wrong network · Switch" | M (25 min) |
| P0-3 | Record page `#/record/<photoHash>`: reuse verdict hero, lifecycle (from `pmap`), details (from Verify details), contextual buttons (Refund, Accuse, Claim), "Copy link"; Accuse flow moves here (drop the photo `<select>`); Verify result gets "Open record →" | M (30 min) |
| P0-4 | Toasts pending/confirmed/failed with tx link (replace the error banner and busy overlay; reuse `REVERT_WHY`) + minimal tx page `#/tx/<hash>`: receipt, decoded call and events via ABIs in `deployment.json`; `NETWORKS` explorer-link helper | M (30 min) |
| P0-5 | Local network tools bar (clock advance, UMA vote resolve, faucet) shown only on chain 31337 with `/demo` reachable; inline dashed chips "⏩ Skip wait (local)" and "⏩ Resolve vote (local)"; remove every "Demo:" label from product UI | S (15 min) |
| P0-6 | Protocol view toggle + drawer: move "What just happened", the map, the params grid and the outcome rule/expected/measured table into it; `?protocol=1` | S (15 min) |
| P0-7 | Confirmation modal for Attest and Commit: amount, refund/loss conditions, 3-tx stepper | S (10 min) |

### P1 (next, ~2 h)

| # | Task | Effort |
|---|---|---|
| P1-1 | Explorer home `#/explorer`: latest blocks, latest txs (decoded method), Paprika/UMA event feed with filters; `#/address/…` with labels; `#/block/…`; search box | M |
| P1-2 | Format helpers everywhere: `0x`-prefixed short hash + copy icon + full on hover; relative dates with exact on hover; "18 KB"; tabular amounts | S |
| P1-3 | Outcome card in words (rule table moved to drawer); evidence field empty with placeholder + local-only "Use example" | S |
| P1-4 | Activity page complete: My accusations (commit/reveal deadlines, forfeit), Transactions from chain logs filtered by my address (replace the browser-local Timeline) | M |
| P1-5 | Visual tightening (§9): sentence-case titles, 16 px body, state-based colours, contrast of helper/disabled text, single-row header at 1024 px, single column < 1100 px | M |
| P1-6 | Empty and loading states (skeleton rows, button spinners, "Reading chain…") | S |
| P1-7 | Attest onboarding: inline "Create & register device key (free)" when no key; sample image local-only; mirror as an icon | S |
| P1-8 | Update e2e selectors and screens script to the new routes | M |

### P2 (later)

| # | Task | Effort |
|---|---|---|
| P2-1 | Blockies identicons and optional local nicknames ("Alice") per address | S |
| P2-2 | Sepolia network entry (Etherscan links, no local tools, wallet add-chain) | S |
| P2-3 | Account switcher inside the browser wallet (single-window fallback) | M |
| P2-4 | (i) term tooltips with "Learn more" to `docs/protocol.md` sections; `#/about` page | S |
| P2-5 | Blockscout in Docker for a long-lived shared test deployment | L |
| P2-6 | Mobile layout (Attest with the phone camera is a strong story) | M |
