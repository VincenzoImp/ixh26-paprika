// p05 probe: read-only JSON-RPC checks on public keyless endpoints. No transactions, no keys kept.
// Usage: node probe.mjs   (Node >= 18; uses global fetch and node:crypto only)
import crypto from "node:crypto";
import fs from "node:fs";

const P256 = "0x0000000000000000000000000000000000000100";
const CONTROL = "0x0000000000000000000000000000000000000123"; // no precompile expected here
// Gas measured locally in p03 (hardened contract, optimizer 200, hardfork osaka): register 127018, attest 86026
const GAS = { attest: 86026n, register: 127018n, zk: 4100000n };
// Approximate calldata sizes (bytes) of the signed tx, used only for L1 data fee on rollups
const TXBYTES = { attest: 330, register: 300, zk: 1100 };

const NETS = [
  { name: "Ethereum", id: 1, rpcs: ["https://ethereum-rpc.publicnode.com", "https://eth.llamarpc.com", "https://cloudflare-eth.com"], coin: "ethereum", uma: "0xfb55F43fB9F48F63f9269DB7Dde3BbBe1ebDC0dE" },
  { name: "Sepolia", id: 11155111, rpcs: ["https://ethereum-sepolia-rpc.publicnode.com", "https://rpc.sepolia.org", "https://sepolia.drpc.org"], testnet: true, uma: "0xFd9e2642a170aDD10F53Ee14a93FcF2F31924944" },
  { name: "XRPL EVM", id: 1440000, rpcs: ["https://rpc.xrplevm.org"], coin: "ripple", uma: null },
  { name: "XRPL EVM testnet", id: 1449000, rpcs: ["https://rpc.testnet.xrplevm.org"], testnet: true, uma: null },
  { name: "Base", id: 8453, rpcs: ["https://mainnet.base.org", "https://base-rpc.publicnode.com"], coin: "ethereum", op: true, uma: "0x2aBf1Bd76655de80eDB3086114315Eec75AF500c" },
  { name: "Optimism", id: 10, rpcs: ["https://mainnet.optimism.io", "https://optimism-rpc.publicnode.com"], coin: "ethereum", op: true, uma: "0x072819Bb43B50E7A251c64411e7aA362ce82803B" },
  { name: "Arbitrum One", id: 42161, rpcs: ["https://arb1.arbitrum.io/rpc", "https://arbitrum-one-rpc.publicnode.com"], coin: "ethereum", arb: true, uma: "0xa6147867264374F324524E30C02C331cF28aa879" },
  { name: "Polygon PoS", id: 137, rpcs: ["https://polygon-rpc.com", "https://polygon-bor-rpc.publicnode.com"], coin: "polygon-ecosystem-token", uma: "0x5953f2538F613E05bAED8A5AeFa8e6622467AD3D" },
  { name: "Base Sepolia", id: 84532, rpcs: ["https://sepolia.base.org", "https://base-sepolia-rpc.publicnode.com"], testnet: true, op: true, uma: "0x0F7fC5E6482f096380db6158f978167b57388deE" },
  { name: "Arbitrum Sepolia", id: 421614, rpcs: ["https://sepolia-rollup.arbitrum.io/rpc"], testnet: true, arb: true, uma: "0x1037A21a30aEfF90c269b01c3933eB9a5285d9b8" },
  { name: "Polygon Amoy", id: 80002, rpcs: ["https://rpc-amoy.polygon.technology", "https://polygon-amoy-bor-rpc.publicnode.com"], testnet: true, uma: "0xd8866E76441df243fc98B892362Fc6264dC3ca80" },
  { name: "Avalanche C", id: 43114, rpcs: ["https://api.avax.network/ext/bc/C/rpc"], coin: "avalanche-2", uma: "0xa4199d73ae206d49c966cF16c58436851f87d47F" },
];

let rid = 1;
async function rpc(url, method, params = []) {
  const ctl = AbortSignal.timeout(15000);
  const r = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: rid++, method, params }), signal: ctl });
  const txt = await r.text();
  let j; try { j = JSON.parse(txt); } catch { throw new Error(`HTTP ${r.status} non-JSON: ${txt.slice(0, 120)}`); }
  if (j.error) throw new Error(`RPC error ${j.error.code}: ${j.error.message}`);
  return j.result;
}
const hex = (n) => "0x" + n.toString(16);
const B = (h) => BigInt(h);
const safe = async (f) => { try { return await f(); } catch (e) { return { error: String(e.message || e).slice(0, 200) }; } };

