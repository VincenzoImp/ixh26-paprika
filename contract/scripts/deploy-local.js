// Deploys UMA's real Optimistic Oracle V3 stack (from @uma/contracts-node, see lib/deploy-uma.js), UMA's test bond
// token (TestnetERC20) and Paprika; mints test tokens to the first 5 accounts; writes deployments/local.json with
// addresses, parameters and ABIs, so a browser app can use them without Hardhat.
//
//   npx hardhat node                                             # terminal 1 (hardfork osaka, chainId 31337)
//   npx hardhat run scripts/deploy-local.js --network localhost  # terminal 2
//
// Parameters (environment variables; defaults in brackets; token amounts in whole tokens, 18 decimals):
//   BOND [100]             photo deposit = accusation bond; must be >= UMA's minimum bond (= FINAL_FEE / 50%)
//   FINAL_FEE [50]         UMA Store final fee for the token
//   PHOTO_WINDOW [604800]  seconds during which a photo can be accused (7 days)
//   REVEAL_WINDOW [3600]   seconds allowed between commit and reveal
//   LIVENESS [7200]        seconds, passed to UMA (each accusation is disputed at once, so it never runs out)
//   MINT [10000]           test tokens minted to each of the first 5 accounts
const fs = require("fs");
const path = require("path");
const hre = require("hardhat");
const { deployUma, umaArtifact } = require("../lib/deploy-uma");

const env = (k, d) => (process.env[k] ? process.env[k] : d);

async function main() {
  const { ethers } = hre;
  const BOND = ethers.parseEther(env("BOND", "100")), FINAL_FEE = ethers.parseEther(env("FINAL_FEE", "50"));
  const PHOTO_WINDOW = BigInt(env("PHOTO_WINDOW", "604800")), REVEAL_WINDOW = BigInt(env("REVEAL_WINDOW", "3600"));
  const LIVENESS = BigInt(env("LIVENESS", "7200")), MINT = ethers.parseEther(env("MINT", "10000"));

  const uma = await deployUma(hre, { finalFee: FINAL_FEE, liveness: LIVENESS });
  const oo = await uma.oo.getAddress(), currency = await uma.currency.getAddress();
  if (BOND < uma.minimumBond) throw new Error(`BOND ${ethers.formatEther(BOND)} is below UMA's minimum bond ${ethers.formatEther(uma.minimumBond)}`);
  const pap = await (await ethers.getContractFactory("Paprika")).deploy(oo, currency, BOND, PHOTO_WINDOW, REVEAL_WINDOW, LIVENESS);
  await pap.waitForDeployment();
  const accounts = (await ethers.getSigners()).slice(0, 5);
  for (const a of accounts) await (await uma.currency.allocateTo(a.address, MINT)).wait();   // UMA's test token: anyone may mint

  const out = {
    network: hre.network.name,
    chainId: Number((await ethers.provider.getNetwork()).chainId),
    addresses: {
      paprika: await pap.getAddress(), oo, finder: await uma.finder.getAddress(), store: await uma.store.getAddress(),
      mockOracle: await uma.mockOracle.getAddress(), currency,
    },
    identifier: uma.identifier,
    parameters: {
      BOND: BOND.toString(), PHOTO_WINDOW: Number(PHOTO_WINDOW), REVEAL_WINDOW: Number(REVEAL_WINDOW), LIVENESS: Number(LIVENESS),
      finalFee: FINAL_FEE.toString(), minimumBond: uma.minimumBond.toString(), burnedBondPercentage: (await uma.oo.burnedBondPercentage()).toString(),
    },
    token: { symbol: await uma.currency.symbol(), decimals: Number(await uma.currency.decimals()), mintedTo: accounts.map((a) => a.address), mintedEach: MINT.toString() },
    abis: {
      Paprika: (await hre.artifacts.readArtifact("Paprika")).abi,
      OptimisticOracleV3: umaArtifact("OptimisticOracleV3").abi,
      MockOracleAncillary: umaArtifact("MockOracleAncillary").abi,
      TestnetERC20: umaArtifact("TestnetERC20").abi,
    },
  };
  const file = path.join(__dirname, "..", "deployments", hre.network.name === "localhost" ? "local.json" : `${hre.network.name}.json`);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(out, null, 2));
  console.log(`Paprika ${out.addresses.paprika} | oracle ${oo} | token ${currency} (${out.token.symbol}) | BOND ${ethers.formatEther(BOND)} | written ${path.relative(process.cwd(), file)}`);
}

main().catch((e) => { console.error(e); process.exitCode = 1; });
