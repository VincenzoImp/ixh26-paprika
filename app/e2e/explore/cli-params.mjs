// Compares the served /deployment.json params with the chain's Paprika constants.
// Usage: RPC_PORT=9245 WEB_PORT=5873 node e2e/explore/cli-params.mjs
import { ethers } from "ethers";
const web = Number(process.env.WEB_PORT), port = Number(process.env.RPC_PORT);
const dep = await (await fetch(`http://127.0.0.1:${web}/deployment.json`)).json();
const p = new ethers.Contract(dep.addresses.paprika, dep.abis?.Paprika || dep.abi?.Paprika || dep.abis?.paprika, new ethers.JsonRpcProvider(`http://127.0.0.1:${port}`));
const chain = { BOND: ethers.formatEther(await p.BOND()), PHOTO_WINDOW: String(await p.PHOTO_WINDOW()), REVEAL_WINDOW: String(await p.REVEAL_WINDOW()) };
console.log("deployment.json params:", JSON.stringify(dep.params));
console.log("chain:", JSON.stringify(chain), "rpcUrl in json:", dep.rpcUrl);
