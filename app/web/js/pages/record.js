// Paprika web app: the record page #/record/<photoHash>[?key=<keyId>] — the centre of the product.
// Verdict, lifecycle, one contextual action (Reveal / Refund / Accuse), copy link, details, evidence and history
// with explorer links. Accusing happens here: evidence (file or text) → confirm → commit → reveal (countdown) →
// UMA vote → outcome in words. Claimable credit lives in the account menu and My activity, never here.
// The commitment secret is stored BEFORE the wallet signs, keyed by the committing address, and reconciled with the
// chain's Committed events, so a reload or an account switch during the signature never loses a bond.

import { h, mount } from "../dom.js";
import { S, emit, save } from "../state.js";
import { same, toHex, download, big } from "../../util.js";
import { verdictCard, scopeLines, lifecycle, stateOf, refundable, accusationsOf, notAccusable, deviceOf } from "../verdict.js";
import { hashLink, addrLink, blockLink, tok, signedTok, dur, rel, exactTime, size } from "../format.js";
import { act } from "../actions.js";
import { confirmDialog } from "../toasts.js";
import { accountBlocker, prepared } from "../wallet.js";
import { getRecords, publishEvidence, getEvidence, paprikaEvents } from "../api.js";
import { localChip, skipWait, untilRefundable, resolveVote, skipBlocker } from "../localtools.js";
import { snapshot } from "../outcome.js";

// Page state per record key: the accuse form (evidence) and cached reads.
const R = { key: "", records: [], events: [], evidence: {}, form: { text: "", file: null }, formError: "", loading: false };

// Loads the records and events of a photo (after a route change or a new block), and reconciles pending commits.
export async function load(photoHash) {
  R.loading = true;
  R.records = await getRecords(photoHash);
  R.events = (await paprikaEvents()).filter((e) => e.args?.photoHash && same(e.args.photoHash, photoHash));
  R.loading = false;
  await reconcileCommits();
  for (const a of S.accusations.filter((x) => same(x.photoHash, photoHash))) {
    if (!(a.evidenceHash in R.evidence)) { R.evidence[a.evidenceHash] = null; getEvidence(a.evidenceHash).then((ev) => { R.evidence[a.evidenceHash] = ev || false; emit("change"); }); }
  }
}

// This browser's accusations, keyed by "<committing address>|photoHash|keyId" (survive reloads and switches).
const keyFor = (address, photoHash, keyId) => `${String(address).toLowerCase()}|${String(photoHash).toLowerCase()}|${String(keyId).toLowerCase()}`;
function mine(rec) { return S.account ? S.mine[keyFor(S.account.address, rec.photoHash, rec.keyId)] || null : null; }
function setMineFor(address, rec, v) { const k = keyFor(address, rec.photoHash, rec.keyId); if (v) S.mine[k] = v; else delete S.mine[k]; save("mine", S.mine); }

// A pending commit (secret stored, signature asked) is confirmed by its Committed event on chain.
async function reconcileCommits() {
  const pend = Object.entries(S.mine).filter(([, m]) => m.pending && m.commitment);
  if (!pend.length) return;
  const p = S.ctx.contracts.paprika;
  for (const [k, m] of pend) {
    const evs = await p.queryFilter(p.filters.Committed(m.commitment), 0, "latest").catch(() => []);
    if (evs.length) {
      const blk = await S.ctx.provider.getBlock(evs[0].blockNumber);
      S.mine[k] = { ...m, pending: false, committedAt: Number(blk.timestamp), commitTx: evs[0].transactionHash };
      save("mine", S.mine);
    }
  }
}

// The reveal deadline and liveness of a commitment of this browser.
const isDeadCommit = (m) => m && m.committedAt && !m.assertionId && !m.noAssertion && S.chain.timestamp + 1 > m.committedAt + Number(S.ctx.params.revealWindow);
export const liveCommit = (m) => !!(m && m.commitment && !m.pending && !m.assertionId && !m.noAssertion && !m.forfeited && !isDeadCommit(m));

