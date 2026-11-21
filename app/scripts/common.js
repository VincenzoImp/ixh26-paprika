// Shared helpers for the start scripts: paths, the RPC probe, the PID file and child-process handling.
import { spawn } from "node:child_process";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONTRACT_DIR = path.resolve(APP_DIR, "..", "contract");
export const STATE_DIR = path.join(APP_DIR, ".state");
export const HARDHAT_BIN = path.join(CONTRACT_DIR, "node_modules", ".bin", "hardhat");

// Ports: RPC_PORT (chain, default 8545) and WEB_PORT (UI, default 5173). Several instances can run side by side;
// every per-instance file gets a "-<RPC_PORT>" suffix when the chain is not on the default port.
export const CHAIN_HOST = "127.0.0.1";
export const CHAIN_PORT = Number(process.env.RPC_PORT || 8545);
export const RPC_URL = process.env.RPC_URL || `http://${CHAIN_HOST}:${CHAIN_PORT}`;
export const WEB_HOST = process.env.HOST || "127.0.0.1";   // HOST overrides; default local only
export const WEB_PORT = Number(process.env.WEB_PORT || 5173);
export const SUFFIX = CHAIN_PORT === 8545 ? "" : `-${CHAIN_PORT}`;
export const PID_FILE = path.join(STATE_DIR, `pids${SUFFIX}.json`);
export const DEPLOYMENT_FILE = path.join(CONTRACT_DIR, "deployments", `local${SUFFIX}.json`);
// The deployment the web page loads for THIS instance. deploy.js writes it; start.js and web.js pass its absolute
// path to server.js as DEPLOYMENT_FILE, and the server serves it at /deployment.json, so the page never sees the
// per-port name. (app/web/deployment.json for the default port 8545, app/web/deployment-<RPC_PORT>.json otherwise.)
export const WEB_DEPLOYMENT_FILE = path.join(APP_DIR, "web", `deployment${SUFFIX}.json`);

/** Environment for server.js: where to listen, which chain to relay /rpc to, which deployment to serve. */
export function serverEnv() {
  return {
    ...process.env, HOST: WEB_HOST, PORT: String(WEB_PORT), WEB_PORT: String(WEB_PORT),
    RPC_PORT: String(CHAIN_PORT), RPC_URL, DEPLOYMENT_FILE: WEB_DEPLOYMENT_FILE,
  };
}

/** True if a JSON-RPC node answers eth_chainId at RPC_URL. */
export async function rpcAlive(url = RPC_URL) {
  try {
    const res = await fetch(url, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }),
      signal: AbortSignal.timeout(1000),
    });
    return res.ok && "result" in (await res.json());
  } catch {
    return false;
  }
}

/** Polls the RPC until it answers or `timeoutMs` passes. */
export async function waitForRpc(timeoutMs = 60000, url = RPC_URL) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await rpcAlive(url)) return true;
    await new Promise((r) => setTimeout(r, 300));
  }
  return false;
}

/** Installs contract/ dependencies (hardhat, @uma/contracts-node) if they are missing. */
export async function ensureContractDeps() {
  const uma = path.join(CONTRACT_DIR, "node_modules", "@uma", "contracts-node", "package.json");
  if (fs.existsSync(HARDHAT_BIN) && fs.existsSync(uma)) return;
  console.log("Installing contract dependencies (npm install in ../contract) ...");
  await run("npm", ["install", "--no-audit", "--no-fund"], { cwd: CONTRACT_DIR });
}

/** Runs a command to completion with inherited output; rejects on a non-zero exit code. */
export function run(cmd, args, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { stdio: "inherit", ...opts });
    child.on("error", reject);
    child.on("exit", (code) => (code === 0 ? resolve() : reject(new Error(`${cmd} ${args.join(" ")} exited with code ${code}`))));
  });
}

