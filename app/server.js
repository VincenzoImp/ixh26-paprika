// Paprika demo web server.
// A tiny static file server with no dependencies, for the demo web UI only. It listens on HOST (default 127.0.0.1)
// and port WEB_PORT (or PORT; default 5173) and serves:
//   /deployment.json -> the file named by DEPLOYMENT_FILE; else web/deployment-<RPC_PORT>.json if it exists;
//                       else web/deployment.json
//   /            -> app/web/            (the page, its scripts and styles)
//   /lib/...     -> app/lib/            (the shared Paprika library, ES modules)
//   /vendor/...  -> node_modules/ethers/dist/   (the browser ES module build of ethers)
//   POST /rpc    -> relayed to the local chain's JSON-RPC (http://127.0.0.1:RPC_PORT, default 8545): reads and
//                   eth_sendRawTransaction only (RPC_ALLOWED below). Transactions arrive SIGNED by the user's own
//                   wallet (the page's key or MetaMask); the server never holds a user key and never asks the node
//                   to sign (eth_sendTransaction, eth_accounts, personal_*, eth_sign*, evm_*, hardhat_*: 403).
//                   CORS is open on /rpc only, so a wallet extension such as MetaMask can use it as its RPC URL.
//   /demo/...    -> the demo controls of the LOCAL chain, run here because they belong to third parties, not the
//                   user: POST /demo/faucet (test ETH from the operator), POST /demo/vote + GET /demo/vote/status
//                   (the UMA voters vote; polled for progress), POST /demo/advance (the chain clock). They sign with
//                   the operator and voter keys of Hardhat's public test mnemonic (lib/demo-keys.js), which never
//                   leave this process, and refuse anything but a local Hardhat chain.
// The page talks only to its own origin, so one port serves everything. It never serves files outside the three
// folders (and never lib/demo-keys.js). Keep the default HOST=127.0.0.1 and use an SSH tunnel from another computer:
// the demo endpoints give test ETH and move the clock for anyone who can reach them.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { advanceTime, connect, requestTestFunds, umaVote, onActivity } from "./lib/paprika.js";
import { demoKeys } from "./lib/demo-keys.js";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.WEB_PORT || process.env.PORT || 5173);
const HOST = process.env.HOST || "127.0.0.1";
const RPC_PORT = Number(process.env.RPC_PORT || 8545);

// The deployment the page must use: the one for this chain (B6).
function deploymentFile() {
  if (process.env.DEPLOYMENT_FILE) return path.resolve(process.env.DEPLOYMENT_FILE);
  const perPort = path.join(APP_DIR, "web", `deployment-${RPC_PORT}.json`);
  if (RPC_PORT !== 8545 && fs.existsSync(perPort)) return perPort;
  return path.join(APP_DIR, "web", "deployment.json");
}

// JSON-RPC methods relayed by /rpc: what ethers and MetaMask need for reads, gas and fees, and signed transactions.
// Everything else is refused with 403, in particular eth_sendTransaction / eth_accounts / eth_requestAccounts
// (signing by the node), personal_*, eth_sign*, evm_*, hardhat_*, debug_*.
const RPC_MAX_BYTES = 1024 * 1024;   // /rpc body size limit (the page sends small requests)
const RPC_ALLOWED = new Set([
  "eth_chainId", "net_version", "web3_clientVersion", "eth_blockNumber", "eth_getBlockByNumber", "eth_getBlockByHash",
  "eth_getBalance", "eth_getCode", "eth_getTransactionCount", "eth_call", "eth_estimateGas", "eth_gasPrice",
  "eth_maxPriorityFeePerGas", "eth_feeHistory", "eth_getLogs", "eth_getTransactionByHash", "eth_getTransactionReceipt",
  "eth_sendRawTransaction", "eth_getStorageAt", "eth_syncing",
]);

// Content types by file extension. Unknown extensions are served as raw bytes.
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".map": "application/json; charset=utf-8",
  ".md": "text/plain; charset=utf-8",
};

// Finds the folder with the browser build of ethers: looks in node_modules of app/ and of its parents.
function findEthersDist() {
  let dir = APP_DIR;
  for (;;) {
    const candidate = path.join(dir, "node_modules", "ethers", "dist");
    if (fs.existsSync(candidate)) return candidate;
    const parent = path.dirname(dir);
    if (parent === dir) return null;
    dir = parent;
  }
}

const ROOTS = {
  web: path.join(APP_DIR, "web"),
  lib: path.join(APP_DIR, "lib"),
  vendor: findEthersDist(),
};

