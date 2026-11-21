// Deploys the whole Paprika system on a running local Hardhat node, from published code only:
//   UMA's Optimistic Oracle V3 + UMA's DVM (VotingV2, VotingToken, Registry, ...) from @uma/contracts-node
//   (see lib/deploy-uma-dvm.js), UMA's WETH9 as the bond currency, then Paprika.
// The voters are Hardhat accounts 3, 4, 5: each gets voting tokens (UMA token) and stakes them in VotingV2.
// Users are Hardhat's prefunded accounts #1 (Alice) and #2 (Bob), imported into MetaMask; this script gives them
// nothing (their ETH comes from Hardhat's genesis allocation). Every transaction here is signed locally with the keys of Hardhat's public test mnemonic
// (hardhat.config.js, network localhost): operator = index 0, voters = 3, 4, 5. No unlocked node account is used.
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
//   EVIDENCE_BASE_URI [http://localhost:5173/evidence]  where accusation evidence is published (fixed in Paprika)
//   MAX_ROLLS [4294967295] VotingV2.maxRolls (uint32 rounds). An unresolved vote request "rolls" to the next round;
//                          when its roll count exceeds maxRolls, VotingV2 deletes it and the assertion can never settle
//                          (both bonds stay in OOv3). The count grows by every round skipped, so jumping the local clock
//                          over an open accusation (7 days = ~5,000 rounds of 120 s) would delete it with UMA's
//                          mainnet value 4. The default is the uint32 maximum: never reached (the roll count is uint32).
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
  const MAX_ROLLS = BigInt(env("MAX_ROLLS", "4294967295"));
  if (MAX_ROLLS < 1n || MAX_ROLLS > 4294967295n) throw new Error("MAX_ROLLS must be between 1 and 4294967295 (uint32)");

  const startBlock = await ethers.provider.getBlockNumber();   // events of this deployment start after this block
  const EVIDENCE_BASE_URI = env("EVIDENCE_BASE_URI", "http://localhost:5173/evidence").replace(/\/+$/, "");
  const signers = await ethers.getSigners();
  const [operator] = signers;
  const voters = signers.slice(3, 6);
  const uma = await deployUmaWithVoting(hre, {
    finalFee: FINAL_FEE, liveness: LIVENESS, phaseLength: PHASE_LENGTH, voters, stakePerVoter: STAKE, currency: "WETH9",
    maxRolls: MAX_ROLLS,
  });
  const oo = await uma.oo.getAddress(), weth = await uma.currency.getAddress();
  if (BOND < uma.minimumBond) throw new Error(`BOND ${ethers.formatEther(BOND)} is below UMA's minimum bond ${ethers.formatEther(uma.minimumBond)}`);
  const pap = await (await ethers.getContractFactory("Paprika")).deploy(oo, weth, BOND, PHOTO_WINDOW, REVEAL_WINDOW, LIVENESS, EVIDENCE_BASE_URI);
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
    // Known accounts, for names in the app. alice (#1) and bob (#2) are Hardhat's prefunded genesis accounts that the
    // demo imports into MetaMask; they get nothing from this script. operator (#0) deployed; voters (#3-#5) vote.
    accounts: { operator: operator.address, alice: signers[1].address, bob: signers[2].address, voters: uma.voterAddrs },
    deploymentBlock: startBlock + 1,
    evidenceBaseURI: EVIDENCE_BASE_URI,
    identifier: uma.identifier,
    parameters: {
      BOND: BOND.toString(), PHOTO_WINDOW: Number(PHOTO_WINDOW), REVEAL_WINDOW: Number(REVEAL_WINDOW), LIVENESS: Number(LIVENESS),
      PHASE_LENGTH: Number(PHASE_LENGTH), finalFee: FINAL_FEE.toString(), minimumBond: uma.minimumBond.toString(),
      burnedBondPercentage: (await uma.oo.burnedBondPercentage()).toString(),
      stakePerVoter: STAKE.toString(), maxRolls: MAX_ROLLS.toString(), gat: uma.params.gat.toString(), spat: uma.params.spat.toString(),
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
