// Paprika web app: the connected account (MetaMask only) and the account menu.
// One way to connect: MetaMask (any EIP-1193 wallet). The app follows MetaMask's accountsChanged and chainChanged
// events at once. The account menu holds: address (copy, explorer), balances, "Prepare account" (wrap ETH and
// approve Paprika once), claimable credit, the device key of this browser (create, register, export, import,
// revoke), and Disconnect.

import { h, tid, mount } from "./dom.js";
import { S, emit, save, load } from "./state.js";
import { addrLink, hashLink, tok, eth, labelOf } from "./format.js";
import { act } from "./actions.js";
import { confirmDialog } from "./toasts.js";
import { big, download, toHex } from "../util.js";


// The chain id the app needs, as 0x hex.
const wantChain = () => "0x" + Number(S.deployment.chainId ?? 31337).toString(16);

// True when MetaMask is on another chain than the deployment's.
export const wrongChain = () => !!S.account && S.account.chainId && S.account.chainId.toLowerCase() !== wantChain();

// Why a write action cannot run now ("" when it can).
export function accountBlocker(needDeposit = false) {
  if (!window.ethereum) return "Install MetaMask to sign transactions (verifying needs no wallet).";
  if (!S.account) return "Connect MetaMask to sign.";
  if (wrongChain()) return "MetaMask is on another network: switch to Paprika local.";
  if (!(big(S.account.eth) > 0n)) return "This account has no ETH on this network.";
  if (needDeposit && big(S.account.weth) + big(S.account.eth) < big(S.ctx.params.bond)) return `Not enough ETH for the ${tok(S.ctx.params.bond)} deposit.`;
  return "";
}

// Connects MetaMask (prompting), switches it to this chain, and uses it as the signer for every action.
export async function connect() {
  if (!window.ethereum) throw new Error("MetaMask is not installed in this browser.");
  const w = await S.lib.injectedWallet(S.ctx, "photographer");   // asks for an account and switches the chain
  await useAddress(w.address, w.signer);
  try { localStorage.setItem("paprika:connected", "1"); } catch { /* ignore */ }
}

// Reconnects silently if this site was connected before (no prompt).
export async function reconnect() {
  if (!window.ethereum || localStorage.getItem("paprika:connected") !== "1") return;
  try {
    const [a] = await window.ethereum.request({ method: "eth_accounts" });
    if (a) await useAddress(a);
  } catch (e) { console.warn("reconnect", e); }
}

// Uses an address of the wallet as the signer of both protocol roles (one account can attest and accuse).
async function useAddress(address, signer = null) {
  const { ethers } = S.ethers;
  const chainId = await window.ethereum.request({ method: "eth_chainId" });
  if (!signer) signer = await new ethers.BrowserProvider(window.ethereum, "any").getSigner(address);
  await S.lib.setSigner(S.ctx, "photographer", signer);
  await S.lib.setSigner(S.ctx, "accuser", signer);
  S.account = { address: ethers.getAddress(address), kind: "metamask", signer, chainId, eth: 0n, weth: 0n, credit: 0n, allowance: 0n };
  await refreshAccount();
  emit("account");
}

// Forgets the account (MetaMask stays connected to the site; the app stops using it).
export async function disconnect() {
  await S.lib.setSigner(S.ctx, "photographer", null);
  await S.lib.setSigner(S.ctx, "accuser", null);
  S.account = null;
  try { localStorage.setItem("paprika:connected", "0"); } catch { /* ignore */ }
  emit("account");
}

// Follows MetaMask: another account selected, or another network.
export function listen() {
  const eth1193 = window.ethereum;
  if (!eth1193?.on) return;
  eth1193.on("accountsChanged", async (accounts) => {
    if (!accounts?.length) { await disconnect(); return; }
    if (localStorage.getItem("paprika:connected") !== "1") return;
    await useAddress(accounts[0]);
    emit("change");
  });
  eth1193.on("chainChanged", async (chainId) => {
    if (!S.account) return;
    S.account.chainId = chainId;
    if (!wrongChain()) await useAddress(S.account.address);
    emit("account"); emit("change");
  });
}

// Asks MetaMask to switch to this chain, adding "Paprika local" if it does not know it.
export async function switchChain() {
  try {
    await window.ethereum.request({ method: "wallet_switchEthereumChain", params: [{ chainId: wantChain() }] });
  } catch (e) {
    if (e?.code === 4001) throw e;
    await window.ethereum.request({ method: "wallet_addEthereumChain", params: [{ chainId: wantChain(), chainName: "Paprika local",
      nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: [`${location.origin}/rpc`] }] });
  }
  if (S.account) { S.account.chainId = await window.ethereum.request({ method: "eth_chainId" }); await useAddress(S.account.address); }
}

