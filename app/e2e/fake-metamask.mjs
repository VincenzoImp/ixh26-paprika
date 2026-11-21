// Paprika tests: a stand-in for the MetaMask extension (headless Chromium cannot load extensions).
// It injects window.ethereum (EIP-1193) into the page. Every request is forwarded to this Node process, which signs
// with ethers Wallets for Hardhat's well-known test accounts #1 (Alice) and #2 (Bob) — the same accounts the demo
// imports into MetaMask — and relays reads to the chain. It can switch account (accountsChanged), switch chain
// (chainChanged), refuse a request (code 4001) and count the transactions it signed.

import { ethers } from "ethers";

export const ALICE_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";   // Hardhat #1
export const BOB_KEY = "0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a";     // Hardhat #2

// Installs the fake wallet in a browser context. rpcUrl: the chain (direct). Returns a controller.
export async function installFakeMetaMask(context, rpcUrl, { chainId = 31337 } = {}) {
  const rpc = new ethers.JsonRpcProvider(rpcUrl, undefined, { staticNetwork: true, cacheTimeout: -1, pollingInterval: 100 });
  const wallets = { alice: new ethers.Wallet(ALICE_KEY, rpc), bob: new ethers.Wallet(BOB_KEY, rpc) };
  const st = { current: "alice", chainId, reject: false, sent: [], pages: [] };
  const known = new Set([31337]);
  const fail = (code, message) => ({ __error: { code, message } });

  await context.exposeBinding("__fakeMetaMask", async (_src, method, params) => {
    try {
      const w = wallets[st.current];
      if (st.reject && /^(eth_requestAccounts|eth_sendTransaction|wallet_|personal_sign|eth_signTypedData)/.test(method)) return fail(4001, "User rejected the request.");
      switch (method) {
        case "eth_requestAccounts": case "eth_accounts": return [w.address.toLowerCase()];
        case "eth_chainId": return "0x" + st.chainId.toString(16);
        case "net_version": return String(st.chainId);
        case "wallet_switchEthereumChain": {
          const id = Number(params[0].chainId);
          if (!known.has(id)) return fail(4902, "Unrecognized chain ID.");
          st.chainId = id; await emitAll("chainChanged", params[0].chainId); return null;
        }
        case "wallet_addEthereumChain": known.add(Number(params[0].chainId)); st.chainId = Number(params[0].chainId); await emitAll("chainChanged", params[0].chainId); return null;
        case "eth_sendTransaction": {
          if (st.chainId !== chainId) return fail(4100, "wrong chain");
          const t = params[0];
          const sent = await w.sendTransaction({ to: t.to, data: t.data, value: t.value ?? 0, gasLimit: t.gas ?? t.gasLimit });
          st.sent.push({ hash: sent.hash, from: w.address, account: st.current });
          return sent.hash;
        }
        case "personal_sign": return w.signMessage(ethers.getBytes(params[0]));
        default: return await rpc.send(method, params ?? []);
      }
    } catch (e) { return fail(e?.code ?? -32603, e?.shortMessage || e?.message || String(e)); }
  });
  await context.addInitScript(() => {
    const handlers = {};
    window.ethereum = {
      isMetaMask: true, isTestStandIn: true,
      async request({ method, params }) {
        const r = await window.__fakeMetaMask(method, params);
        if (r && r.__error) { const e = new Error(r.__error.message); e.code = r.__error.code; throw e; }
        return r;
      },
      on(name, cb) { (handlers[name] ||= []).push(cb); },
      removeListener(name, cb) { handlers[name] = (handlers[name] || []).filter((x) => x !== cb); },
    };
    window.__fakeMetaMaskEmit = (name, value) => { for (const cb of handlers[name] || []) cb(value); };
  });
  async function emitAll(name, value) {
    for (const p of context.pages()) await p.evaluate(([n, v]) => window.__fakeMetaMaskEmit?.(n, v), [name, value]).catch(() => {});
  }
  return {
    wallets, state: st, rpc,
    address: (who = st.current) => wallets[who].address,
    // Selects another account, as the user does in MetaMask; the page gets accountsChanged.
    async use(who) { st.current = who; await emitAll("accountsChanged", [wallets[who].address.toLowerCase()]); },
    // Moves MetaMask to another chain id (to test the wrong-network prompt).
    async setChain(id) { st.chainId = id; await emitAll("chainChanged", "0x" + id.toString(16)); },
    // Makes the next requests fail as if the user pressed Reject.
    reject(on = true) { st.reject = on; },
    // Transactions signed since a given count (to check "exactly one signature").
    sentSince(n) { return st.sent.slice(n); },
  };
}