// Step 1: publish the evidence, confirm, store the secret, then commit (only a hash goes on chain, with the bond).
async function commit(rec) {
  const text = R.form.text.trim();
  const file = R.form.file;
  if (!text && !file) { R.formError = "Add the evidence first: a link or a text, or attach a file."; emit("change"); return; }
  R.formError = "";
  const B = big(S.ctx.params.bond);
  const fB = (B * BigInt(Math.round(Number(S.ctx.params.feeShare) * 1e9))) / 1000000000n;
  const ok = await confirmDialog({ title: "Commit this challenge", testid: "confirm-commit", confirm: "Commit in MetaMask",
    lines: [["Photo", hashLink(rec.photoHash, "hash")], ["Bond", `${tok(B)} locked now`],
      ["If the evidence proves it", `you get your ${tok(B)} bond back plus ${tok(B - fB)}; UMA keeps ${tok(fB)}`],
      ["If it does not", `you lose ${tok(B)}`],
      ["Then", `reveal within ${dur(S.ctx.params.revealWindow)} (one more signature)`],
      ["Signatures", prepared() ? "1 in MetaMask" : "up to 3 in MetaMask (wrap, approve, commit)"]] });
  if (!ok) return;
  const who = S.account.address;   // the committing account: its secret stays with it, whatever happens next
  await act("Commit challenge", async () => {
    const [published, before] = await Promise.all([publishEvidence(file || text), snapshot(rec.photoHash, rec.keyId)]);
    const base = { photoHash: toHex(rec.photoHash), keyId: toHex(rec.keyId), evidenceUrl: published.url, before };
    // The secret is made here and stored BEFORE anything is signed (also before a wrap or an approval).
    const { ethers } = S.ethers;
    const salt = ethers.hexlify(ethers.randomBytes(32));
    const evidenceHash = toHex(published.evidenceHash).toLowerCase();
    const commitment = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32", "bytes32", "bytes32", "bytes32"],
      [who, rec.photoHash, rec.keyId, evidenceHash, salt]));
    setMineFor(who, rec, { ...base, evidenceHash, salt, commitment, pending: true });
    try {
      const r = await S.lib.commitAccusation(S.ctx, "accuser", { photoHash: rec.photoHash, keyId: rec.keyId, evidenceHash, salt });
      const last = S.actionTxs[S.actionTxs.length - 1];
      const blk = last ? await S.ctx.provider.getBlock(last.blockNumber) : null;
      let wrapped = 0n;
      for (const t of S.actionTxs) if (/deposit|wrap/i.test(t.call)) { const tx = await S.ctx.provider.getTransaction(t.txHash); wrapped += big(tx?.value ?? 0); }
      setMineFor(who, rec, { ...base, evidenceHash: toHex(r.evidenceHash), salt: toHex(r.salt), commitment: toHex(r.commitment), pending: false,
        committedAt: Number(blk?.timestamp ?? S.chain.timestamp), commitTx: last?.txHash, wrapped });
      R.form = { text: "", file: null };
    } catch (e) {
      // Rejected or failed before reaching the chain: forget the pending secret (nothing was committed).
      const k = keyFor(who, rec.photoHash, rec.keyId);
      const m = S.mine[k];
      if (m?.pending) {
        const p = S.ctx.contracts.paprika;
        const evs = await p.queryFilter(p.filters.Committed(m.commitment), 0, "latest").catch(() => []);
        if (!evs.length) setMineFor(who, rec, null);
      }
      throw e;
    }
  }, { step: { key: "commit" } });
}

// Step 2: reveal; Paprika sends the case to UMA's vote (or returns the bond if the photo is already accused).
async function reveal(rec) {
  const who = S.account.address;
  const m = mine(rec);
  await act("Reveal & send to UMA vote", async () => {
    const r = await S.lib.revealAccusation(S.ctx, "accuser", { photoHash: m.photoHash, keyId: m.keyId, evidenceHash: m.evidenceHash, salt: m.salt });
    const id = toHex(r.assertionId);
    if (!r.assertionId || /^0x0*$/.test(id)) setMineFor(who, rec, { ...m, noAssertion: true });
    else { setMineFor(who, rec, { ...m, assertionId: id }); S.voteBefore = { ...(S.voteBefore || {}), [id]: m.before }; }
  }, { step: { key: "reveal" } });
}

