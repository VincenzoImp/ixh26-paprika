// `npm run web`: starts the web UI server (app/server.js, written separately) on 127.0.0.1:5173 in the
// foreground. WEB_PORT, HOST and RPC_PORT are honoured. server.js gets HOST, PORT (= WEB_PORT), RPC_PORT, RPC_URL and
// DEPLOYMENT_FILE (absolute path of this instance's deployment JSON, served at /deployment.json). Ctrl-C stops it.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { APP_DIR, WEB_DEPLOYMENT_FILE, WEB_HOST, WEB_PORT, serverEnv, writePid } from "./common.js";

if (!["127.0.0.1", "localhost", "::1"].includes(WEB_HOST)) {
  console.warn(`WARNING: HOST=${WEB_HOST}: the page and its /rpc relay (unlocked Hardhat accounts) are reachable from other machines.`);
}
const server = path.join(APP_DIR, "server.js");
if (!fs.existsSync(server)) {
  console.error("app/server.js does not exist yet (the web UI is built separately).");
  process.exit(1);
}
const child = spawn(process.execPath, [server], { cwd: APP_DIR, stdio: "inherit", env: serverEnv() });
writePid("web", child.pid);
console.log(`Web UI: http://${WEB_HOST}:${WEB_PORT}/  (serving ${WEB_DEPLOYMENT_FILE} as /deployment.json)`);
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => { writePid("web", null); process.exit(code ?? 0); });
