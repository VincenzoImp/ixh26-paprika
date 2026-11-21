/**
 * Deploy UMA's real Optimistic Oracle V3 stack WITH UMA's real DVM (VotingV2) on the current Hardhat network,
 * straight from the compiled artifacts of the npm package @uma/contracts-node (ABI + bytecode, compiled by UMA
 * with solc 0.8.16). No UMA source is compiled. Disputes are decided by UMA's own voting contract.
 *
 * Deploys: Finder, Store, whitelists, Registry, VotingToken (the UMA token), FixedSlashSlashingLibrary, VotingV2
 *   (the DVM, registered as "Oracle"), the bond currency, OptimisticOracleV3; mints and stakes voting tokens for the
 *   demo voters and registers OOv3 in the Registry. Copied from uma-vote/lib/deploy-uma-dvm.js.
 * Constructor arguments follow UMA's own hardhat-deploy scripts (packages/core/deploy/003, 004, 052, 053, 057);
 * the deviations are listed next to each step and in README.md.
 *
 * Works with or without @nomicfoundation/hardhat-ethers (falls back to plain ethers v6 over hre.network.provider).
 */
const path = require("path");
const { ethers } = require("ethers");

const UMA_ARTIFACTS = path.join(
  path.dirname(require.resolve("@uma/contracts-node/package.json")),
  "dist/packages/core/artifacts/contracts"
);
const DVM = "data-verification-mechanism/implementation";
const ARTIFACT_PATHS = {
  Finder: `${DVM}/Finder.sol/Finder.json`,
  Store: `${DVM}/Store.sol/Store.json`,
  AddressWhitelist: "common/implementation/AddressWhitelist.sol/AddressWhitelist.json",
  IdentifierWhitelist: `${DVM}/IdentifierWhitelist.sol/IdentifierWhitelist.json`,
  Registry: `${DVM}/Registry.sol/Registry.json`,
  VotingToken: `${DVM}/VotingToken.sol/VotingToken.json`,
  FixedSlashSlashingLibrary: `${DVM}/FixedSlashSlashingLibrary.sol/FixedSlashSlashingLibrary.json`,
  VotingV2: `${DVM}/VotingV2.sol/VotingV2.json`,
  TestnetERC20: "common/implementation/TestnetERC20.sol/TestnetERC20.json",
  WETH9: "financial-templates/common/WETH9.sol/WETH9.json",
  OptimisticOracleV3: "optimistic-oracle-v3/implementation/OptimisticOracleV3.sol/OptimisticOracleV3.json",
};
const umaArtifact = (name) => require(path.join(UMA_ARTIFACTS, ARTIFACT_PATHS[name]));

// Finder keys, from UMA's OracleInterfaces (data-verification-mechanism/implementation/Constants.sol).
const KEYS = Object.fromEntries(
  ["Oracle", "Registry", "Store", "IdentifierWhitelist", "CollateralWhitelist", "OptimisticOracleV3"].map((k) => [
    k,
    ethers.encodeBytes32String(k),
  ])
);
// Role ids of UMA's MultiRole contracts (enum order in the sources).
const ROLES = {
  VotingToken: { Owner: 0, Minter: 1, Burner: 2 }, // ExpandedERC20.Roles
  Registry: { Owner: 0, ContractCreator: 1 }, // Registry.Roles
};

async function getProviderAndSigners(hre) {
  if (hre.ethers) {
    const signers = await hre.ethers.getSigners();
    return { provider: hre.ethers.provider, signers };
  }
  // cacheTimeout -1: ethers v6 otherwise caches identical RPC requests (eth_estimateGas, eth_blockNumber, ...) for
  // 250 ms. With jumps in chain time that is wrong: a settleAssertion estimate that reverted ("Current voting round
  // not ended") just before a time jump was replayed from the cache right after it.
  const provider = new ethers.BrowserProvider(hre.network.provider, undefined, { cacheTimeout: -1 });
  provider.pollingInterval = 50;
  const addrs = await provider.send("eth_accounts", []);
  return { provider, signers: await Promise.all(addrs.map((a) => provider.getSigner(a))) };
}

