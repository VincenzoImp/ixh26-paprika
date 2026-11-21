// Paprika: staging-3 test. One check per reproducible finding of output/staging-3-report.md and per behaviour of the
// earlier suite (demo-stable-0715) that the rebuilt suite no longer checks. A FAIL here is an open finding.
// Alice and Bob share ONE page and switch accounts in the MetaMask stand-in (fake-metamask.mjs), as on stage.
//
//   cd app && node e2e/staging3.e2e.mjs     Environment: ST3_RPC_PORT (9045), ST3_WEB_PORT (5745), HEADED=1.

import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { APP, startInstance, checker, driver } from "./helpers.mjs";
import { installFakeMetaMask } from "./fake-metamask.mjs";

const RPC_PORT = Number(process.env.ST3_RPC_PORT || 9045);
const WEB_PORT = Number(process.env.ST3_WEB_PORT || 5745);
const OUT = path.join(APP, "output", "staging-3");
fs.mkdirSync(OUT, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page, browser, context, inst, lib, ctx, mm;
const { check, eq, results } = checker(OUT, () => page);
const consoleErrors = [];
const badResponses = [];
const shot = (name) => page.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: true }).catch(() => {});
const bodyText = () => page.evaluate(() => document.body.innerText);
const num = (s) => Number(String(s).replace(/[^0-9.]/g, ""));
const overlap = (a, b) => !!(a && b && a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height);

async function connect(d) {
  await page.goto(`${inst.base}/#/verify`); await page.waitForTimeout(1200); await d.idle();
  await d.click("btn-connect");
}
async function attestSample(d) {
  await d.go("#/attest");
  if (await d.t("btn-new-photo").isVisible().catch(() => false)) await d.t("btn-new-photo").click();
  await d.click("btn-sample-image");
  if (await d.t("btn-new-key-attest").isVisible().catch(() => false)) await d.click("btn-new-key-attest");
  await d.clickConfirm("btn-attest", "confirm-attest");
  return page.evaluate(() => window.paprikaState.lastAttested);
}
async function as(who, d) { await mm.use(who); await page.waitForTimeout(800); await d.idle(); }
const keyOf = async (h) => (await lib.verifyPhoto(ctx, h))[0].keyId;
const stateOf = async (h) => (await lib.verifyPhoto(ctx, h))[0]?.state;

