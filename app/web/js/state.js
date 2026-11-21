// Paprika web app: the shared state and a minimal change notification.
// One connected wallet per window (no personas). Pages read S and subscribe with on("change").
// Local data is kept in localStorage under a scope "chainId:paprikaAddress:fingerprint", so another chain or a
// redeployment simply uses another scope: nothing is ever deleted (wallet keys and secrets stay recoverable).

export const S = {
  lib: null, dev: null, ctx: null,
  network: null,        // /network.json: { chainId, name, local, explorer, ... }
  deployment: null,
  fingerprint: "",
  chain: { blockNumber: 0, timestamp: 0 },
  account: null,        // { address, kind: "browser" | "metamask", signer, eth, weth, credit }
  device: null,         // device key of this browser (device.js object)
  deviceInfo: null,     // { status: "none" | "active" | "flagged", reason, flaggedAtBlock }
  records: [],          // listRecords()
  accusations: [],      // [{ assertionId, photoHash, keyId, claimant, evidenceHash, open, fakeProven, blockNumber, txHash }]
  mine: {},             // this browser's accusations, by "photoHash|keyId": { salt, evidence, evidenceHash, commitment, ... }
  files: {},            // photoHash -> { bytes, type, name } attested or verified in this session
  lastAttested: "",     // photo hash attested last in this browser
  busy: false,
  chainDown: false,
  protocol: { open: false, last: null },   // Protocol view drawer
};
window.paprikaState = S;   // read-only handle for debugging and the end-to-end tests

const listeners = new Map();
// Subscribes to an event ("change", "block", "account", "action").
export function on(name, fn) {
  if (!listeners.has(name)) listeners.set(name, new Set());
  listeners.get(name).add(fn);
  return () => listeners.get(name).delete(fn);
}
// Notifies the subscribers of an event.
export function emit(name, data) {
  for (const fn of listeners.get(name) || []) {
    try { fn(data); } catch (e) { console.warn(`listener of ${name} failed`, e); }
  }
}

// Storage key in the current scope (chain, contract, chain instance).
export function scopeKey(what) {
  const d = S.deployment;
  return `paprika:${d?.chainId ?? "?"}:${(d?.addresses?.paprika || "").toLowerCase()}:${S.fingerprint}:${what}`;
}
// JSON in localStorage, with bigints kept as strings.
export function save(what, value) {
  try {
    localStorage.setItem(scopeKey(what), JSON.stringify(value, (k, x) => (typeof x === "bigint" ? { $big: x.toString() } : x)));
  } catch (e) { console.warn("could not save", what, e); }
}
export function load(what, fallback = null) {
  try {
    const s = localStorage.getItem(scopeKey(what));
    if (s == null) return fallback;
    return JSON.parse(s, (k, x) => (x && typeof x === "object" && "$big" in x ? BigInt(x.$big) : x));
  } catch { return fallback; }
}
