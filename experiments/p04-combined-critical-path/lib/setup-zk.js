// One-time setup: compile the (unchanged e05) circuit, write the verification key and regenerate the
// Solidity verifier. Usage: node lib/setup-zk.js   (needs `nargo` and `bb` on PATH)
const fs = require("fs");
const crypto = require("crypto");
const { execFileSync } = require("child_process");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const CIRCUIT = path.join(ROOT, "circuit");
const run = (cmd, args) => {
  const t0 = Date.now();
  execFileSync(cmd, args, { cwd: CIRCUIT, stdio: ["ignore", "pipe", "pipe"] });
  return Date.now() - t0;
};
fs.mkdirSync(path.join(ROOT, "zk"), { recursive: true });
console.log("nargo compile ms:", run("nargo", ["compile"]));
console.log("bb write_vk ms:", run("bb", ["write_vk", "-b", "target/origo.json", "-o", "../zk", "-t", "evm"]));
console.log("bb write_solidity_verifier ms:", run("bb", ["write_solidity_verifier", "-k", "../zk/vk", "-o", "../contracts/HonkVerifier.sol", "-t", "evm"]));
const sha = (f) => crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex").slice(0, 16);
console.log("HonkVerifier.sol sha256:", sha(path.join(ROOT, "contracts/HonkVerifier.sol")), "| vk sha256:", sha(path.join(ROOT, "zk/vk")));