/**
 * @param hre Hardhat runtime environment.
 * @param opts.finalFee      Store final fee of the bond currency (base units). OOv3 minimum bond = 2 x finalFee.
 * @param opts.liveness      OOv3 default liveness in seconds (default 7200, UMA sandbox).
 * @param opts.phaseLength   DVM commit = reveal phase length in seconds; a round is 2 x phaseLength (mainnet 86400).
 * @param opts.voters        array of signers (or addresses known to the node) acting as UMA token holders.
 *                           Default: accounts 1..3 of the node.
 * @param opts.stakePerVoter voting tokens minted to and staked by each voter (default 1,000,000e18).
 * @param opts.currency      undefined | "TestnetERC20" (deploy UMA's TestnetERC20) | "WETH9" (deploy UMA's WETH9)
 *                           | address of an existing ERC-20. It is whitelisted and gets the final fee.
 * @param opts.gat           GAT, absolute number of tokens that must reveal (strictly more). Default: half of
 *                           the total stake, i.e. reachable by a majority of equal-stake voters but not by one of 3.
 * @param opts.spat          SPAT (1e18 = 100%), share of the cumulative stake that must vote for the winning
 *                           answer (strictly more). Default 0.5e18 (UMA mainnet value).
 * @param opts.emissionRate  UMA staking rewards per second (default 0: keeps balances easy to read; mainnet 0.18e18).
 * @param opts.unstakeCoolDown seconds (default 7 days, mainnet value).
 * @param opts.maxRolls      VotingV2.maxRolls (uint32): how many voting rounds an unresolved request may roll before
 *                           the DVM deletes it (deleted when rollCount > maxRolls). rollCount grows by the number of
 *                           rounds that passed without a resolution, so a jump of the local clock by N rounds counts
 *                           as N rolls. Default MAX_UINT32 (4,294,967,295): never deleted in a demo (a jump of 7 days
 *                           with 60 s phases is ~5,000 rounds). UMA mainnet uses 4.
 * @param opts.baseSlashAmount FixedSlashSlashingLibrary slash per missed/wrong vote (default 0.001e18 = 0.1%, mainnet).
 * @returns {Promise<object>} all contracts (ethers v6, connected to the deployer) + parameters + per-step gas.
 */