function p256Input() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const msg = crypto.randomBytes(32);
  const h = crypto.createHash("sha256").update(msg).digest();
  const sig = crypto.sign("sha256", msg, { key: privateKey, dsaEncoding: "ieee-p1363" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = Buffer.from(jwk.x, "base64url"), y = Buffer.from(jwk.y, "base64url");
  const good = "0x" + Buffer.concat([h, sig, x, y]).toString("hex");
  const hb = Buffer.from(good.slice(2), "hex"); hb[0] ^= 0x01; // flip one bit of the hash
  return { good, bad: "0x" + hb.toString("hex") };
}
const abiBytes = (n) => { // abi-encode a single `bytes` arg of n random bytes
  const len = n.toString(16).padStart(64, "0");
  const data = crypto.randomBytes(n).toString("hex").padEnd(Math.ceil(n / 32) * 64, "0");
  return "0000000000000000000000000000000000000000000000000000000000000020" + len + data;
};

async function probe(net) {
  const out = { name: net.name, expectedChainId: net.id, tried: [] };
  let url = null;
  for (const u of net.rpcs) {
    const cid = await safe(() => rpc(u, "eth_chainId"));
    out.tried.push({ url: u, chainId: cid.error ? cid : Number(B(cid)) });
    if (!cid.error) { url = u; out.chainId = Number(B(cid)); break; }
  }
  if (!url) { out.status = "all RPCs failed"; return out; }
  out.rpc = url;
  out.chainIdMatches = out.chainId === net.id;
  const latest = await rpc(url, "eth_getBlockByNumber", ["latest", false]);
  const n = B(latest.number);
  const old = await safe(() => rpc(url, "eth_getBlockByNumber", [hex(n - 100n), false]));
  out.block = { number: Number(n), timestamp: Number(B(latest.timestamp)), time: new Date(Number(B(latest.timestamp)) * 1000).toISOString(), gasLimit: Number(B(latest.gasLimit)), gasUsed: Number(B(latest.gasUsed)), baseFeeGwei: latest.baseFeePerGas ? Number(B(latest.baseFeePerGas)) / 1e9 : null };
  if (!old.error && old) out.avgBlockTimeS = (Number(B(latest.timestamp)) - Number(B(old.timestamp))) / 100;
  else out.avgBlockTimeS = old;
  const gp = await safe(() => rpc(url, "eth_gasPrice"));
  out.gasPriceGwei = gp.error ? gp : Number(B(gp)) / 1e9;
  out.feeHistory = await safe(async () => { const f = await rpc(url, "eth_feeHistory", ["0x5", "latest", [50]]); return { baseFeeGwei: f.baseFeePerGas.map((x) => Number(B(x)) / 1e9), p50PriorityGwei: (f.reward || []).map((r) => Number(B(r[0])) / 1e9) }; });
  // P-256 precompile
  const { good, bad } = p256Input();
  out.p256 = {
    valid: await safe(() => rpc(url, "eth_call", [{ to: P256, data: good }, "latest"])),
    tampered: await safe(() => rpc(url, "eth_call", [{ to: P256, data: bad }, "latest"])),
    controlAddress: await safe(() => rpc(url, "eth_call", [{ to: CONTROL, data: good }, "latest"])),
    estimateGasValid: await safe(async () => Number(B(await rpc(url, "eth_estimateGas", [{ to: P256, data: good }])))),
  };
  const v = out.p256.valid;
  out.p256.supported = typeof v === "string" && B(v === "0x" ? "0x0" : v) === 1n && (out.p256.tampered === "0x" || (typeof out.p256.tampered === "string" && B(out.p256.tampered === "0x" ? "0x0" : out.p256.tampered) === 0n));
  // UMA OOv3 code presence
  if (net.uma) out.uma = { address: net.uma, codeBytes: await safe(async () => (await rpc(url, "eth_getCode", [net.uma, "latest"])).length / 2 - 1) };
  else out.uma = { address: null, note: "no OOv3 address listed for this chainId in UMAprotocol/protocol networks folder" };
  // L1 data fee for rollups (approximation with random, incompressible calldata of the given size)
  if (net.op) {
    out.l1FeeWei = {};
    for (const k of Object.keys(TXBYTES)) out.l1FeeWei[k] = await safe(async () => B(await rpc(url, "eth_call", [{ to: "0x420000000000000000000000000000000000000F", data: "0x49948e0e" + abiBytes(TXBYTES[k]) }, "latest"])).toString());
  }
  if (net.arb) {
    out.l1GasUnits = {};
    for (const k of Object.keys(TXBYTES)) out.l1GasUnits[k] = await safe(async () => {
      const data = "0x77d488a2" + "000000000000000000000000" + "1111111111111111111111111111111111111111" + "0".repeat(64) + "0000000000000000000000000000000000000000000000000000000000000060" + abiBytes(TXBYTES[k] - 100).slice(64);
      const r = await rpc(url, "eth_call", [{ to: "0x00000000000000000000000000000000000000C8", data }, "latest"]);
      return Number(B("0x" + r.slice(2, 66)));
    });
  }
  return out;
}

const started = new Date().toISOString();
const results = await Promise.all(NETS.map((n) => safe(() => probe(n)).then((r) => (r.error ? { name: n.name, error: r.error } : r))));
// price
const PRICE_URL = "https://api.coingecko.com/api/v3/simple/price?ids=ethereum,ripple,polygon-ecosystem-token,avalanche-2&vs_currencies=usd,eur";
const price = await safe(async () => { const r = await fetch(PRICE_URL, { signal: AbortSignal.timeout(15000) }); return { status: r.status, body: await r.json() }; });
const priceTime = new Date().toISOString();

// cost table
const rows = [];
for (const r of results) {
  const net = NETS.find((n) => n.name === r.name);
  if (r.error || !r.block) { rows.push({ name: r.name, error: r.error || r.status }); continue; }
  const gpWei = typeof r.gasPriceGwei === "number" ? BigInt(Math.round(r.gasPriceGwei * 1e9)) : 0n;
  const px = net.coin && price.body ? price.body[net.coin] : null;
  const row = { name: r.name, gasPriceGwei: r.gasPriceGwei, blockGasLimit: r.block.gasLimit, avgBlockTimeS: r.avgBlockTimeS, blockhashWindowMin: typeof r.avgBlockTimeS === "number" ? +(256 * r.avgBlockTimeS / 60).toFixed(1) : null, nativeUsd: px?.usd ?? null, nativeEur: px?.eur ?? null };
  for (const k of ["attest", "register", "zk"]) {
    let wei = GAS[k] * gpWei;
    if (r.l1FeeWei && typeof r.l1FeeWei[k] === "string") wei += BigInt(r.l1FeeWei[k]);
    if (r.l1GasUnits && typeof r.l1GasUnits[k] === "number") wei += BigInt(r.l1GasUnits[k]) * gpWei;
    const native = Number(wei) / 1e18;
    row[k] = { native, usd: px ? native * px.usd : null, eur: px ? native * px.eur : null };
  }
  row.attestsPerBlock = Math.floor(r.block.gasLimit / Number(GAS.attest));
  row.zkPerBlock = Math.floor(r.block.gasLimit / Number(GAS.zk));
  rows.push(row);
}
const report = { started, finished: new Date().toISOString(), gasAssumptions: GAS, gasSource: "p03 output/2026-11-20-run.txt (local hardhat, osaka)", txBytesForL1Fee: TXBYTES, priceUrl: PRICE_URL, priceTime, price, results, costs: rows };
fs.mkdirSync(new URL("./output/", import.meta.url), { recursive: true });
const file = new URL(`./output/probe-${started.replace(/[:.]/g, "-")}.json`, import.meta.url);
fs.writeFileSync(file, JSON.stringify(report, (k, v) => (typeof v === "bigint" ? v.toString() : v), 2));
// short console summary
for (const r of results) {
  if (r.error || !r.block) { console.log(`${r.name}: FAILED ${r.error || r.status} ${JSON.stringify(r.tried || "")}`); continue; }
  console.log(`${r.name} [${r.rpc}] chainId=${r.chainId}${r.chainIdMatches ? "" : " (MISMATCH)"} block=${r.block.number} ${r.block.time} avgBlock=${JSON.stringify(r.avgBlockTimeS)}s gasLimit=${r.block.gasLimit} gasPrice=${JSON.stringify(r.gasPriceGwei)}gwei base=${r.block.baseFeeGwei} | p256 valid=${JSON.stringify(r.p256.valid)} tampered=${JSON.stringify(r.p256.tampered)} control=${JSON.stringify(r.p256.controlAddress)} est=${JSON.stringify(r.p256.estimateGasValid)} supported=${r.p256.supported} | UMA code bytes=${JSON.stringify(r.uma.codeBytes ?? r.uma.note)}${r.l1FeeWei ? " l1FeeWei=" + JSON.stringify(r.l1FeeWei) : ""}${r.l1GasUnits ? " l1GasUnits=" + JSON.stringify(r.l1GasUnits) : ""}`);
}
console.log("price", PRICE_URL, priceTime, JSON.stringify(price.body ?? price));
console.table(rows.map((x) => x.error ? { name: x.name, error: x.error } : { name: x.name, gwei: x.gasPriceGwei, blockS: x.avgBlockTimeS, windowMin: x.blockhashWindowMin, attestNative: x.attest.native.toPrecision(3), attestUsd: x.attest.usd?.toPrecision(3), registerUsd: x.register.usd?.toPrecision(3), zkNative: x.zk.native.toPrecision(3), zkUsd: x.zk.usd?.toPrecision(3), attPerBlock: x.attestsPerBlock, zkPerBlock: x.zkPerBlock }));
console.log("saved", file.pathname);
