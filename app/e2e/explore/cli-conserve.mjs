// Prints WETH conservation for an instance: totalSupply vs sum of known holders; plus credits and Paprika holdings.
// Usage: RPC_PORT=9145 node e2e/explore/cli-conserve.mjs [label]
import fs from "node:fs";
import { ethers } from "ethers";
import { connect, balances, credits } from "../../lib/paprika.js";
const port = Number(process.env.RPC_PORT || 8545);
const dep = JSON.parse(fs.readFileSync(new URL(`../../../contract/deployments/local${port === 8545 ? "" : "-" + port}.json`, import.meta.url)));
const ctx = connect({ rpcUrl: `http://127.0.0.1:${port}`, deployment: dep });
const b = await balances(ctx);
const t = ctx.contracts.token;
const total = await t.totalSupply();
const voters = (ctx.voters || []).map((v) => v.address || v);
const dead = "0x000000000000000000000000000000000000dEaD";
const holders = { photographer: ctx.accounts.photographer, accuser: ctx.accounts.accuser, operator: ctx.accounts.operator, store: ctx.addresses.store, paprika: ctx.addresses.paprika, oo: ctx.addresses.oo, dead, ...Object.fromEntries(voters.map((v, i) => ["voter" + (i + 1), v])) };
let sum = 0n; const out = {};
for (const [k, a] of Object.entries(holders)) { const v = await t.balanceOf(a); out[k] = ethers.formatEther(v); sum += v; }
const cP = await credits(ctx, ctx.accounts.photographer), cA = await credits(ctx, ctx.accounts.accuser);
const p = ctx.contracts.paprika;
console.log(JSON.stringify({ label: process.argv[2] || "", total: ethers.formatEther(total), sumHolders: ethers.formatEther(sum), balanced: total === sum, ...out, creditPh: ethers.formatEther(cP), creditAc: ethers.formatEther(cA) }));
