// Staging-2 exploration 2: several accusations interleaved between the web and the CLI library, a second
// accusation on a photo already under accusation (bond back), "Start a new accusation" during a live commitment,
// a second browser context continuing an accusation, and two tabs voting at once.
// Needs a running instance (RPC_PORT / WEB_PORT, default 8945 / 5573).
import fs from "node:fs";
import { connectLib, newBrowser, newPage, helpers, money, conservation, lib, note, notes, SHOTS } from "./harness.mjs";

const ctx = await connectLib();
const fmt = (v) => lib.formatToken(ctx, v);
const B = ctx.params.bond;
const browser = await newBrowser();
const page = await newPage(browser);
const H = helpers(page);
const { t, text, click, open, shot, state } = H;
const expect = (name, ok, detail = "") => { note(ok ? "ok" : "FAIL", `${name}${ok ? "" : " -- " + detail}`); return ok; };
const low = (x) => String(x || "").toLowerCase();

// Library-side accusation (as the CLI does it): commit + reveal by the accuser account.
async function libAccuse(p) {
  const c = await lib.commitAccusation(ctx, "accuser", { photoHash: p.photoHash, keyId: p.keyId, evidence: "cli evidence" });
  const r = await lib.revealAccusation(ctx, "accuser", { photoHash: p.photoHash, keyId: p.keyId, evidenceHash: c.evidenceHash, salt: c.salt });
  return r;
}
async function attest() {
  await t("tab-photographer").click();
  await click("btn-sample-image");
  const r = await click("btn-attest");
  if (r) throw new Error("attest: " + r);
  return (await state()).attested;
}
async function webCommit(p) {
  await t("tab-accuser").click();
  if (await t("btn-accuse-new").isEnabled()) await click("btn-accuse-new");
  await t("select-accuse-photo").selectOption(`${p.photoHash}|${p.keyId}`);
  return click("btn-commit");
}

await open();
let r = await click("btn-register"); expect("register", !r, r);
const X = await attest(), Y = await attest(), Z = await attest(), W = await attest();

// --- A. interleaved: web commits on Y, CLI opens an accusation on X, web reveals Y
r = await webCommit(Y); expect("web commit Y", !r, r);
const rx = await libAccuse(X);
expect("lib accusation on X opened", !/^0x0+$/.test(rx.assertionId));
await t("btn-refresh-records").click(); await H.idle();
r = await click("btn-reveal"); expect("web reveal Y", !r, r);
const sA = await state();
const onChainY = (await lib.verifyPhoto(ctx, Y.photoHash))[0].state;
expect("Y accused on chain", onChainY === "accused", onChainY);
expect("page still shows ITS accusation (Y) after the reveal", low(sA.acc?.photoHash) === low(Y.photoHash),
  `page acc photo=${sA.acc?.photoHash?.slice(0, 10)} (X=${X.photoHash.slice(0, 10)}, Y=${Y.photoHash.slice(0, 10)}) fromChain=${sA.acc?.fromChain}`);
note("obs", `after reveal Y: reveal-photo=${await text("reveal-photo")} commit-status=${await text("commit-status")}`);
await shot("s2-01-interleaved-after-reveal");
// Vote YES on whatever the page shows; check which photo got decided
r = await click("btn-vote-fake"); expect("vote (page)", !r, r);
const xs = (await lib.verifyPhoto(ctx, X.photoHash))[0].state, ys = (await lib.verifyPhoto(ctx, Y.photoHash))[0].state;
note("obs", `after the page vote YES: X=${xs}, Y=${ys}`);
expect("the page's vote decided the photo the user revealed (Y)", ys === "fake", `X=${xs} Y=${ys}`);
await shot("s2-02-interleaved-after-vote");
// the remaining open one: can the web user reach it?
await open("#accuser");
const sA2 = await state();
note("obs", `after reload: page acc photo=${sA2.acc?.photoHash?.slice(0, 10)} assertion=${sA2.acc?.assertionId?.slice(0, 10)} voted=${sA2.acc?.voted} fromChain=${sA2.acc?.fromChain}; vote enabled=${await t("btn-vote-not-fake").isEnabled()}`);
if (await t("btn-vote-not-fake").isEnabled()) { r = await click("btn-vote-not-fake"); note("obs", `voted NO on remaining: ${r}`); }
const xs2 = (await lib.verifyPhoto(ctx, X.photoHash))[0].state, ys2 = (await lib.verifyPhoto(ctx, Y.photoHash))[0].state;
note("obs", `after second vote: X=${xs2}, Y=${ys2}`);
let c = await conservation(ctx); expect("conservation A", c.ok, `${c.supply} vs ${c.sum}`);

// Device of the page key is now flagged (one fake proven): use a new key for the rest.
await t("tab-photographer").click();
await click("btn-generate-key"); r = await click("btn-register"); expect("register key 2", !r, r);
const Z2 = await attest(), V = await attest(), U = await attest();

