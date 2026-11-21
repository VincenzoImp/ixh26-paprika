// Paprika web app: the record page #/record/<photoHash>[?key=<keyId>] — the centre of the product.
// Verdict, lifecycle, one contextual action (Refund / Accuse / Reveal / Claim), copy link, details, evidence and
// history with explorer links. Accusing happens here: evidence (file or text) → confirm → commit → reveal
// (countdown) → UMA vote → outcome in words.

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
const R = { key: "", records: [], events: [], evidence: {}, form: { text: "", file: null }, accusing: false, loading: false };

// Loads the records and events of a photo (after a route change or a new block).
export async function load(photoHash) {
  R.loading = true;
  R.records = await getRecords(photoHash);
  R.events = (await paprikaEvents()).filter((e) => e.args?.photoHash && same(e.args.photoHash, photoHash));
  R.loading = false;
  for (const a of S.accusations.filter((x) => same(x.photoHash, photoHash))) {
    if (!(a.evidenceHash in R.evidence)) { R.evidence[a.evidenceHash] = null; getEvidence(a.evidenceHash).then((ev) => { R.evidence[a.evidenceHash] = ev || false; emit("change"); }); }
  }
}

// This browser's accusation of a record by the connected account (persisted, survives reloads).
const mineKey = (rec) => `${(S.account?.address || "").toLowerCase()}|${rec.photoHash.toLowerCase()}|${rec.keyId.toLowerCase()}`;
function mine(rec) { return S.account ? S.mine[mineKey(rec)] || null : null; }
function setMine(rec, v) { if (v) S.mine[mineKey(rec)] = v; else delete S.mine[mineKey(rec)]; save("mine", S.mine); }

// True for a live (revealable) commitment.
const isDeadCommit = (m) => m && m.commitment && !m.assertionId && !m.noAssertion && S.chain.timestamp + 1 > m.committedAt + Number(S.ctx.params.revealWindow);
const liveCommit = (m) => !!(m && m.commitment && !m.assertionId && !m.noAssertion && !m.forfeited && !isDeadCommit(m));

// Step 1: publish the evidence, confirm, commit (only a hash goes on chain, with the bond).
async function commit(rec) {
  const text = R.form.text.trim();
  const file = R.form.file;
  if (!text && !file) throw new Error("Add the evidence first: a file, or a link / text.");
  const B = S.ctx.params.bond;
  const ok = await confirmDialog({ title: "Commit this accusation", testid: "confirm-commit",
    lines: [["Photo", hashLink(rec.photoHash, "hash")], ["Bond", `${tok(B)} locked now`],
      ["If the evidence proves it", `you get your bond back plus part of the deposit (UMA keeps a fee)`],
      ["If it does not", `you lose ${tok(B)}`],
      ["Then", `reveal within ${dur(S.ctx.params.revealWindow)} (one more signature)`],
      ["Signatures", prepared() ? "1 in MetaMask" : "up to 3 in MetaMask (wrap, approve, commit)"]] });
  if (!ok) return;
  await act("Commit accusation", async () => {
    // The evidence is published first (content-addressed); only its SHA-256 goes into the commitment.
    const published = await publishEvidence(file || text);
    const evidence = published.url;
    const before = await snapshot(rec.photoHash, rec.keyId);
    const r = await S.lib.commitAccusation(S.ctx, "accuser", { photoHash: rec.photoHash, keyId: rec.keyId, evidenceHash: published.evidenceHash });
    const last = S.actionTxs[S.actionTxs.length - 1];
    const blk = last ? await S.ctx.provider.getBlock(last.blockNumber) : null;
    let wrapped = 0n;
    for (const t of S.actionTxs) if (/deposit|wrap/i.test(t.call)) { const tx = await S.ctx.provider.getTransaction(t.txHash); wrapped += big(tx?.value ?? 0); }
    setMine(rec, { photoHash: toHex(rec.photoHash), keyId: toHex(rec.keyId), evidence, evidenceUrl: r.evidenceUrl || published.url, evidenceHash: toHex(r.evidenceHash),
      salt: toHex(r.salt), commitment: toHex(r.commitment), committedAt: Number(blk?.timestamp ?? S.chain.timestamp), commitTx: last?.txHash, before, wrapped });
    R.form = { text: "", file: null };
  }, { step: { key: "commit" } });
}

