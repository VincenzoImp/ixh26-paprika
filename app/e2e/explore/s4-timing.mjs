// Staging-2 exploration 4: timing boundaries (refund one second before / at refundableAt, reveal at the reveal
// deadline), reload in the middle of a vote, tab switches during a vote, revoke with an open accusation and a
// pending refund. Needs a running instance (RPC_PORT / WEB_PORT, default 8945 / 5573).
import fs from "node:fs";
import { connectLib, newBrowser, newPage, helpers, money, conservation, lib, note, notes, SHOTS } from "./harness.mjs";

const ctx = await connectLib();
const browser = await newBrowser();
const page = await newPage(browser);
const H = helpers(page);
const { t, text, click, open, shot, state } = H;
const expect = (name, ok, detail = "") => { note(ok ? "ok" : "FAIL", `${name}${ok ? "" : " -- " + detail}`); return ok; };
const latest = async () => (await lib.chainInfo(ctx)).timestamp;
async function mineAt(ts) { await ctx.provider.send("evm_setNextBlockTimestamp", [ts]); await ctx.provider.send("evm_mine", []); }
const poll = () => page.waitForTimeout(3600);   // the page polls every 3 s
async function attest() {
  await t("tab-photographer").click();
  await click("btn-sample-image");
  const r = await click("btn-attest"); if (r) throw new Error(r);
  return (await state()).attested;
}
const rowRefund = (h) => page.locator(`[data-testid="deposit-row"][data-photo-hash="${h}"] [data-testid="btn-refund"]`);

await open();
let r = await click("btn-register"); expect("register", !r, r);

// --- refund boundary
const P = await attest();
const rec = (await lib.verifyPhoto(ctx, P.photoHash))[0];
await mineAt(rec.refundableAt - 2);
await poll();
expect("refund disabled when the next block is 1 s before refundableAt", !(await rowRefund(P.photoHash).isEnabled()), `latest=${await latest()} refundableAt=${rec.refundableAt}`);
let threw = ""; try { await lib.refund(ctx, "photographer", P); } catch (e) { threw = e.message; }
note("obs", `lib refund one second early: ${threw}`);
await mineAt(rec.refundableAt - 1);
await poll();
expect("refund enabled when the next block reaches refundableAt", await rowRefund(P.photoHash).isEnabled());
r = await click(rowRefund(P.photoHash)); expect("refund at exactly refundableAt", !r, r);
const rcp = await ctx.provider.getBlock("latest");
note("obs", `refund mined at ${rcp.timestamp} (refundableAt ${rec.refundableAt}); state ${(await lib.verifyPhoto(ctx, P.photoHash))[0].state}`);

// --- reveal at the reveal deadline
const Q = await attest();
await t("tab-accuser").click();
if (await t("btn-accuse-new").isEnabled()) await click("btn-accuse-new");
await t("select-accuse-photo").selectOption(`${Q.photoHash}|${Q.keyId}`);
r = await click("btn-commit"); expect("commit Q", !r, r);
const committedAt = (await state()).acc.committedAt;
await mineAt(committedAt + ctx.params.revealWindow);   // latest block = deadline: the reveal would be mined after it
await poll();
const en = await t("btn-reveal").isEnabled();
const dl = await text("reveal-deadline");
note("obs", `at the deadline block: reveal enabled=${en}; deadline text="${dl}"`);
await shot("s4-01-reveal-at-deadline");
r = await click("btn-reveal");
note("obs", `reveal clicked at deadline: ${r}`);
expect("reveal not offered when it can only fail ('too late')", !en || !r, `enabled=${en}, result=${r}`);
await shot("s4-02-reveal-too-late");
note("obs", `after too-late: commit-status="${await text("commit-status")}" new=${await t("btn-accuse-new").isEnabled()} reveal=${await t("btn-reveal").isEnabled()}`);

