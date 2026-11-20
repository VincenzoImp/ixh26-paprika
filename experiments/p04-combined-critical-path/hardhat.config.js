/** Local in-process Hardhat chain only. osaka => P-256 verify precompile at 0x100 (EIP-7951). */
module.exports = {
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 1 }, viaIR: false, evmVersion: "cancun" } },
  networks: { hardhat: { hardfork: "osaka", allowUnlimitedContractSize: true, blockGasLimit: 60_000_000 } },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
  mocha: { timeout: 600000 },
};
