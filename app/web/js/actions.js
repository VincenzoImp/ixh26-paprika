// Paprika web app: running a user action (one or more transactions signed in MetaMask).
// act() blocks a second action, shows a toast through the whole action ("Confirm in MetaMask" → pending → confirmed
// or failed with a plain reason and explorer links), feeds the Protocol view, and re-reads the chain afterwards.

import { S, emit } from "./state.js";
import { toast } from "./toasts.js";
import { errText } from "../util.js";
import { record as recordStep } from "./drawer.js";

// Revert reasons of Paprika.sol and common wallet/node errors, in plain words.
export const WHY = {
  "not active": "The device key is not active (flagged, or not registered on this chain).",
  "too early": "Too early: a refund needs the challenge period plus the reveal period; a reveal needs one block after the commit.",
  "too late": "The reveal period is over: this commitment can no longer be revealed.",
  refunded: "The deposit of this photo was already refunded: nothing is at stake.",
  "accusation open": "This photo already has an open accusation; one at a time.",
  "outside window": "The commitment was not made inside the photo's challenge period.",
  "no record": "There is no record for this photo and device.",
  "no commit": "No live commitment matches this reveal.",
  "no credit": "Nothing to claim.",
  "key used": "This key was registered before. A key registers only once.",
  exists: "This key already attested this exact file.",
  anchor: "The signed block is older than the last 256 blocks.",
  "bad sig": "The signature does not match the device key.",
};

// True when the user refused in the wallet (EIP-1193 4001, ethers ACTION_REJECTED).
export function isRejection(e) {
  const c = e?.code ?? e?.cause?.code ?? e?.info?.error?.code;
  return c === 4001 || c === "ACTION_REJECTED" || /user rejected|user denied|rejected the request|rejected in the wallet/i.test(errText(e));
}

// Plain message for a failed action.
export function plainError(e) {
  const m = errText(e);
  if (isRejection(e)) return "You rejected the request in MetaMask. Nothing was sent.";
  if (/nonce/i.test(m)) return "MetaMask's transaction counter is out of date (the local chain was restarted). Fix: MetaMask > Settings > Advanced > Clear activity tab data, then try again.";
  if (/insufficient funds|coalesce/i.test(m)) return "Not enough ETH in this account for this transaction.";
  return WHY[m] ? `${WHY[m]} (${m})` : m;
}

// Runs one user action. label: toast title; fn: async () => result; opts: { after(result), step, signs }.
// Every transaction the library reports during fn is listed in the toast with an explorer link.
export async function act(label, fn, opts = {}) {
  const { after = null, step = null, local = false } = opts;
  if (S.busy) return null;
  S.busy = true;
  S.actionTxs = [];
  emit("busy", true);
  const t = toast(label, { status: "pending", text: local ? "Running on the local network…" : "Confirm in MetaMask…", tag: local ? "Local network" : "" });
  t.el.dataset.action = label;
  const unsub = S.lib.onActivity(S.ctx, (item) => {
    S.actionTxs.push(item);
    t.update("pending", `Pending · ${S.actionTxs.length} transaction${S.actionTxs.length > 1 ? "s" : ""} sent`, S.actionTxs.map(txLabel));
  });
  let result = null, ok = false;
  try {
    result = await fn();
    ok = true;
    const last = S.actionTxs[S.actionTxs.length - 1];
    t.update("ok", opts.okText || (last ? `Confirmed in block ${last.blockNumber}` : "Done"), S.actionTxs.map(txLabel));
  } catch (e) {
    console.warn(label, e);
    t.update(isRejection(e) ? "rejected" : "failed", `${isRejection(e) ? "" : "Failed: "}${plainError(e)}`, S.actionTxs.map(txLabel));
    t.el.dataset.error = errText(e);
    if (step) recordStep({ ...step, refused: plainError(e), txs: [...S.actionTxs] });
  } finally {
    unsub();
  }
  try { await S.refresh(); } catch (e) { console.warn("refresh after action", e); }
  if (ok && step) recordStep({ ...step, txs: [...S.actionTxs], result });
  if (ok && after) { try { after(result); } catch (e) { console.warn(e); } }
  S.busy = false;
  emit("busy", false);
  emit("change");
  return ok ? result ?? true : null;
}

// Label of a transaction in a toast: the contract call in words.
function txLabel(item) {
  const c = String(item.call || "");
  const label = /deposit|wrap/i.test(c) ? "Wrap ETH" : /approve/i.test(c) ? "Approve WETH" : /\.attest/i.test(c) ? "Attest"
    : /commitClaim/i.test(c) ? "Commit" : /revealClaim/i.test(c) ? "Reveal" : /register/i.test(c) ? "Register key"
    : /refund/i.test(c) ? "Refund" : /withdraw/i.test(c) ? "Claim" : /revoke/i.test(c) ? "Revoke key" : /settle/i.test(c) ? "Settle"
    : /commit/i.test(c) ? "Vote commit" : /reveal/i.test(c) ? "Vote reveal" : c;
  return { txHash: item.txHash, label };
}