// Maps a URL path to a file on disk, or null when the path is outside the served folders.
function resolveFile(urlPath) {
  let root, rest;
  if (urlPath.startsWith("/lib/")) [root, rest] = [ROOTS.lib, urlPath.slice(5)];
  else if (urlPath.startsWith("/vendor/")) [root, rest] = [ROOTS.vendor, urlPath.slice(8)];
  else [root, rest] = [ROOTS.web, urlPath === "/" ? "index.html" : urlPath.slice(1)];
  if (!root) return null;
  const file = path.resolve(root, rest);
  if (root === ROOTS.lib && path.basename(file) === "demo-keys.js") return null;   // Node-only keys module
  if (file !== root && !file.startsWith(root + path.sep)) return null;   // blocks "../" escapes
  return file;
}

// Forwards one JSON-RPC POST body to the local chain and pipes the answer back.
function proxyRpc(req, res) {
  const chunks = [];
  let size = 0, tooBig = false;
  req.on("data", (c) => {
    size += c.length;
    if (size > RPC_MAX_BYTES) { tooBig = true; req.destroy(); return; }
    if (!tooBig) chunks.push(c);
  });
  req.on("close", () => { if (tooBig && !res.headersSent) reply(res, 413, null, -32600, `request body larger than ${RPC_MAX_BYTES} bytes`); });
  req.on("end", () => {
    if (tooBig) return reply(res, 413, null, -32600, `request body larger than ${RPC_MAX_BYTES} bytes`);
    const body = Buffer.concat(chunks);
    let calls;
    try { calls = JSON.parse(body.toString("utf8")); } catch { return reply(res, 400, null, -32700, "invalid JSON"); }
    const problem = checkRpc(calls);
    if (problem) return reply(res, 403, null, -32601, problem);
    forward(Buffer.from(JSON.stringify(calls)), res);   // forward the validated value, re-serialised
  });
}

// Validates a parsed JSON-RPC body: one request object, or a non-empty array of request objects, each with an
// allowed method. Returns "" when valid, else the reason. null, scalars, empty or mixed arrays are refused.
function checkRpc(calls) {
  const isReq = (c) => c !== null && typeof c === "object" && !Array.isArray(c) && typeof c.method === "string";
  const list = Array.isArray(calls) ? calls : [calls];
  if (!list.length) return "empty batch";
  if (list.length > 100) return "batch too large";
  for (const c of list) {
    if (!isReq(c)) return "not a JSON-RPC request object";
    if (!RPC_ALLOWED.has(c.method)) return `method not allowed through /rpc: ${c.method}`;
  }
  return "";
}

// Vote locks: one UMA vote at a time per assertion, across every tab and browser using this server.
// POST /vote-lock?assertion=<id>&op=acquire|release. A lock expires after VOTE_LOCK_MS.
const VOTE_LOCK_MS = 60000;
const voteLocks = new Map();   // assertion id -> expiry time (ms)
function voteLock(req, res) {
  const u = new URL(req.url, "http://localhost");
  const id = String(u.searchParams.get("assertion") || "").toLowerCase();
  const op = u.searchParams.get("op");
  res.setHeader("Content-Type", "application/json");
  if (!/^0x[0-9a-f]{64}$/.test(id)) { res.writeHead(400); return res.end(JSON.stringify({ ok: false, error: "bad assertion id" })); }
  const now = Date.now();
  if (op === "release") { voteLocks.delete(id); res.writeHead(200); return res.end(JSON.stringify({ ok: true })); }
  if ((voteLocks.get(id) || 0) > now) { res.writeHead(409); return res.end(JSON.stringify({ ok: false, busy: true })); }
  voteLocks.set(id, now + VOTE_LOCK_MS);
  res.writeHead(200);
  return res.end(JSON.stringify({ ok: true }));
}

// ------------------------------------------------------------------ demo controls (local chain only)

// A read-write ctx for the demo controls, rebuilt when the deployment file changes. It signs with the operator and
// voter keys (lib/demo-keys.js); it has no user wallet.
let demoCtx = null, demoCtxKey = "";
function getDemoCtx() {
  const file = deploymentFile();
  const st = fs.statSync(file);
  const key = `${file}:${st.mtimeMs}`;
  if (!demoCtx || demoCtxKey !== key) {
    const deployment = JSON.parse(fs.readFileSync(file, "utf8"));
    demoCtx = connect({ rpcUrl: `http://127.0.0.1:${RPC_PORT}`, deployment, demoKeys: demoKeys(deployment) });
    demoCtxKey = key;
  }
  return demoCtx;
}

