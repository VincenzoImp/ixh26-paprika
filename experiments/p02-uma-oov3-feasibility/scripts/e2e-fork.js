// End-to-end UMA OOv3 lifecycle on a local Hardhat fork of Sepolia. All transactions are local only.
const hre = require("hardhat");
const { ethers } = require("ethers");
const { network } = hre;
// No hardhat-ethers plugin: wrap the in-process EIP-1193 provider with plain ethers v6.
const provider = new ethers.BrowserProvider(network.provider);
provider.pollingInterval = 50;

const OO_ADDR = "0xFd9e2642a170aDD10F53Ee14a93FcF2F31924944";
const FINDER_ADDR = "0xf4C48eDAd256326086AEfbd1A53e1896815F8f13";
const MOCK_ORACLE = "0x5FE28AEa36420414692b1C907F7d0114d304eb0C";
const USDC = "0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238";
const ORACLE_KEY = ethers.encodeBytes32String("Oracle");

const ooAbi = [
  "function assertTruthWithDefaults(bytes claim, address asserter) returns (bytes32)",
  "function disputeAssertion(bytes32 assertionId, address disputer)",
  "function settleAssertion(bytes32 assertionId)",
  "function getAssertionResult(bytes32 assertionId) view returns (bool)",
  "function getMinimumBond(address) view returns (uint256)",
  "function defaultIdentifier() view returns (bytes32)",
  "function defaultLiveness() view returns (uint64)",
  "function cachedOracle() view returns (address)",
  "function syncUmaParams(bytes32 identifier, address currency)",
  "function burnedBondPercentage() view returns (uint256)",
  "event AssertionMade(bytes32 indexed assertionId, bytes32 domainId, bytes claim, address indexed asserter, address callbackRecipient, address escalationManager, address caller, uint64 expirationTime, address currency, uint256 bond, bytes32 indexed identifier)",
  "event AssertionSettled(bytes32 indexed assertionId, address indexed bondRecipient, bool disputed, bool settlementResolution, address settleCaller)",
];
const erc20Abi = [
  "function balanceOf(address) view returns (uint256)",
  "function approve(address,uint256) returns (bool)",
  "function transfer(address,uint256) returns (bool)",
];
const finderAbi = [
  "function owner() view returns (address)",
  "function getImplementationAddress(bytes32) view returns (address)",
  "function changeImplementationAddress(bytes32,address)",
];
const mockAbi = [
  "function getPendingQueries() view returns (tuple(bytes32 identifier, uint256 time, bytes ancillaryData)[])",
  "function pushPrice(bytes32 identifier, uint256 time, bytes ancillaryData, int256 price)",
  "function finder() view returns (address)",
  "event PriceRequestAdded(address indexed requester, bytes32 indexed identifier, uint256 time, bytes ancillaryData, bytes32 indexed requestId)",
];

const log = (...a) => console.log(...a);
const fmt = (x) => ethers.formatUnits(x, 6);
const gasRows = [];
async function tx(label, p) {
  const t = await p;
  const r = await t.wait();
  gasRows.push({ label, gasUsed: r.gasUsed.toString() });
  log(`  [gas] ${label}: ${r.gasUsed}`);
  return r;
}
async function now() { return (await provider.getBlock("latest")).timestamp; }
async function warp(sec) { await network.provider.send("evm_increaseTime", [sec]); await network.provider.send("evm_mine"); }

async function setUsdcBalance(usdc, who, amount) {
  // Find the balance mapping slot by trial (FiatToken stores balance in a mapping; slot unknown a priori).
  for (let slot = 0; slot < 30; slot++) {
    const key = ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "uint256"], [who, slot]));
    const prev = await network.provider.send("eth_getStorageAt", [USDC, key, "latest"]);
    await network.provider.send("hardhat_setStorageAt", [USDC, key, ethers.toBeHex(amount, 32)]);
    if ((await usdc.balanceOf(who)) === amount) return slot;
    await network.provider.send("hardhat_setStorageAt", [USDC, key, prev]);
  }
  throw new Error("balance slot not found");
}

