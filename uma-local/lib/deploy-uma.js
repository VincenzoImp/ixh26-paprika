/**
 * Deploy UMA's real Optimistic Oracle V3 stack on the current Hardhat network, straight from the compiled
 * artifacts published in the npm package @uma/contracts-node (ABI + bytecode, compiled by UMA with solc 0.8.16).
 * No UMA source is compiled here.
 *
 * Mirrors UMA's own sandbox script (UMAprotocol/dev-quickstart-oov3, script/OracleSandbox.s.sol), step by step.
 * The only UMA contract that is NOT production code is MockOracleAncillary: it stands in for the DVM vote
 * (UMA token holders) and lets anyone push the "vote result" with pushPrice().
 *
 * Works with or without @nomicfoundation/hardhat-ethers: if hre.ethers is absent, the in-process EIP-1193
 * provider is wrapped with plain ethers v6.
 */
const path = require("path");
const { ethers } = require("ethers");

// Root of the compiled UMA artifacts inside the npm package.
const UMA_ARTIFACTS = path.join(
  path.dirname(require.resolve("@uma/contracts-node/package.json")),
  "dist/packages/core/artifacts/contracts"
);
const ARTIFACT_PATHS = {
  Finder: "data-verification-mechanism/implementation/Finder.sol/Finder.json",
  Store: "data-verification-mechanism/implementation/Store.sol/Store.json",
  AddressWhitelist: "common/implementation/AddressWhitelist.sol/AddressWhitelist.json",
  IdentifierWhitelist: "data-verification-mechanism/implementation/IdentifierWhitelist.sol/IdentifierWhitelist.json",
  MockOracleAncillary: "data-verification-mechanism/test/MockOracleAncillary.sol/MockOracleAncillary.json",
  TestnetERC20: "common/implementation/TestnetERC20.sol/TestnetERC20.json",
  OptimisticOracleV3: "optimistic-oracle-v3/implementation/OptimisticOracleV3.sol/OptimisticOracleV3.json",
};

function umaArtifact(name) {
  return require(path.join(UMA_ARTIFACTS, ARTIFACT_PATHS[name]));
}

// Finder keys, copied from UMA's OracleInterfaces (data-verification-mechanism/implementation/Constants.sol).
const KEYS = {
  Oracle: ethers.encodeBytes32String("Oracle"),
  Store: ethers.encodeBytes32String("Store"),
  IdentifierWhitelist: ethers.encodeBytes32String("IdentifierWhitelist"),
  CollateralWhitelist: ethers.encodeBytes32String("CollateralWhitelist"),
  OptimisticOracleV3: ethers.encodeBytes32String("OptimisticOracleV3"),
};

async function getProviderAndSigner(hre) {
  if (hre.ethers) {
    const [signer] = await hre.ethers.getSigners();
    return { provider: hre.ethers.provider, signer };
  }
  const provider = new ethers.BrowserProvider(hre.network.provider);
  provider.pollingInterval = 50;
  const [addr] = await provider.send("eth_accounts", []);
  return { provider, signer: await provider.getSigner(addr) };
}

/**
 * @param hre Hardhat runtime environment.
 * @param opts.finalFee   UMA Store final fee for the currency, in token base units (minimum bond = 2 x finalFee).
 * @param opts.liveness   OOv3 default liveness in seconds (UMA sandbox default: 7200).
 * @param opts.identifier bytes32 identifier (default "ASSERT_TRUTH", as in UMA's sandbox).
 * @param opts.currency   existing ERC-20 address to use as bond currency; default deploys UMA's TestnetERC20.
 * @param opts.currencyDecimals decimals of the deployed TestnetERC20 (default 18, as in UMA's sandbox).
 * @returns {Promise<{oo, finder, store, mockOracle, currency, identifier, minimumBond, identifierWhitelist,
 *   addressWhitelist, deployer, provider, gas}>}  ethers v6 contracts connected to the deployer;
 *   gas = [{ step, gasUsed }] per deployment transaction.
 */
