// Paprika web app: start-up, router and refresh loop.
// Loads /network.json and /deployment.json, connects read-only to the chain through this server's /rpc, restores
// the MetaMask connection, and draws the page for the current route. Pages live in js/pages/*, shared parts in js/*.
// Routes: #/verify (home) · #/attest · #/record/<photoHash>[/accuse][?key=] · #/activity · #/explorer ·
// #/tx/<hash> · #/block/<n> · #/address/<a> · #/device/<keyId>. Old routes (#photographer…) redirect.

import { ethers } from "ethers";
import { h, tid, mount } from "./js/dom.js";
import { S, on, emit, load } from "./js/state.js";
import { loadNetwork, readAccusations } from "./js/api.js";
import { renderAccount, reconnect, listen, refreshAccount, loadDevice, refreshDevice } from "./js/wallet.js";
import { setOpen, render as renderDrawer } from "./js/drawer.js";
import { renderTools, toggleTools } from "./js/localtools.js";
import { wrongChain } from "./js/wallet.js";
import * as verifyPage from "./js/pages/verify.js";
import * as attestPage from "./js/pages/attest.js";
import * as recordPage from "./js/pages/record.js";
import * as activityPage from "./js/pages/activity.js";
import * as explorerPage from "./js/pages/explorer.js";
import { errText } from "./util.js";

S.ethers = { ethers };

