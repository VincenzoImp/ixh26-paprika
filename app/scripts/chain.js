// `npm run chain`: starts the Hardhat node of ../contract (hardfork osaka, chainId 31337) on 127.0.0.1:RPC_PORT (default 8545)
// in the foreground. Ctrl-C stops it. The chain lives in memory: every restart begins from block 0.
import { spawn } from "node:child_process";
import { CHAIN_HOST, CHAIN_PORT, CONTRACT_DIR, HARDHAT_BIN, ensureContractDeps, rpcAlive, writePid } from "./common.js";

if (await rpcAlive()) {
  console.error(`A node already answers on ${CHAIN_HOST}:${CHAIN_PORT}. Run \`npm run stop\` first.`);
  process.exit(1);
}
await ensureContractDeps();
const child = spawn(HARDHAT_BIN, ["node", "--hostname", CHAIN_HOST, "--port", String(CHAIN_PORT)], { cwd: CONTRACT_DIR, stdio: "inherit" });
writePid("chain", child.pid);
const stop = () => child.kill("SIGTERM");
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => { writePid("chain", null); process.exit(code ?? 0); });