async function deployUma(hre, { finalFee, liveness = 7200, identifier, currency, currencyDecimals = 18 } = {}) {
  if (finalFee === undefined) throw new Error("deployUma: finalFee is required");
  const { provider, signer: deployer } = await getProviderAndSigner(hre);
  const id = identifier || ethers.encodeBytes32String("ASSERT_TRUTH");
  const gas = [];

  const deploy = async (name, ...args) => {
    const a = umaArtifact(name);
    const c = await new ethers.ContractFactory(a.abi, a.bytecode, deployer).deploy(...args);
    const r = await c.deploymentTransaction().wait();
    gas.push({ step: `deploy ${name}`, gasUsed: r.gasUsed });
    return c;
  };
  const send = async (step, p) => {
    const r = await (await p).wait();
    gas.push({ step, gasUsed: r.gasUsed });
    return r;
  };

  // 1. Finder: UMA's registry of interface name -> implementation address. Owner = deployer.
  const finder = await deploy("Finder");
  // 2. Store: collects oracle fees and holds the per-currency final fee. Regular fees 0, timer 0 (= block time).
  //    FixedPoint.Unsigned is a struct { uint256 rawValue }, hence the 1-tuples.
  const store = await deploy("Store", { rawValue: 0 }, { rawValue: 0 }, ethers.ZeroAddress);
  // 3. AddressWhitelist: registered as "CollateralWhitelist", the list of accepted bond currencies.
  const addressWhitelist = await deploy("AddressWhitelist");
  // 4. IdentifierWhitelist: list of price identifiers the oracle accepts.
  const identifierWhitelist = await deploy("IdentifierWhitelist");
  // 5. MockOracleAncillary (UMA's test oracle): replaces the DVM vote. Timer 0 (= block time).
  const mockOracle = await deploy("MockOracleAncillary", await finder.getAddress(), ethers.ZeroAddress);
  // 6. Bond currency: UMA's TestnetERC20 (anyone may call allocateTo(owner, amount) to mint), unless provided.
  let currencyContract;
  if (currency) {
    currencyContract = new ethers.Contract(currency, umaArtifact("TestnetERC20").abi, deployer);
  } else {
    currencyContract = await deploy("TestnetERC20", "Default Bond Token", "DBT", currencyDecimals);
  }
  const currencyAddr = await currencyContract.getAddress();

  // 7. Register the contracts in the Finder under UMA's interface names.
  await send("Finder.set Store", finder.changeImplementationAddress(KEYS.Store, await store.getAddress()));
  await send("Finder.set CollateralWhitelist", finder.changeImplementationAddress(KEYS.CollateralWhitelist, await addressWhitelist.getAddress()));
  await send("Finder.set IdentifierWhitelist", finder.changeImplementationAddress(KEYS.IdentifierWhitelist, await identifierWhitelist.getAddress()));
  await send("Finder.set Oracle (mock)", finder.changeImplementationAddress(KEYS.Oracle, await mockOracle.getAddress()));
  // 8. Whitelist currency and identifier; set the currency's final fee in the Store.
  //    Must happen BEFORE step 9: the OOv3 constructor calls syncUmaParams() and caches whitelist + final fee.
  await send("AddressWhitelist.addToWhitelist", addressWhitelist.addToWhitelist(currencyAddr));
  await send("IdentifierWhitelist.addSupportedIdentifier", identifierWhitelist.addSupportedIdentifier(id));
  await send("Store.setFinalFee", store.setFinalFee(currencyAddr, { rawValue: finalFee }));
  // 9. OptimisticOracleV3(finder, defaultCurrency, defaultLiveness), then register it in the Finder.
  //    defaultIdentifier is hard-coded to "ASSERT_TRUTH" in OOv3; burnedBondPercentage is set to 50%.
  const oo = await deploy("OptimisticOracleV3", await finder.getAddress(), currencyAddr, liveness);
  await send("Finder.set OptimisticOracleV3", finder.changeImplementationAddress(KEYS.OptimisticOracleV3, await oo.getAddress()));

  // If a non-default identifier is used, OOv3 must also cache it (it is whitelisted above).
  if (id !== (await oo.defaultIdentifier())) await send("OOv3.syncUmaParams", oo.syncUmaParams(id, currencyAddr));

  const minimumBond = await oo.getMinimumBond(currencyAddr); // = finalFee * 1e18 / burnedBondPercentage
  return {
    oo, finder, store, mockOracle, currency: currencyContract, identifier: id, minimumBond,
    identifierWhitelist, addressWhitelist, deployer, provider, gas,
  };
}

module.exports = { deployUma, umaArtifact, getProviderAndSigner, KEYS, UMA_ARTIFACTS };