// Draws the page for a photo hash (and optional key).
export function render(root, { photoHash, key, accuse }) {
  if (!/^0x[0-9a-f]{64}$/.test(photoHash || "")) {
    mount(root, h("h1", {}, "Record"), h("div", { class: "card", testid: "record-bad-link" },
      h("b", {}, "This link is not a photo hash."), h("p", { class: "d" }, "A record link ends with 0x and 64 hexadecimal characters (the SHA-256 of the photo). Verify a file to find its record."),
      h("a", { class: "btn", href: "#/verify" }, "Verify a photo")));
    return;
  }
  if (R.key !== photoHash) { R.key = photoHash; R.records = []; R.loading = true; R.form = { text: "", file: null }; R.formError = ""; load(photoHash).then(() => emit("change"), () => { R.loading = false; emit("change"); }); }
  if (!R.records.length) {
    mount(root, h("h1", {}, "Record"), R.loading ? h("p", { class: "d" }, "Reading the chain…")
      : [verdictCard(null, { testid: "record-verdict" }), h("p", { class: "d" }, "No key attested this photo hash on this network.")]);
    return;
  }
  const rec = (key && R.records.find((r) => same(r.keyId, key))) || R.records.find((r) => stateOf(r) === "fake") || R.records[R.records.length - 1];
  const st = stateOf(rec);
  const acc = accusationsOf(rec);
  const m = mine(rec);
  const iAmDepositor = S.account && same(S.account.address, rec.depositor);
  const link = `${location.origin}${location.pathname}#/record/${rec.photoHash}${R.records.length > 1 ? `?key=${rec.keyId}` : ""}`;

  // Who may accuse this record now ("" = this account can).
  const accuseWhy = notAccusable(rec) || (iAmDepositor ? "You attested this photo: another account must challenge it." : "");
  const panelOpen = (accuse && !accuseWhy && S.account) || (m && !m.forfeited && (m.pending || liveCommit(m) || isDeadCommit(m) || m.assertionId || m.noAssertion));

  // The one contextual action.
  let action = null, actionWhy = "";
  const blocked = accountBlocker();
  if (m && liveCommit(m)) {
    action = h("button", { class: "pri big", testid: "btn-reveal", disabled: !!blocked || S.busy, onclick: () => reveal(rec) }, "Reveal & send to UMA vote");
  } else if (st === "attested" && refundable(rec) && iAmDepositor) {
    action = h("button", { class: "pri big", testid: "btn-refund", disabled: !!blocked || S.busy,
      onclick: () => act("Refund deposit", () => S.lib.refund(S.ctx, "photographer", { photoHash: rec.photoHash, keyId: rec.keyId }),
        { step: { key: "refund" }, okText: `${tok(S.ctx.params.bond)} added to your claimable balance. Claim it from the account menu.` }) }, "Refund deposit");
  } else if (!accuseWhy && !panelOpen) {
    action = h("a", { class: "btn pri big", testid: "btn-accuse", href: `#/record/${rec.photoHash}/accuse${R.records.length > 1 ? `?key=${rec.keyId}` : ""}` }, "Challenge");
  } else if (!panelOpen) actionWhy = accuseWhy;
  if (blocked && action) actionWhy = blocked;

  // The local "skip" chip sits next to the wait it skips (the refundable step), once.
  const skip = st === "attested" && !refundable(rec) ? h("div", { class: "row end skiprow" }, h("span", { class: "d" }, "Refundable ", rel(rec.refundableAt)),
    localChip("Skip wait (local)", () => skipWait(untilRefundable(rec)), { testid: "btn-skip-wait", disabled: skipBlocker() })) : null;

  const mineLine = m && (m.pending || liveCommit(m)) ? "1 committed by you (hidden until you reveal)" : null;
  mount(root,
    h("div", { class: "rec-head" }, h("h1", {}, "Record ", hashLink(rec.photoHash, "hash", { testid: "record-hash" })),
      h("button", { testid: "btn-copy-link", onclick: (e) => { navigator.clipboard?.writeText(link).catch(() => {}); const b = e.currentTarget; b.textContent = "Link copied ✓"; setTimeout(() => (b.textContent = "Copy link"), 2000); } }, "Copy link")),
    verdictCard(rec, { testid: "record-verdict", action: action || actionWhy ? [action, actionWhy ? h("span", { class: "why", testid: "record-action-why" }, actionWhy) : null] : null }),
    lifecycle(rec), skip,
    scopeLines(rec),
    panelOpen ? accusePanel(rec, m) : null,
    acc.list.length ? outcomes(rec) : null,
    h("div", { class: "rec-grid" },
      h("div", { class: "card" }, h("h2", {}, "Details"),
        h("dl", { class: "kv", testid: "record-details" },
          h("dt", {}, "Photo hash"), h("dd", {}, hashLink(rec.photoHash, "hash")),
          h("dt", {}, "Device key"), h("dd", {}, hashLink(rec.keyId, "device"), " · ", deviceText(rec)),
          h("dt", {}, "Signed"), h("dd", {}, "between block ", blockLink(rec.anchorBlock), " and ", blockLink(rec.recordedBlock), h("span", { class: "d" }, " (the device signed a block hash it could not know earlier)")),
          h("dt", {}, "Depositor"), h("dd", { testid: "record-depositor" }, addrLink(rec.depositor)),
          h("dt", {}, "Deposit"), h("dd", {}, st === "fake" ? "lost to the challenger" : st === "refunded" ? "returned to the photographer (claimable)" : `${tok(S.ctx.params.bond)} locked`),
          h("dt", {}, "Challenge period"), h("dd", {}, challengeText(rec)),
          h("dt", {}, "Challenges"), h("dd", { testid: "record-accusation-count" }, mineLine || (acc.total ? `${acc.total} (${acc.rejected} rejected, ${acc.proven} proven${acc.open ? ", 1 open" : ""})` : "none")),
          R.records.length > 1 ? [h("dt", {}, "Other keys"), h("dd", {}, R.records.filter((r) => r !== rec).map((r) => h("a", { class: "link mono", href: `#/record/${r.photoHash}?key=${r.keyId}` }, `${r.keyId.slice(0, 10)}… `)))] : null),
        S.files[rec.photoHash] ? h("button", { testid: "btn-download", onclick: () => { const f = S.files[rec.photoHash]; download(f.bytes, `paprika-${rec.photoHash.slice(2, 10)}.${extOf(f)}`, f.type); } }, "Download the attested file") : null),
      h("div", { class: "card" }, h("h2", {}, "History"), history(rec))));
}

