// Paprika web app: transaction toasts (bottom right) and the confirmation dialog.
// A toast follows one action: "Confirm in MetaMask…" → "Pending · tx" → "Confirmed in block N · View" or
// "Failed: <plain reason> · View". Successes close after 6 s; failures stay until closed.

import { h, tid } from "./dom.js";
import { explorerUrl, shortHex } from "./format.js";

let n = 0;

// Opens a toast and returns a handle: { update(status, text, links), close() }.
export function toast(title, { status = "pending", text = "", tag = "" } = {}) {
  n += 1;
  const id = n;
  const body = h("div", { class: "t-text", testid: "toast-text" }, text);
  const links = h("div", { class: "t-links" });
  const close = h("button", { class: "t-close", title: "Close", onclick: () => el.remove() }, "×");
  const el = h("div", { class: `toast ${status}`, testid: "toast", "data-status": status, "data-id": id },
    h("div", { class: "t-head" }, h("b", { testid: "toast-title" }, title), tag ? h("span", { class: "chip local" }, tag) : null, close), body, links);
  tid("toasts").appendChild(el);
  const api = {
    el,
    update(st, txt, txs = []) {
      el.className = `toast ${st}`;
      el.dataset.status = st;
      if (txt != null) body.textContent = txt;
      // At most three links; a long action (e.g. the UMA vote, 7 transactions) shows the last one and a count.
      const shown = txs.length > 3 ? [txs[txs.length - 1]] : txs;
      links.replaceChildren(...shown.map((t) => h("a", { class: "link mono", href: explorerUrl("tx", t.txHash), testid: "toast-tx" }, `${t.label || "tx"} ${shortHex(t.txHash)} ↗`)),
        txs.length > 3 ? h("span", { class: "d" }, `${txs.length} transactions in total`) : "");
      if (st === "ok") setTimeout(() => el.remove(), 6000);
    },
    close() { el.remove(); },
  };
  return api;
}

// A confirmation dialog: resolves true (confirm) or false (cancel). lines: [label, value] pairs or strings.
export function confirmDialog({ title, lines = [], confirm = "Confirm in MetaMask", note = "", testid = "confirm" }) {
  return new Promise((resolve) => {
    const done = (v) => { wrap.remove(); resolve(v); };
    const wrap = h("div", { class: "modal-wrap", testid: `${testid}-dialog` },
      h("div", { class: "modal card" },
        h("h2", {}, title),
        h("dl", { class: "kv" }, lines.map((l) => (Array.isArray(l) ? [h("dt", {}, l[0]), h("dd", {}, l[1])] : [h("dd", { class: "wide" }, l)]))),
        note ? h("p", { class: "d" }, note) : null,
        h("div", { class: "row end" },
          h("button", { testid: `${testid}-cancel`, onclick: () => done(false) }, "Cancel"),
          h("button", { class: "pri", testid: `${testid}-ok`, onclick: () => done(true) }, confirm))));
    document.body.appendChild(wrap);
    wrap.querySelector(".pri").focus();
  });
}
