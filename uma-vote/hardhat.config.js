/**
 * Plain local Hardhat chain (no fork, no RPC). Hardfork "osaka" so a consumer contract can use the
 * P-256 precompile (RIP-7212 / EIP-7951 at 0x100). UMA's artifacts are compiled with solc 0.8.16
 * (no PUSH0, no MCOPY) and deploy unchanged under this hardfork.
 */
module.exports = {
  solidity: {
    version: "0.8.28",
    settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" },
  },
  networks: {
    hardhat: {
      hardfork: "osaka",
      // EIP-7825 (Osaka) caps a transaction at 2^24 gas; stay below it (OOv3 deploy is ~4M).
      gas: 16_000_000,
    },
    localhost: { url: "http://127.0.0.1:8545" },
  },
  mocha: { timeout: 120_000 },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
};
