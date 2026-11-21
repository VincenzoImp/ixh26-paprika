// Contract-level: refund mined at refundableAt-1 must revert "too early"; at refundableAt must succeed.
// Also: library pre-check when latest block is at refundableAt-1 (next block = refundableAt) must allow it.
import fs from "node:fs";
import { connect, refund, verifyPhoto } from "../../lib/paprika.js";
const port = Number(process.env.RPC_PORT || 8545);
const dep = JSON.parse(fs.readFileSync(new URL(`../../../contract/deployments/local${port === 8545 ? "" : "-" + port}.json`, import.meta.url)));
const ctx = connect({ rpcUrl: `http://127.0.0.1:${port}`, deployment: dep });
const [ph, key, mode] = process.argv.slice(2);
const rec = (await verifyPhoto(ctx, ph)).find((r) => r.keyId.toLowerCase() === key.toLowerCase());
console.log("refundableAt", rec.refundableAt, "accusableUntil+T_reveal", rec.accusableUntil + Number(ctx.params.revealWindow));
const p = ctx.contracts.paprika.connect(ctx.signers.photographer);
if (mode === "contract") {
  await ctx.provider.send("evm_setNextBlockTimestamp", [rec.refundableAt - 1]);
  try { const tx = await p.refund(ph, key, { gasLimit: 300000 }); const r = await tx.wait(); console.log("UNEXPECTED success at -1, status", r.status); }
  catch (e) { console.log("contract refund at refundableAt-1 ->", e.shortMessage || e.message); }
  await ctx.provider.send("evm_setNextBlockTimestamp", [rec.refundableAt]);
  const tx = await p.refund(ph, key); const r = await tx.wait(); const b = await ctx.provider.getBlock(r.blockNumber);
  console.log("contract refund at", b.timestamp, "status", r.status);
} else {
  await ctx.provider.send("evm_setNextBlockTimestamp", [rec.refundableAt - 1]); await ctx.provider.send("evm_mine", []);
  try { const r = await refund(ctx, "photographer", { photoHash: ph, keyId: key }); const rb = await ctx.provider.getTransactionReceipt(r.txHash); console.log("lib refund OK in block ts", (await ctx.provider.getBlock(rb.blockNumber)).timestamp); }
  catch (e) { console.log("lib refund with latest=refundableAt-1 ->", e.message); }
}