// --- B. second accusation on a photo already under accusation: bond credited back
r = await webCommit(Z2); expect("web commit Z2", !r, r);
const before = await money(ctx);
await libAccuse(Z2);
const mid = await money(ctx);
r = await click("btn-reveal"); expect("web reveal on accused Z2 (no error)", !r, r);
const after = await money(ctx);
expect("bond credited back to accuser (+B credit)", after.cAcc - mid.cAcc === B, `credit delta ${fmt(after.cAcc - mid.cAcc)}`);
note("obs", `bond-back: reveal-status="${await text("reveal-status")}" commit-status="${await text("commit-status")}" vote panel off=${await t("accuse-panel-vote").evaluate((e) => e.classList.contains("off"))}`);
note("obs", `bond-back: delta-accuser="${await text("delta-accuser")}" header credit acc="${await text("header-credit-accuser")}" explainer="${await text("explainer-text")}"`);
note("obs", `bond-back buttons: new=${await t("btn-accuse-new").isEnabled()} vote=${await t("btn-vote-fake").isEnabled()} reveal=${await t("btn-reveal").isEnabled()}`);
await shot("s2-03-bond-back");
// The CLI accusation on Z2 is still open: what does the page show now (after refresh)?
await open("#accuser");
const sB = await state();
note("obs", `after reload with Z2 open (CLI): acc photo=${sB.acc?.photoHash?.slice(0, 10)} fromChain=${sB.acc?.fromChain} vote enabled=${await t("btn-vote-not-fake").isEnabled()}`);
r = await click("btn-vote-not-fake"); expect("vote NO on CLI accusation from web", !r, r);
note("obs", `settle for rebuilt accusation: accuser="${await text("settle-accuser")}" check="${await text("settle-check")}"`);
await shot("s2-04-rebuilt-settle");

// --- C. "Start a new accusation" during a live (unrevealed) commitment
r = await webCommit(V); expect("web commit V", !r, r);
const newEnabled = await t("btn-accuse-new").isEnabled();
note("obs", `live commitment: 'Start a new accusation' enabled=${newEnabled}`);
const paprikaBefore = (await money(ctx)).paprika;
let dialog = false; page.once("dialog", (d) => { dialog = true; d.dismiss(); });
if (newEnabled) await t("btn-accuse-new").click();
await page.waitForTimeout(300);
const sC = await state();
expect("live commitment not silently dropped (confirmation or disabled)", !newEnabled || dialog || !!sC.acc?.commitment,
  `enabled=${newEnabled}, dialog=${dialog}, acc after click=${JSON.stringify(sC.acc)?.slice(0, 80)}`);
await shot("s2-05-new-accusation-dropped-commit");
note("obs", `after drop: reveal enabled=${await t("btn-reveal").isEnabled()}; Paprika still holds the bond: ${fmt(paprikaBefore)}`);

// --- D. second browser context continues an accusation
r = await webCommit(U); expect("web commit U", !r, r);
const page2 = await newPage(browser);
const H2 = helpers(page2);
await H2.open("#accuser");
note("obs", `context 2 while U committed (not revealed): commit-status="${await H2.text("commit-status")}" reveal enabled=${await H2.t("btn-reveal").isEnabled()} commit enabled=${await H2.t("btn-commit").isEnabled()}`);
r = await click("btn-reveal"); expect("ctx1 reveal U", !r, r);
await H2.open("#accuser");
note("obs", `context 2 after reveal in ctx1: commit-status="${await H2.text("commit-status")}" vote enabled=${await H2.t("btn-vote-fake").isEnabled()} photo=${await H2.text("reveal-photo")}`);
// two windows vote at once (ctx1 YES, ctx2 NO)
const [r1, r2] = await Promise.all([click("btn-vote-fake"), H2.click("btn-vote-not-fake")]);
note("obs", `simultaneous votes: ctx1="${r1}" ctx2="${r2}"; chain U=${(await lib.verifyPhoto(ctx, U.photoHash))[0].state}`);
await shot("s2-06-ctx1-simultaneous");
await page2.screenshot({ path: `${SHOTS}/s2-06-ctx2-simultaneous.png`, fullPage: true });
note("obs", `ctx1 outcome=${await t("settle-outcome").getAttribute("data-outcome")} ctx2 outcome=${await H2.t("settle-outcome").getAttribute("data-outcome")}`);
await H2.open("#accuser");
note("obs", `ctx2 after reload: outcome=${await H2.t("settle-outcome").getAttribute("data-outcome")} check=${await H2.text("settle-check").catch(() => "")}`);
c = await conservation(ctx); expect("conservation end", c.ok, `${c.supply} vs ${c.sum}`);
note("obs", `console1: ${JSON.stringify(page.qa.console.slice(0, 8))} console2: ${JSON.stringify(page2.qa.console.slice(0, 8))}`);
note("obs", `failed1: ${JSON.stringify(page.qa.failed.slice(0, 8))}`);
fs.writeFileSync(`${SHOTS}/s2-notes.json`, JSON.stringify(notes, null, 1));
await browser.close();