// One demo operation at a time: the operator and the voters sign with plain wallets, so their nonces must not race.
let demoQueue = Promise.resolve();
function enqueue(fn) {
  const p = demoQueue.then(fn, fn);
  demoQueue = p.catch(() => {});
  return p;
}

// Reads a small JSON body (at most 64 kB).
function readJson(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 65536) { reject(Object.assign(new Error("body too large"), { status: 413 })); req.destroy(); } });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { reject(Object.assign(new Error("invalid JSON"), { status: 400 })); } });
    req.on("error", reject);
  });
}
function sendJson(res, status, obj) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store" });
  res.end(JSON.stringify(obj, (_k, v) => (typeof v === "bigint" ? v.toString() : v)));
}
// Maps a library error to an HTTP status: refusals the user can act on are 409, a non-local chain is 403.
function statusOf(e) {
  if (e.status) return e.status;
  if (/not a local Hardhat chain/.test(e.message)) return 403;
  if (/cannot reach the local chain/.test(e.message)) return 502;
  return 409;
}

const FAUCET_INTERVAL_MS = 10000;
const faucetLast = new Map();   // address (lowercase) -> time of the last grant (ms)
const MAX_JUMP = 30 * 86400;    // the demo clock moves at most 30 days per request
const voteJobs = new Map();     // assertion id (lowercase) -> { state, phases, activity, result, error, code, at }

async function demoRoute(req, res, route) {
  try {
    if (req.method === "POST" && route === "/demo/faucet") {
      const { address } = await readJson(req);
      if (!/^0x[0-9a-fA-F]{40}$/.test(String(address))) return sendJson(res, 400, { error: "address must be 0x + 40 hex characters" });
      const k = address.toLowerCase();
      const wait = (faucetLast.get(k) || 0) + FAUCET_INTERVAL_MS - Date.now();
      if (wait > 0) return sendJson(res, 429, { error: `test ETH was just sent to this address: try again in ${Math.ceil(wait / 1000)} s` });
      faucetLast.set(k, Date.now());
      const ctx = getDemoCtx();
      const activity = [];
      const off = onActivity(ctx, (a) => activity.push(a));
      try {
        const r = await enqueue(() => requestTestFunds(ctx, address));
        return sendJson(res, 200, { txHash: r.txHash, amount: r.amount, activity });
      } catch (e) { faucetLast.delete(k); throw e; } finally { off(); }
    }
    if (req.method === "POST" && route === "/demo/vote") {
      const { assertionId, fakeProven } = await readJson(req);
      if (!/^0x[0-9a-fA-F]{64}$/.test(String(assertionId))) return sendJson(res, 400, { error: "assertionId must be 0x + 64 hex characters" });
      const k = assertionId.toLowerCase();
      if (voteJobs.get(k)?.state === "running") {
        return sendJson(res, 409, { error: "a vote on this accusation is already running (another tab or the CLI): wait a few seconds", code: "VOTE_IN_PROGRESS" });
      }
      const job = { state: "running", phases: [], activity: [], result: null, error: null, code: null, at: Date.now() };
      voteJobs.set(k, job);
      const ctx = getDemoCtx();
      enqueue(async () => {
        const off = onActivity(ctx, (a) => job.activity.push(a));
        try {
          job.result = await umaVote(ctx, assertionId, Boolean(fakeProven), { onPhase: (ph) => job.phases.push(ph) });
          job.state = "done";
        } catch (e) {
          job.state = "error"; job.error = e.message; job.code = e.code || null;
        } finally { off(); }
      });
      for (const [id, j] of voteJobs) if (j.state !== "running" && Date.now() - j.at > 600000) voteJobs.delete(id);
      return sendJson(res, 202, { assertionId, state: "running" });
    }
    if (req.method === "GET" && route === "/demo/vote/status") {
      const id = String(new URL(req.url, "http://localhost").searchParams.get("assertionId") || "").toLowerCase();
      const job = voteJobs.get(id);
      if (!job) return sendJson(res, 404, { error: "no vote started for this assertion on this server" });
      return sendJson(res, 200, job);
    }
    if (req.method === "POST" && route === "/demo/advance") {
      const { seconds, force } = await readJson(req);
      const s = Number(seconds);
      if (!Number.isFinite(s) || s < 0) return sendJson(res, 400, { error: "seconds must be a number >= 0" });
      if (s > MAX_JUMP) return sendJson(res, 400, { error: `at most ${MAX_JUMP} s per request` });
      const ctx = getDemoCtx();
      const r = await enqueue(() => advanceTime(ctx, s, { force: Boolean(force) }));
      return sendJson(res, 200, r);
    }
    return sendJson(res, 404, { error: `unknown demo endpoint: ${req.method} ${route}` });
  } catch (e) {
    return sendJson(res, statusOf(e), { error: e.message, code: e.code || null });
  }
}

