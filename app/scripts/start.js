// `npm start`: the whole local demo in one command, for one instance (RPC_PORT, default 8545; WEB_PORT, default 5173).
//   0. refuses to start if this instance already runs (web port busy, or the chain already has this instance's
//      Paprika deployment): it never redeploys over a running demo. Stop it first with `npm run stop`.
//   1. starts the Hardhat node in the background (log: app/.state/chain[-<RPC_PORT>].log), unless a node without a
//      Paprika deployment already answers on the port (for example one started with `npm run chain`): then it uses it;
//   2. waits until the RPC answers;
//   3. deploys UMA + WETH + Paprika (scripts/deploy.js) and writes the deployment JSON this instance serves;
//   4. starts the web UI server (app/server.js) if it exists, and prints the URL.
// If the web server exits, it is restarted (up to 3 times): the chain and the demo state survive. If the chain
// exits, everything stops: the chain lives in memory, so its state is lost and a new `npm start` is needed.
// Ctrl-C stops everything this script started (and, on a non-default port, removes that instance's per-port files).
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import {
  APP_DIR, CHAIN_HOST, CHAIN_PORT, CONTRACT_DIR, HARDHAT_BIN, RPC_URL, STATE_DIR, WEB_HOST, WEB_PORT,
  SUFFIX, cleanupInstanceFiles, ensureContractDeps, serverEnv, killGroup, liveDeployment, portBusy, rpcAlive,
  waitForRpc, writePid,
} from "./common.js";
import { deploy } from "./deploy.js";

const URL_WEB = `http://${WEB_HOST}:${WEB_PORT}/`;
const STOP_HINT = CHAIN_PORT === 8545 ? "npm run stop" : `npm run stop -- ${CHAIN_PORT}`;
const children = [];
let stopping = false;
let ownChain = false;

function stopAll(code = 0) {
  if (stopping) return;
  stopping = true;
  for (const { name, child } of children) {
    killGroup(child.pid);
    writePid(name, null);
  }
  if (ownChain) cleanupInstanceFiles();   // only files of a chain this script started (and is now gone)
  console.log("\nStopped.");
  process.exit(code);
}
process.on("SIGINT", () => stopAll(0));
process.on("SIGTERM", () => stopAll(0));

// detached: own process group, so Ctrl-C reaches only this script, which then stops the children cleanly.
// onExit(code, signal) decides what happens when the child ends.
function background(name, cmd, args, opts, onExit) {
  const child = spawn(cmd, args, { detached: true, ...opts });
  const entry = { name, child };
  children.push(entry);
  writePid(name, child.pid);
  child.on("exit", (code, signal) => {
    children.splice(children.indexOf(entry), 1);
    if (!stopping) onExit(code, signal);
  });
  return child;
}

function onChainExit(code, signal) {
  if (code === 0 || code === null) {
    console.log(`The chain was stopped${signal ? ` (${signal})` : ""}; stopping the web server too.`);
    return stopAll(0);
  }
  console.error(`The Hardhat node CRASHED (exit code ${code}); see app/.state/chain${SUFFIX}.log.`);
  console.error("The chain lived in memory: all demo state is lost. Run `npm start` again for a fresh chain.");
  stopAll(1);
}

let webRestarts = 0;
function startWeb() {
  background("web", process.execPath, ["server.js"], { cwd: APP_DIR, stdio: "inherit", env: serverEnv() }, (code, signal) => {
    // The web server holds no state: restart it and keep the chain (and the demo) alive.
    if (webRestarts < 3) {
      webRestarts++;
      console.error(`The web server exited (${signal || `code ${code}`}); restarting it (${webRestarts}/3). The chain is untouched.`);
      setTimeout(startWeb, 500);
    } else {
      console.error(`The web server exited again; not restarting. The chain still runs on ${RPC_URL}: use \`npm run web\`, or Ctrl-C to stop.`);
    }
  });
}

try {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  // 0. Never redeploy over a running instance.
  const live = (await rpcAlive()) ? await liveDeployment() : null;
  if (live) {
    console.error(`Paprika is already running at ${URL_WEB} (chain ${RPC_URL}, Paprika ${live.addresses.paprika}).`);
    console.error(`Open that page, or use \`${STOP_HINT}\` first. Nothing was changed.`);
    process.exit(1);
  }
  if (await portBusy(WEB_PORT, WEB_HOST === "0.0.0.0" ? "127.0.0.1" : WEB_HOST)) {
    console.error(`The web port ${WEB_PORT} is already in use (another Paprika instance or another program).`);
    console.error(`Choose another one (WEB_PORT=...) or stop the program that uses it. Nothing was changed.`);
    process.exit(1);
  }
  if (!["127.0.0.1", "localhost", "::1"].includes(WEB_HOST)) {
    console.warn(`WARNING: HOST=${WEB_HOST}: the page and its /rpc relay (unlocked Hardhat accounts) are reachable from other machines.`);
  }
  if (await rpcAlive()) {
    console.log(`A node without a Paprika deployment answers on ${RPC_URL}: deploying on it.`);
  } else {
    await ensureContractDeps();
    const log = fs.openSync(path.join(STATE_DIR, `chain${SUFFIX}.log`), "w");
    background("chain", HARDHAT_BIN, ["node", "--hostname", CHAIN_HOST, "--port", String(CHAIN_PORT)],
      { cwd: CONTRACT_DIR, stdio: ["ignore", log, log] }, onChainExit);
    ownChain = true;
    console.log(`Starting the Hardhat node on ${RPC_URL} (log: app/.state/chain${SUFFIX}.log) ...`);
    if (!(await waitForRpc(90000))) throw new Error("the node did not answer within 90 s");
  }
  await deploy();
  if (fs.existsSync(path.join(APP_DIR, "server.js"))) {
    startWeb();
    console.log(`\nPaprika is running: ${URL_WEB}   (chain: ${RPC_URL})\nPress Ctrl-C to stop (or \`${STOP_HINT}\` from another terminal).`);
  } else {
    console.log(`\napp/server.js not found: chain and contracts are up (${RPC_URL}); the web UI is not started.\nTry \`node cli.js demo\`. Press Ctrl-C to stop.`);
  }
} catch (e) {
  console.error(`Start failed: ${e.message}`);
  stopAll(1);
}
