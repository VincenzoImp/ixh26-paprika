/** Local in-process Hardhat chain only. */
require("@nomicfoundation/hardhat-ethers");
module.exports = {
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" } },
  networks: { hardhat: { blockGasLimit: 60_000_000 } },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
  mocha: { timeout: 120000 },
};