async function run() {
  const d = driver(page);
  const { t, click, clickConfirm, go, idle, text, lastToast } = d;
  const B = ctx.params.bond;

  // ---------------------------------------------------------------- wording and shell (no wallet)
  await page.goto(`${inst.base}/#/verify`); await page.waitForTimeout(1200); await idle();
  const banner = await text("network-pill");
  await check("wording: the banner does not call UMA's real VotingV2 'simulated' (docs: three demo voter accounts)", !/simulated/i.test(banner), banner);
  await t("network-pill").click(); await page.waitForTimeout(200);
  const bar = await t("local-tools-bar").innerText().catch(() => "");
  await check("wording: local tools do not call the voters 'simulated'", !/simulated/i.test(bar), bar.replace(/\s+/g, " ").slice(0, 120));
  await go("#/attest"); await page.waitForTimeout(300);
  const lbBox = await t("local-tools-bar").boundingBox(), camBox = await t("btn-start-camera").boundingBox();
  await check("layout 1440px: the open local tools bar does not cover 'Start camera' on Attest", !overlap(lbBox, camBox), JSON.stringify({ lbBox, camBox }));
  await shot("localbar-open-attest");
  await page.locator("[data-testid=local-tools-bar] .t-close").click(); await page.waitForTimeout(200);

  // ---------------------------------------------------------------- deep links and explorer garbage
  await go("#/record/0x" + "ab".repeat(32)); await page.waitForTimeout(800);
  await check("deep link: an unknown photo hash says no record", /No key attested/i.test(await bodyText()));
  await go("#/record/not-a-hash"); await page.waitForTimeout(800);
  const bad = await bodyText();
  await check("deep link: a malformed record link shows a clear message, no raw error", !/invalid BytesLike|TypeError|undefined|Reading the chain/i.test(bad) && /hash|record/i.test(bad), bad.slice(0, 200));
  await shot("deeplink-malformed");
  for (const q of ["hello world", "<img src=x onerror=window.__xss=1>", "0x", "99999999999", "0x" + "cd".repeat(32), "-1"]) {
    await go("#/explorer");
    await t("explorer-search").fill(q); await t("btn-explorer-search").click(); await page.waitForTimeout(700); await idle();
    const b = await bodyText();
    await check(`explorer: search ${JSON.stringify(q).slice(0, 30)} gives a plain answer, no raw error`, !/TypeError|invalid BytesLike|could not coalesce|undefined/i.test(b) && !(await page.evaluate(() => window.__xss)), b.slice(0, 160).replace(/\s+/g, " "));
  }
  await go("#/tx/0x" + "11".repeat(32)); await page.waitForTimeout(800);
  await check("explorer: an unknown tx link says not found", await t("tx-missing").isVisible().catch(() => false));
  await go("#/block/99999999"); await page.waitForTimeout(800);
  await check("explorer: a future block link shows a plain message", !/TypeError|undefined|null/i.test(await bodyText()));
  await shot("explorer-future-block");

  // ---------------------------------------------------------------- connect: rejection, then Alice
  mm.reject(true);
  await click("btn-connect");
  await check("connect: a rejected MetaMask connection leaves the page disconnected with a plain message", (await t("btn-connect").isVisible()) && !/-32603|stack|undefined/i.test((await lastToast())?.text || ""), (await lastToast())?.text);
  mm.reject(false);
  await click("btn-connect");
  await eq("connect: Alice connected", await text("account-name"), "Alice");

  // prepare: Cancel in the dialog sends nothing; reject in MetaMask sends nothing
  await t("account-button").click();
  const s0 = mm.state.sent.length;
  await t("btn-prepare").click(); await t("prepare-cancel").click(); await idle();
  await eq("prepare: Cancel in the dialog sends nothing", mm.state.sent.length, s0);
  if (!(await t("btn-prepare").isVisible().catch(() => false))) await t("account-button").click();
  await clickConfirm("btn-prepare", "prepare");
  await check("prepare: Alice WETH >= 3B and allowance set (chain)", BigInt(await ctx.contracts.token.balanceOf(mm.address("alice"))) >= 3n * B);
  if (!(await t("btn-register").isVisible().catch(() => false))) await t("account-button").click();
  await click("btn-register");
  // numbers in the header and menu vs the chain
  if (!(await t("menu-eth").isVisible().catch(() => false))) await t("account-button").click();
  const ethChain = Number(BigInt(await ctx.provider.getBalance(mm.address("alice"))) / 10n ** 14n) / 1e4;
  const wethChain = Number(BigInt(await ctx.contracts.token.balanceOf(mm.address("alice"))) / 10n ** 14n) / 1e4;
  await check("numbers: menu ETH = chain balance (rounded)", Math.abs(num(await text("menu-eth")) - ethChain) < 1, `${await text("menu-eth")} vs ${ethChain}`);
  await check("numbers: menu WETH = chain WETH", Math.abs(num(await text("menu-weth")) - wethChain) < 0.01, `${await text("menu-weth")} vs ${wethChain}`);
  await t("account-button").click();

  // ---------------------------------------------------------------- attest with the (fake) camera
  await go("#/attest");
  await click("btn-start-camera"); await page.waitForTimeout(1500);
  await check("camera: live preview shown", await t("camera-video").isVisible());
  await click("btn-take-photo"); await page.waitForTimeout(500);
  await clickConfirm("btn-attest", "confirm-attest");
  const C = await page.evaluate(() => window.paprikaState.lastAttested);
  await eq("camera: the captured photo is attested (chain)", await stateOf(C), "attested");
  await check("camera: the stream is stopped after the photo", await page.evaluate(() => !document.querySelector("video") || !document.querySelector("video").srcObject || document.querySelector("video").srcObject.getTracks().every((x) => x.readyState === "ended")));

  // reject the attest in MetaMask
  await t("btn-new-photo").click(); await click("btn-sample-image");
  mm.reject(true);
  const sr = mm.state.sent.length;
  const rt = await clickConfirm("btn-attest", "confirm-attest");
  mm.reject(false);
  await check("reject: attest refused in MetaMask -> 'rejected' toast, nothing sent", rt?.status === "rejected" && mm.state.sent.length === sr, rt?.text);
  // a file
  await t("input-capture-file").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
  await page.waitForTimeout(300); await idle();
  await clickConfirm("btn-attest", "confirm-attest");
  const F = await page.evaluate(() => window.paprikaState.lastAttested);
  const X = await attestSample(d), Y = await attestSample(d), Z = await attestSample(d);

  // ---------------------------------------------------------------- record page layout (pill vs download)
  for (const [w, hgt] of [[1440, 900], [1280, 720], [1024, 768], [800, 900]]) {
    await page.setViewportSize({ width: w, height: hgt });
    await page.evaluate(() => document.querySelectorAll("[data-testid=toast] button").forEach((b) => b.click()));
    await go(`#/record/${F}`); await page.waitForTimeout(400);
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await page.waitForTimeout(200);
    const a = await t("btn-download").boundingBox(), b = await t("network-pill").boundingBox();
    await check(`layout ${w}px: the 'Local network' pill does not cover 'Download the attested file'`, !overlap(a, b), JSON.stringify({ a, b }));
    if (overlap(a, b)) await page.screenshot({ path: path.join(OUT, `overlap-download-${w}.png`) });
    const hs = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
    await check(`layout ${w}px: no horizontal scroll on the record page`, !hs);
    const hdr = await page.evaluate(() => { const e = document.querySelector("header"); return e.scrollWidth > e.clientWidth + 1; });
    await check(`layout ${w}px: the header fits (nothing cut)`, !hdr);
    await page.screenshot({ path: path.join(OUT, `record-${w}.png`) });
  }
  // sweep of window heights without scrolling: the fixed pill must never sit on the download button
  const hits = [];
  for (const w of [1440, 1280]) for (let hgt = 560; hgt <= 1000; hgt += 20) {
    await page.setViewportSize({ width: w, height: hgt }); await page.evaluate(() => window.scrollTo(0, 0)); await page.waitForTimeout(60);
    if (overlap(await t("btn-download").boundingBox(), await t("network-pill").boundingBox())) hits.push(`${w}x${hgt}`);
  }
  if (hits.length) { const [w, hh] = hits[0].split("x").map(Number); await page.setViewportSize({ width: w, height: hh }); await page.evaluate(() => window.scrollTo(0, 0)); await page.screenshot({ path: path.join(OUT, `overlap-download-${hits[0]}.png`) }); }
  await check("layout: the 'Local network' pill covers 'Download the attested file' at no window height (no scroll)", hits.length === 0, hits.join(", "));
  await page.setViewportSize({ width: 1440, height: 900 });

  // ---------------------------------------------------------------- verify and tamper
  await go("#/verify");
  await t("input-verify-file").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64") });
  await page.waitForTimeout(800); await idle();
  await eq("verify: the attested file is found", await t("verify-status").getAttribute("data-state"), "attested");
  await click("btn-change-pixel"); await page.waitForTimeout(2500); await idle();
  await eq("verify: tamper test -> no record", await t("verify-status").getAttribute("data-state"), "no-record");

  // ---------------------------------------------------------------- Bob accuses: XSS text, cancel, reject, reload, reveal
  await as("bob", d);
  await eq("switch: account label follows MetaMask (Bob)", await text("account-name"), "Bob");
  await check("switch: Bob does not see Alice's credit/device as his", (await t("account-name").innerText()) === "Bob");
  await t("account-button").click(); await clickConfirm("btn-prepare", "prepare"); await t("account-button").click();
  await go(`#/record/${X}/accuse`);
  await click("btn-commit").catch(() => {});
  await check("evidence: empty evidence refused with a message, nothing sent", /Add the evidence first/i.test(await bodyText()));
  await t("input-evidence").fill("   "); await click("btn-commit").catch(() => {});
  await check("evidence: whitespace-only evidence refused", /Add the evidence first/i.test(await bodyText()) && !(await t("confirm-commit-dialog").isVisible().catch(() => false)));
  const xss = `<img src=x onerror="window.__xss=1"><script>window.__xss=2</script> proof`;
  await t("input-evidence").fill(xss);
  const sc = mm.state.sent.length;
  await t("btn-commit").click(); await t("confirm-commit-cancel").click(); await idle();
  await eq("commit: Cancel in the dialog sends nothing", mm.state.sent.length, sc);
  mm.reject(true); const rj = await clickConfirm("btn-commit", "confirm-commit"); mm.reject(false);
  await check("reject: commit refused in MetaMask -> rejected toast, no reveal offered", rj?.status === "rejected" && !(await t("btn-reveal").isVisible().catch(() => false)), rj?.text);
  if (!(await t("input-evidence").inputValue().catch(() => ""))) await t("input-evidence").fill(xss);
  await clickConfirm("btn-commit", "confirm-commit");
  await page.reload(); await page.waitForTimeout(1500); await idle();
  await check("reload: after commit + reload the reveal is offered", await t("btn-reveal").isEnabled());
  await t("network-pill").click().catch(() => {}); await page.waitForTimeout(200);
  await shot("skip-enabled-during-commit");
  await check("lost B1: time skip blocked while a commitment is unrevealed, with the reason", !(await t("btn-advance-time").isEnabled()) && (await t("advance-why").isVisible()));
  await page.locator("[data-testid=local-tools-bar] .t-close").click().catch(() => {});
  mm.reject(true); const rr = await click("btn-reveal"); mm.reject(false);
  await check("reject: reveal refused -> reveal still offered", rr?.status === "rejected" && (await t("btn-reveal").isVisible()), rr?.text);
  await click("btn-reveal");
  await eq("reveal: X accused (chain)", await stateOf(X), "accused");
  await page.waitForTimeout(1500);
  const waits = ((await bodyText()).match(/Waiting for UMA's vote/g) || []).length;
  await check("wording: 'Waiting for UMA's vote' appears once on the record page", waits === 1, `${waits} times`);
  await shot("record-waiting-vote");
  await check("XSS: evidence text is shown literally and never executed", !(await page.evaluate(() => window.__xss)) && (await t("evidence-text").innerText().catch(() => "")).includes("<script>"));
  // wrong chain while an action is possible
  await mm.setChain(1); await page.waitForTimeout(500);
  await check("wrong chain: Bob's actions disabled and a switch prompt shown", await t("btn-switch-chain").isVisible());
  await click("btn-switch-chain");
  // vote not proven via the local tools bar
  const cB0 = await lib.credits(ctx, mm.address("bob")), cA0 = await lib.credits(ctx, mm.address("alice"));
  const until0 = BigInt((await lib.verifyPhoto(ctx, X))[0].accusableUntil);
  // (the resolve chips moved next to the waiting vote on the record page; the tools bar keeps only the clock)
  await click("btn-vote-not-fake-inline");
  await eq("vote not proven: X back to attested (chain)", await stateOf(X), "attested");
  const cA1 = await lib.credits(ctx, mm.address("alice"));
  await check("vote not proven: Alice credited B - fee (chain)", cA1 - cA0 > 0n && cA1 - cA0 < B, `${cA1 - cA0}`);
  await eq("vote not proven: Bob gets nothing back", (await lib.credits(ctx, mm.address("bob"))) - cB0, 0n);
  await check("lost: a rejected accusation extends the challenge period (chain)", BigInt((await lib.verifyPhoto(ctx, X))[0].accusableUntil) > until0);
  await eq("record: outcome 'not-proven' in words", await t("settle-outcome").first().getAttribute("data-outcome"), "not-proven");

  // ---------------------------------------------------------------- binary file evidence, vote fake proven
  await go(`#/record/${Y}/accuse`);
  await t("input-evidence-file").setInputFiles({ name: "blob.bin", mimeType: "application/octet-stream", buffer: Buffer.from([0, 255, 1, 254, 7, 0, 0, 9]) });
  await page.waitForTimeout(200);
  await clickConfirm("btn-commit", "confirm-commit"); await click("btn-reveal");
  const store0 = BigInt(await ctx.contracts.token.balanceOf(ctx.addresses.store));
  await click("btn-vote-fake-inline");
  const fB = (B * BigInt(Math.round(ctx.params.feeShare * 1e6))) / 1000000n;
  await eq("lost: fake proven pays UMA's Store the fee fB (chain)", BigInt(await ctx.contracts.token.balanceOf(ctx.addresses.store)) - store0, fB);
  await check("lost B4: a proven-fake record offers no accusation", !(await t("btn-accuse").isVisible().catch(() => false)));
  await check("lost F2: 'What this record shows' sentence on the record", /What this record shows:/i.test(await bodyText()));
  await eq("vote fake: Y fake (chain)", await stateOf(Y), "fake");
  await check("evidence: a binary file shows size + hash check, no garbage preview", (await t("evidence-hash-ok").first().isVisible()) && !(await t("evidence-text").first().isVisible().catch(() => false)));
  const kY = await keyOf(Y);
  const dev = await ctx.contracts.paprika.devices(kY);
  await eq("fake proven: device flagged (chain)", Number(dev.status ?? dev[1]), 2);
  // numbers on the record vs the chain after a fake proven
  const outTxt = await t("settle-outcome").first().innerText();
  await check("numbers: the outcome line shows the bond amounts", outTxt.includes(lib.formatToken(ctx, B).split(" ")[0]), outTxt);

  // Bob holds unclaimed winnings: an accusable record must still offer "Accuse"
  await go(`#/record/${Z}`); await page.waitForTimeout(600); await idle();
  await check("record: with unclaimed credit, an accusable record still offers Accuse (Claim does not replace it)", await t("btn-accuse").isVisible().catch(() => false), `main action: ${await page.locator("[data-testid^=btn-claim-record],[data-testid=btn-accuse]").first().innerText().catch(() => "none")}`);
  await shot("credit-hides-accuse");
  // claim credit: Bob (fake proven winner)
  const wB0 = BigInt(await ctx.contracts.token.balanceOf(mm.address("bob")));
  const cBob = await lib.credits(ctx, mm.address("bob"));
  await go("#/activity");
  await check("activity: Bob's claimable credit = chain", Math.abs(num(await text("deposits-credit")) - Number(cBob) / 1e18) < 0.001, `${await text("deposits-credit")} vs ${cBob}`);
  await click("btn-deposits-withdraw");
  await eq("claim: Bob WETH + credit (chain)", BigInt(await ctx.contracts.token.balanceOf(mm.address("bob"))) - wB0, cBob);

  // ---------------------------------------------------------------- unreachable evidence (committed by the library, never published)
  await as("alice", d);
  // (Alice's key was flagged by the fake proven: a new key is needed)
  const W = await attestSample(d);
  await as("bob", d);
  const { ethers } = await import("ethers");
  const bobW = new ethers.Wallet("0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", ctx.provider);
  await lib.setSigner(ctx, "accuser", bobW);
  const ghost = ethers.keccak256(ethers.toUtf8Bytes("never published"));
  const cm = await lib.commitAccusation(ctx, "accuser", { photoHash: W, keyId: await keyOf(W), evidenceHash: ghost });
  await lib.revealAccusation(ctx, "accuser", { photoHash: W, keyId: await keyOf(W), evidenceHash: ghost, salt: cm.salt });
  await go(`#/record/${W}`); await page.waitForTimeout(1500); await idle();
  await check("evidence: unpublished evidence is shown as 'not published', page works", await t("evidence-missing").isVisible().catch(() => false));
  await click("btn-vote-not-fake-inline");

  // ---------------------------------------------------------------- account switch DURING a pending MetaMask confirmation
  await go(`#/record/${Z}/accuse`);
  await t("input-evidence").fill("switch mid-transaction");
  const release = mm.hold();
  await t("btn-commit").click(); await t("confirm-commit-ok").click();
  await sleep(1500);
  await mm.use("alice"); await sleep(800);
  release(); await sleep(500); await idle();
  const tx = mm.state.sent[mm.state.sent.length - 1];
  await eq("mid-tx switch: the commit was signed by Bob (its from)", tx.account, "bob");
  await as("bob", d);
  await go(`#/record/${Z}`); await page.waitForTimeout(800); await idle();
  await check("mid-tx switch: Bob's commitment secret stays with Bob (reveal offered to Bob)", await t("btn-reveal").isVisible().catch(() => false));
  await shot("midtx-switch-bob");
  await as("alice", d); await go(`#/record/${Z}`); await page.waitForTimeout(500);
  await check("mid-tx switch: Alice is not offered Bob's reveal", !(await t("btn-reveal").isVisible().catch(() => false)));
  if (await t("btn-reveal").isVisible().catch(() => false)) {
    const ar = await click("btn-reveal");
    await check("mid-tx switch: if Alice reveals Bob's commitment, the message is plain", ar?.status !== "ok" && !/execution reverted|CALL_EXCEPTION|0x[0-9a-f]{8}/i.test(ar?.text || ""), `${ar?.status}: ${ar?.text}`);
  }

  // ---------------------------------------------------------------- reload DURING a pending commit confirmation
  const V = await attestSample(d);
  await as("bob", d);
  await go(`#/record/${V}/accuse`);
  await t("input-evidence").fill("reload mid-transaction");
  const rel2 = mm.hold();
  await t("btn-commit").click(); await t("confirm-commit-ok").click();
  await sleep(3000);   // until the commit's confirmation is open in the wallet (the page publishes the evidence first)
  await page.reload(); release && rel2(); await sleep(2500); await idle();
  await go(`#/record/${V}`); await page.waitForTimeout(800); await idle();
  const bobCommits = (await ctx.contracts.paprika.queryFilter(ctx.contracts.paprika.filters.Committed?.() ?? "Committed").catch(() => [])).length;
  await check("reload mid-commit: the signed commitment can still be revealed or forfeited from the page (salt kept before signing)",
    (await t("btn-reveal").isVisible().catch(() => false)) || (await t("btn-forfeit").isVisible().catch(() => false)), `commit events on chain: ${bobCommits}`);
  await shot("reload-midcommit");
  // Bob finishes his accusation: a live commitment blocks every time skip (M1), so it must be revealed and decided first.
  for (const photo of [V, Z]) {
    await go(`#/record/${photo}`); await page.waitForTimeout(800); await idle();
    if (await t("btn-reveal").isVisible().catch(() => false)) { await click("btn-reveal"); await page.waitForTimeout(800); }
    if (await t("btn-vote-not-fake-inline").isVisible().catch(() => false)) await click("btn-vote-not-fake-inline");
  }

  // ---------------------------------------------------------------- skip wait, refund, revoke (Alice)
  await as("alice", d);
  const R2 = await attestSample(d);
  await go(`#/record/${R2}`);
  await click("btn-skip-wait");
  const cRef0 = await lib.credits(ctx, mm.address("alice"));
  mm.reject(true); const rf = await click("btn-refund"); mm.reject(false);
  await check("reject: refund refused -> refund still offered", rf?.status === "rejected" && (await t("btn-refund").isVisible()), rf?.text);
  await click("btn-refund");
  await eq("refund: Alice credit +B (chain; refund credits, Claim pays)", (await lib.credits(ctx, mm.address("alice"))) - cRef0, B);
  await check("lost B4: a refunded record offers no accusation, with the reason", !(await t("btn-accuse").isVisible().catch(() => false)) && (await t("record-action-why").isVisible().catch(() => false)));
  await check("refund: no refund button left", !(await t("btn-refund").isVisible().catch(() => false)));
  await t("account-button").click();
  mm.reject(true); const rv = await clickConfirm("btn-revoke", "revoke"); mm.reject(false);
  await check("reject: revoke refused -> key still active", rv?.status === "rejected", rv?.text);
  if (!(await t("btn-revoke").isVisible().catch(() => false))) await t("account-button").click();
  await clickConfirm("btn-revoke", "revoke");
  const key = await page.evaluate(() => window.paprikaState.device?.keyId);
  const dv = await ctx.contracts.paprika.devices(key);
  await eq("revoke: device flagged key-revoked (chain)", Number(dv.reason ?? dv[2]), 2);

  // ---------------------------------------------------------------- explorer: every signed transaction decodes
  let missing = 0;
  for (const s of mm.state.sent) {
    await go(`#/tx/${s.hash}`); await page.waitForTimeout(150);
    if (!(await t("tx-call").isVisible().catch(() => false))) missing++;
  }
  await eq(`explorer: all ${mm.state.sent.length} signed transactions open with a decoded call`, missing, 0);

  // ---------------------------------------------------------------- two windows
  const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const mm2 = await installFakeMetaMask(ctx2, inst.rpc); await mm2.use("bob");
  const p2 = await ctx2.newPage(); await p2.goto(`${inst.base}/#/record/${R2}`); await p2.waitForTimeout(1500);
  await check("two windows: the second window shows the refunded record", /refund/i.test(await p2.evaluate(() => document.body.innerText)));
  await ctx2.close();

  // ---------------------------------------------------------------- zoom 125 %
  const zc = await browser.newContext({ viewport: { width: 1152, height: 720 }, deviceScaleFactor: 1.25 });
  await installFakeMetaMask(zc, inst.rpc);
  const zp = await zc.newPage(); await zp.goto(`${inst.base}/#/record/${F}`); await zp.waitForTimeout(1500);
  await zp.screenshot({ path: path.join(OUT, "zoom125-record.png"), fullPage: true });
  await check("zoom 125%: no horizontal scroll", !(await zp.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth)));
  await zc.close();

  // ---------------------------------------------------------------- chain restart while the page is open
  const before = await page.evaluate(() => Object.keys(localStorage).filter((k) => /device|mine|secret/i.test(k)).map((k) => [k, localStorage.getItem(k).length]));
  inst.stop(); await sleep(3000);
  await page.waitForTimeout(3000);
  await check("chain down: the network pill says the chain is unreachable", /down|unreach|offline|disconnect/i.test(await text("network-pill")) || (await t("network-pill").getAttribute("class")).includes("down"), await text("network-pill"));
  await shot("chain-down");
  inst = await startInstance(RPC_PORT, WEB_PORT);
  await page.waitForTimeout(8000); await idle().catch(() => {});
  const after = await page.evaluate(() => Object.keys(localStorage));
  await check("chain restart: every stored device key and commitment secret survives", before.every(([k]) => after.includes(k)), `${before.length} before`);
  await check("chain restart: the page recovers without a manual reload", !(await t("fatal-message").isVisible().catch(() => false)));
  await shot("after-restart");
}

let code = 1;
try {
  inst = await startInstance(RPC_PORT, WEB_PORT);
  const deployment = await (await fetch(`${inst.base}/deployment.json`)).json();
  lib = await import(path.join(APP, "lib", "paprika.js"));
  ctx = lib.connect({ rpcUrl: inst.rpc, deployment });
  browser = await chromium.launch({ headless: !process.env.HEADED, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true, permissions: ["camera"] });
  mm = await installFakeMetaMask(context, inst.rpc);
  page = await context.newPage();
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));
  page.on("response", (r) => { if (r.status() >= 400 && !/\/evidence\//.test(r.url())) badResponses.push(`${r.status()} ${r.request().method()} ${r.url()}`); });
  await run();
  const errs = consoleErrors.filter((e) => !/Failed to load resource|ERR_CONNECTION_REFUSED|net::/i.test(e));
  await check("lost: no failed HTTP requests (>= 400, evidence 404 excluded)", badResponses.length === 0, badResponses.slice(0, 5).join(" | "));
  await check("console: no uncaught errors during the run (chain-down fetch errors excluded)", errs.length === 0, errs.slice(0, 5).join(" | "));
  code = results.every((r) => r.ok) ? 0 : 1;
} catch (e) {
  console.error("staging-3 test aborted:", e.stack || e.message);
  if (page) await page.screenshot({ path: path.join(OUT, "aborted.png") }).catch(() => {});
} finally {
  fs.writeFileSync(path.join(OUT, "console-errors.txt"), consoleErrors.join("\n") + "\n--- HTTP >= 400\n" + badResponses.join("\n"));
  await browser?.close().catch(() => {});
  inst?.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length || code ? 1 : 0);