// Reads the account's ETH, WETH, allowance to Paprika and claimable credit.
export async function refreshAccount() {
  const a = S.account;
  if (!a) return;
  const token = S.ctx.contracts.token;
  const [e, w, al, c] = await Promise.all([S.ctx.provider.getBalance(a.address), token.balanceOf(a.address),
    token.allowance(a.address, S.ctx.addresses.paprika), S.lib.credits(S.ctx, a.address)]);
  Object.assign(a, { eth: big(e), weth: big(w), allowance: big(al), credit: big(c) });
}

// True once the account has WETH for a deposit and Paprika may take it (then attest and commit need one signature).
export const prepared = () => !!S.account && S.account.allowance >= big(S.ctx.params.bond) && S.account.weth >= big(S.ctx.params.bond);

// How much ETH "Prepare account" wraps: what is missing for three deposits or bonds.
function prepareAmount() {
  const B = big(S.ctx.params.bond);
  return 3n * B > S.account.weth ? 3n * B - S.account.weth : 0n;
}

// "Prepare account": wrap ETH into WETH and approve Paprika once (max allowance), stated with amounts first.
export async function prepareAccount() {
  const amount = prepareAmount();
  const needApprove = S.account.allowance < big(S.ctx.params.bond) * 1000n;
  const ok = await confirmDialog({ title: "Prepare this account", testid: "prepare",
    lines: [["Wrap", amount ? `${eth(amount)} into ${tok(amount)} (WETH is ETH as a token; you can unwrap it any time)` : "nothing (enough WETH already)"],
      ["Approve", needApprove ? "Paprika may take WETH from this account for deposits and bonds (once, no limit)" : "already done"],
      ["Signatures", `${(amount ? 1 : 0) + (needApprove ? 1 : 0)} in MetaMask now; then one per attest or accusation`]] });
  if (!ok) return;
  await act("Prepare account", () => S.lib.prepareAccount(S.ctx, { photos: 3, role: "photographer" }), { step: { key: "prepare" } });
}

// ------------------------------------------------------------------ device key of this browser

// Loads the device key saved in this browser (current scope).
export async function loadDevice() {
  const saved = load("device");
  if (saved && S.dev.importDevice) { try { S.device = await S.dev.importDevice(saved); } catch (e) { console.warn("device key", e); } }
}
async function saveDevice() { if (S.device) save("device", await S.dev.exportDevice(S.device)); }

// Reads the device status from the contract.
export async function refreshDevice() {
  if (!S.device) { S.deviceInfo = { status: "none" }; return; }
  const raw = await S.ctx.contracts.paprika.devices(S.device.keyId);
  S.deviceInfo = { status: ["none", "active", "flagged"][Number(raw.status ?? raw[1])], reason: ["", "fake proven", "key revoked"][Number(raw.reason ?? raw[2])],
    flaggedAtBlock: Number(raw.flaggedAtBlock ?? raw[3]), owner: raw.owner ?? raw[0] };
}

// Creates a device key in this browser (if none, or if the current one is flagged) and registers it (free).
export async function createAndRegister() {
  return act("Register device key", async () => {
    if (!S.device || S.deviceInfo?.status === "flagged") {
      if (S.device) { const old = load("old-devices", []); old.push(await S.dev.exportDevice(S.device)); save("old-devices", old); }
      S.device = await S.dev.createDevice();
      await saveDevice();
    }
    await S.lib.registerDevice(S.ctx, "photographer", S.device);
  }, { step: { key: "register" } });
}

// Downloads the device key (private) as a JSON file.
export async function exportDevice() {
  const data = await S.dev.exportDevice(S.device);
  download(new TextEncoder().encode(JSON.stringify(data, null, 2)), `paprika-device-${toHex(S.device.keyId).slice(2, 10)}.json`, "application/json");
}

// Imports a device key from a JSON file exported earlier.
export async function importDeviceFile(file) {
  const text = await file.text();
  S.device = await S.dev.importDevice(text);
  await saveDevice();
  await refreshDevice();
  emit("change");
}

// Revokes the device key after a typed confirmation (no money moves).
export async function revoke() {
  const ok = await confirmDialog({ title: "Revoke this device key?", testid: "revoke", confirm: "Revoke in MetaMask",
    lines: ["The key signs its own revocation. It can never attest again. Earlier records keep their deposits. No money moves."] });
  if (!ok) return;
  await act("Revoke device key", () => S.lib.revokeKey(S.ctx, "photographer", S.device), { step: { key: "revoke" } });
}

// ------------------------------------------------------------------ header button and menu

