// Deploys the whole Paprika system on a running local Hardhat node, from published code only:
//   UMA's Optimistic Oracle V3 + UMA's DVM (VotingV2, VotingToken, Registry, ...) from @uma/contracts-node
//   (see lib/deploy-uma-dvm.js), UMA's WETH9 as the bond currency, then Paprika.
// The voters are Hardhat accounts 3, 4, 5: each gets voting tokens (UMA token) and stakes them in VotingV2.
// The role accounts (operator 0, photographer 1, accuser 2) get no tokens: they hold Hardhat's test ETH and wrap it
// into WETH when they need a deposit or a bond.
// Writes deployments/local.json with addresses, parameters, accounts and the ABIs a browser needs.
//
//   npx hardhat node                                             # terminal 1 (hardfork osaka, chainId 31337)
//   npx hardhat run scripts/deploy-local.js --network localhost  # terminal 2  (RPC_PORT=8546 for another port)
//
// Parameters (environment variables; defaults in brackets; amounts in whole WETH):
//   BOND [1]               photo deposit = accusation bond; must be >= UMA's minimum bond (= FINAL_FEE / 50%)
//   FINAL_FEE [0.5]        UMA Store final fee for WETH
//   PHASE_LENGTH [60]      seconds of each DVM phase (commit, reveal); a vote takes 2 to 4 phases of chain time
//   PHOTO_WINDOW [3600]    seconds during which a photo can be accused
//   REVEAL_WINDOW [900]    seconds allowed between commit and reveal
//   LIVENESS [7200]        seconds, passed to UMA (each accusation is disputed at once, so it never runs out)
//   STAKE [1000000]        voting tokens minted to and staked by each voter
// Why these defaults: a vote moves the chain clock forward by up to 4 x PHASE_LENGTH = 240 s. REVEAL_WINDOW (900 s)
// survives three votes on other photos between a commit and its reveal; PHOTO_WINDOW (3600 s) survives about 15.
// The photo under accusation does not lose time: Paprika extends its window by the time spent under accusation.
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { deployUmaWithVoting, umaArtifact } = require("../lib/deploy-uma-dvm");

const env = (k, d) => (process.env[k] ? process.env[k] : d);

async function main() {
  const { ethers } = hre;
  const BOND = ethers.parseEther(env("BOND", "1")), FINAL_FEE = ethers.parseEther(env("FINAL_FEE", "0.5"));
  const PHOTO_WINDOW = BigInt(env("PHOTO_WINDOW", "3600")), REVEAL_WINDOW = BigInt(env("REVEAL_WINDOW", "900"));
  const LIVENESS = BigInt(env("LIVENESS", "7200")), PHASE_LENGTH = BigInt(env("PHASE_LENGTH", "60"));
  const STAKE = ethers.parseEther(env("STAKE", "1000000"));

  const signers = await ethers.getSigners();
  const [operator, photographer, accuser] = signers;
  const voters = signers.slice(3, 6);
  const uma = await deployUmaWithVoting(hre, {
    finalFee: FINAL_FEE, liveness: LIVENESS, phaseLength: PHASE_LENGTH, voters, stakePerVoter: STAKE, currency: "WETH9",
  });
  const oo = await uma.oo.getAddress(), weth = await uma.currency.getAddress();
  if (BOND < uma.minimumBond) throw new Error(`BOND ${ethers.formatEther(BOND)} is below UMA's minimum bond ${ethers.formatEther(uma.minimumBond)}`);
  const pap = await (await ethers.getContractFactory("Paprika")).deploy(oo, weth, BOND, PHOTO_WINDOW, REVEAL_WINDOW, LIVENESS);
  await pap.waitForDeployment();

  const rpcUrl = hre.network.config.url || "http://127.0.0.1:8545";
  const out = {
    network: hre.network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    rpcUrl,
    addresses: {
      paprika: await pap.getAddress(), oo, finder: await uma.finder.getAddress(), store: await uma.store.getAddress(),
      registry: await uma.registry.getAddress(), voting: await uma.voting.getAddress(),
      votingToken: await uma.votingToken.getAddress(), currency: weth, weth,
    },
    // Duplicated at top level for convenience (the browser reads them directly).
    voting: await uma.voting.getAddress(),
    votingToken: await uma.votingToken.getAddress(),
    weth,
    voters: uma.voterAddrs,
    phaseLength: Number(PHASE_LENGTH),
    accounts: { operator: operator.address, photographer: photographer.address, accuser: accuser.address },
    identifier: uma.identifier,
    parameters: {
      BOND: BOND.toString(), PHOTO_WINDOW: Number(PHOTO_WINDOW), REVEAL_WINDOW: Number(REVEAL_WINDOW), LIVENESS: Number(LIVENESS),
      PHASE_LENGTH: Number(PHASE_LENGTH), finalFee: FINAL_FEE.toString(), minimumBond: uma.minimumBond.toString(),
      burnedBondPercentage: (await uma.oo.burnedBondPercentage()).toString(),
      stakePerVoter: STAKE.toString(), gat: uma.params.gat.toString(), spat: uma.params.spat.toString(),
    },
    token: { symbol: await uma.currency.symbol(), decimals: Number(await uma.currency.decimals()) },
    abis: {
      Paprika: (await hre.artifacts.readArtifact("Paprika")).abi,
      OptimisticOracleV3: umaArtifact("OptimisticOracleV3").abi,
      VotingV2: umaArtifact("VotingV2").abi,
      WETH9: umaArtifact("WETH9").abi,
    },
  };
  // localhost on the default port -> local.json; on another port (RPC_PORT) -> local-<port>.json, so two local
  // instances (e.g. a UI test on 8545 and a CLI run on 8546) do not overwrite each other's deployment.
  const port = new URL(rpcUrl).port || "8545";
  const name = hre.network.name !== "localhost" ? hre.network.name : port === "8545" ? "local" : `local-${port}`;
  const file = path.join(__dirname, "..", "deployments", `${name}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`Paprika ${out.addresses.paprika} | OOv3 ${oo} | VotingV2 ${out.voting} | WETH ${weth} (${out.token.symbol}) | ` +
    `BOND ${ethers.formatEther(BOND)} | phase ${PHASE_LENGTH}s | voters ${uma.voterAddrs.length} | ${rpcUrl} | written ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
