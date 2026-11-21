// Paprika demo web server.
// A tiny static file server with no dependencies, for the demo web UI only. It listens on HOST (default 127.0.0.1)
// and port WEB_PORT (or PORT; default 5173) and serves:
//   /deployment.json -> the file named by DEPLOYMENT_FILE; else web/deployment-<RPC_PORT>.json if it exists;
//                       else web/deployment.json
//   /            -> app/web/            (the page, its scripts and styles)
//   /lib/...     -> app/lib/            (the shared Paprika library, ES modules)
//   /vendor/...  -> node_modules/ethers/dist/   (the browser ES module build of ethers)
//   POST /rpc    -> forwarded to the local chain's JSON-RPC (http://127.0.0.1:RPC_PORT, default 8545)
// The page talks only to its own origin, so one port serves everything and the app also works from another
// machine. It never serves files outside the three folders. /rpc forwards only the JSON-RPC methods the page uses.
// WARNING: the chain's accounts are unlocked, so anyone who can reach /rpc can act as any demo account. Keep the
// default 127.0.0.1 and use an SSH tunnel from another computer; the server prints a warning when exposed.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

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

// JSON-RPC methods the page needs (reads, transactions from the unlocked demo accounts, the demo clock).
const RPC_MAX_BYTES = 1024 * 1024;   // /rpc body size limit (the page sends small requests)
const RPC_ALLOWED = /^(eth_|net_version$|web3_clientVersion$|evm_increaseTime$|evm_setNextBlockTimestamp$|evm_mine$)/;

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
    checkClock(calls).then((bad) => {
      if (bad) return reply(res, 403, null, -32602, bad);
      forward(Buffer.from(JSON.stringify(calls)), res);   // forward the validated value, re-serialised
    }, () => reply(res, 502, null, -32000, "local chain not reachable"));
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
    if (!RPC_ALLOWED.test(c.method)) return `method not allowed through /rpc: ${c.method}`;
  }
  return "";
}

// The demo clock may move forward, but not absurdly far: evm_increaseTime and evm_setNextBlockTimestamp are
// limited to MAX_JUMP seconds after the latest block (a timestamp in the year 5000 would spoil the chain).
const MAX_JUMP = 30 * 86400;
async function checkClock(calls) {
  const list = Array.isArray(calls) ? calls : [calls];
  const clock = list.filter((c) => c.method === "evm_increaseTime" || c.method === "evm_setNextBlockTimestamp");
  if (!clock.length) return "";
  let latest = null;
  for (const c of clock) {
    const v = Number(Array.isArray(c.params) ? c.params[0] : NaN);
    if (!Number.isFinite(v) || v < 0) return `${c.method}: invalid value`;
    if (c.method === "evm_increaseTime" && v > MAX_JUMP) return `evm_increaseTime: at most ${MAX_JUMP} s per call`;
    if (c.method === "evm_setNextBlockTimestamp") {
      if (latest === null) latest = await latestTimestamp();
      if (v > latest + MAX_JUMP) return `evm_setNextBlockTimestamp: at most ${MAX_JUMP} s after the latest block`;
    }
  }
  return "";
}

// Timestamp of the latest block, asked directly to the chain.
function latestTimestamp() {
  return new Promise((resolve, reject) => {
    const up = http.request({ host: "127.0.0.1", port: RPC_PORT, path: "/", method: "POST", headers: { "Content-Type": "application/json" } }, (r) => {
      let data = "";
      r.on("data", (c) => (data += c));
      r.on("end", () => { try { resolve(Number(BigInt(JSON.parse(data).result.timestamp))); } catch (e) { reject(e); } });
    });
    up.on("error", reject);
    up.end(JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_getBlockByNumber", params: ["latest", false] }));
  });
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

// Sends a JSON-RPC error answer with an HTTP status (the request never reaches the chain).
function reply(res, status, id, code, message) {
  if (res.headersSent) return;
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ jsonrpc: "2.0", id, error: { code, message } }));
}

// Sends a JSON-RPC body to the local chain and pipes the answer back.
function forward(body, res) {
  const up = http.request({ host: "127.0.0.1", port: RPC_PORT, path: "/", method: "POST",
    headers: { "Content-Type": "application/json" } }, (r) => {
    res.writeHead(r.statusCode || 502, { "Content-Type": r.headers["content-type"] || "application/json", "Cache-Control": "no-store" });
    r.pipe(res);
  });
  up.on("error", (e) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: `local chain not reachable on port ${RPC_PORT}: ${e.code || e.message}` } }));
  });
  up.end(body);
}

// Answers one request: POST /rpc to the chain; GET/HEAD of a file; 404 otherwise. Nothing is cached.
function handle(req, res) {
  if (req.method === "POST" && req.url.split("?")[0] === "/rpc") return proxyRpc(req, res);
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
    console.warn(`\nWARNING: HOST=${HOST} exposes this server beyond this machine. Through /rpc, anyone who can reach it can`);
    console.warn("send transactions as any demo account (the chain's accounts are unlocked) and move the chain clock.");
    console.warn("Browsers also disable WebCrypto and the camera on plain http from another address, so the page will not");
    console.warn(`work there anyway. Prefer the default HOST=127.0.0.1 and, on the other computer: ssh -N -L ${PORT}:127.0.0.1:${PORT} <user>@<this-host>\n`);
  }
  console.log(`JSON-RPC proxy: /rpc -> http://127.0.0.1:${RPC_PORT}`);
  if (!ROOTS.vendor) console.warn("Warning: node_modules/ethers/dist not found; run npm install in app/.");
});

// Stops cleanly on Ctrl+C or when a start script kills the process.
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));