// Step 2: reveal; Paprika sends the case to UMA's vote (or returns the bond if the photo is already accused).
async function reveal(rec) {
  const m = mine(rec);
  await act("Reveal & send to UMA vote", async () => {
    const r = await S.lib.revealAccusation(S.ctx, "accuser", { photoHash: m.photoHash, keyId: m.keyId, evidenceHash: m.evidenceHash, salt: m.salt });
    const id = toHex(r.assertionId);
    if (!r.assertionId || /^0x0*$/.test(id)) setMine(rec, { ...m, noAssertion: true });
    else { setMine(rec, { ...m, assertionId: id }); S.voteBefore = { ...(S.voteBefore || {}), [id]: m.before }; }
  }, { step: { key: "reveal" } });
}

// Draws the page for a photo hash (and optional key).
export function render(root, { photoHash, key, accuse }) {
  if (R.key !== photoHash) { R.key = photoHash; R.records = []; R.form = { text: "", file: null }; load(photoHash).then(() => emit("change")); }
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

  // The one contextual action.
  let action = null, actionWhy = "", chip = null;
  const blocked = accountBlocker();
  if (m && liveCommit(m)) {
    action = h("button", { class: "pri big", testid: "btn-reveal", disabled: !!blocked || S.busy, onclick: () => reveal(rec) }, "Reveal & send to UMA vote");
  } else if (st === "attested" && refundable(rec) && iAmDepositor) {
    action = h("button", { class: "pri big", testid: "btn-refund", disabled: !!blocked || S.busy,
      onclick: () => act("Refund deposit", () => S.lib.refund(S.ctx, "photographer", { photoHash: rec.photoHash, keyId: rec.keyId }), { step: { key: "refund" } }) }, "Refund deposit");
  } else if (S.account?.credit > 0n) {
    action = h("button", { class: "pri big", testid: "btn-claim-record", disabled: !!blocked || S.busy,
      onclick: () => act("Claim credit", () => S.lib.withdrawCredit(S.ctx, "photographer"), { step: { key: "claim" } }) }, `Claim ${tok(S.account.credit)}`);
  } else if (!notAccusable(rec)) {
    action = h("a", { class: "btn pri big", testid: "btn-accuse", href: `#/record/${rec.photoHash}/accuse${R.records.length > 1 ? `?key=${rec.keyId}` : ""}` }, "Accuse");
  } else actionWhy = notAccusable(rec);
  if (blocked && action) actionWhy = blocked;
  if (st === "attested" && !refundable(rec)) chip = localChip("Skip wait (local)", () => skipWait(untilRefundable(rec)), { testid: "btn-skip-wait", disabled: skipBlocker() });
  if (st === "accused" && acc.open) chip = h("span", { class: "row" },
    localChip("Resolve vote (local): Fake proven", () => resolveVote(acc.open.assertionId, true), { testid: "btn-vote-fake-inline" }),
    localChip("Not proven", () => resolveVote(acc.open.assertionId, false), { testid: "btn-vote-not-fake-inline" }));

  mount(root,
    h("div", { class: "rec-head" }, h("h1", {}, "Record ", hashLink(rec.photoHash, "hash", { testid: "record-hash" })),
      h("button", { testid: "btn-copy-link", onclick: (e) => { navigator.clipboard?.writeText(link).catch(() => {}); e.currentTarget.textContent = "Link copied ✓"; } }, "Copy link")),
    verdictCard(rec, { testid: "record-verdict", extra: chip ? h("div", { class: "row" }, chip) : null }),
    h("div", { class: "row" }, action, actionWhy ? h("span", { class: "why", testid: "record-action-why" }, actionWhy) : null),
    lifecycle(rec),
    accuse || m ? accusePanel(rec, m) : null,
    acc.list.length ? outcomes(rec) : null,
    h("div", { class: "rec-grid" },
      h("div", { class: "card" }, h("h2", {}, "Details"),
        h("dl", { class: "kv", testid: "record-details" },
          h("dt", {}, "Photo hash"), h("dd", {}, hashLink(rec.photoHash, "hash")),
          h("dt", {}, "Device key"), h("dd", {}, hashLink(rec.keyId, "device"), " · ", deviceOf(rec).status),
          h("dt", {}, "Signed"), h("dd", {}, "between block ", blockLink(rec.anchorBlock), " and ", blockLink(rec.recordedBlock)),
          h("dt", {}, "Depositor"), h("dd", { testid: "record-depositor" }, addrLink(rec.depositor)),
          h("dt", {}, "Deposit"), h("dd", {}, st === "fake" ? "lost" : st === "refunded" ? "refunded" : `${tok(S.ctx.params.bond)} locked`),
          h("dt", {}, "Challenge period"), h("dd", {}, challengeText(rec)),
          h("dt", {}, "Accusations"), h("dd", {}, acc.total ? `${acc.total} (${acc.rejected} rejected, ${acc.proven} proven${acc.open ? ", 1 open" : ""})` : "none"),
          R.records.length > 1 ? [h("dt", {}, "Other keys"), h("dd", {}, R.records.filter((r) => r !== rec).map((r) => h("a", { class: "link mono", href: `#/record/${r.photoHash}?key=${r.keyId}` }, `${r.keyId.slice(0, 10)}… `)))] : null),
        scopeLines(rec),
        S.files[rec.photoHash] ? h("button", { testid: "btn-download", onclick: () => { const f = S.files[rec.photoHash]; download(f.bytes, `paprika-${rec.photoHash.slice(2, 10)}.${extOf(f)}`, f.type); } }, "Download the attested file") : null),
      h("div", { class: "card" }, h("h2", {}, "History"), history(rec))));
}

