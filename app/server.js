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
  req.on("data", (c) => chunks.push(c));
  req.on("end", () => {
    const body = Buffer.concat(chunks);
    let calls;
    try { calls = JSON.parse(body.toString("utf8")); } catch { calls = null; }
    const list = Array.isArray(calls) ? calls : [calls];
    const bad = list.find((c) => !c || typeof c.method !== "string" || !RPC_ALLOWED.test(c.method));
    if (bad) {
      res.writeHead(403, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ jsonrpc: "2.0", id: bad?.id ?? null, error: { code: -32601, message: `method not allowed through /rpc: ${bad?.method}` } }));
    }
    forward(body, res);
  });
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