// Sends a JSON-RPC error answer with an HTTP status (the request never reaches the chain).
function reply(res, status, id, code, message) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
}

// Sends a JSON-RPC body to the local chain and pipes the answer back.
function forward(body, res) {
  const up = http.request({ host: "127.0.0.1", port: RPC_PORT, path: "/", method: "POST",
    headers: { "Content-Type": "application/json" } }, (r) => {
    res.writeHead(r.statusCode || 502, { "Content-Type": r.headers["content-type"] || "application/json", "Cache-Control": "no-store", "Access-Control-Allow-Origin": "*" });
    r.pipe(res);
  });
  up.on("error", (e) => {
    res.writeHead(502, { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: `local chain not reachable on port ${RPC_PORT}: ${e.code || e.message}` } }));
  });
  up.end(body);
}

// Answers one request: POST /rpc to the chain; GET/HEAD of a file; 404 otherwise. Nothing is cached.
function handle(req, res) {
  const route = req.url.split("?")[0];
  if (route === "/rpc" && req.method === "OPTIONS") {   // CORS preflight (wallet extensions)
    res.writeHead(204, { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "content-type", "Access-Control-Max-Age": "600" });
    return res.end();
  }
  if (req.method === "POST" && route === "/rpc") return proxyRpc(req, res);
  if (route.startsWith("/demo/")) return demoRoute(req, res, route);
  if (req.method === "POST" && req.url.split("?")[0] === "/vote-lock") return voteLock(req, res);
  if (req.url.split("?")[0] === "/server-info.json") {   // the real ports, for the page's "start the system" hint
    res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" });
    return res.end(JSON.stringify({ rpcPort: RPC_PORT, webPort: PORT }));
  }
  if (req.url.split("?")[0] === "/deployment.json" && (req.method === "GET" || req.method === "HEAD")) return serveFile(deploymentFile(), req, res, "/deployment.json");
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(405, { "Content-Type": "text/plain" });
    return res.end("Method not allowed");
  }
  let urlPath;
  try {
    urlPath = decodeURIComponent(new URL(req.url, "http://localhost").pathname);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain" });
    return res.end("Bad request");
  }
  serveFile(resolveFile(urlPath), req, res, urlPath);
}

// Sends one file (404 if missing). Nothing is cached, so a new deployment shows at once.
function serveFile(file, req, res, urlPath) {
  fs.stat(file || "", (err, st) => {
    if (err || !st.isFile()) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      return res.end("Not found: " + urlPath);
    }
    res.writeHead(200, {
      "Content-Type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
      "Content-Length": st.size,
      "Cache-Control": "no-store",
    });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(file).pipe(res);
  });
}

const server = http.createServer(handle);
server.listen(PORT, HOST, () => {
  // Print every URL that reaches the page: all IPv4 addresses when bound to 0.0.0.0, else the bound host.
  const hosts = HOST === "0.0.0.0"
    ? Object.values(os.networkInterfaces()).flat().filter((i) => i && i.family === "IPv4").map((i) => i.address)
    : [HOST];
  for (const h of hosts) console.log(`Paprika web UI: http://${h}:${PORT}/`);
  console.log(`Deployment served at /deployment.json: ${deploymentFile()}`);
  if (!["127.0.0.1", "localhost", "::1"].includes(HOST)) {
    console.warn(`\nWARNING: HOST=${HOST} exposes this server beyond this machine. Anyone who can reach it can use the demo`);
    console.warn("controls (test ETH from the faucet, the UMA vote, the chain clock). User keys are never on the server.");
    console.warn("Browsers also disable WebCrypto and the camera on plain http from another address, so the page will not");
    console.warn(`work there anyway. Prefer the default HOST=127.0.0.1 and, on the other computer: ssh -N -L ${PORT}:127.0.0.1:${PORT} <user>@<this-host>\n`);
  }
  console.log(`JSON-RPC proxy: /rpc -> http://127.0.0.1:${RPC_PORT}`);
  if (!ROOTS.vendor) console.warn("Warning: node_modules/ethers/dist not found; run npm install in app/.");
});

// Stops cleanly on Ctrl+C or when a start script kills the process.
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));
