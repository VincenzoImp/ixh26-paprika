// Paprika: end-to-end test of the web app (Playwright, Chromium headless), the demo story with Alice and Bob.
//
// It starts its OWN fresh instance on spare ports, opens the app with a stand-in for the MetaMask extension
// (e2e/fake-metamask.mjs: Hardhat accounts #1 = Alice and #2 = Bob, switched with accountsChanged as the presenter
// does in MetaMask), drives the whole story, and checks what the page shows against the chain, read independently
// with app/lib/paprika.js. Exit code 0 = all checks passed.
//
//   cd app && npm run e2e        Environment: E2E_RPC_PORT (8645), E2E_WEB_PORT (5273), HEADED=1.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { ethers } from "ethers";
import { APP, startInstance, checker, driver } from "./helpers.mjs";
import { installFakeMetaMask } from "./fake-metamask.mjs";

const RPC_PORT = Number(process.env.E2E_RPC_PORT || 8645);
const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5273);
const OUT = path.join(APP, "output", "e2e");
let page, browser, inst, lib, ctx, mm;
const { check, eq, results } = checker(OUT, () => page);
const consoleErrors = [];

// Chain reads, independent of the page.
const recordOf = async (photoHash) => (await lib.verifyPhoto(ctx, photoHash))[0];
async function money() {
  const tok = ctx.contracts.token;
  const A = mm.address("alice"), B = mm.address("bob");
  const bal = async (x) => BigInt(await tok.balanceOf(x));
  return { alice: await bal(A), bob: await bal(B), store: await bal(ctx.addresses.store), paprika: await bal(ctx.addresses.paprika), oo: await bal(ctx.addresses.oo),
    cAlice: await lib.credits(ctx, A), cBob: await lib.credits(ctx, B) };
}
async function deviceOnChain(keyId) {
  const d = await ctx.contracts.paprika.devices(keyId);
  return { status: ["none", "active", "flagged"][Number(d.status ?? d[1])], reason: ["none", "fake-proven", "key-revoked"][Number(d.reason ?? d[2])] };
}

