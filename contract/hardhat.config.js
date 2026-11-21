/** Local Hardhat chain. osaka => P-256 verify precompile at 0x100 (EIP-7951). `localhost` = a running `npx hardhat node`. */
require("@nomicfoundation/hardhat-ethers");

module.exports = {
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" } },
  networks: {
    // gas: stays below osaka's per-transaction cap of 2^24 (UMA's OptimisticOracleV3 deploys with about 4.1M gas)
    hardhat: { hardfork: "osaka", gas: 16_000_000 },
    // RPC_PORT / RPC_URL: run against a node on another port (e.g. a second demo instance).
    localhost: { url: process.env.RPC_URL || `http://127.0.0.1:${process.env.RPC_PORT || 8545}` },
  },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
  mocha: { timeout: 300000 },
};