// "ends in 58 min", "ended", with refund time.
function challengeText(rec) {
  const now = S.chain.timestamp;
  const end = Number(rec.accusableUntil);
  return [end > now ? ["ends ", rel(end)] : ["ended ", rel(end)], " · refundable from ", rel(rec.refundableAt)];
}

// The record's history: every Paprika event about it, with explorer links.
function history(rec) {
  const rows = R.events.filter((e) => !e.args.keyId || same(e.args.keyId, rec.keyId));
  const words = { Attested: "Attested", Refunded: "Refunded", AccusationOpened: "Accused · sent to UMA vote", AccusationResolved: "UMA vote decided" };
  // AccusationResolved has no photo hash: add those of this record's accusations.
  const resolved = accusationsOf(rec).list.filter((a) => !a.open).map((a) => ({ name: "AccusationResolved", blockNumber: a.resolvedBlock, txHash: a.resolvedTx, fake: a.fakeProven }));
  const all = [...rows, ...resolved].sort((a, b) => a.blockNumber - b.blockNumber);
  return h("ol", { class: "history", testid: "record-history" }, all.map((e) => h("li", { testid: "history-row" },
    h("span", {}, e.name === "AccusationResolved" ? `UMA vote: ${e.fake ? "fake proven" : "not proven"}` : words[e.name] || e.name),
    e.args?.depositor ? [" by ", addrLink(e.args.depositor, { copy: false })] : e.args?.claimant ? [" by ", addrLink(e.args.claimant, { copy: false })] : null,
    " · ", blockLink(e.blockNumber), " · ", hashLink(e.txHash, "tx", { copy: false }))));
}