async function main() {
  const accts = await provider.send("eth_accounts", []);
  const [deployer, claimant, disputer, settler] = await Promise.all(accts.slice(0, 4).map((a) => provider.getSigner(a)));
  log("chainId", (await provider.getNetwork()).chainId.toString(), "fork block", (await provider.getBlockNumber()));
  const oo = new ethers.Contract(OO_ADDR, ooAbi, deployer);
  const usdc = new ethers.Contract(USDC, erc20Abi, deployer);
  const finder = new ethers.Contract(FINDER_ADDR, finderAbi, deployer);
  const mock = new ethers.Contract(MOCK_ORACLE, mockAbi, deployer);
  const ident = await oo.defaultIdentifier();
  const minBond = await oo.getMinimumBond(USDC);
  log("defaultLiveness", (await oo.defaultLiveness()).toString(), "minBond", fmt(minBond), "USDC", "cachedOracle", await oo.cachedOracle());

  const M = 1_000_000n;
  for (const s of [deployer, claimant, disputer]) {
    const slot = await setUsdcBalance(usdc, s.address, 10_000n * M);
    log(`funded ${s.address} with 10000 USDC via hardhat_setStorageAt (mapping slot ${slot})`);
  }

  // ---------- Run 1: raw OOv3, undisputed, default liveness (real code, untouched config) ----------
  log("\n=== RUN 1: raw OOv3 assertTruthWithDefaults, no dispute ===");
  const photo = ethers.keccak256(ethers.toUtf8Bytes("photo A"));
  const device = "0x000000000000000000000000000000000000dEaD";
  const claimStr = `Photo ${photo} attested by device ${device} is not a genuine camera capture`;
  await tx("USDC.approve(OO)", usdc.connect(claimant).approve(OO_ADDR, ethers.MaxUint256));
  let r = await tx("OOv3.assertTruthWithDefaults", oo.connect(claimant).assertTruthWithDefaults(ethers.toUtf8Bytes(claimStr), claimant.address));
  let ev = r.logs.map((l) => { try { return oo.interface.parseLog(l); } catch { return null; } }).find((e) => e && e.name === "AssertionMade");
  let id = ev.args.assertionId;
  log("assertionId", id, "bond", fmt(ev.args.bond), "expirationTime", ev.args.expirationTime.toString(), "now", await now());
  try { await oo.connect(settler).settleAssertion.staticCall(id); log("UNEXPECTED: settle before liveness succeeded"); }
  catch (e) { log("settle before liveness reverts as expected:", e.shortMessage || e.message); }
  let b0 = await usdc.balanceOf(claimant.address);
  await warp(7201);
  await tx("OOv3.settleAssertion", oo.connect(settler).settleAssertion(id));
  log("getAssertionResult =", await oo.getAssertionResult(id), "| claimant USDC delta", fmt((await usdc.balanceOf(claimant.address)) - b0));

  // ---------- Point the Finder's Oracle at UMA's MockOracleAncillary (fork-only, impersonating Finder owner) ----------
  log("\n=== Switch Finder 'Oracle' from VotingV2 to MockOracleAncillary (local fork only) ===");
  const fOwner = await finder.owner();
  log("Finder owner", fOwner, "| current Oracle", await finder.getImplementationAddress(ORACLE_KEY), "| mock code bytes", ((await provider.getCode(MOCK_ORACLE)).length - 2) / 2);
  await network.provider.send("hardhat_impersonateAccount", [fOwner]);
  await network.provider.send("hardhat_setBalance", [fOwner, "0x56BC75E2D63100000"]);
  const ownerSigner = new ethers.JsonRpcSigner(provider, fOwner);
  await tx("Finder.changeImplementationAddress(Oracle, Mock) [impersonated owner]", finder.connect(ownerSigner).changeImplementationAddress(ORACLE_KEY, MOCK_ORACLE));
  await tx("OOv3.syncUmaParams", oo.syncUmaParams(ident, USDC));
  log("OOv3.cachedOracle now", await oo.cachedOracle(), "| minBond after sync", fmt(await oo.getMinimumBond(USDC)));

  // ---------- Consumer contract ----------
  const BOND = 400n * M, REWARD = 100n * M, LIVENESS = 120n;
  const art = await hre.artifacts.readArtifact("BanByAssertion");
  const F = new ethers.ContractFactory(art.abi, art.bytecode, deployer);
  const ban = await F.deploy(OO_ADDR, USDC, BOND, REWARD, LIVENESS);
  const depR = await ban.deploymentTransaction().wait();
  gasRows.push({ label: "BanByAssertion deploy", gasUsed: depR.gasUsed.toString() });
  log(`\nBanByAssertion at ${await ban.getAddress()} (deploy gas ${depR.gasUsed}); bond ${fmt(BOND)} USDC, reward ${fmt(REWARD)} USDC, liveness ${LIVENESS}s`);
  await tx("USDC.transfer(reward pool 1000)", usdc.transfer(await ban.getAddress(), 1000n * M));
  await tx("claimant USDC.approve(BanByAssertion)", usdc.connect(claimant).approve(await ban.getAddress(), ethers.MaxUint256));
  await tx("disputer USDC.approve(OO)", usdc.connect(disputer).approve(OO_ADDR, ethers.MaxUint256));

  const results = [];
  async function scenario(name, deviceAddr, dispute, price) {
    log(`\n=== ${name} ===`);
    const bal = async () => ({ c: await usdc.balanceOf(claimant.address), d: await usdc.balanceOf(disputer.address), p: await usdc.balanceOf(await ban.getAddress()) });
    const before = await bal();
    const ph = ethers.keccak256(ethers.toUtf8Bytes(name));
    const t0 = await now();
    const rc = await tx(`${name}: claimFake`, ban.connect(claimant).claimFake(ph, deviceAddr));
    const e = rc.logs.map((l) => { try { return oo.interface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === "AssertionMade");
    const aid = e.args.assertionId;
    log("  claim:", ethers.toUtf8String(e.args.claim));
    log("  assertionId", aid);
    const row = { name, claimFakeGas: rc.gasUsed.toString() };
    if (dispute) {
      const rd = await tx(`${name}: disputeAssertion`, oo.connect(disputer).disputeAssertion(aid, disputer.address));
      row.disputeGas = rd.gasUsed.toString();
      const q = (await mock.getPendingQueries()).at(-1);
      log("  mock oracle pending query: identifier", ethers.decodeBytes32String(q.identifier), "time", q.time.toString(), "ancillary", ethers.toUtf8String(q.ancillaryData));
      const rp = await tx(`${name}: MockOracleAncillary.pushPrice(${price})`, mock.connect(settler).pushPrice(q.identifier, q.time, q.ancillaryData, price));
      row.pushPriceGas = rp.gasUsed.toString();
    } else {
      await warp(Number(LIVENESS) + 1);
    }
    const rs = await tx(`${name}: settleAssertion`, oo.connect(settler).settleAssertion(aid));
    row.settleGas = rs.gasUsed.toString();
    const after = await bal();
    row.result = await oo.getAssertionResult(aid);
    row.banned = await ban.banned(deviceAddr);
    row.claimantDelta = fmt(after.c - before.c);
    row.disputerDelta = fmt(after.d - before.d);
    row.poolDelta = fmt(after.p - before.p);
    row.simulatedSeconds = (await now()) - t0;
    log("  result", row.result, "| banned", row.banned, "| claimant", row.claimantDelta, "| disputer", row.disputerDelta, "| pool", row.poolDelta, "| sim seconds", row.simulatedSeconds);
    results.push(row);
  }
  await scenario("S1 undisputed", "0x1111111111111111111111111111111111111111", false);
  await scenario("S2 disputed, resolved FALSE", "0x2222222222222222222222222222222222222222", true, 0n);
  await scenario("S3 disputed, resolved TRUE", "0x3333333333333333333333333333333333333333", true, ethers.parseEther("1"));
  log("\nRESULTS_JSON " + JSON.stringify({ results, gasRows }));
}
main().catch((e) => { console.error("ERROR", e); process.exit(1); });