export function readPids() {
  try { return JSON.parse(fs.readFileSync(PID_FILE, "utf8")); } catch { return {}; }
}
export function writePid(name, pid) {
  // Removing an entry never creates the file (a script exiting after `npm run stop` must not leave it behind).
  if (!pid && !fs.existsSync(PID_FILE)) return;
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const pids = readPids();
  if (pid) pids[name] = pid; else delete pids[name];
  if (Object.keys(pids).length) fs.writeFileSync(PID_FILE, JSON.stringify(pids, null, 2));
  else fs.rmSync(PID_FILE, { force: true });
}

// What `npm start` is serving for this instance ({ webUrl, rpcUrl, pid }), so a second start can name the real page.
export const INSTANCE_FILE = path.join(STATE_DIR, `instance${SUFFIX}.json`);
export function readInstance() {
  try { return JSON.parse(fs.readFileSync(INSTANCE_FILE, "utf8")); } catch { return null; }
}

/** Kills a process group started with detached: true (falls back to the single process). */
export function killGroup(pid, signal = "SIGTERM") {
  try { process.kill(-pid, signal); return true; } catch { /* not a group leader or already gone */ }
  try { process.kill(pid, signal); return true; } catch { return false; }
}

/** True if something accepts TCP connections on host:port (e.g. a web server already running). */
export function portBusy(port, host = "127.0.0.1") {
  return new Promise((resolve) => {
    const sock = net.connect({ port, host });
    sock.setTimeout(800);
    sock.once("connect", () => { sock.destroy(); resolve(true); });
    sock.once("timeout", () => { sock.destroy(); resolve(false); });
    sock.once("error", () => resolve(false));
  });
}

// One JSON-RPC call (no ethers needed in the scripts).
export async function rpc(method, params = [], url = RPC_URL) {
  const res = await fetch(url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(3000),
  });
  const j = await res.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

/**
 * The deployment of this instance if it is live on the chain at RPC_URL: the deployment file exists and Paprika's
 * code is at its address. Returns the parsed deployment, or null (no file, chain down, or a fresh chain).
 */
export async function liveDeployment() {
  for (const file of [WEB_DEPLOYMENT_FILE, DEPLOYMENT_FILE]) {
    if (!fs.existsSync(file)) continue;
    try {
      const d = JSON.parse(fs.readFileSync(file, "utf8"));
      const code = await rpc("eth_getCode", [d.addresses.paprika, "latest"]);
      if (code && code !== "0x") return d;
    } catch { /* unreadable file or chain down */ }
  }
  return null;
}

/**
 * PIDs of Hardhat nodes started from ../contract that listen on exactly `port` (argv "--port <port>", compared as a
 * whole word, so port 944 never matches 9445). Reads /proc; returns [] where /proc is not available.
 */
export function hardhatNodePids(port) {
  const out = [];
  let entries = [];
  try { entries = fs.readdirSync("/proc"); } catch { return out; }
  for (const d of entries) {
    if (!/^\d+$/.test(d) || Number(d) === process.pid) continue;
    let argv;
    try { argv = fs.readFileSync(`/proc/${d}/cmdline`, "utf8").split("\0"); } catch { continue; }
    const i = argv.indexOf("--port");
    if (argv.some((a) => a.endsWith("hardhat")) && argv.includes("node") && i >= 0 && argv[i + 1] === String(port)) out.push(Number(d));
  }
  return out;
}

/** For a non-default port: deletes the per-port files of this instance (deployment copies, pids, CLI state). */
export function cleanupInstanceFiles() {
  if (!SUFFIX) return [];
  const removed = [];
  const candidates = [WEB_DEPLOYMENT_FILE, DEPLOYMENT_FILE, PID_FILE, INSTANCE_FILE, path.join(STATE_DIR, `chain${SUFFIX}.log`)];
  for (const f of candidates) if (fs.existsSync(f)) { fs.rmSync(f, { force: true }); removed.push(f); }
  return removed;
}
