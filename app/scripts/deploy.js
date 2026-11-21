// `npm run deploy`: deploys UMA's Optimistic Oracle V3, UMA's voting system (VotingV2 + UMA voting token, voters =
// Hardhat accounts 3-5), UMA's WETH9 as the bond currency and Paprika on the running local node; writes
// ../contract/deployments/local.json and copies it to app/web/deployment.json for the browser (with RPC_PORT other
// than 8545: local-<port>.json and deployment-<port>.json). The JSON carries the RPC URL.
// The work is done by ../contract/scripts/deploy-local.js; this wrapper sets demo defaults and copies the file.
//
// Parameters (environment variables, defaults chosen for a live demo; amounts in whole WETH):
//   BOND=1              photo deposit = accusation bond (must be >= UMA's minimum bond = 2 x FINAL_FEE)
//   FINAL_FEE=0.5       UMA Store final fee for WETH
//   PHASE_LENGTH=60     seconds of each UMA voting phase (commit, reveal); one vote = 2 to 4 phases of chain time
//   PHOTO_WINDOW=3600   seconds during which a photo can be accused (1 hour; advance time in the demo)
//   REVEAL_WINDOW=900   seconds between commit and reveal (15 minutes)
//   LIVENESS=7200       seconds, passed to UMA (every accusation is disputed at once, so it never runs out)
//   STAKE=1000000       UMA voting tokens staked by each of the 3 voters
// A vote moves the chain clock by up to 4 x PHASE_LENGTH (240 s). REVEAL_WINDOW survives 3 votes on other photos
// between a commit and its reveal, PHOTO_WINDOW about 15; the accused photo's own window is extended by the contract.
import fs from "node:fs";
import path from "node:path";
import { CONTRACT_DIR, DEPLOYMENT_FILE, HARDHAT_BIN, RPC_URL, WEB_DEPLOYMENT_FILE, ensureContractDeps, rpcAlive, run } from "./common.js";

const DEFAULTS = { BOND: "1", FINAL_FEE: "0.5", PHASE_LENGTH: "60", PHOTO_WINDOW: "3600", REVEAL_WINDOW: "900", LIVENESS: "7200", STAKE: "1000000" };

export async function deploy() {
  if (!(await rpcAlive())) throw new Error(`no node at ${RPC_URL}: start it with \`npm run chain\``);
  await ensureContractDeps();
  const env = { ...process.env, RPC_URL };
  for (const [k, v] of Object.entries(DEFAULTS)) if (!env[k]) env[k] = v;
  console.log(`Deploying: BOND=${env.BOND} FINAL_FEE=${env.FINAL_FEE} PHASE_LENGTH=${env.PHASE_LENGTH}s PHOTO_WINDOW=${env.PHOTO_WINDOW}s REVEAL_WINDOW=${env.REVEAL_WINDOW}s LIVENESS=${env.LIVENESS}s STAKE=${env.STAKE} on ${RPC_URL}`);
  await run(HARDHAT_BIN, ["run", "scripts/deploy-local.js", "--network", "localhost"], { cwd: CONTRACT_DIR, env });
  fs.mkdirSync(path.dirname(WEB_DEPLOYMENT_FILE), { recursive: true });
  fs.copyFileSync(DEPLOYMENT_FILE, WEB_DEPLOYMENT_FILE);
  console.log(`Deployment written to ${DEPLOYMENT_FILE}\n  and copied to ${WEB_DEPLOYMENT_FILE} (served as /deployment.json for this instance)`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  deploy().catch((e) => { console.error(`Deploy failed: ${e.message}`); process.exit(1); });
}