// Device status in words.
function deviceText(rec) {
  const d = deviceOf(rec);
  return d.status === "flagged" ? `flagged (${d.reason}) at block ${d.flaggedAtBlock}` : d.status;
}

// "ends in 58 min · extended by 1 rejected accusation", with the refund time.
function challengeText(rec) {
  const now = S.chain.timestamp;
  const end = Number(rec.accusableUntil);
  const ext = accusationsOf(rec).rejected;
  return [end > now ? ["ends ", rel(end)] : ["ended ", rel(end)], ext ? ` · extended by ${ext} rejected challenge${ext > 1 ? "s" : ""}` : "", " · refundable from ", rel(rec.refundableAt)];
}

// The record's history: every Paprika event about it, with explorer links.
function history(rec) {
  const rows = R.events.filter((e) => !e.args.keyId || same(e.args.keyId, rec.keyId));
  const words = { Attested: "Attested", Refunded: "Deposit returned to the photographer (claimable)", AccusationOpened: "Challenged · sent to UMA vote" };
  const resolved = accusationsOf(rec).list.filter((a) => !a.open).map((a) => ({ name: "AccusationResolved", blockNumber: a.resolvedBlock, txHash: a.resolvedTx, fake: a.fakeProven }));
  const all = [...rows.filter((e) => e.name !== "AccusationResolved"), ...resolved].sort((a, b) => a.blockNumber - b.blockNumber);
  return h("ol", { class: "history", testid: "record-history" }, all.map((e) => h("li", { testid: "history-row" },
    h("span", {}, e.name === "AccusationResolved" ? `UMA vote: ${e.fake ? "fake proven" : "not proven"} (settled; anyone can settle)` : words[e.name] || e.name),
    e.args?.depositor ? [" by ", addrLink(e.args.depositor, { copy: false })] : e.args?.claimant ? [" by ", addrLink(e.args.claimant, { copy: false })] : null,
    " · ", blockLink(e.blockNumber), " · ", hashLink(e.txHash, "tx", { copy: false }))));
}

