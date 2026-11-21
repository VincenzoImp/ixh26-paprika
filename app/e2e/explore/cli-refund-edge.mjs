// Refund one second before refundableAt (expect "too early") and exactly at refundableAt (expect success).
// Usage: RPC_PORT=9145 node e2e/explore/cli-refund-edge.mjs <photoHash> <keyId>
import fs from "node:fs";
import { connect, refund, verifyPhoto } from "../../lib/paprika.js";
const port = Number(process.env.RPC_PORT || 8545);
const dep = JSON.parse(fs.readFileSync(new URL(`../../../contract/deployments/local${port === 8545 ? "" : "-" + port}.json`, import.meta.url)));
const ctx = connect({ rpcUrl: `http://127.0.0.1:${port}`, deployment: dep });
const [ph, key] = process.argv.slice(2);
const rec = (await verifyPhoto(ctx, ph)).find((r) => r.keyId.toLowerCase() === key.toLowerCase());
console.log("state", rec.state, "accusableUntil", rec.accusableUntil, "refundableAt", rec.refundableAt);
const latest = Number((await ctx.provider.getBlock("latest")).timestamp);
if (latest >= rec.refundableAt - 1) { console.log("already past refundableAt-1; latest", latest); process.exit(2); }
await ctx.provider.send("evm_setNextBlockTimestamp", [rec.refundableAt - 1]);
try { await refund(ctx, "photographer", { photoHash: ph, keyId: key }); console.log("UNEXPECTED: refund at refundableAt-1 succeeded"); }
catch (e) { console.log("refund at refundableAt-1 ->", e.message); }
const b = await ctx.provider.getBlock("latest"); console.log("latest block ts", b.timestamp, "(refundableAt-1 =", rec.refundableAt - 1, ")");
await ctx.provider.send("evm_setNextBlockTimestamp", [rec.refundableAt]);
try { const r = await refund(ctx, "photographer", { photoHash: ph, keyId: key }); const rb = await ctx.provider.getTransactionReceipt(r.txHash); const blk = await ctx.provider.getBlock(rb.blockNumber); console.log("refund at", blk.timestamp, "OK; refundableAt", rec.refundableAt); }
catch (e) { console.log("refund at refundableAt ->", e.message); }
