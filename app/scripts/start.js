// `npm start`: the whole local demo in one command.
//   1. starts the Hardhat node in the background (log: app/.state/chain.log), unless one already answers;
//   2. waits until the RPC answers;
//   3. deploys UMA + token + Paprika (scripts/deploy.js) and copies the deployment JSON into app/web/;
//   4. starts the web UI server (app/server.js) if it exists, and prints the URL.
// Ctrl-C stops everything this script started. `npm run stop` kills leftovers.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  APP_DIR, CHAIN_HOST, CHAIN_PORT, CONTRACT_DIR, HARDHAT_BIN, RPC_URL, STATE_DIR, WEB_HOST, WEB_PORT,
  ensureContractDeps, killGroup, rpcAlive, waitForRpc, writePid,
} from "./common.js";
import { deploy } from "./deploy.js";

const children = [];
let stopping = false;
function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const { name, child } of children) {
    killGroup(child.pid);
    writePid(name, null);
  }
  console.log("\nStopped.");
  process.exit(code);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

// detached: own process group, so Ctrl-C reaches only this script, which then stops the children cleanly.
function background(name, cmd, args, opts) {
  const child = spawn(cmd, args, { detached: true, ...opts });
  children.push({ name, child });
  writePid(name, child.pid);
  child.on("exit", (code) => {
    if (!stopping) { console.error(`${name} exited (code ${code}); stopping.`); stopAll(1); }
  });
  return child;
}

try {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  if (await rpcAlive()) {
    console.log(`A node already answers on ${RPC_URL}: using it.`);
  } else {
    await ensureContractDeps();
    const log = fs.openSync(path.join(STATE_DIR, "chain.log"), "w");
    background("chain", HARDHAT_BIN, ["node", "--hostname", CHAIN_HOST, "--port", String(CHAIN_PORT)], { cwd: CONTRACT_DIR, stdio: ["ignore", log, log] });
    console.log(`Starting the Hardhat node on ${RPC_URL} (log: app/.state/chain.log) ...`);
    if (!(await waitForRpc(90000))) throw new Error("the node did not answer within 90 s");
  }
  await deploy();
  if (fs.existsSync(path.join(APP_DIR, "server.js"))) {
    background("web", process.execPath, ["server.js"], { cwd: APP_DIR, stdio: "inherit", env: { ...process.env, HOST: WEB_HOST, PORT: String(WEB_PORT) } });
    console.log(`\nPaprika is running: http://${WEB_HOST}:${WEB_PORT}/   (chain: ${RPC_URL})\nPress Ctrl-C to stop.`);
  } else {
    console.log(`\napp/server.js not found: chain and contracts are up (${RPC_URL}); the web UI is not started.\nTry \`node cli.js demo\`. Press Ctrl-C to stop.`);
  }
} catch (e) {
  console.error(`Start failed: ${e.message}`);
  stopAll(1);
}
