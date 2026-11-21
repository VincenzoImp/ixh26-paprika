// Paprika demo web server.
// A tiny static file server with no dependencies, for the demo web UI only. It listens on 127.0.0.1
// (port from the PORT environment variable, default 5173) and serves:
//   /            -> app/web/            (the page, its scripts and styles, and deployment.json)
//   /lib/...     -> app/lib/            (the shared Paprika library, ES modules)
//   /vendor/...  -> node_modules/ethers/dist/   (the browser ES module build of ethers)
//   POST /rpc    -> forwarded to the local chain's JSON-RPC (http://127.0.0.1:RPC_PORT, default 8545)
// The page talks only to its own origin, so one port serves everything and the app also works from another
// machine (HOST=0.0.0.0, e.g. over a private network). It never serves files outside the three folders.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "127.0.0.1";
const RPC_PORT = Number(process.env.RPC_PORT || 8545);

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
  const up = http.request({ host: "127.0.0.1", port: RPC_PORT, path: "/", method: "POST",
    headers: { "Content-Type": "application/json" } }, (r) => {
    res.writeHead(r.statusCode || 502, { "Content-Type": r.headers["content-type"] || "application/json", "Cache-Control": "no-store" });
    r.pipe(res);
  });
  up.on("error", (e) => {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ jsonrpc: "2.0", id: null, error: { code: -32000, message: `local chain not reachable on port ${RPC_PORT}: ${e.code || e.message}` } }));
  });
  req.pipe(up);
}

// Answers one request: POST /rpc to the chain; GET/HEAD of a file; 404 otherwise. Nothing is cached.
function handle(req, res) {
  if (req.method === "POST" && req.url.split("?")[0] === "/rpc") return proxyRpc(req, res);
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
  const file = resolveFile(urlPath);
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
  console.log(`JSON-RPC proxy: /rpc -> http://127.0.0.1:${RPC_PORT}`);
  if (!ROOTS.vendor) console.warn("Warning: node_modules/ethers/dist not found; run npm install in app/.");
});

// Stops cleanly on Ctrl+C or when a start script kills the process.
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));