async function story() {
  const { t, click, clickConfirm, text, go, idle } = driver(page);
  const B = ctx.params.bond;
  const fB = (B * BigInt(Math.round(ctx.params.feeShare * 1e6))) / 1000000n;
  const fmt = (v) => lib.formatToken(ctx, v);

  // ---- server: /rpc never signs for anyone and refuses malformed requests
  const rpcPost = (body) => fetch(`${inst.base}/rpc`, { method: "POST", headers: { "content-type": "application/json" }, body });
  for (const m of ["eth_sendTransaction", "eth_accounts", "hardhat_setBalance"]) {
    const r = await rpcPost(JSON.stringify({ jsonrpc: "2.0", id: 1, method: m, params: m === "eth_accounts" ? [] : [{}] }));
    await eq(`rpc: /rpc refuses ${m}`, r.status, 403);
  }
  await check("rpc: /rpc refuses a null body (4xx)", String((await rpcPost("null")).status).startsWith("4"));

  // ---- Verify works without a wallet; signing needs MetaMask
  await page.goto(`${inst.base}/#/verify`);
  await page.waitForTimeout(1000); await idle();
  await check("app: no fatal message", !(await t("fatal-message").isVisible().catch(() => false)));
  await check("app: local network banner shown", await t("network-banner").isVisible());
  await check("app: local tools present on the local network", await t("local-tools-toggle").isVisible());
  await check("wallet: Connect MetaMask is the only wallet option", (await t("btn-connect").innerText()).includes("Connect MetaMask") && (await page.getByText(/browser wallet|faucet/i).count()) === 0);
  await go("#/attest");
  await click("btn-sample-image");
  await check("wallet: Attest refused before connecting, with the reason", !(await t("btn-attest").isEnabled()) && /Connect MetaMask/.test(await text("attest-blocked")));

  // ---- connect Alice; wrong network → switch prompt
  await click("btn-connect");
  await eq("wallet: connected as Alice (label)", await text("account-name"), "Alice");
  await mm.setChain(1);
  await page.waitForTimeout(400);
  await check("network: wrong chain shows 'Switch to Paprika local'", await t("btn-switch-chain").isVisible());
  await check("network: actions disabled on the wrong chain", !(await t("btn-attest").isEnabled()));
  await click("btn-switch-chain");
  await check("network: switched back, prompt gone", !(await t("btn-switch-chain").isVisible().catch(() => false)));

  // ---- prepare account, register device key
  await t("account-button").click();
  await clickConfirm("btn-prepare", "prepare");
  const pa = await money();
  await check("prepare: Alice holds WETH for deposits (chain)", pa.alice >= 3n * B);
  await check("prepare: Paprika approved (chain)", (await ctx.contracts.token.allowance(mm.address("alice"), ctx.addresses.paprika)) >= 1000n * B);
  const wReg = (await money()).alice;
  await click("btn-register");
  const key1 = await page.evaluate(() => window.paprikaState.device.keyId);
  await eq("register: device key active (chain)", (await deviceOnChain(key1)).status, "active");
  await eq("register: free (Alice WETH unchanged, chain)", (await money()).alice, wReg);
  await eq("register: device status shown in the menu", await t("device-status").getAttribute("data-status"), "active");
  const ethChain = Number(await ctx.provider.getBalance(mm.address("alice"))) / 1e18;
  await check("numbers: menu ETH = chain (rounded)", Math.abs(parseFloat(await text("menu-eth")) - ethChain) < 1);
  await eq("numbers: menu WETH = chain", await text("menu-weth"), fmt((await money()).alice));
  await t("account-button").click();

  // ---- camera path (Chromium's fake camera): live preview, still, stream stopped
  await go("#/attest");
  await click("btn-start-camera");
  await check("camera: live preview shown", await t("camera-video").isVisible());
  await click("btn-take-photo");
  await check("camera: the still is ready to attest", await t("btn-attest").isEnabled() && /selfie/.test(await text("capture-file-name")));
  await check("camera: the stream is stopped after the photo", await page.evaluate(() => !document.querySelector("video")));

  // ---- attest: confirmation, exactly one signature
  await go("#/attest");
  await click("btn-sample-image");
  const m0 = await money();
  const sig0 = mm.state.sent.length;
  await t("btn-attest").click();
  await check("attest: confirmation dialog shows the amount B", (await t("confirm-attest-dialog").innerText()).includes(fmt(B)));
  await t("confirm-attest-ok").click(); await page.waitForTimeout(150); await idle();
  await eq("attest: exactly one MetaMask signature after Prepare account", mm.sentSince(sig0).length, 1);
  const toast1 = await driver(page).lastToast();
  await check("toast: attest confirmed with an explorer link", toast1?.status === "ok" && /Confirmed in block/.test(toast1.text) && (await page.getByTestId("toast-tx").last().getAttribute("href")).startsWith("#/"));
  const photo1 = await page.evaluate(() => window.paprikaState.lastAttested);
  const r1 = await recordOf(photo1);
  await eq("attest: chain record attested", r1?.state, "attested");
  await eq("attest: deposit locked = B (chain)", r1?.depositLocked, B);
  const m1 = await money();
  await eq("attest: Alice WETH −B (chain)", m1.alice - m0.alice, -B);
  await eq("attest: Paprika +B (chain)", m1.paprika - m0.paprika, B);
  // empty file refused, previous photo cleared
  await t("btn-new-photo").click();
  await click("btn-sample-image");
  await t("input-capture-file").setInputFiles({ name: "empty.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(0) });
  await page.waitForTimeout(200); await idle();
  await check("attest: empty file refused and the previous photo cleared", /empty/i.test(await text("capture-error")) && !(await t("btn-attest").isEnabled()));

  // ---- record page
  await go(`#/record/${photo1}`);
  await eq("record: verdict attested", await t("record-verdict").getAttribute("data-state"), "attested");
  await check("record: refund not offered before the period ends", !(await page.getByTestId("btn-refund").count()));
  await eq("record: lifecycle on the challenge period", await t("record-lifecycle").getAttribute("data-current"), "Challenge period");
  await check("record: honest sentence names the anchor block", (await text("verify-honest-sentence")).includes(String(r1.anchorBlock)));
  await check("record: history lists the attest with a tx link", (await t("history-row").count()) >= 1);
  // download the exact bytes, then verify them (file input and a real drop)
  const dl = page.waitForEvent("download");
  await t("btn-download").click();
  const file1 = path.join(os.tmpdir(), `paprika-e2e-${Date.now()}.jpg`);
  await (await dl).saveAs(file1);
  await go("#/verify");
  await t("input-verify-file").setInputFiles(file1); await page.waitForTimeout(300); await idle();
  await eq("verify: downloaded file verifies as attested", await t("verify-status").getAttribute("data-state"), "attested");
  await click("btn-change-pixel");
  await page.waitForFunction(() => document.querySelector('[data-testid="verify-status"]')?.dataset.state === "no-record", null, { timeout: 8000 }).catch(() => {});
  await eq("verify: one pixel changed gives no record", await t("verify-status").getAttribute("data-state"), "no-record");
  const b64 = fs.readFileSync(file1).toString("base64");
  const dt = await page.evaluateHandle((s) => { const d = new DataTransfer(); d.items.add(new File([Uint8Array.from(atob(s), (c) => c.charCodeAt(0))], "dropped.jpg", { type: "image/jpeg" })); return d; }, b64);
  await t("verify-dropzone").dispatchEvent("drop", { dataTransfer: dt });
  await page.waitForFunction(() => document.querySelector('[data-testid="verify-status"]')?.dataset.state === "attested", null, { timeout: 8000 }).catch(() => {});
  await eq("verify: a dropped file verifies as attested", await t("verify-status").getAttribute("data-state"), "attested");
  // the same file again on Attest: refused before any transaction, with the reason
  await go("#/attest"); if (await t("btn-new-photo").isVisible().catch(() => false)) await t("btn-new-photo").click();
  await t("input-capture-file").setInputFiles(file1); await page.waitForTimeout(400); await idle();
  await check("attest: re-attesting the same file is disabled with the reason", !(await t("btn-attest").isEnabled()) && /already attested/i.test(await text("attest-blocked")));

  // ---- explorer decodes the attest transaction
  const attestTx = mm.state.sent[sig0].hash;
  await go(`#/tx/${attestTx}`);
  await eq("explorer: attest call decoded", await t("tx-call").getAttribute("data-method"), "Paprika.attest");
  await check("explorer: Attested event decoded", (await page.locator('[data-testid="tx-event"][data-event="Attested"]').count()) === 1);
  await eq("explorer: tx sender is Alice", (await t("tx-from").innerText()).includes("Alice"), true);

  // ---- switch to Bob in MetaMask: every view follows
  await go(`#/record/${photo1}`);
  await mm.use("bob"); await page.waitForTimeout(800); await idle();
  await eq("switch: header shows Bob", await text("account-name"), "Bob");
  await check("switch: the record page offers Bob 'Accuse'", await t("btn-accuse").isVisible());
  await go("#/activity");
  await check("switch: Bob's activity has no records", await t("deposits-empty").isVisible());

  // ---- Bob accuses: commit (one signature), reload safety, reveal
  await t("account-button").click();
  await clickConfirm("btn-prepare", "prepare");
  await t("account-button").click();
  await go(`#/record/${photo1}/accuse`);
  await t("input-evidence").fill("The same image was published at https://example.org/listing before the anchor block.");
  const before = await money();
  const sig1 = mm.state.sent.length;
  await t("btn-commit").click();
  await check("commit: confirmation dialog shows the bond amount B", (await t("confirm-commit-dialog").innerText()).includes(fmt(B)));
  await t("confirm-commit-ok").click(); await page.waitForTimeout(150); await idle();
  await eq("toast: commit confirmed", (await driver(page).lastToast())?.status, "ok");
  await check("commit: Details say the accusation is committed and hidden", /committed by you \(hidden until you reveal\)/.test(await text("record-accusation-count")));
  await t("local-tools-toggle").click();
  await check("B1: skip wait disabled while the commitment is unrevealed, with the reason", !(await t("btn-advance-time").isEnabled()) && (await t("advance-why").isVisible()));
  await t("local-tools-close").click();
  await eq("commit: exactly one MetaMask signature after Prepare account", mm.sentSince(sig1).length, 1);
  await eq("commit: record still attested (the commitment hides the target)", (await recordOf(photo1)).state, "attested");
  await page.reload(); await page.waitForTimeout(1200); await idle();
  await check("reload after commit: Reveal still offered and enabled", await t("btn-reveal").isEnabled());
  await check("reload after commit: reveal countdown shown", /Reveal within/.test(await text("reveal-deadline")));
  const until0 = BigInt((await recordOf(photo1)).accusableUntil);
  await eq("toast: reveal confirmed", (await click("btn-reveal"))?.status, "ok");
  await eq("reveal: chain record accused", (await recordOf(photo1)).state, "accused");
  await eq("reveal: UMA OOv3 holds 2B (chain)", (await money()).oo, 2n * B);
  const acc = (await lib.listAccusations(ctx)).find((a) => a.open);
  const evUrl = new URL(await page.getByTestId("evidence-link").first().getAttribute("href").catch(() => `/evidence/${acc.evidenceHash.slice(2)}`), inst.base).href;
  const evBytes = new Uint8Array(await (await fetch(evUrl)).arrayBuffer());
  await eq("evidence: the published evidence hashes to the on-chain evidence hash", ethers.sha256(evBytes), acc.evidenceHash.toLowerCase());
  await t("local-tools-toggle").click();
  await check("local tools: skip wait disabled while the vote is pending", !(await t("btn-advance-time").isEnabled()));

  // ---- a second window resolves the vote at the same time: one wins, no raw errors
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installFakeMetaMask(ctx2, inst.rpc);
  const p2 = await ctx2.newPage();
  await p2.goto(`${inst.base}/#/record/${photo1}`); await p2.waitForTimeout(1200);
  await check("second window: sees the open accusation and the vote chip", await p2.getByTestId("btn-vote-not-fake-inline").isVisible());
  const d2 = driver(p2);
  await t("local-tools-close").click();
  const [o1, o2] = await Promise.all([click("btn-vote-not-fake-inline"), d2.click("btn-vote-not-fake-inline")]);
  await check("concurrency: both windows got an answer, none a raw UMA error", !!o1 && !!o2 && !/Revealed data|Cannot commit|coalesce/i.test(`${o1?.text} ${o2?.text}`), `${o1?.text} | ${o2?.text}`);
  await check("concurrency: the accusation is decided once", !(await lib.listAccusations(ctx)).some((a) => a.open));
  await p2.reload(); await p2.waitForTimeout(1500);
  await eq("A-2: the second window shows the same outcome", await p2.getByTestId("settle-outcome").first().getAttribute("data-outcome"), "not-proven");
  await ctx2.close();
  await page.reload(); await page.waitForTimeout(1200); await idle();
  const after = await money();
  await eq("vote not proven: record attested again (chain)", (await recordOf(photo1)).state, "attested");
  await eq("vote not proven: Bob lost B (wallet + credit, chain)", after.bob + after.cBob - before.bob - before.cBob, -B);
  await eq("vote not proven: Alice credit +B − fB (chain)", after.cAlice - before.cAlice, B - fB);
  await eq("vote not proven: Store +fB (chain)", after.store - before.store, fB);
  await check("vote not proven: outcome in words on the record", /Accusation rejected/.test(await text("settle-outcome")));
  await check("vote not proven: the challenge period was extended (chain)", BigInt((await recordOf(photo1)).accusableUntil) > until0);

  // ---- Alice: claim, skip wait, refund
  await mm.use("alice"); await page.waitForTimeout(800); await idle();
  await check("switch back: Alice's claim badge shows her credit", (await text("account-claim-badge")).includes(fmt(B - fB)));
  await check("record: Claim does not replace the record's action (credit lives in the menu)", !(await page.getByTestId("btn-claim-record").count()));
  const c0 = await money();
  await t("account-button").click();
  await click("btn-claim");
  await t("account-button").click();   // close the menu
  const c1 = await money();
  await eq("claim: credit now 0 (chain)", c1.cAlice, 0n);
  await eq("claim: wallet + credit (chain)", c1.alice - c0.alice, c0.cAlice);
  await click("btn-skip-wait");
  await check("skip wait: Refund offered to the depositor", await t("btn-refund").isVisible());
  const f0 = await money();
  await click("btn-refund");
  await eq("refund: chain record refunded", (await recordOf(photo1)).state, "refunded");
  await eq("refund: Alice credit +B (chain)", (await money()).cAlice - f0.cAlice, B);
  await eq("refund: verdict says what happened", await t("record-verdict").getAttribute("data-state"), "unchallenged");
  await check("refund: verdict says 'Not proven fake · deposit refunded'", /Not proven fake · deposit refunded/.test(await text("record-verdict-title")));
  await check("B4: a refunded record offers no accusation, with the reason", !(await t("btn-accuse").isVisible().catch(() => false)) && (await t("record-action-why").isVisible()));
  await t("account-button").click();
  await click("btn-claim");
  await t("account-button").click();

  // ---- second photo: proven fake
  await go("#/attest"); await click("btn-sample-image");
  await clickConfirm("btn-attest", "confirm-attest");
  const photo2 = await page.evaluate(() => window.paprikaState.lastAttested);
  await mm.use("bob"); await page.waitForTimeout(800); await idle();
  await go(`#/record/${photo2}/accuse`);
  await t("btn-evidence-example").click();
  const a0 = await money();
  await clickConfirm("btn-commit", "confirm-commit");
  await click("btn-reveal");
  await click("btn-vote-fake-inline");
  const a1 = await money();
  await eq("vote fake: chain record fake", (await recordOf(photo2)).state, "fake");
  const dev = await deviceOnChain(key1);
  await eq("vote fake: device flagged, reason fake-proven (chain)", `${dev.status}/${dev.reason}`, "flagged/fake-proven");
  await eq("vote fake: Bob net +B − fB (chain)", a1.bob + a1.cBob - a0.bob - a0.cBob, B - fB);
  await eq("vote fake: Store +fB (chain)", a1.store - a0.store, fB);
  await check("B4: a proven-fake record offers no accusation", !(await t("btn-accuse").isVisible().catch(() => false)));
  await check("vote fake: the verdict says the device key is flagged", /flagged/.test(await text("record-verdict-detail")));
  await eq("vote fake: verdict proven fake", await t("record-verdict").getAttribute("data-state"), "fake");
  await t("protocol-toggle").check(); await page.waitForTimeout(300);
  await check("protocol view: measured on chain = rule for the fake-proven outcome", /Measured on chain = expected by the rule ✓/.test(await text("settle-check")), await text("settle-check").catch(() => ""));
  await t("protocol-toggle").uncheck();
  const wb0 = await money();
  await t("account-button").click(); await click("btn-claim"); await t("account-button").click();
  const wb1 = await money();
  await eq("claim: Bob withdraws his winnings (wallet + credit, chain)", wb1.bob - wb0.bob, wb0.cBob);

  // ---- Alice with the flagged key; new key; revoke; rejection in the wallet
  await mm.use("alice"); await page.waitForTimeout(800); await idle();
  await go("#/attest"); await click("btn-sample-image");
  await check("flagged key: attest refused before any transaction, with 'New key & register'", await t("btn-new-key-attest").isVisible() && !(await t("btn-attest").isEnabled()));
  await click("btn-new-key-attest");
  const key2 = await page.evaluate(() => window.paprikaState.device.keyId);
  await check("new key: different and active (chain)", key2 !== key1 && (await deviceOnChain(key2)).status === "active");
  mm.reject(true);
  const rj0 = mm.state.sent.length;
  await t("btn-attest").click(); await t("confirm-attest-ok").click(); await page.waitForTimeout(150); await idle();
  const rj = await driver(page).lastToast();
  mm.reject(false);
  await check("rejection: plain message, nothing sent", rj?.status === "rejected" && /rejected/i.test(rj.text) && mm.sentSince(rj0).length === 0, rj?.text);
  await clickConfirm("btn-attest", "confirm-attest");
  const photo3 = await page.evaluate(() => window.paprikaState.lastAttested);
  const v0 = await money();
  await t("account-button").click();
  await clickConfirm("btn-revoke", "revoke");
  const v1 = await money();
  await eq("revoke: device flagged, reason key-revoked (chain)", (await deviceOnChain(key2)).reason, "key-revoked");
  await check("revoke: no WETH moved", v0.alice === v1.alice && v0.paprika === v1.paprika);
  await go(`#/record/${photo3}`);
  await eq("revoke: verdict 'not judged · key revoked'", await t("record-verdict").getAttribute("data-state"), "flagged-key-revoked");

  // ---- every transaction was signed by Alice's or Bob's own key
  let bad = [];
  for (const s of mm.state.sent) { const tx = await ctx.provider.getTransaction(s.hash); if (tx.from.toLowerCase() !== s.from.toLowerCase()) bad.push(s.hash); }
  await check(`signing: all ${mm.state.sent.length} user transactions signed by MetaMask (Alice/Bob)`, mm.state.sent.length > 10 && !bad.length, bad.join(","));
  const paprikaTxs = (await ctx.provider.getLogs({ address: ctx.addresses.paprika, fromBlock: 0, toBlock: "latest" })).map((l) => l.transactionHash);
  const userSent = new Set(mm.state.sent.map((s) => s.hash.toLowerCase()));
  // Paprika events in transactions not signed by Alice or Bob come only from UMA's settlement (sent to the oracle).
  const notByUsers = [];
  for (const h of new Set(paprikaTxs)) { const tx = await ctx.provider.getTransaction(h); if (!userSent.has(h.toLowerCase()) && tx.to.toLowerCase() !== ctx.addresses.oo.toLowerCase()) notByUsers.push(`${h} to ${tx.to}`); }
  await check("signing: every other Paprika transaction is UMA's settlement, never a user action by the server", notByUsers.length === 0, notByUsers.join(","));

  // ---- local tools hidden when the network is not local
  const ctx3 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p3 = await ctx3.newPage();
  await p3.route("**/network.json", async (route) => { const r = await route.fetch(); const j = await r.json(); await route.fulfill({ json: { ...j, local: false, name: "Test network" } }); });
  await p3.goto(`${inst.base}/#/attest`); await p3.waitForTimeout(1500);
  await check("local:false: the app works (Attest page and Connect shown)", (await p3.getByRole("heading", { name: "Attest a photo" }).isVisible()) && (await p3.getByTestId("btn-connect").isVisible()));
  await check("local:false: no local tools, banner or sample image", !(await p3.getByTestId("local-tools-toggle").isVisible()) && !(await p3.getByTestId("network-banner").isVisible()) && !(await p3.getByTestId("btn-sample-image").count()));
  await ctx3.close();

  // ---- layout
  for (const w of [1440, 1280, 1024, 960]) {
    await page.setViewportSize({ width: w, height: 900 }); await page.waitForTimeout(200);
    await check(`layout ${w}px: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
}

let code = 1;
try {
  console.log(`Starting a fresh instance: chain ${RPC_PORT}, web ${WEB_PORT} ...`);
  inst = await startInstance(RPC_PORT, WEB_PORT);
  const deployment = await (await fetch(`${inst.base}/deployment.json`)).json();
  lib = await import(path.join(APP, "lib", "paprika.js"));
  ctx = lib.connect({ rpcUrl: inst.rpc, deployment });
  browser = await chromium.launch({ headless: !process.env.HEADED, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await context.grantPermissions(["camera"], { origin: inst.base });
  mm = await installFakeMetaMask(context, inst.rpc);
  page = await context.newPage();
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  await story();
  await check("no page errors", consoleErrors.length === 0, consoleErrors.join(" | "));
  code = results.every((r) => r.ok) ? 0 : 1;
} catch (e) {
  console.error("ABORTED:", e.stack || e.message);
  if (page) await page.screenshot({ path: path.join(OUT, "aborted.png") }).catch(() => {});
} finally {
  await browser?.close().catch(() => {});
  inst?.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
for (const f of failed) console.log(`  FAIL ${f.name}${f.detail ? "  -- " + f.detail : ""}`);
process.exit(failed.length || code ? 1 : 0);
