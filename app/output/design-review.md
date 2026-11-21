# Paprika web app: design review

Reviewer: senior UI/UX designer. Material: crawl gallery (56 states, 1440x900 first, then 800x900 and 1440@125%), the 24 story screenshots, `web/styles.css`, `web/index.html` and `web/js/**`. This review does not repeat the defects already listed in `crawl-report.md`, `staging-3-report.md` or `first-time-review-3.md` (overlaps by the local pill and toasts, "simulated" wording, chips inside the verdict, the lifecycle changing shape, the wrong-network pill, the accuse panel shown when it shouldn't be, tiny copy targets, dimmed-step contrast, menu not closing). Where one of my changes touches the same element, I say "(known: …)" and add only the visual part.

Tags: **P0** = do before the demo, **P1** = clearly better, **P2** = polish. Effort: **S** < 5 min, **M** 5-20 min.

---

## 1. Overall

**Today.** The app reads as a careful, honest prototype. The verdict cards and the confirm dialogs are strong, and the ink-and-pastel language gives it a recognisable look. Around them the controls are uneven: buttons come in three sizes and two weights by accident, small grey text and 12-13 px monospace carry important facts, and almost every page is a vertical stack of equal-weight bordered cards, so nothing below the verdict leads the eye. Colour is meant to encode state, but the same state gets different colours on different screens: refunded is blue in the verdict and green in the chip, and "fake proven" is rose in My records but mint in My accusations.

**The 5 changes with the biggest effect**

1. **Fix the button font (one CSS line, every screen).** `button,.btn,…{font:700 15px/1.2 inherit}` is an invalid shorthand (a CSS-wide keyword cannot appear inside `font:`), so the browser drops the whole declaration. Every `<button>` renders in the user-agent font: 13.3 px, regular weight. Every `<a class="btn">` inherits 16 px. That is why "Connect MetaMask", "Commit accusation", "Copy link", "Start camera" and "Choose another file" look small and thin, while "Open record →" and "View record →" look large. It is the single biggest source of visual unevenness.
2. **One button system with fixed heights.** Primary, secondary, tertiary (link), destructive and local, at 44 / 52 / 32 px heights. Replace `opacity:.5` for disabled with a real disabled style. Today a disabled primary is a washed blue-grey slab ("Attest photo") that reads as a different colour, not as "not yet".
3. **Colour means record state, and nothing else.** sky = open, lemon = waiting (accused, current step), rose = proven fake, neutral = closed without a verdict (refunded, challenge over, no record), mint = an action or step that completed. Apply this in the verdict, chips, lifecycle and the activity tables. A finished lifecycle must not end on a lemon "current" step (today "Proven fake" and "Settled" are lemon).
4. **Record page: one clear spine.** Put the primary action inside the verdict card, with the lifecycle bar directly underneath. Put the scope lines ("What this record shows / Not shown") right under the verdict, as on Verify. Turn the accusation outcome into a three-cell money strip. Make the accuse stepper visibly secondary to the lifecycle (today it is larger: 16 px bold against 14 px).
5. **Projector legibility.** Present at browser zoom 125%. The crawl shows that layout (1152x720 CSS) is identical with no horizontal scroll, and it brings 16 px body text to 20 px on screen. Raise everything the audience must read to at least 16 px CSS (lifecycle sub-labels, chips, toasts, history, outcome money). Keep monospace for hex only: the local chips use mono today.

---

## 2. Design system

### 2.1 Tokens: replace the `:root` line in `styles.css` with this (the palette is unchanged)

```css
:root{
  /* approved palette (unchanged) */
  --ink:#14123a;--paper:#f8f6f1;--lilac:#e4dcfb;--lemon:#fff8b8;--mint:#c9f2d6;--rose:#ffd9d2;--sky:#dce6ff;--peach:#ffe6c2;--accent:#3b45b5;--line:#14123a22;
  /* type */
  --sans:"Helvetica Neue",Helvetica,Arial,sans-serif;
  --mono:ui-monospace,Menlo,Consolas,monospace;
  --fs-meta:13px;   /* timestamps, table headers only; never for facts the audience must read */
  --fs-sm:14px;     /* secondary text, chips in dense tables, explorer tables */
  --fs-body:16px;   /* body, buttons, kv values, lifecycle labels */
  --fs-lead:18px;   /* verdict detail, dialog body, money lines */
  --fs-h2:18px;     /* card titles */
  --fs-h1:30px;     /* page titles */
  --fs-verdict:36px;/* verdict title */
  --lh-tight:1.15;--lh-body:1.5;
  /* spacing: 4-pt scale */
  --s1:4px;--s2:8px;--s3:12px;--s4:16px;--s5:24px;--s6:32px;--s7:48px;
  /* text roles */
  --muted:#4d4b68;  /* replaces #14123abf (same look, opaque, 8.3:1 on white) */
  --dim:#6b6985;    /* future steps, disabled text: 5.3:1 on white (replaces opacity:.5) */
  /* state roles */
  --open-bg:var(--sky);                          /* open to challenge */
  --wait-bg:var(--lemon); --wait-fg:#8a4a00;     /* accused, current step, warnings */
  --bad-bg:var(--rose);   --bad-fg:#b3261e;      /* proven fake, failures, destructive */
  --ok-bg:var(--mint);    --ok-fg:#17703f;       /* completed step, success feedback */
  --closed-bg:#ffffff;                           /* refunded / challenge over: no verdict */
  --none-bg:#ecebf1;                             /* no record (was #eeeeee, now tinted to the ink) */
  --uma-bg:var(--lilac);                         /* UMA rule callouts */
  --local-bg:var(--lemon); --local-border:2px dashed var(--ink); /* local-only facilities, nothing else is dashed ink */
  /* lines and depth */
  --bw:2px; --lift:5px;                          /* every card, verdict, toast, dialog: 2px border + 5px bottom */
  --r-sm:6px; --r-md:8px; --r-lg:12px; --r-pill:999px;
  --shadow-pop:0 10px 30px #14123a2e;            /* only floating layers: menu, dialog, toast */
  --focus:0 0 0 3px #fff,0 0 0 5px var(--accent);
  /* controls */
  --ctl-sm:32px; --ctl:44px; --ctl-lg:52px;
}
```

### 2.2 Rules to standardise

| Area | Today | Standard |
|---|---|---|
| Spacing | 4, 6, 7, 8, 9, 10, 12, 14, 16, 18, 20, 22 px | Only `--s1…--s7`. Between cards `--s5` (24). Inside a card `--s3`/`--s4`. Card padding `var(--s4) var(--s5)`. `main{gap:var(--s5)}`. |
| Type scale | 11, 12, 13, 14, 15, 16, 17, 18, 19, 22, 28, 32, 40 px | Seven sizes: 13 / 14 / 16 / 18 / 30 / 36 (+ seal glyph 44). Weights: 400 body, 700 labels and buttons, 800 only for the logo and verdict title. Kill 11, 12, 15, 17, 19 px. |
| Colour roles | `.ok`, `.err`, `.hint`, `.why` are global classes that leak (`.toast.ok` turns all toast text green) | Role colours via tokens; text classes renamed `.t-ok`, `.t-bad`, `.t-wait` so they can't collide with state modifiers. |
| States | refunded: sky verdict, mint chip; fake: rose in records, mint ("you won") in accusations | Section 1 #3 mapping everywhere. A personal outcome goes in words ("you won +0.5 WETH"), never as a colour flip. |
| Borders / radius | radius 4, 6, 8, 10, 12; bottom 5 or 6 px | Radius: chips `--r-sm`, controls `--r-md`, every container `--r-lg`, pills `--r-pill`. Bottom lift 5 px on every card-like surface (verdict too, today 6). |
| Shadow | none, so the menu, toasts and dialog sit flat on content | `--shadow-pop` on `.menu`, `.modal`, `.toast` only. |
| Focus | browser default | `:focus-visible{outline:none;box-shadow:var(--focus)}` |
| Icons | unicode glyphs from mixed fonts: ◷ ! ✕ ∅ ⬇ ⇋ ⏩ ⚙ ⧉ ↗ → ▾ × | Keep unicode but limit it to four roles: **seal** (◷ ! ✕ ∅, plus ○ for closed); **direction** (→ for navigation, ↗ for opening outside); **copy** (⧉); **close** (×). Drop ⬇ (dropzone), ⚙ and ⏩ (local chips: the dashed lemon already says "local"). Icon-only buttons get a 28x28 box and `aria-label`. |
| Monospace | hashes, but also local chips/pill, textarea text, the search placeholder | Mono **only** for hex (hashes, addresses, key ids, tx) and raw evidence text. Size `max(13px,.875em)` so it scales with its context (today a fixed 13 px makes hashes shrink next to 16-18 px text). Short form `0x1234…abcd`, always lowercase: the account button shows the checksummed `0x7099…79C8`, every other place shows `0x7099…79c8`. |

### 2.3 Button hierarchy (CSS to replace the `button,.btn,select,input,textarea` block)

```css
button,.btn,select{font:700 var(--fs-body)/1.2 var(--sans);min-height:var(--ctl);padding:0 var(--s4);display:inline-flex;align-items:center;justify-content:center;gap:var(--s2);
  border:var(--bw) solid var(--ink);border-radius:var(--r-md);background:#fff;color:var(--ink);text-decoration:none;cursor:pointer;white-space:nowrap}
button.pri,.btn.pri{background:var(--ink);color:#fff}                          /* primary: one per view */
button.big,.btn.big{min-height:var(--ctl-lg);padding:0 var(--s5);font-size:var(--fs-lead)}
button.sm,.btn.sm,.localbar button,.tabs button{min-height:var(--ctl-sm);padding:0 var(--s3);font-size:var(--fs-sm)}
button.danger,button.warn{background:var(--bad-bg);color:var(--ink)}           /* destructive: Revoke, Forfeit, their confirm buttons */
button:disabled,.btn[aria-disabled=true]{background:#f1f0f5;color:var(--dim);border-color:#b9b8c8;cursor:not-allowed;opacity:1}
button.link,.link{min-height:0;padding:var(--s1) 0;border:0;background:none;color:var(--accent);font-weight:400;display:inline}  /* tertiary */
.copy,.t-close,.mirrorbtn{min-height:0}
input,textarea{font:var(--fs-sm)/1.5 var(--mono);min-height:var(--ctl);padding:var(--s2) var(--s3);border:var(--bw) solid var(--ink);border-radius:var(--r-md);width:100%;background:#fff;color:var(--ink)}
textarea{font-family:var(--sans);font-size:var(--fs-body)}                       /* evidence is prose or a URL, not hex */
:focus-visible{outline:none;box-shadow:var(--focus)}
```

Rules: one `.pri` per view. Navigation is "→" and secondary or link, never primary, unless it is the next step ("View record →" after attesting is fine). Destructive actions are rose in both places, the trigger and the dialog confirm: today "Revoke key…" is rose but "Revoke in MetaMask" is ink primary.

---

## 3. Per screen

### Global shell (header, banner, layout)
Critique: the header is clean, but "Protocol view" is a bare native checkbox. It reads as a form field, not a mode switch. The account button carries five items (dot, name, address, ETH, WETH badge, ▾), and that is what makes the header wrap at 1024 px (the wrap itself is known: crawl #7).
- Protocol view: restyle as a toggle button, `label.pv` with the checkbox visually hidden. Off: secondary `.sm` button "Protocol view". On: filled `--uma-bg` with ink border, text "Protocol view ✓". **P1 S** (`styles.css .pv`, `index.html`).
- Account button: drop the ETH balance from the button (it stays in the menu). Keep dot + name + short address + the claimable chip only if > 0. **P1 S** (`wallet.js` renderAccount, `[account-eth]`).
- Network banner: weight 400, `--muted` text. It is a disclaimer, not a headline, yet it is the first thing the eye hits (first-time review #01). Keep the lemon and the dashed border. **P2 S** (`.netbanner{font-weight:400;color:var(--muted)}`; wording known).
- Layout: `.shell{padding:var(--s5) var(--s5) 96px}`, `main{gap:var(--s5)}`, `h1{font-size:var(--fs-h1)}`, `h2{font-size:var(--fs-h2);margin:0 0 var(--s3)}`, `.sub{margin:calc(-1*var(--s3)) 0 0;font-size:var(--fs-lead)}`. **P1 S**.

### Verify (home, empty)
Critique: the drop zone is only 380 px wide on a 1440 px screen, and the main call to action is a small text link inside it. The right half is empty (known). The dashed ink border also clashes with the rule "dashed = local".
- Empty state: let the drop zone span the full content width at `min-height:240px`, with a real primary button inside: **"Choose a photo"** (`.pri.big`), plus the line **"or drop it here · nothing is uploaded, the hash is computed in your browser"** (16 px, `--muted`). Drop the ⬇ glyph. Switch to the two-column `.verify-grid` only once a file is loaded. **P1 M** (`verify.js`, `.dropzone`).
- Dropzone border: `border:2px dashed var(--dim)` (grey dashes). Ink dashes stay reserved for local tools. With a file loaded: `.dropzone:has(img){border:var(--bw) solid var(--ink);padding:0}`. **P1 S**.
- "Recent records" header: move "Explorer →" to the right edge of the card title row, text **"All records in Explorer →"**, 14 px. **P2 S** (`.card > h2` as flex `justify-content:space-between`).

### Verify (file loaded: open / no record / fake / refunded)
Critique: a strong verdict, but the left column ends in a small 13 px "Choose another file" button floating above the file caption. The SHA-256 line is a 13 px mono string with no structure, and the action row sits between the scope lines and the hash.
- Left column caption: the file name and size first, then a **link** "Choose another file" on the same line (`.d` row: `selfie.jpg · 17 KB · Choose another file`). **P2 S**.
- Order on the right: verdict, then scope lines, then the hash block, then the actions. The hash goes in a `dl.kv` row: `SHA-256` (label, sans 14 px `--muted`) / value (mono 14 px, `word-break:break-all`). Then the actions row: "Open record →" (`.btn.pri`) + "Tamper test: change one pixel" (link). **P2 S**.
- Refunded / challenge over: the verdict class becomes `closed` (white background, seal ○) instead of `open` (sky). The chip for the same states becomes white too, not mint. (Seal and wording known: first-time #11; colour is new.) **P1 S** (`verdict.js verdictOf` cls, `stateChip` class; CSS `.verdict.closed{background:var(--closed-bg)}`, `.chip.n{background:#fff}`).

### Attest
Critique: the camera box takes 60% of the width and 540 px of height, and the capture controls sit centred under it, away from the Summary card. The bordered placeholder "Take a photo, or choose a file" looks like a button and isn't one. The Summary title says nothing about what the card does.
- Grid: `.attest-grid{grid-template-columns:minmax(0,1.3fr) minmax(340px,1fr)}`, `.cambig{max-height:min(60vh,480px)}`. **P1 S**.
- Empty preview: replace the fake-button label with two real buttons centred in the box: **"Start camera"** (`.pri`) and **"Choose a file"** (secondary). Under them, the link "use a sample image (local)" (dashed-lemon chip style, see local tools). Remove the row under the preview while it is empty. **P1 M** (`attest.js`, `.cambig b`).
- With a photo or live camera: the controls row goes left-aligned directly under the preview (`.row` not `.row.center`), "Take photo" `.pri` while live, "Retake" secondary. **P2 S**.
- Card title "Summary" → **"Attestation"**. `.summary .kv{grid-template-columns:110px 1fr}` (the 150 px label column leaves a 60 px hole). **P2 S**.
- Success box: keep. Make "Take another photo" `.sm` secondary so it sits on the same baseline as "View record →". **P2 S**.
- Refusal box (lemon, "no device key"): radius `--r-lg`, padding `--s4`, button full-width `.pri` (already). OK.

### Record page (all lifecycle states)
Critique: six stacked full-width blocks of equal weight (title row, verdict, action row, lifecycle, accuse panel, accusations) before Details/History. The primary action floats alone in a 70 px row. "Copy link" is a bordered button competing with the title. The scope lines are buried at the bottom of Details. History stretches to Details' height and leaves a large empty white box.
- **Action inside the verdict** (right side, vertically centred): `.verdict > .v-action{margin-left:auto}`. Reveal / Refund / Claim / Accuse as `.pri.big`, with the "why" text under it (14 px). Removes one row and ties "what is true" to "what you can do". **P1 M** (`record.js` main render: pass `action` via `verdictCard(..., {extra})` or a new `action` option in `verdict.js verdictCard`).
- **Lifecycle directly under the verdict**, gap `--s3` instead of 18 px, so the two read as one unit. **P1 S** (order in `record.js`).
- **Scope lines under the lifecycle** (same as Verify), not inside Details. **P1 S** (`scopeLines(rec)` moved out of the Details `dl`).
- Title row: `h1` "Record" + hash in mono 18 px `--muted`. "Copy link" becomes a link with ⧉ next to the hash, not a bordered button. **P2 S** (`.rec-head`).
- `.rec-grid{grid-template-columns:1.2fr 1fr;align-items:start}`: History no longer stretches. **P1 S**.
- Lifecycle terminal states: when the record is fake, the last step "Proven fake" gets class `bad` (rose, not lemon), and every earlier step is `done`. When refunded, all steps are `done`. (Step set known: first-time #4; this is the colour rule.) **P0 S** (`verdict.js lifecycle()`: `cls = i<curIdx||final ? "done" : …`, plus `bad` for fake).
- Key revoked / key flagged verdicts: the headline says "revoked" while Details says "flagged". Use one word on the page. Headline **"Not judged · key revoked at block 70"**, Details **"0x606b…d511 · revoked at block 70"**. **P2 S** (`verdict.js`, `record.js deviceText`).

### Accuse flow (panel, commit, reveal, waiting, settled)
Critique: the accuse stepper (16 px bold, 46 px tall) is visually *stronger* than the record lifecycle (14 px), which inverts the hierarchy. The form spans 1350 px: a full-width textarea and a full-width 13 px "Commit accusation" bar. The bond rule, the thing that costs money, is 14 px grey.
- Stepper smaller and numbered: labels **"1 Commit", "2 Reveal", "3 UMA vote", "4 Settled"**, `.stepper li{font-size:var(--fs-sm);padding:var(--s2) var(--s3)}`, `.stepper{border-width:1.5px;border-radius:var(--r-md)}`. When settled, "4 Settled" is `done` (mint), not lemon. **P0 S** (`styles.css .stepper`, `record.js` stepper classes).
- Form width: `.accuse > *:not(.stepper){max-width:720px}`. Commit button `.pri.big`, left-aligned (`justify-self:start`), not full-width. **P1 S**.
- "…or attach a file" → secondary `.sm` button **"Attach a file"**. A chosen file shows as a chip `evidence.pdf · 12 KB ×`. **P2 S**.
- Bond line above the button at 16 px ink, not muted: **"Bond 1 WETH · lost if the evidence does not prove the fake"** with "Bond 1 WETH" bold. The publication note stays `.d` below the textarea. **P1 S**.
- Committed: show the countdown as the step's headline in 18 px bold, **"Reveal within 15 min · by 08:18"** (typo fix known: first-time #8), with the commitment hash on a `.d` line below. **P2 S**.

### Accusations card / outcome
Critique: the outcome line is the most informative sentence in the app, but it mixes 17 px bold text, a 13 px mono link and "·" separators on one line. From the back of a room it is one grey smear.
- Outcome = a chip plus a three-cell money strip:
  `[Rejected]` or `[Fake proven]` chip (state colours), then a strip of three equal cells with a 2 px ink border: **Accuser (Bob) −1 WETH | Depositor (Alice) +0.5 WETH | UMA fee 0.5 WETH**, values 20 px bold tabular, labels 14 px `--muted`. Under the strip, one `.d` line: "Credits are claimable from the account menu." **P1 M** (`record.js` accusation row `.outcome`; CSS `.money{display:grid;grid-template-columns:repeat(3,1fr);border:var(--bw) solid var(--ink);border-radius:var(--r-md)} .money div{padding:var(--s3)} .money div+div{border-left:var(--bw) solid var(--ink)} .money b{display:block;font-size:20px}`).
- Evidence preview: label "Evidence" as a 14 px `--muted` caption. `.ev-text` max-height 120 px with the paper background (keep). `.ev-img` max 320x200. **P2 S**.

### My activity
Critique: the tabs are styled exactly like action buttons, with the active one as a filled primary, so they look like three commands. The colour of the same event flips by perspective: "fake proven · you won" is mint in accusations, "proven fake" is rose in records.
- Tabs: use the nav look. `.tabs{border-bottom:var(--bw) solid var(--ink);gap:var(--s1)}` `.tabs button{border-color:transparent;background:none;border-radius:var(--r-md) var(--r-md) 0 0;min-height:var(--ctl-sm)}` `.tabs button.on{border-color:var(--ink);border-bottom-color:var(--paper);background:var(--paper);color:var(--ink);margin-bottom:-2px}`. **P1 S**.
- Accusation chips: colour by the record's outcome (fake proven = rose, rejected = white/closed, waiting = lemon). Put the personal result in the text: **"fake proven · you won +0.5 WETH"**, **"rejected · you lost 1 WETH"**. **P1 S** (`activity.js` chip classes).
- Records table: add an **Amount** column ("1 WETH locked" / "refunded" / "lost") and right-align "Recorded". Device key column `--muted`. **P2 M**.
- Header: "Claimable 1 WETH [Claim]": OK. Hide it at 0 (known).

### Explorer: home
Critique: the 50/50 split leaves "Latest blocks" (3 short columns) mostly empty, while "Latest transactions" wraps method names and "3 min / ago" onto two lines. Neither table has headers. Raw selectors (`0x095ea7b3`) appear among decoded names. The search placeholder is cut off at "…address or ph".
- `.explorer-grid{grid-template-columns:minmax(260px,1fr) 2.2fr}` (new class instead of `.rec-grid`). **P1 S** (`explorer.js` home).
- Header rows: Blocks **Block / Txs / Age**; Transactions **Tx / Call / From / Age**. Age column `text-align:right;white-space:nowrap`. **P1 S**.
- Undecoded selectors: show `approve (WETH)` for `0x095ea7b3`, `transfer` for `0xa9059cbb`, otherwise **"unknown call 0x095e…"** in `--dim`. **P2 M** (`format.js`/explorer decode table).
- Search: input `width:440px`, sans placeholder **"Tx hash, block, address or photo hash"**, mono only for the typed value (`input::placeholder{font-family:var(--sans)}`). **P2 S**.
- Title "Localhost explorer" (wording known); subtitle OK.

### Explorer: tx / address / block / device
Critique: the page h1 stays "Localhost explorer" while the real subject ("Transaction 0xdac8…") is an 18 px card title. Tx lists on the address/block pages follow the kv list with no heading and no column headers. "Open record →" is a secondary button left alone at the bottom.
- Heading pattern for every detail page: h1 = **"Transaction"**, **"Block #54"**, **"Address · Alice"**, **"Device key"**, with the hash on a mono `.sub` line and copy. Plus a breadcrumb link above: **"← Explorer"** (14 px). The search box stays at the right. **P1 S** (`explorer.js` tx/block/address/device).
- Tx page: "Open record →" moves to the h1 row, right side, `.btn.pri`. Call args and events lose the bullets (`.args{list-style:none;padding:0}`), one arg per line as `name` (`--muted` 14 px) + value. **P2 S**.
- Address/block/device lists: card title **"Transactions (10)"** / **"Records (2)"**, column headers, block # right-aligned. The device page also shows the key status chip (active / flagged / revoked) next to the title. **P1 S**.
- Not found (tx, block, address, search): replace the red bold `.err` with the empty-state pattern (see below): **"No transaction 0x1234…abcd on Paprika local."** + link **"← Back to Explorer"**. Red is reserved for failures and fakes. **P1 S** (`explorer.js` `[tx-missing]` etc.).

### Account menu
Critique: there is no visual hierarchy. The identity is a 13 px mono link, "MetaMask · Paprika local" is grey, balances sit at 16 px regular, and the set-up step, claimable credit and device key all have the same weight. The panel sits 2 px over the header border and 4 px right of the button's right edge. It has no shadow, so it blends into the page.
- Structure (top to bottom), sections separated by a 1.5 px `--line` rule:
  1. **Alice** (18 px bold) + `0x7099…79c8 ⧉` (mono `--muted`) · right side: chip "MetaMask · Paprika local".
  2. Balances as a 3-column grid: **ETH 9997 | WETH 3 | Claimable 1** (labels 13 px `--muted`, values 18 px bold) + "Claim" `.sm.pri` under Claimable, shown only when > 0.
  3. **Set-up** checklist, only until both steps are done: "1 Prepare account" (✓ or `.sm` button), "2 Device key" (✓ or `.sm` button). (Order missing: first-time #03.)
  4. **Device key of this browser**: id + status chip, then "Export" "Import" as `.sm` secondary, then a separate row "Revoke key…" `.sm.danger`.
  5. Footer: "Disconnect" link, right-aligned.
  **P1 M** (`wallet.js menu()`).
- Position: `.menu-slot{top:calc(64px + var(--s2));right:var(--s5);width:360px}` `.menu{box-shadow:var(--shadow-pop)}`. **P1 S**.

### Dialogs (prepare, confirm attest, confirm commit, revoke)
Critique: the best screens in the app (keep the content). Visually: the title is 17 px, same as body text. The kv label column (150 px) is wider than needed. Buttons are 13 px (the font bug). Revoke, a destructive and irreversible action, confirms with the same ink primary button and default focus as "Attest".
- `.modal{max-width:600px;padding:var(--s5);box-shadow:var(--shadow-pop)}` `.modal h2{font-size:22px;margin-bottom:var(--s4)}` `.modal .kv{grid-template-columns:130px 1fr;font-size:var(--fs-lead)}`. **P1 S**.
- Move the "Signatures" row out of the kv and into the footer, left of the buttons: **"1 signature in MetaMask"** (14 px `--muted`). **P2 S** (`toasts.js confirmDialog` `note` placed in the footer row).
- Destructive variant: `confirmDialog({danger:true})` → confirm button `.danger`, initial focus on **Cancel**. Use it for Revoke and Forfeit. **P0 S** (`toasts.js confirmDialog`, `wallet.js revoke`, `record.js` forfeit).
- Close on Esc and on a backdrop click (focus is already placed). **P2 S**.

### Toasts
Critique: the success toast renders all its text dark green (#17703f) on mint, because `.toast.ok` also matches the global `.ok{color:#17703f}`. Titles and body share one size. There is no shadow, so the toast looks pasted onto the content it overlaps (overlap known).
- `.toast{font-size:15px;color:var(--ink);box-shadow:var(--shadow-pop);border-radius:var(--r-lg)}`. Rename the global `.ok` text class to `.t-ok` (and `.err` → `.t-bad`) in `styles.css` and its few users (`record.js` evidence-hash-ok, `wallet.js` menu-prepared). **P0 S**.
- Leading status glyph in the head: pending "…" / ok "✓" / failed "✕" / rejected "–" (16 px bold), title 15 px bold, body 15 px. **P2 S** (`toasts.js`).

### Protocol view (drawer)
Critique: this is the cryptographers' content, but it is the smallest text on screen (13-15 px in 380 px). The bullets of "Paprika in three lines" hang outside the text column (`.ex-text{padding-left:0}` on a `ul`). The phase map pills look like buttons and do nothing.
- `.drawer{width:420px;font-size:var(--fs-body)}` (`body.protocol-open .shell{grid-template-columns:minmax(0,1fr) 420px}`), `.ex-text{padding-left:20px}`, `.ex-step{font-size:20px}`. **P1 S**.
- Phase map as a non-interactive flow: `.pmap li{border:0;background:none;color:var(--dim);padding:0}` with "→" separators. Current phase `.cur{color:var(--ink);background:var(--wait-bg);border-radius:var(--r-sm);padding:2px 6px}`. **P2 S**.
- Parameter block (B, T_photo, T_reveal, f): a two-column `dl.kv` with symbols in mono and values right-aligned. Contracts as label + link rows. **P2 S**.
- Close button "Close" → "×" 28 px box, the same as toasts. **P2 S**.

### Local tools (pill, bar, inline chips)
Critique: local facilities are the only components set in monospace, which makes them look like code and competes with the hashes. ⏩ and ⚙ add noise; the dashed lemon already says "local". (Position and overlap known.)
- `.localchip,.localpill{font:700 var(--fs-sm)/1.2 var(--sans);min-height:var(--ctl-sm);padding:0 var(--s3);border-radius:var(--r-pill)}`. Labels without glyphs: **"Skip wait (local)"**, **"Resolve: fake proven (local)"**, **"Resolve: not proven (local)"**, pill **"Local network tools"**. **P0 S** (`styles.css`, `localtools.js localChip`).
- `.localbar` buttons `.sm`; row gap `--s2`. OK otherwise.

### Empty and error states
Critique: three different patterns. Grey text in a card ("No records yet on this network."), bold + link in a card (activity), and red bold text on the page background (explorer not found). Record-not-found shows the grey verdict plus a redundant grey sentence and no way forward.
- One pattern, `.empty-state`: white card, 2 px border, no lift, centred, `padding:var(--s6)`. Title 18 px bold, one `.d` line, one action (link or secondary). **P1 S**.
- Record not found: keep the grey verdict. Replace the sentence with the hash being looked up (mono) and two links: **"Verify a file →"**, **"Search the explorer →"**. **P1 S** (`record.js` not-found branch).
- Errors (`.t-bad`) only for failures that need action. "Not found" is neutral. **P1 S**.

### Wrong network
(Merge of pill and switch button known.) Visual: the switch button should be `.sm.danger`, the same height as the pill (32 px). Today it is 36 px tall with a 13 px label. **P2 S**.

---

## 4. Per component

| Component | Verdict | Exact refinement |
|---|---|---|
| Header | refine | Height 64 px fixed (`min-height:64px`), `gap:var(--s4)`. Protocol view as a toggle button. Account button slimmed (no ETH). Logo 22 px 800 OK. |
| Network badge `.netpill` | refine | `font:700 14px/1 var(--sans);min-height:32px;display:inline-flex;align-items:center;gap:6px;color:var(--ink)`. The dot becomes a real 8x8 circle in `--ok-fg` / `--bad-fg` (`::before`), so the status is colour + text, not green text (wording known). |
| Account button `.acct` | refine | Dot + name + address + claim chip; `min-height:var(--ctl)`; address lowercase; `.badge` replaced by `.chip.m`. |
| Account menu | refine (structure) | Five sections as in §3; shadow; aligned to the button's right edge and 8 px below the header. |
| Verdict card `.verdict` | keep, refine | `padding:var(--s5);gap:var(--s5);border-bottom-width:var(--lift)`; `.bigt{font-size:var(--fs-verdict)}`; `.vd{font-size:var(--fs-lead);max-width:72ch}`; `.seal{width:84px;height:84px;font-size:44px}`; new `.verdict.closed`; action slot right. At ≤ 900 px `.bigt{font-size:28px}`. |
| Lifecycle bar `.lifecycle` | refine | `li{font-size:var(--fs-body);padding:var(--s3) var(--s4);opacity:1;color:var(--dim)}` `li.done{background:var(--ok-bg);color:var(--ink)}` `li.cur{background:var(--wait-bg);color:var(--ink);box-shadow:inset 0 -4px 0 var(--ink)}` `li.bad{background:var(--bad-bg);color:var(--ink)}` `small{font-size:var(--fs-sm)}`. A final state is never `cur`. |
| Stepper `.stepper` | refine | Numbered, 14 px, 1.5 px border, `--r-md`: visibly a sub-process of the lifecycle. |
| Buttons | replace (system) | §2.3. |
| Chips `.chip` | refine | `font:700 13px/1.2 var(--sans);padding:3px 8px;border-radius:var(--r-sm)`; classes `s` open, `p` waiting, `r` fake, `m` completed, `n` closed (white). On the record/verify pages (projector) use `.chip.lg{font-size:var(--fs-sm);padding:4px 10px}`. |
| Hash display + copy | refine | `.hashlink{display:inline-flex;align-items:center;gap:2px}`; mono `max(13px,.875em)`; ⧉ in a 28x28 box, `--muted`, `--accent` on hover; "Copied" in a tooltip for 2 s (target size known). Full 64-hex hashes only on Verify and the tx page, `word-break:break-all`. |
| Tables | refine | Always a header row. `th{font-size:var(--fs-meta);color:var(--muted)}`, `td{padding:var(--s3) var(--s2);height:44px}`; numbers/time `text-align:right;white-space:nowrap`; first column mono; clickable rows `tr:hover td{background:var(--paper)}`. |
| History list `.history` | refine | Row grid `grid-template-columns:1fr auto`: left "**Attested** by Alice 0x7099…79c8", right "#37 · tx 0x44c4…abf9" in 14 px `--muted`. Row padding `var(--s2) 0`. Font 15-16 px (today 14). |
| Evidence preview | keep | Caption label, `.ev-img` 320x200 max, `.ev-text` 120 px max-height. |
| Camera panel `.cambig` | refine | Max height 480 px; when live, a "● Live" chip top-left (rose dot, white chip); real buttons inside the empty state; mirror toggle only while live (known). |
| Stepper/lifecycle duplication | keep both | Differentiated by size, not removed. |
| Toast | refine | Ink text on every status, shadow, status glyph, 15 px, `--r-lg`. |
| Dialog `.modal` | refine | 600 px, 22 px title, 18 px kv, signature note in the footer, `danger` variant with focus on Cancel. |
| Drawer | refine | 420 px, 16 px body, bullets fixed, non-interactive phase flow. |
| Callout `.callout` / `.note` | merge | One `.callout` (lilac, `--r-md`, no border, `padding:var(--s3) var(--s4)`, 16 px). `.note` (bordered lilac) only for the multi-key warning on Verify, and then it becomes a `.callout` too. |
| Result / refusal boxes | keep | Radius → `--r-lg`, padding `--s4`, title 18 px bold. |

---

## 5. Projector check

Assumptions: 1440x900 output on a 3-4 m screen, audience up to 12 m away, a washed-out projector (pastels lose saturation and contrast drops ~30%).

**Minimums for anything the story depends on** (CSS px at 100% zoom):
- Verdict title ≥ 32 px (36 proposed); page title ≥ 28 px; anything the presenter points at ≥ 18 px; anything secondary the audience should still be able to read ≥ 16 px; nothing on demo screens < 14 px (13 px only for table headers and timestamps).
- Text contrast ≥ 7:1 for those elements (ink on any pastel is 11-15:1, fine; `--muted` 8.3:1 fine; `--dim` 5.3:1 only for "not yet" states).
- State must never depend on fill alone. Sky #dce6ff vs white is ~1.2:1 and can vanish on a projector, so each state also needs its seal glyph + words (true today for the verdict, not for the lifecycle, where "current" vs "done" is lemon vs mint only. The proposed 4 px ink bottom bar on `cur` fixes that).
- **Present at browser zoom 125%** (Ctrl +). Layout = the crawl's `1440@125%` viewport (identical, no horizontal scroll), so 16 px → 20 px, 14 → 17.5, 36 → 45. This alone fixes most of the table below. **P0, zero code** (add to `docs/demo.md`).

| Screen | What the audience must read | Today | Pass at 100%? | Pass at 125% + fixes? |
|---|---|---|---|---|
| Verify (result) | verdict title, detail, "Not shown" | 32 / 16 / 15 px | title yes; detail and scope **no** | yes (detail 18 → 22.5) |
| Attest | "Attest photo", dialog lines | 17 px; dialog 16 px; dialog buttons 13.3 px | **no** (buttons) | yes after the font fix |
| Record: lifecycle | step names + "ends 09:01" | 14 / 12 px, future steps 3.4:1 | **no** | yes (16/14 → 20/17.5, `--dim`) |
| Record: accuse stepper + form | step, bond line | 16 px; bond 14 px grey | **no** (bond) | yes |
| Record: outcome | who lost/gained how much | 17 px bold mixed with 13 px mono | **no** | yes (money strip 20 → 25) |
| Record: history | the three events | 14 px + 13 px mono | **no** | borderline (pointer only) |
| Local chips | "Skip wait", "Resolve" | 13 px mono | **no** | yes (14 sans, 17.5) |
| Toasts | "Confirmed in block 38" | 14 px, green on mint | **no** | yes (15 ink → 19) |
| Account menu | balances, claimable | 16 px regular, 13 px address | borderline | yes (18 bold values) |
| Protocol view drawer | measured = expected table, calls | 13-15 px | **no** | yes at 16 px + 125% |
| Explorer tx | method, events | 16 px, args 13-14 px | borderline | yes |
| Header / banner | network | 13 px | n/a (not story-critical) | fine |

Fails at 100% today: **Record page (lifecycle, outcome, history, local chips), toasts, drawer, every bordered button (13.3 px).** The verdict cards and dialogs pass.

---

## 6. Implementation list (about 45 minutes, P0 first)

Files: `app/web/styles.css` (most), `app/web/js/verdict.js`, `app/web/js/toasts.js`, `app/web/js/pages/record.js`, `app/web/js/localtools.js`, `app/web/js/wallet.js`, `app/web/js/pages/activity.js`, `app/web/js/pages/explorer.js`. Re-run `npm run e2e` after the class renames (`.ok`/`.err` are used for some testid'd elements; the testids don't change).

| # | Pri | Min | Where | Change |
|---|---|---|---|---|
| 1 | P0 | 2 | `styles.css` `button,.btn,select,…` | Replace the invalid `font:700 15px/1.2 inherit` with `font:700 var(--fs-body)/1.2 var(--sans)` (§2.3 block). Fixes the size and weight of every button. |
| 2 | P0 | 3 | `styles.css :root` | Add the token block (§2.1), `--muted` opaque. |
| 3 | P0 | 5 | `styles.css` buttons | Heights, `.sm`, `.big`, `.danger`, disabled style, `.link` tertiary, `:focus-visible`, resets for `.copy,.t-close,.mirrorbtn` (§2.3). |
| 4 | P0 | 2 | `styles.css` + `record.js`, `wallet.js` | Rename global `.ok`/`.err` text classes to `.t-ok`/`.t-bad`; `.toast{color:var(--ink);box-shadow:var(--shadow-pop)}`. |
| 5 | P0 | 5 | `verdict.js lifecycle()`, `record.js` stepper, `styles.css .lifecycle/.stepper` | Final state = all `done` (fake = last step `bad`); `cur` gets the ink bottom bar; `--dim` instead of opacity; lifecycle 16/14 px; stepper numbered 14 px. |
| 6 | P0 | 3 | `toasts.js confirmDialog`, `wallet.js` revoke, `record.js` forfeit | `danger` option: `.danger` confirm, focus on Cancel. |
| 7 | P0 | 2 | `styles.css .localchip,.localpill`, `localtools.js` | Sans 14 px pill; drop ⏩/⚙ from labels. |
| 8 | P0 | 0 | `docs/demo.md` | "Present at browser zoom 125%." |
| 9 | P1 | 4 | `verdict.js verdictOf/stateChip`, `styles.css` | `closed` verdict (white, ○) for refunded / challenge over; `.chip.n` white; activity accusation chips coloured by outcome, words carry "you won/lost". |
| 10 | P1 | 6 | `record.js` render order, `verdict.js verdictCard` | Action inside the verdict (right); lifecycle right under it; scope lines under the lifecycle; `.rec-grid{grid-template-columns:1.2fr 1fr;align-items:start}`. |
| 11 | P1 | 5 | `record.js` accusation row, `styles.css .money` | Outcome chip + three-cell money strip, 20 px values. |
| 12 | P1 | 3 | `styles.css .accuse`, `record.js` accuse form | Form max-width 720, Commit `.pri.big` left-aligned, bond line 16 px ink. |
| 13 | P1 | 3 | `styles.css .tabs`, `.menu-slot`, `.menu`, `.modal`, `.drawer`, `.ex-text` | Tabs as tabs; menu position + shadow; dialog 600 px / 22 px title; drawer 420 px / 16 px, bullet padding. |
| 14 | P1 | 4 | `explorer.js`, `styles.css` | Home grid `1fr 2.2fr`, header rows on every table, right-aligned nowrap age; detail-page h1 + "← Explorer"; not-found as an empty state (not red). |

Remaining P1/P2 items (attest layout and empty camera buttons, the Verify full-width empty dropzone, the account menu restructure, protocol toggle restyle, history grid, explorer selector decoding, `.empty-state` pattern) fit a second pass of about 30 minutes.
