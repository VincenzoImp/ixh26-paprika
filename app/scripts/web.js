// `npm run web`: starts the web UI server (app/server.js, written separately) on 127.0.0.1:5173 in the
// foreground. HOST and PORT are passed as environment variables. Ctrl-C stops it.
import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { APP_DIR, WEB_HOST, WEB_PORT, writePid } from "./common.js";

const server = path.join(APP_DIR, "server.js");
if (!fs.existsSync(server)) {
  console.error("app/server.js does not exist yet (the web UI is built separately).");
  process.exit(1);
}
const child = spawn(process.execPath, [server], { cwd: APP_DIR, stdio: "inherit", env: { ...process.env, HOST: WEB_HOST, PORT: String(WEB_PORT) } });
writePid("web", child.pid);
console.log(`Web UI: http://${WEB_HOST}:${WEB_PORT}/`);
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => { writePid("web", null); process.exit(code ?? 0); });