// Parses the hash route.
function route() {
  let raw = location.hash.replace(/^#\/?/, "");
  const redirects = { photographer: "attest", verifier: "verify", accuser: "activity" };
  if (redirects[raw]) { location.hash = `#/${redirects[raw]}`; raw = redirects[raw]; }
  const [path, query = ""] = raw.split("?");
  let parts = path.split("/").filter(Boolean);
  if (parts[0] === "explorer" && ["tx", "block", "address", "device"].includes(parts[1])) parts = parts.slice(1);   // #/explorer/tx/<hash>
  const params = Object.fromEntries(new URLSearchParams(query));
  const page = parts[0] || "verify";
  return { page, parts, params };
}

// Draws the current page and the shared chrome (header account, nav, drawer, local tools).
function draw() {
  if (!S.ctx) return;
  const { page, parts, params } = route();
  const nav = { verify: "verify", attest: "attest", activity: "activity", explorer: "explorer", tx: "explorer", block: "explorer", address: "explorer", device: "explorer" };
  for (const a of document.querySelectorAll("nav a")) a.classList.toggle("on", a.dataset.v === nav[page]);
  const root = tid("page");
  root.dataset.page = page;
  try {
    if (page === "attest") attestPage.render(root);
    else if (page === "record") recordPage.render(root, { photoHash: (parts[1] || "").toLowerCase(), key: params.key, accuse: parts[2] === "accuse" });
    else if (page === "activity") activityPage.render(root);
    else if (["explorer", "tx", "block", "address", "device"].includes(page)) explorerPage.render(root, { view: page === "explorer" ? "home" : page, id: parts[1] });
    else verifyPage.render(root);
  } catch (e) {
    console.error(e);
    mount(root, h("p", { class: "t-bad" }, `This page could not be drawn: ${errText(e)}`));
  }
  renderAccount();
  renderTools();
  const pill = tid("network-pill");
  // One network indicator: green when fine, rose when the chain is down or MetaMask is on another network.
  pill.textContent = S.chainDown ? "● Network down · retrying" : wrongChain() ? "● Wrong network in MetaMask" : `● ${S.network.name} · block ${S.chain.blockNumber}`;
  pill.title = `Chain ${S.network.chainId} · chain time ${new Date(S.chain.timestamp * 1000).toLocaleString()}`;
  pill.classList.toggle("down", S.chainDown || wrongChain());
}

// Re-reads the chain: block, records, accusations, the account and the device key; then redraws.
async function refresh() {
  const info = await S.lib.chainInfo(S.ctx);
  S.chain = { blockNumber: Number(info.blockNumber), timestamp: Number(info.timestamp) };
  [S.records, S.accusations] = await Promise.all([S.lib.listRecords(S.ctx), readAccusations()]);
  await Promise.all([refreshAccount(), refreshDevice()]);
  const r = route();
  if (r.page === "record" && r.parts[1]) await recordPage.load(r.parts[1].toLowerCase());
}
S.refresh = refresh;

// The full-page message when the network cannot be reached; retries by itself.
function fatal(title, reason, howto) {
  mount(tid("page"), h("div", { class: "card fatal", testid: "fatal-message" },
    h("h1", { testid: "fatal-title" }, title), h("p", { testid: "fatal-reason" }, reason),
    howto ? h("details", {}, h("summary", {}, "Developer instructions"), h("pre", { testid: "fatal-howto" }, howto)) : null,
    h("p", { class: "d" }, "This page retries by itself.")));
  setTimeout(() => location.reload(), 4000);
}

// Starts the app.
async function main() {
  if (!globalThis.crypto?.subtle) {
    const port = location.port || "80";
    mount(tid("page"), h("div", { class: "card fatal", testid: "fatal-message" }, h("h1", { testid: "fatal-title" }, "Open Paprika on localhost or https"),
      h("p", { testid: "fatal-reason" }, `Browsers enable WebCrypto (device keys, SHA-256) and the camera only on https or localhost. This page is at ${location.origin}.`),
      h("pre", { testid: "fatal-howto" }, `ssh -N -L ${port}:127.0.0.1:${port} <user>@${location.hostname}\nthen open http://localhost:${port}/`)));
    return;
  }
  let deployment;
  try {
    deployment = await (await fetch("/deployment.json", { cache: "no-store" })).json();
    S.deployment = deployment;
    S.network = await loadNetwork(deployment);
    S.dev = await import("/lib/device.js");
    S.lib = await import("/lib/paprika.js");
    S.ctx = await S.lib.connect({ deployment, network: S.network, rpcUrl: new URL(S.network.rpcUrl || "/rpc", location.href).href });
    const code = await S.ctx.provider.getCode(S.ctx.addresses.paprika);
    if (!code || code === "0x") throw new Error("no Paprika contract at the deployed address");
    S.fingerprint = String(await S.lib.deploymentFingerprint(S.ctx));
  } catch (e) {
    return fatal(`Can't reach network ${S.network?.name || "Paprika local"}`, errText(e), "cd app\nnpm start");
  }
  document.body.classList.toggle("is-local", !!S.network.local);
  tid("network-banner").classList.toggle("hidden", !S.network.local);
  S.mine = load("mine", {});
  await loadDevice();
  listen();
  await reconnect();
  setOpen(new URLSearchParams(location.search).get("protocol") === "1" || location.hash.includes("protocol=1") || localStorage.getItem("paprika:protocol-view") === "1");
  tid("protocol-toggle").addEventListener("change", (e) => setOpen(e.target.checked));
  await refresh();
  on("change", draw);
  on("account", async () => {
    // Another account in MetaMask: an open accuse form belonged to the previous one.
    if (/\/accuse/.test(location.hash)) history.replaceState(null, "", location.hash.replace(/\/accuse/, ""));
    try { await refresh(); } catch (e) { console.warn(e); }
    draw();
  });
  tid("local-tools-toggle").addEventListener("click", toggleTools);
  on("drawer-refresh", renderDrawer);
  addEventListener("hashchange", draw);
  draw();
  renderDrawer();
  // Poll: a new block (from this window, another window, or the CLI) or a restarted chain.
  setInterval(async () => {
    if (S.busy) return;
    try {
      const info = await S.lib.chainInfo(S.ctx);
      S.chainDown = false;
      if (Number(info.blockNumber) !== S.chain.blockNumber || Number(info.timestamp) !== S.chain.timestamp) {
        if (String(await S.lib.deploymentFingerprint(S.ctx)) !== S.fingerprint) { location.reload(); return; }
        await refresh();
        draw();
      }
    } catch { if (!S.chainDown) { S.chainDown = true; draw(); } }
  }, 2000);
}

main();
emit("boot");