// Draws the header account area: Connect button, wrong-network switch, or the account button with its menu.
export function renderAccount() {
  const box = tid("account");
  if (!box) return;
  if (!S.account) {
    mount(box, h("button", { class: "pri", testid: "btn-connect", onclick: () => act("Connect MetaMask", connect, { local: false }) },
      window.ethereum ? "Connect MetaMask" : "Install MetaMask"));
    if (!window.ethereum) box.firstChild.disabled = true, (box.firstChild.title = "Verifying needs no wallet; signing needs MetaMask.");
    return;
  }
  const a = S.account;
  const name = labelOf(a.address);
  const button = h("button", { class: "acct", testid: "account-button", onclick: () => toggleMenu() },
    h("span", { class: "dot-id", style: `background:${idColour(a.address)}` }),
    h("span", { testid: "account-name" }, name && name !== "You" ? name : ""),
    h("span", { class: "mono", testid: "account-address" }, `${a.address.slice(0, 6)}…${a.address.slice(-4)}`),
    h("span", { class: "d", testid: "account-eth" }, eth(a.eth)),
    a.credit > 0n ? h("span", { class: "badge", testid: "account-claim-badge", title: "Claimable credit" }, tok(a.credit)) : null, " ▾");
  const parts = [button];
  if (wrongChain()) parts.unshift(h("button", { class: "warn", testid: "btn-switch-chain", onclick: () => act("Switch network", switchChain) }, "Switch to Paprika local"));
  mount(box, parts);
  if (menuOpen) mount(tid("account-menu-slot"), menu());
}

let menuOpen = false;
function toggleMenu() { menuOpen = !menuOpen; tid("account-menu-slot").classList.toggle("hidden", !menuOpen); renderAccount(); }

// A colour derived from the address, so the same account looks the same everywhere.
export function idColour(address) {
  const n = parseInt(String(address).slice(2, 8), 16) || 0;
  return `hsl(${n % 360},65%,62%)`;
}

// The account menu.
function menu() {
  const a = S.account;
  const dev = S.deviceInfo || { status: "none" };
  const fileIn = h("input", { type: "file", accept: "application/json", class: "hidden", testid: "input-import-device",
    onchange: (e) => { const f = e.target.files[0]; if (f) act("Import device key", () => importDeviceFile(f)); e.target.value = ""; } });
  return h("div", { class: "menu card", testid: "account-menu" },
    h("div", { class: "m-row" }, addrLink(a.address, { testid: "menu-address" })),
    h("div", { class: "m-row d" }, `MetaMask · ${S.network.name}`),
    h("div", { class: "m-row" }, h("span", { testid: "menu-eth" }, eth(a.eth)), h("span", { testid: "menu-weth" }, tok(a.weth))),
    prepared() ? h("div", { class: "m-row ok", testid: "menu-prepared" }, "✓ Account prepared: one signature per attest or accusation")
      : h("div", { class: "m-row" }, h("span", { class: "d" }, "Wrap ETH and approve Paprika once, so each action needs one signature."),
        h("button", { testid: "btn-prepare", onclick: () => prepareAccount() }, "Prepare account")),
    h("div", { class: "m-row" }, h("span", {}, "Claimable ", h("b", { testid: "menu-credit" }, tok(a.credit))),
      h("button", { testid: "btn-claim", disabled: !(a.credit > 0n), onclick: () => act("Claim credit", () => S.lib.withdrawCredit(S.ctx, "photographer"), { step: { key: "claim" } }) }, "Claim")),
    h("div", { class: "m-sec" }, h("b", {}, "Device key of this browser"),
      S.device ? h("div", { class: "m-row" }, hashLink(S.device.keyId, "device", { testid: "menu-device-key" }),
        h("span", { class: `chip ${dev.status === "active" ? "m" : dev.status === "flagged" ? "r" : ""}`, testid: "device-status", "data-status": dev.status },
          dev.status === "flagged" ? `flagged · ${dev.reason}` : dev.status === "active" ? "active" : "not registered")) : h("div", { class: "d" }, "None yet."),
      h("div", { class: "row" },
        !S.device || dev.status !== "active" ? h("button", { testid: "btn-register", onclick: () => createAndRegister() }, dev.status === "flagged" ? "New key & register (free)" : "Create & register (free)") : null,
        S.device ? h("button", { testid: "btn-export-device", onclick: () => exportDevice() }, "Export") : null,
        h("button", { testid: "btn-import-device", onclick: () => fileIn.click() }, "Import"), fileIn),
      dev.status === "active" ? h("div", { class: "row" }, h("button", { class: "warn", testid: "btn-revoke", onclick: () => revoke() }, "Revoke key…")) : null),
    h("div", { class: "m-row" }, h("button", { class: "link", testid: "btn-disconnect", onclick: () => { menuOpen = false; disconnect(); } }, "Disconnect")));
}