async function deployUmaWithVoting(
  hre,
  {
    finalFee,
    liveness = 7200,
    phaseLength = 86400,
    voters,
    stakePerVoter = ethers.parseEther("1000000"),
    currency,
    gat,
    spat = ethers.parseEther("0.5"),
    emissionRate = 0n,
    unstakeCoolDown = 7 * 24 * 3600,
    maxRolls = 4294967295,
    maxRequestsPerRound = 1000,
    baseSlashAmount = ethers.parseEther("0.001"),
    governanceSlashAmount = 0n,
    identifier,
  } = {}
) {
  if (finalFee === undefined) throw new Error("deployUmaWithVoting: finalFee is required");
  const { provider, signers } = await getProviderAndSigners(hre);
  const deployer = signers[0];
  voters = voters || signers.slice(1, 4);
  voters = await Promise.all(voters.map((v) => (typeof v === "string" ? provider.getSigner(v) : v)));
  const voterAddrs = await Promise.all(voters.map((v) => v.getAddress()));
  const totalStake = BigInt(stakePerVoter) * BigInt(voters.length);
  gat = gat === undefined ? totalStake / 2n : BigInt(gat);
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

  // ---- 1-4. Oracle plumbing ----
  // Finder: name -> implementation address registry that every UMA contract reads.
  const finder = await deploy("Finder");
  // Store: holds final fees (OOv3 burns half the loser's bond into it). No regular fees, timer 0 = block time.
  const store = await deploy("Store", { rawValue: 0 }, { rawValue: 0 }, ethers.ZeroAddress);
  // AddressWhitelist, registered as "CollateralWhitelist": accepted bond currencies.
  const addressWhitelist = await deploy("AddressWhitelist");
  // IdentifierWhitelist: VotingV2._requestPrice reverts with "Unsupported identifier" if ASSERT_TRUTH is missing.
  const identifierWhitelist = await deploy("IdentifierWhitelist");

  // ---- 5. Registry (NEW) ----
  // VotingV2.requestPrice/getPrice/hasPrice are onlyRegisteredContract: the caller (OOv3) must be registered here.
  const registry = await deploy("Registry");

  // ---- 6. VotingToken (NEW): the UMA token. ExpandedERC20 "UMA Voting Token v1"/"UMA", 18 decimals. ----
  const votingToken = await deploy("VotingToken");

  // ---- 7. Bond currency ----
  let currencyContract;
  let currencyKind;
  if (!currency || currency === "TestnetERC20") {
    currencyKind = "TestnetERC20";
    currencyContract = await deploy("TestnetERC20", "Default Bond Token", "DBT", 18);
  } else if (currency === "WETH9") {
    // UMA ships WETH9 (financial-templates/common/WETH9.sol): deposit ETH -> WETH, standard ERC-20 otherwise.
    currencyKind = "WETH9";
    currencyContract = await deploy("WETH9");
  } else {
    currencyKind = "external";
    currencyContract = new ethers.Contract(currency, umaArtifact("TestnetERC20").abi, deployer);
  }
  const currencyAddr = await currencyContract.getAddress();

  // ---- 8. Finder entries needed BEFORE VotingV2 / OOv3 exist ----
  await send("Finder.set Store", finder.changeImplementationAddress(KEYS.Store, await store.getAddress()));
  await send("Finder.set CollateralWhitelist", finder.changeImplementationAddress(KEYS.CollateralWhitelist, await addressWhitelist.getAddress()));
  await send("Finder.set IdentifierWhitelist", finder.changeImplementationAddress(KEYS.IdentifierWhitelist, await identifierWhitelist.getAddress()));
  await send("Finder.set Registry", finder.changeImplementationAddress(KEYS.Registry, await registry.getAddress()));

  // ---- 9. Whitelists + final fee (before OOv3: its constructor caches them via syncUmaParams) ----
  await send("AddressWhitelist.addToWhitelist", addressWhitelist.addToWhitelist(currencyAddr));
  await send("IdentifierWhitelist.addSupportedIdentifier", identifierWhitelist.addSupportedIdentifier(id));
  await send("Store.setFinalFee", store.setFinalFee(currencyAddr, { rawValue: finalFee }));

  // ---- 10. Mint voting tokens to the voters (NEW) ----
  // Must happen BEFORE VotingV2 is deployed: its constructor calls setGatAndSpat, which requires
  // 0 < gat < votingToken.totalSupply(). (UMA's script mints gat+1 to the deployer and burns them after.)
  // The deployer becomes Minter (role 1); it is kept as minter so the demo can mint more later.
  await send("VotingToken.addMember(Minter, deployer)", votingToken.addMember(ROLES.VotingToken.Minter, await deployer.getAddress()));
  for (let i = 0; i < voters.length; i++) {
    await send(`VotingToken.mint voter${i}`, votingToken.mint(voterAddrs[i], stakePerVoter));
  }
  if (!(gat > 0n && gat < (await votingToken.totalSupply()))) throw new Error("gat must be > 0 and < total supply");

  // ---- 11. Slashing library (NEW) ----
  // FixedSlashSlashingLibrary(baseSlashAmount, governanceSlashAmount): fraction of stake moved from voters who did
  // not vote / voted wrong to voters who voted right. Required constructor argument of VotingV2.
  const slashingLibrary = await deploy("FixedSlashSlashingLibrary", baseSlashAmount, governanceSlashAmount);

  // ---- 12. VotingV2 (NEW): the real DVM ----
  // (emissionRate, unstakeCoolDown, phaseLength, maxRolls, maxRequestsPerRound, gat, spat, votingToken, finder,
  //  slashingLibrary, previousVotingContract = 0: no V1 to fall back to). Uses block.timestamp (not a Timer).
  const voting = await deploy(
    "VotingV2",
    emissionRate,
    unstakeCoolDown,
    phaseLength,
    maxRolls,
    maxRequestsPerRound,
    gat,
    spat,
    await votingToken.getAddress(),
    await finder.getAddress(),
    await slashingLibrary.getAddress(),
    ethers.ZeroAddress
  );
  const votingAddr = await voting.getAddress();
  // VotingV2 mints staking rewards (withdrawRewards) -> it needs the Minter role, as on mainnet.
  await send("VotingToken.addMember(Minter, VotingV2)", votingToken.addMember(ROLES.VotingToken.Minter, votingAddr));
  // "Oracle" in the Finder = VotingV2. OOv3 caches this address at construction (cachedOracle).
  await send("Finder.set Oracle (VotingV2)", finder.changeImplementationAddress(KEYS.Oracle, votingAddr));

  // ---- 13. OOv3 ----
  const oo = await deploy("OptimisticOracleV3", await finder.getAddress(), currencyAddr, liveness);
  const ooAddr = await oo.getAddress();
  await send("Finder.set OptimisticOracleV3", finder.changeImplementationAddress(KEYS.OptimisticOracleV3, ooAddr));
  if (id !== (await oo.defaultIdentifier())) await send("OOv3.syncUmaParams", oo.syncUmaParams(id, currencyAddr));

  // ---- 14. Register OOv3 in the Registry (NEW) ----
  // registerContract is restricted to ContractCreator (role 1). On mainnet that role is held by governance; here
  // the deployer grants it to itself, registers OOv3 (no parties), and keeps it.
  await send("Registry.addMember(ContractCreator, deployer)", registry.addMember(ROLES.Registry.ContractCreator, await deployer.getAddress()));
  await send("Registry.registerContract(OOv3)", registry.registerContract([], ooAddr));

  // ---- 15. Each voter approves and stakes (NEW) ----
  // Only staked tokens vote in VotingV2 (stake = voting weight). cumulativeStake feeds the SPAT threshold.
  const votingAbi = umaArtifact("VotingV2").abi;
  for (let i = 0; i < voters.length; i++) {
    await send(`voter${i} VotingToken.approve`, votingToken.connect(voters[i]).approve(votingAddr, stakePerVoter));
    await send(`voter${i} VotingV2.stake`, new ethers.Contract(votingAddr, votingAbi, voters[i]).stake(stakePerVoter));
  }

  const minimumBond = await oo.getMinimumBond(currencyAddr);
  return {
    oo, finder, store, addressWhitelist, identifierWhitelist, registry, votingToken, slashingLibrary, voting,
    currency: currencyContract, currencyKind, identifier: id, minimumBond, deployer, voters, voterAddrs, provider, gas,
    params: {
      finalFee: BigInt(finalFee), liveness: BigInt(liveness), phaseLength: BigInt(phaseLength),
      stakePerVoter: BigInt(stakePerVoter), totalStake, gat, spat: BigInt(spat), emissionRate: BigInt(emissionRate),
      unstakeCoolDown: BigInt(unstakeCoolDown), maxRolls: BigInt(maxRolls), maxRequestsPerRound: BigInt(maxRequestsPerRound),
      baseSlashAmount: BigInt(baseSlashAmount), governanceSlashAmount: BigInt(governanceSlashAmount),
    },
  };
}

module.exports = { deployUmaWithVoting, umaArtifact, getProviderAndSigners, KEYS, ROLES, UMA_ARTIFACTS };
