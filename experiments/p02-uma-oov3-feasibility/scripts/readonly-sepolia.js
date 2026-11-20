// Read-only checks against live Sepolia (no transactions sent).
const { ethers } = require("ethers");
const RPC = process.argv[2] || "https://ethereum-sepolia-rpc.publicnode.com";
const OO = "0xFd9e2642a170aDD10F53Ee14a93FcF2F31924944";
const FINDER = "0xf4C48eDAd256326086AEfbd1A53e1896815F8f13";
const abi = [
  "function defaultIdentifier() view returns (bytes32)",
  "function defaultLiveness() view returns (uint64)",
  "function defaultCurrency() view returns (address)",
  "function getMinimumBond(address) view returns (uint256)",
  "function finder() view returns (address)",
  "function burnedBondPercentage() view returns (uint256)",
  "function owner() view returns (address)",
];
(async () => {
  const p = new ethers.JsonRpcProvider(RPC);
  const out = { rpc: RPC, chainId: (await p.getNetwork()).chainId.toString(), block: await p.getBlockNumber() };
  const code = await p.getCode(OO);
  out.oov3CodeBytes = (code.length - 2) / 2;
  const oo = new ethers.Contract(OO, abi, p);
  out.defaultIdentifier = await oo.defaultIdentifier();
  out.defaultIdentifierAscii = ethers.decodeBytes32String(out.defaultIdentifier);
  out.defaultLiveness = (await oo.defaultLiveness()).toString();
  out.defaultCurrency = await oo.defaultCurrency();
  out.minimumBond = (await oo.getMinimumBond(out.defaultCurrency)).toString();
  out.finder = await oo.finder();
  out.burnedBondPercentage = (await oo.burnedBondPercentage()).toString();
  out.owner = await oo.owner();
  const erc = new ethers.Contract(out.defaultCurrency, ["function symbol() view returns (string)", "function decimals() view returns (uint8)", "function name() view returns (string)"], p);
  out.currency = { name: await erc.name(), symbol: await erc.symbol(), decimals: Number(await erc.decimals()) };
  const finder = new ethers.Contract(FINDER, ["function getImplementationAddress(bytes32) view returns (address)"], p);
  out.finderOracle = await finder.getImplementationAddress(ethers.encodeBytes32String("Oracle"));
  out.finderStore = await finder.getImplementationAddress(ethers.encodeBytes32String("Store"));
  out.finderCollateralWhitelist = await finder.getImplementationAddress(ethers.encodeBytes32String("CollateralWhitelist"));
  out.finderIdentifierWhitelist = await finder.getImplementationAddress(ethers.encodeBytes32String("IdentifierWhitelist"));
  const st = new ethers.Contract(out.finderStore, ["function computeFinalFee(address) view returns (uint256)"], p);
  out.storeFinalFee = (await st.computeFinalFee(out.defaultCurrency)).toString();
  out.oracleCodeBytes = ((await p.getCode(out.finderOracle)).length - 2) / 2;
  console.log(JSON.stringify(out, null, 2));
})().catch((e) => { console.error("ERROR", e); process.exit(1); });
