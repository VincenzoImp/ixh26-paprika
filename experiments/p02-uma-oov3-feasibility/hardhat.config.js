/** Hardhat config: in-process network forking live Sepolia (read-only RPC, keyless). */
const FORK_URL = process.env.FORK_URL || "https://ethereum-sepolia-rpc.publicnode.com";
const FORK_BLOCK = process.env.FORK_BLOCK ? Number(process.env.FORK_BLOCK) : 12177408;
module.exports = {
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" } },
  networks: {
    hardhat: {
      chainId: 11155111,
      forking: { url: FORK_URL, blockNumber: FORK_BLOCK },
      gas: 16_000_000, // EIP-7825 per-tx gas cap is enforced by the forked chain rules
    },
  },
  paths: { sources: "./contracts", cache: "./cache", artifacts: "./artifacts" },
};
