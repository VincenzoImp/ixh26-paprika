// Shared helpers for the start scripts: paths, the RPC probe, the PID file and child-process handling.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const CONTRACT_DIR = path.resolve(APP_DIR, "..", "contract");
export const STATE_DIR = path.join(APP_DIR, ".state");
export const PID_FILE = path.join(STATE_DIR, "pids.json");
export const HARDHAT_BIN = path.join(CONTRACT_DIR, "node_modules", ".bin", "hardhat");
export const DEPLOYMENT_FILE = path.join(CONTRACT_DIR, "deployments", "local.json");
export const WEB_DEPLOYMENT_FILE = path.join(APP_DIR, "web", "deployment.json");

export const CHAIN_HOST = "127.0.0.1";
export const CHAIN_PORT = 8545;
export const RPC_URL = process.env.RPC_URL || `http://${CHAIN_HOST}:${CHAIN_PORT}`;
export const WEB_HOST = "127.0.0.1";
export const WEB_PORT = Number(process.env.WEB_PORT || 5173);

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
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const pids = readPids();
  if (pid) pids[name] = pid; else delete pids[name];
  fs.writeFileSync(PID_FILE, JSON.stringify(pids, null, 2));
}

/** Kills a process group started with detached: true (falls back to the single process). */
export function killGroup(pid, signal = "SIGTERM") {
  try { process.kill(-pid, signal); return true; } catch { /* not a group leader or already gone */ }
  try { process.kill(pid, signal); return true; } catch { return false; }
}
