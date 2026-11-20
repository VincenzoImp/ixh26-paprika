/** Local in-process Hardhat chain only. osaka => P-256 verify precompile at 0x100 (EIP-7951). */
require("@nomicfoundation/hardhat-ethers");
const { subtask } = require("hardhat/config");
const { TASK_TEST_GET_TEST_FILES } = require("hardhat/builtin-tasks/task-names");

// Run the scenario suite before the fuzz, so the scenarios start on a fresh chain.
subtask(TASK_TEST_GET_TEST_FILES).setAction(async (args, hre, runSuper) => {
  const files = await runSuper(args);
  const rank = (f) => (f.endsWith("paprika.test.js") ? 0 : f.endsWith("paprika.fuzz.js") ? 1 : 2);
  return [...files].sort((a, b) => rank(a) - rank(b));
});

module.exports = {
  solidity: { version: "0.8.28", settings: { optimizer: { enabled: true, runs: 200 }, evmVersion: "cancun" } },
  networks: { hardhat: { hardfork: "osaka", blockGasLimit: 60_000_000 } },
  paths: { sources: "./contracts", tests: "./test", cache: "./cache", artifacts: "./artifacts" },
  mocha: { timeout: 300000 },
};
