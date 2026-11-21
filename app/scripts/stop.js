// `npm run stop`: stops ONE instance: the chain and web server that the scripts started for RPC_PORT (default 8545).
//   npm run stop                 the default instance (8545)
//   npm run stop -- 8546         or  RPC_PORT=8546 npm run stop: only the instance on 8546
// It kills the PIDs recorded in app/.state/pids[-<port>].json, then any Hardhat node of ../contract whose
// "--port" argument is exactly that port (a whole-word match: 944 never matches 9445). Other instances are untouched.
// For a non-default port it also deletes that instance's per-port files (deployment copies, pids, chain log).
if (process.argv[2]) {
  if (!/^\d+$/.test(process.argv[2])) { console.error("usage: npm run stop [-- <rpc port>]"); process.exit(1); }
  process.env.RPC_PORT = process.argv[2];
}
const { CHAIN_PORT, cleanupInstanceFiles, hardhatNodePids, killGroup, readPids, writePid } = await import("./common.js");

console.log(`Stopping the Paprika instance on chain port ${CHAIN_PORT} ...`);
let stopped = 0;
for (const [name, pid] of Object.entries(readPids())) {
  const ok = killGroup(pid);
  console.log(`${ok ? "Stopped" : "Already gone"}: ${name} (pid ${pid})`);
  stopped += ok ? 1 : 0;
  writePid(name, null);
}
for (const pid of hardhatNodePids(CHAIN_PORT)) {
  try { process.kill(pid, "SIGTERM"); console.log(`Stopped a leftover Hardhat node on port ${CHAIN_PORT} (pid ${pid}).`); stopped++; } catch { /* gone */ }
}
for (const f of cleanupInstanceFiles()) console.log(`Removed ${f}`);
if (!stopped) console.log("Nothing was running for this port.");