// The outcome of each decided accusation, in words, with the evidence.
function outcomes(rec) {
  const B = big(S.ctx.params.bond);
  const fB = (B * BigInt(Math.round(Number(S.ctx.params.feeShare) * 1e9))) / 1000000000n;
  return h("div", { class: "card", testid: "record-accusations" }, h("h2", {}, "Accusations"),
    accusationsOf(rec).list.map((a) => h("div", { class: "acc-row", testid: "accusation-row", "data-open": a.open ? "1" : "0" },
      a.open ? h("div", { testid: "accusation-open" }, "Waiting for UMA's vote · 48-72 h on mainnet", S.votePhase && same(S.votePhase.assertionId, a.assertionId) ? ` · ${S.votePhase.phases.join(" ✓ · ")} ✓` : "")
        : h("div", { class: "outcome", testid: "settle-outcome", "data-outcome": a.fakeProven ? "fake-proven" : "not-proven" },
          a.fakeProven ? ["Fake proven · ", addrLink(a.claimant, { copy: false }), ` ${signedTok(B - fB)} · depositor ${signedTok(-B)} · UMA fee ${tok(fB)}`]
            : ["Accusation rejected · ", addrLink(a.claimant, { copy: false }), ` ${signedTok(-B)} · depositor ${signedTok(B - fB)} (claimable) · UMA fee ${tok(fB)}`]),
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
    : /^text\//.test(type) || !type ? h("pre", { class: "ev-text", testid: "evidence-text" }, new TextDecoder().decode(ev.bytes).slice(0, 600)) : null;
  return h("div", { class: "evidence", testid: "evidence" }, h("div", {}, "Evidence ", h("a", { class: "link", href: url, target: "_blank", testid: "evidence-link" }, "open ↗"),
    ` · ${size(ev.bytes.length)} · `, ev.sha256Ok === false ? h("b", { class: "err" }, "hash does not match") : h("span", { class: "ok", testid: "evidence-hash-ok" }, "SHA-256 matches ✓")), preview);
}

// The accusation flow on the record page: stepper and the current step's control only.
function accusePanel(rec, m) {
  const acc = accusationsOf(rec);
  const step = !m?.commitment ? 0 : m.noAssertion ? 3 : !m.assertionId ? 1 : acc.list.find((a) => same(a.assertionId, m.assertionId))?.open ? 2 : 3;
  const stepper = h("ol", { class: "stepper", testid: "accuse-stepper" }, ["Commit", "Reveal", "UMA vote", "Settled"].map((n, i) =>
    h("li", { class: i < step ? "done" : i === step ? "cur" : "", testid: `accuse-step-${i + 1}` }, n)));
  let body;
  if (step === 0) {
    const why = notAccusable(rec) || accountBlocker(true);
    const fileIn = h("input", { type: "file", class: "hidden", testid: "input-evidence-file", onchange: (e) => { R.form.file = e.target.files[0] || null; emit("change"); } });
    body = [
      h("p", { class: "callout", testid: "uma-question" }, "UMA's voters say FAKE only on public, checkable evidence: the accuser must prove it."),
      h("label", { class: "f", for: "ev" }, "Evidence"),
      h("textarea", { id: "ev", testid: "input-evidence", placeholder: "Link to public evidence, or a short text", value: R.form.text, oninput: (e) => (R.form.text = e.target.value) }),
      h("div", { class: "row" }, h("button", { testid: "btn-evidence-file", onclick: () => fileIn.click() }, R.form.file ? `File: ${R.form.file.name}` : "…or attach a file"), fileIn,
        S.network?.local ? h("button", { class: "link", testid: "btn-evidence-example", onclick: () => { R.form.text = "The same image was published at https://example.org/listing before this record's anchor block."; emit("change"); } }, "use example (local)") : null),
      h("p", { class: "d" }, `The evidence is published for the voters; only its SHA-256 goes on chain. Bond ${tok(S.ctx.params.bond)}: you lose it if the evidence does not prove the fake.`),
      h("button", { class: "pri", testid: "btn-commit", disabled: !!why || S.busy, onclick: () => commit(rec).catch((e) => { R.formError = e.message; emit("change"); }) }, "Commit accusation"),
      why ? h("div", { class: "why", testid: "commit-why" }, why) : null,
      R.formError ? h("div", { class: "err" }, R.formError) : null];
  } else if (step === 1) {
    const dead = isDeadCommit(m);
    const deadline = m.committedAt + Number(S.ctx.params.revealWindow);
    body = [h("div", { testid: "reveal-deadline" }, dead ? `The reveal period ended ${exactTime(deadline)}: the bond can no longer be revealed.` : ["Reveal before ", rel(deadline), " (", exactTime(deadline).slice(11), ")"]),
      dead ? h("button", { class: "warn", testid: "btn-forfeit", onclick: () => act("Forfeit commitment", async () => { await S.lib.forfeitCommitment(S.ctx, "accuser", m.commitment); setMine(rec, { ...m, forfeited: true }); }, { step: { key: "forfeit" } }) }, "Burn the expired bond (forfeit)") : null,
      h("div", { class: "d" }, "Commitment ", hashLink(m.commitment, "hash"), m.commitTx ? [" · ", hashLink(m.commitTx, "tx", { copy: false })] : null)];
  } else if (step === 2) {
    body = [h("div", { testid: "vote-waiting" }, "Waiting for UMA's vote · 48-72 h on mainnet.")];
  } else {
    body = [m?.noAssertion ? h("div", { testid: "reveal-status" }, `Bond returned: this photo was already accused or decided. Your ${tok(S.ctx.params.bond)} is claimable.`)
      : h("div", { testid: "accuse-done" }, "Decided: see the outcome below."),
      h("button", { class: "link", testid: "btn-accuse-new", onclick: () => { setMine(rec, null); emit("change"); } }, "Start a new accusation")];
  }
  return h("div", { class: "card accuse", testid: "accuse-panel" }, h("h2", {}, "Accuse this photo"), stepper, body);
}

// File extension for a download.
function extOf(f) {
  const m = /\.([a-z0-9]{1,8})$/i.exec(f.name || "");
  return m ? m[1].toLowerCase() : ({ "image/jpeg": "jpg", "image/png": "png", "image/gif": "gif" }[f.type] || "bin");
}

export { R as recordState };
