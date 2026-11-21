// `npm run deploy`: deploys UMA's Optimistic Oracle V3 stack (real UMA contracts + UMA's mock oracle), UMA's test
// token and Paprika on the running local node, mints test tokens to the role accounts, writes
// ../contract/deployments/local.json and copies it to app/web/deployment.json for the browser.
// The work is done by ../contract/scripts/deploy-local.js; this wrapper sets demo defaults and copies the file.
//
// Parameters (environment variables, defaults chosen for a live demo; token amounts in whole tokens):
//   BOND=100            photo deposit = accusation bond (must be >= UMA's minimum bond = 2 x FINAL_FEE)
//   FINAL_FEE=50        UMA Store final fee for the token
//   PHOTO_WINDOW=3600   seconds during which a photo can be accused (1 hour; advance time in the demo)
//   REVEAL_WINDOW=600   seconds between commit and reveal (10 minutes)
//   LIVENESS=7200       seconds, passed to UMA (every accusation is disputed at once, so it never runs out)
//   MINT=10000          test tokens minted to each of the first 5 Hardhat accounts
import fs from "node:fs";
import path from "node:path";
import { CONTRACT_DIR, DEPLOYMENT_FILE, HARDHAT_BIN, RPC_URL, WEB_DEPLOYMENT_FILE, ensureContractDeps, rpcAlive, run } from "./common.js";

const DEFAULTS = { BOND: "100", FINAL_FEE: "50", PHOTO_WINDOW: "3600", REVEAL_WINDOW: "600", LIVENESS: "7200", MINT: "10000" };

export async function deploy() {
  if (!(await rpcAlive())) throw new Error(`no node at ${RPC_URL}: start it with \`npm run chain\``);
  await ensureContractDeps();
  const env = { ...process.env };
  for (const [k, v] of Object.entries(DEFAULTS)) if (!env[k]) env[k] = v;
  console.log(`Deploying: BOND=${env.BOND} FINAL_FEE=${env.FINAL_FEE} PHOTO_WINDOW=${env.PHOTO_WINDOW}s REVEAL_WINDOW=${env.REVEAL_WINDOW}s LIVENESS=${env.LIVENESS}s MINT=${env.MINT}`);
  await run(HARDHAT_BIN, ["run", "scripts/deploy-local.js", "--network", "localhost"], { cwd: CONTRACT_DIR, env });
  fs.mkdirSync(path.dirname(WEB_DEPLOYMENT_FILE), { recursive: true });
  fs.copyFileSync(DEPLOYMENT_FILE, WEB_DEPLOYMENT_FILE);
  console.log(`Deployment written to ${DEPLOYMENT_FILE}\n  and copied to ${WEB_DEPLOYMENT_FILE}`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  deploy().catch((e) => { console.error(`Deploy failed: ${e.message}`); process.exit(1); });
}