// Each accusation of the record: waiting for the vote (with the local resolve chips), or the outcome in words.
function outcomes(rec) {
  const B = big(S.ctx.params.bond);
  const fB = (B * BigInt(Math.round(Number(S.ctx.params.feeShare) * 1e9))) / 1000000000n;
  return h("div", { class: "card", testid: "record-accusations" }, h("h2", {}, "Challenges"),
    accusationsOf(rec).list.map((a) => h("div", { class: "acc-row", testid: "accusation-row", "data-open": a.open ? "1" : "0" },
      a.open ? h("div", { testid: "accusation-open" }, "Waiting for UMA's vote · 48-72 h on mainnet",
          S.votePhase && same(S.votePhase.assertionId, a.assertionId) && S.votePhase.phases.length ? ` · ${S.votePhase.phases.join(" ✓ · ")} ✓` : "",
          h("div", { class: "row" },
            localChip("Resolve vote (local): Fake proven", () => resolveVote(a.assertionId, true), { testid: "btn-vote-fake-inline" }),
            localChip("Resolve vote (local): Not proven", () => resolveVote(a.assertionId, false), { testid: "btn-vote-not-fake-inline" })))
        : h("div", { class: "outcome", testid: "settle-outcome", "data-outcome": a.fakeProven ? "fake-proven" : "not-proven" },
          h("div", {}, h("span", { class: `chip ${a.fakeProven ? "r" : "n"}` }, a.fakeProven ? "Fake proven" : "Challenge rejected"), " ",
            a.fakeProven ? "The device key is flagged." : "The challenge period was extended by the time under challenge."),
          h("div", { class: "money", testid: "settle-money" },
            h("div", {}, h("span", {}, "Challenger ", addrLink(a.claimant, { copy: false })), h("b", {}, signedTok(a.fakeProven ? B - fB : -B))),
            h("div", {}, h("span", {}, "Depositor"), h("b", {}, signedTok(a.fakeProven ? -B : B - fB))),
            h("div", {}, h("span", {}, "UMA fee"), h("b", {}, tok(fB)))),
          h("div", { class: "d" }, "Credits are claimable from the account menu.")),
      evidenceView(a))));
}

// The evidence of an accusation: its link and a preview of the content, with the hash check.
function evidenceView(a) {
  const ev = R.evidence[a.evidenceHash];
  const url = ev?.url || `/evidence/${a.evidenceHash.replace(/^0x/, "")}`;
  if (ev === undefined || ev === null) return h("div", { class: "d" }, "Evidence: reading…");
  if (ev === false) return h("div", { class: "d", testid: "evidence-missing" }, "Evidence SHA-256 ", hashLink(a.evidenceHash, "hash"), " · not published on this server");
  const type = ev.type || "";
  const preview = /^image\//.test(type) ? h("img", { class: "ev-img", src: URL.createObjectURL(new Blob([ev.bytes], { type })), alt: "evidence" })
    : /^text\//.test(type) ? h("pre", { class: "ev-text", testid: "evidence-text" }, new TextDecoder().decode(ev.bytes).slice(0, 600)) : null;
  return h("div", { class: "evidence", testid: "evidence" }, h("div", {}, "Evidence ", h("a", { class: "link", href: url, target: "_blank", testid: "evidence-link" }, "open ↗"),
    ` · ${size(ev.bytes.length)}${type ? ` · ${type.split(";")[0]}` : ""} · `, ev.sha256Ok === false ? h("b", { class: "t-bad" }, "hash does not match") : h("span", { class: "t-ok", testid: "evidence-hash-ok" }, "SHA-256 matches ✓")), preview);
}

