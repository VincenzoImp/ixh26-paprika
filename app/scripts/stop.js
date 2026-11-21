// `npm run stop`: kills the chain and web server started by the other scripts for THIS instance (RPC_PORT, default
// 8545; PIDs in app/.state/pids[-<port>].json), plus a leftover Hardhat node on that port. Other ports are untouched.
import { execSync } from "node:child_process";
import { CHAIN_PORT, killGroup, readPids, writePid } from "./common.js";

for (const [name, pid] of Object.entries(readPids())) {
  console.log(`${killGroup(pid) ? "Stopped" : "Already gone"}: ${name} (pid ${pid})`);
  writePid(name, null);
}
try {
  execSync(`pkill -f "hardhat node --hostname 127.0.0.1 --port ${CHAIN_PORT}"`, { stdio: "ignore" });
  console.log("Stopped a leftover Hardhat node.");
} catch { /* nothing to kill */ }
