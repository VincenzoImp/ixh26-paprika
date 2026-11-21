// Paprika demo web server.
// A tiny static file server with no dependencies, for the demo web UI only. It listens on 127.0.0.1
// (port from the PORT environment variable, default 5173) and serves:
//   /            -> app/web/            (the page, its scripts and styles, and deployment.json)
//   /lib/...     -> app/lib/            (the shared Paprika library, ES modules)
//   /vendor/...  -> node_modules/ethers/dist/   (the browser ES module build of ethers)
// It never writes anything and never serves files outside these three folders.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const APP_DIR = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5173);
const HOST = process.env.HOST || "127.0.0.1";

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

// Answers one request: GET/HEAD of a file, 404 otherwise. Nothing is cached, so a new deployment shows at once.
function handle(req, res) {
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
  console.log(`Paprika web UI: http://${HOST}:${PORT}/`);
  if (!ROOTS.vendor) console.warn("Warning: node_modules/ethers/dist not found; run npm install in app/.");
});

// Stops cleanly on Ctrl+C or when a start script kills the process.
for (const sig of ["SIGINT", "SIGTERM"]) process.on(sig, () => server.close(() => process.exit(0)));