// The accusation flow on the record page: stepper and the current step's control only.
function accusePanel(rec, m) {
  const acc = accusationsOf(rec);
  const decided = m?.assertionId && acc.list.find((a) => same(a.assertionId, m.assertionId) && !a.open);
  const step = !m?.commitment ? 0 : m.noAssertion || decided ? 3 : !m.assertionId ? 1 : 2;
  if (step === 3) {   // settled: one line, the detail is in the Accusations card
    return h("div", { class: "card accuse", testid: "accuse-panel" },
      h("div", { testid: m.noAssertion ? "reveal-status" : "accuse-done" }, m.noAssertion
        ? `Bond returned: this photo was already challenged or decided, so your challenge did not open. ${tok(S.ctx.params.bond)} is in your claimable balance.`
        : `Your challenge: ${decided.fakeProven ? "proven" : "rejected"} · see the outcome below.`),
      !notAccusable(rec) && !same(S.account?.address, rec.depositor) ? h("button", { class: "link", testid: "btn-accuse-new", onclick: () => { setMineFor(S.account.address, rec, null); location.hash = `#/record/${rec.photoHash}/accuse`; emit("change"); } }, "Start a new challenge") : null);
  }
  const stepper = h("ol", { class: "stepper", testid: "accuse-stepper" }, ["1 Commit", "2 Reveal", "3 UMA vote", "4 Settled"].map((n, i) =>
    h("li", { class: i < step ? "done" : i === step ? "cur" : "", testid: `accuse-step-${i + 1}` }, n)));
  let body;
  if (step === 0) {
    const why = accountBlocker(true);
    const fileIn = h("input", { type: "file", class: "hidden", testid: "input-evidence-file", onchange: (e) => { R.form.file = e.target.files[0] || null; R.formError = ""; emit("change"); } });
    body = [
      h("p", { class: "callout", testid: "uma-question" }, "UMA's voters say FAKE only on public, checkable evidence: the challenger must prove it."),
      h("label", { class: "f", for: "ev" }, "Evidence"),
      h("textarea", { id: "ev", testid: "input-evidence", placeholder: "Link to public evidence, or a short text", value: R.form.text, oninput: (e) => { R.form.text = e.target.value; } }),
      h("div", { class: "row" }, h("button", { testid: "btn-evidence-file", onclick: () => fileIn.click() }, R.form.file ? `File: ${R.form.file.name}` : "…or attach a file"), fileIn,
        S.network?.local ? h("button", { class: "link", testid: "btn-evidence-example", onclick: () => { R.form.text = "The same image was published at https://example.org/listing before this record's anchor block."; emit("change"); } }, "use example (local)") : null),
      h("p", { class: "d" }, `The evidence is published for the voters; only its SHA-256 goes on chain. Bond ${tok(S.ctx.params.bond)}: you lose it if the evidence does not prove the fake.`),
      h("button", { class: "pri", testid: "btn-commit", disabled: !!why || S.busy, onclick: () => commit(rec) }, "Commit challenge"),
      why ? h("div", { class: "why", testid: "commit-why" }, why) : null,
      R.formError ? h("div", { class: "t-bad", testid: "commit-error" }, R.formError) : null];
  } else if (step === 1) {
    if (m.pending) body = [h("div", { testid: "commit-pending" }, "Commitment sent to your wallet: waiting for it on chain. The secret is saved in this browser."),
      h("button", { class: "link", testid: "btn-discard-pending", title: "Only if you closed MetaMask without confirming: nothing was committed",
        onclick: () => { setMineFor(S.account.address, rec, null); emit("change"); } }, "Not confirmed in MetaMask? Discard it")];
    else {
      const dead = isDeadCommit(m);
      const deadline = m.committedAt + Number(S.ctx.params.revealWindow);
      body = [h("div", { testid: "reveal-deadline" }, dead ? `The reveal period ended ${exactTime(deadline)}: the bond can no longer be revealed.`
          : `Committed: hidden until you reveal. Reveal within ${dur(deadline - S.chain.timestamp)} (by ${exactTime(deadline).slice(11, 16)}).`),
        dead ? h("button", { class: "danger", testid: "btn-forfeit", onclick: async () => {
          const ok = await confirmDialog({ title: "Burn the expired bond?", testid: "forfeit", confirm: "Forfeit in MetaMask", danger: true,
            lines: [`The reveal period is over. ${tok(S.ctx.params.bond)} goes to the burn address; nobody gets it.`] });
          if (ok) act("Forfeit commitment", async () => { await S.lib.forfeitCommitment(S.ctx, "accuser", m.commitment); setMineFor(S.account.address, rec, { ...m, forfeited: true }); }, { step: { key: "forfeit" } });
        } }, "Burn the expired bond (forfeit)") : null,
        h("div", { class: "d" }, "Commitment ", hashLink(m.commitment, "hash"), m.commitTx ? [" · transaction ", hashLink(m.commitTx, "tx", { copy: false })] : null)];
    }
  } else {
    body = [h("div", { testid: "vote-in-progress" }, "UMA vote in progress (see Challenges below).")];
  }
  return h("div", { class: "card accuse", testid: "accuse-panel" }, h("h2", {}, "Challenge this photo"), stepper, body);
}

// File extension for a download.
function extOf(f) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(f.name || "");
  return m ? m[1].toLowerCase() : ({ "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" }[f.type] || "bin");
}

export { R as recordState };