// --- reload in the middle of a vote, tab switch during a vote
const V = await attest();
await t("tab-accuser").click();
if (await t("btn-accuse-new").isEnabled()) await click("btn-accuse-new");
await t("select-accuse-photo").selectOption(`${V.photoHash}|${V.keyId}`);
r = await click("btn-commit"); expect("commit V", !r, r);
r = await click("btn-reveal"); expect("reveal V", !r, r);
await t("btn-vote-not-fake").click();
await page.waitForTimeout(250);
await t("tab-photographer").click();     // tab switch during the vote
note("obs", `during vote on Photographer tab: busy="${await text("busy-indicator")}" visible=${await t("busy-indicator").isVisible()} sample enabled=${await t("btn-sample-image").isEnabled()} generate-key enabled=${await t("btn-generate-key").isEnabled()} choose-file=${await t("btn-choose-file").isEnabled()} start-camera=${await t("btn-start-camera").isEnabled()}`);
await page.reload();                      // reload mid-vote
await page.waitForTimeout(800); await H.idle();
await t("tab-accuser").click();
const midState = (await lib.verifyPhoto(ctx, V.photoHash))[0].state;
note("obs", `after reload mid-vote: chain V=${midState}; vote buttons enabled=${await t("btn-vote-not-fake").isEnabled()}; phases=${await text("vote-phases")}`);
await shot("s4-03-reload-mid-vote");
if (await t("btn-vote-not-fake").isEnabled()) {
  r = await click("btn-vote-not-fake");
  note("obs", `vote again after reload: ${r || "ok"}; chain V=${(await lib.verifyPhoto(ctx, V.photoHash))[0].state}`);
  await shot("s4-04-vote-again");
}
// a stuck accusation: try to finish it from the CLI library
if ((await lib.verifyPhoto(ctx, V.photoHash))[0].state === "accused") {
  const open1 = (await lib.listAccusations(ctx)).find((a) => a.open);
  try { await lib.umaVote(ctx, open1.assertionId, false); note("obs", "lib vote finished the stuck accusation"); } catch (e) { note("obs", `lib vote on stuck accusation: ${e.message}`); }
}

// --- revoke with an open accusation and a pending refund
const R1 = await attest(), R2 = await attest();
await t("tab-accuser").click();
if (await t("btn-accuse-new").isEnabled()) await click("btn-accuse-new");
await t("select-accuse-photo").selectOption(`${R1.photoHash}|${R1.keyId}`);
await click("btn-commit"); await click("btn-reveal");
await t("tab-photographer").click();
note("obs", `revoke enabled during open accusation: ${await t("btn-revoke").isEnabled()}`);
r = await click("btn-revoke"); note("obs", `revoke with open accusation: ${r || "ok"}`);
await t("tab-accuser").click();
r = await click("btn-vote-fake"); note("obs", `vote YES after revoke: ${r || "ok"}`);
const dv = await ctx.contracts.paprika.devices(R1.keyId);
note("obs", `device after revoke then fake proven: status=${dv.status ?? dv[1]} reason=${dv.reason ?? dv[2]}`);
note("obs", `settle: ${await text("settle-accuser")} / ${await text("settle-depositor")} / ${await text("settle-check")}`);
await t("tab-verifier").click();
const f2 = await page.evaluate((h) => Array.from(window.paprikaState.files.get(h).bytes), R2.photoHash);
const { tmpFile } = await import("./harness.mjs");
await t("input-verify-file").setInputFiles(tmpFile("r2.jpg", Buffer.from(f2))); await page.waitForTimeout(150); await H.idle();
note("obs", `verify R2 (revoked key, other photo fake): ${await t("verify-status").getAttribute("data-state")} / ${await text("verify-title")} / ${await text("verify-detail")}`);
await shot("s4-05-revoked-plus-fake");
await t("tab-photographer").click();
r = await click("btn-advance-time"); note("obs", `advance: ${r || "ok"}`);
r = await click(rowRefund(R2.photoHash)); note("obs", `refund R2 of revoked key: ${r || "ok"}`);
const c = await conservation(ctx); expect("conservation", c.ok, `${c.supply} vs ${c.sum}`);
note("obs", `console: ${JSON.stringify(page.qa.console.slice(0, 6))}`);
fs.writeFileSync(`${SHOTS}/s4-notes.json`, JSON.stringify(notes, null, 1));
await browser.close();
