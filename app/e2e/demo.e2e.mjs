// Paprika: end-to-end test of the web demo (docs/demo.md), with Playwright (Chromium, headless).
//
// It starts its OWN fresh instance (chain + deploy + web) on spare ports, drives the page through the whole demo
// story, and checks both what the page shows and the chain state, read independently with app/lib/paprika.js.
// At the end it stops the instance. Exit code 0 = all checks passed, 1 = at least one failed.
//
//   cd app && npm run e2e            (package.json: "e2e": "node e2e/demo.e2e.mjs")
//
// Environment: E2E_RPC_PORT (default 8645), E2E_WEB_PORT (default 5273), HEADED=1 to watch.
// Screenshots of failures: app/output/e2e/.

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const RPC_PORT = Number(process.env.E2E_RPC_PORT || 8645);
const WEB_PORT = Number(process.env.E2E_WEB_PORT || 5273);
const BASE = `http://127.0.0.1:${WEB_PORT}`;
const OUT = path.join(APP, "output", "e2e");
fs.mkdirSync(OUT, { recursive: true });

const results = [];      // { name, ok, detail }
const consoleErrors = [];
const failedRequests = [];
let page, browser, server, lib, ctx;

// ------------------------------------------------------------------ instance

async function rpcAlive(port) {
  try {
    const r = await fetch(`http://127.0.0.1:${port}`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: AbortSignal.timeout(1000) });
    return r.ok;
  } catch { return false; }
}

async function startInstance() {
  if (await rpcAlive(RPC_PORT)) throw new Error(`port ${RPC_PORT} is busy: a fresh chain is needed (set E2E_RPC_PORT)`);
  server = spawn(process.execPath, ["scripts/start.js"], {
    cwd: APP, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, RPC_PORT: String(RPC_PORT), WEB_PORT: String(WEB_PORT) },
  });
  let log = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("instance did not start in 180 s:\n" + log)), 180000);
    const onData = (d) => {
      log += d;
      if (/Paprika is running/.test(log)) { clearTimeout(timer); resolve(); }
      if (/Start failed/.test(log)) { clearTimeout(timer); reject(new Error(log)); }
    };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.on("exit", (c) => { clearTimeout(timer); reject(new Error(`start.js exited (${c}):\n${log}`)); });
  });
  // the web server prints its line a moment later
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE)).ok) break; } catch {}
    await new Promise((r) => setTimeout(r, 200));
  }
}

function stopInstance() {
  if (!server) return;
  try { process.kill(-server.pid, "SIGINT"); } catch {}
  server = null;
}

// ------------------------------------------------------------------ checks

let shotN = 0;
async function check(name, cond, detail = "") {
  let ok;
  try { ok = typeof cond === "function" ? await cond() : cond; } catch (e) { ok = false; detail = (detail + " " + e.message).trim(); }
  results.push({ name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? "  -- " + detail : ""}`);
  if (!ok && page) {
    shotN += 1;
    const file = path.join(OUT, `fail-${String(shotN).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.png`);
    await page.screenshot({ path: file, fullPage: true }).catch(() => {});
    console.log(`      screenshot: ${path.relative(APP, file)}`);
  }
  return !!ok;
}
const show = (v) => typeof v === "bigint" ? v.toString() : JSON.stringify(v);
const eq = (name, actual, expected) => check(name, actual === expected, `expected ${show(expected)}, got ${show(actual)}`);

const t = (id) => page.getByTestId(id);
const text = async (id) => (await t(id).first().innerText()).trim();
async function idle() {
  await page.waitForFunction(() => document.querySelector('[data-testid="busy-indicator"]')?.classList.contains("hidden"), null, { timeout: 90000 });
}
// Clicks and waits for the action; returns the error banner text, or "" if none.
async function click(idOrLoc) {
  const loc = typeof idOrLoc === "string" ? t(idOrLoc) : idOrLoc;
  await loc.click();
  await page.waitForTimeout(150);
  await idle();
  if (await t("error-banner").isVisible()) {
    const msg = await text("error-message");
    await t("btn-dismiss-error").click();
    return msg || "(error banner without text)";
  }
  return "";
}
async function clickOk(name, id) {
  const err = await click(id);
  await check(`${name}: no error`, err === "", err);
}
const verdict = () => t("verify-status").getAttribute("data-state");
const fmt = (v) => lib.formatToken(ctx, v);

// Chain reads, independent of the page.
async function chainRecord(photoHash, keyId) {
  const rows = await lib.verifyPhoto(ctx, photoHash);
  return keyId ? rows.find((r) => r.keyId.toLowerCase() === keyId.toLowerCase()) : rows[rows.length - 1];
}
async function deviceOnChain(keyId) {
  const d = await ctx.contracts.paprika.devices(keyId);
  return { status: ["none", "active", "flagged"][Number(d.status ?? d[1])], reason: ["none", "fake-proven", "key-revoked"][Number(d.reason ?? d[2])] };
}
// The addresses of the page's own wallets (each actor signs client-side).
const W = { photographer: "", accuser: "" };
async function money() {
  const tok = ctx.contracts.token;
  const bal = async (a) => (a ? BigInt(await tok.balanceOf(a)) : 0n);
  return {
    photographer: await bal(W.photographer), accuser: await bal(W.accuser), store: await bal(ctx.addresses.store),
    paprika: await bal(ctx.addresses.paprika), oo: await bal(ctx.addresses.oo),
    cPh: W.photographer ? await lib.credits(ctx, W.photographer) : 0n, cAcc: W.accuser ? await lib.credits(ctx, W.accuser) : 0n,
  };
}
// Connects the browser wallet of a role in the page and funds it from the local faucet; returns its address.
async function connectWallet(role, p = page) {
  await p.getByTestId(role === "photographer" ? "tab-photographer" : "tab-accuser").click();
  await p.getByTestId(`btn-wallet-browser-${role}`).click(); await p.waitForTimeout(150);
  await p.waitForFunction(() => document.querySelector('[data-testid="busy-indicator"]')?.classList.contains("hidden"), null, { timeout: 60000 });
  await p.getByTestId(`btn-faucet-${role}`).click(); await p.waitForTimeout(150);
  await p.waitForFunction(() => document.querySelector('[data-testid="busy-indicator"]')?.classList.contains("hidden"), null, { timeout: 60000 });
  return p.evaluate((r) => window.paprikaState.wallets[r]?.address || "", role);
}
// Header balances shown by the page must equal the chain.
async function headerMatchesChain(label) {
  const m = await money();
  await eq(`${label}: header photographer balance = chain`, await text("balance-photographer"), fmt(m.photographer));
  await eq(`${label}: header accuser balance = chain`, await text("balance-accuser"), fmt(m.accuser));
  await eq(`${label}: header Store balance = chain`, await text("balance-store"), fmt(m.store));
  const cp = await text("header-credit-photographer");
  await eq(`${label}: header photographer credit = chain`, cp, m.cPh ? `+ ${fmt(m.cPh)} credit` : "");
  const ca = await text("header-credit-accuser");
  await eq(`${label}: header accuser credit = chain`, ca, m.cAcc ? `+ ${fmt(m.cAcc)} credit` : "");
  return m;
}
async function attestSample() {
  await t("tab-photographer").click();
  await clickOk("sample image", "btn-sample-image");
  await clickOk("attest", "btn-attest");
  return page.evaluate(() => ({ photoHash: window.paprikaState.attested?.photoHash, keyId: window.paprikaState.attested?.keyId }));
}
async function downloadLast(nth = 0) {
  await t("tab-photographer").click();
  const dl = page.waitForEvent("download");
  await t("btn-download").nth(nth).click();
  const file = path.join(os.tmpdir(), `paprika-e2e-${Date.now()}.jpg`);
  await (await dl).saveAs(file);
  return file;
}
async function verifyFile(file) {
  await t("tab-verifier").click();
  await t("input-verify-file").setInputFiles(file);
  await page.waitForTimeout(150);
  await idle();
}
async function accuse(photo, fake) {
  await t("tab-accuser").click();
  if (await t("btn-accuse-new").isEnabled()) await click("btn-accuse-new");
  await t("select-accuse-photo").selectOption(`${photo.photoHash}|${photo.keyId}`);
  await t("input-evidence").fill("https://example.org/e2e-evidence");
  await clickOk("commit", "btn-commit");
  await t("tab-photographer").click();
  await check("B1: advance time disabled after commit", !(await t("btn-advance-time").isEnabled()));
  await check("B1: advance time reason shown", /accusation is open/i.test(await text("advance-why")));
  await t("tab-accuser").click();
  const afterCommit = await money();   // the bond B is now locked in Paprika (wrapped from ETH if needed)
  await eq("commit: chain record still attested (hidden commit)", (await chainRecord(photo.photoHash, photo.keyId)).state, "attested");
  await clickOk("reveal", "btn-reveal");
  const m = await money();
  await eq("reveal: chain record accused", (await chainRecord(photo.photoHash, photo.keyId)).state, "accused");
  await eq("reveal: UMA OOv3 holds 2 x B", m.oo, 2n * ctx.params.bond);
  await check("B1: advance time disabled while the vote is pending", !(await t("btn-advance-time").isEnabled()));
  await clickOk(fake ? "vote fake" : "vote not fake", fake ? "btn-vote-fake" : "btn-vote-not-fake");
  return afterCommit;
}

// ------------------------------------------------------------------ the story

async function story() {
  const B = ctx.params.bond;
  const fB = (B * BigInt(Math.round(ctx.params.feeShare * 1e6))) / 1000000n;

  await page.goto(BASE);
  await page.waitForTimeout(800);
  await idle();
  await check("page connects (no fatal message)", !(await t("fatal-message").isVisible()));
  // B6: the server serves the deployment of THIS chain at /deployment.json.
  const served = await (await fetch(`${BASE}/deployment.json`)).json();
  await eq("B6: /deployment.json is this chain's deployment", served.addresses.paprika.toLowerCase(), ctx.addresses.paprika.toLowerCase());
  // M2: /rpc forwards only the methods the page needs.
  const bad = await fetch(`${BASE}/rpc`, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "hardhat_setBalance", params: ["0x0000000000000000000000000000000000000001", "0x1"] }) });
  await eq("M2: /rpc refuses hardhat_setBalance", bad.status, 403);
  // Wallets: the server signs nothing for the user. /rpc refuses eth_sendTransaction and eth_accounts.
  for (const method of ["eth_sendTransaction", "eth_accounts"]) {
    const r = await fetch(`${BASE}/rpc`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params: method === "eth_accounts" ? [] : [{ to: ctx.addresses.paprika }] }) });
    await eq(`wallet: /rpc refuses ${method}`, r.status, 403);
  }
  // Before a wallet is connected, the actor's actions are refused with the reason.
  await t("tab-photographer").click();
  await check("wallet: Register refused before a wallet is connected", !(await t("btn-register").isEnabled()));
  await check("wallet: the reason is shown", /Connect a wallet/.test(await text("wallet-why-photographer")));
  W.photographer = await connectWallet("photographer");
  await check("wallet: photographer wallet connected (browser wallet)", /^0x[0-9a-fA-F]{40}$/.test(W.photographer));
  await check("faucet: photographer wallet funded with test ETH (chain)", (await ctx.provider.getBalance(W.photographer)) > 0n);
  await check("wallet: Register enabled once connected and funded", await t("btn-register").isEnabled());
  W.accuser = await connectWallet("accuser");
  await check("faucet: accuser wallet funded with test ETH (chain)", (await ctx.provider.getBalance(W.accuser)) > 0n);
  await check("wallet: the two actors have different addresses", W.accuser.toLowerCase() !== W.photographer.toLowerCase());
  await t("tab-photographer").click();
  // Layout: no horizontal scroll at 1440, 1280, 1024; the explainer is not under the footer.
  for (const w of [1440, 1280, 1024]) {
    await page.setViewportSize({ width: w, height: 900 });
    await page.waitForTimeout(200);
    await check(`layout ${w}px: no horizontal scroll`, await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    if (w > 1100) await check(`layout ${w}px: explainer above the footer`, await page.evaluate(() =>
      document.querySelector('[data-testid="explainer"]').getBoundingClientRect().bottom <= document.querySelector("footer").getBoundingClientRect().top + 1));
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  // F1 (moved by review 2): B and T_photo are always visible in the protocol map; all four in "Parameters & contracts".
  await check("F1: B and T_photo always visible (protocol map)", (await text("map-attest")).includes(fmt(B)) && (await text("map-challenge")).includes((await t("param-photo-window").textContent()).trim()));
  await t("params-toggle").click();
  await check("F1: all four parameters in the Parameters panel", await t("param-photo-window").isVisible() && await t("param-fee").isVisible() && await t("param-reveal-window").isVisible());
  await t("params-toggle").click();
  await eq("param B shown", (await t("param-bond").textContent()).trim(), fmt(B));
  await headerMatchesChain("start");

  // 1. Register
  await t("tab-photographer").click();
  await clickOk("register", "btn-register");
  await eq("register: device-status active (page)", await t("device-status").getAttribute("data-status"), "active");
  const key1 = await page.evaluate(() => window.paprikaState.device.keyId);
  await eq("register: device active (chain)", (await deviceOnChain(key1)).status, "active");
  const afterReg = await money();
  await eq("register: free (photographer WETH unchanged)", afterReg.photographer, 0n);

  // 2. Attest a sample image
  const m0 = await money();
  const photo1 = await attestSample();
  await check("attest: page reports the photo hash", !!photo1.photoHash);
  const r1 = await chainRecord(photo1.photoHash, photo1.keyId);
  await eq("attest: chain record attested", r1?.state, "attested");
  await eq("attest: chain deposit locked = B", r1?.depositLocked, B);
  const m1 = await headerMatchesChain("after attest");
  await eq("attest: Paprika +B", m1.paprika - m0.paprika, B);
  await check("attest: capture-result shown", (await text("capture-result")).length > 0);
  await eq("attest: My photos row state", await t("deposit-row").first().getAttribute("data-state"), "attested");
  await check("attest: refund button disabled before the period", !(await t("btn-refund").first().isEnabled()));
  const file1 = await downloadLast(0);
  // M3: the same photo cannot be attested twice by the same key, and a forced click sends nothing.
  await check("M3: re-attest button disabled", !(await t("btn-attest").isEnabled()));
  await check("M3: one result block after the attest (no warning)", /Recorded on chain/.test(await text("capture-result")) && !(await t("attest-refusal").isVisible()));
  const ra0 = await money();
  await t("btn-attest").evaluate((b) => { b.disabled = false; b.click(); });
  await page.waitForTimeout(150); await idle();
  const raErr = (await t("error-banner").isVisible()) ? await text("error-message") : "";
  if (raErr) await t("btn-dismiss-error").click();
  const ra1 = await money();
  await check("M3: forced re-attest refused before any transaction", /already attested/i.test(raErr), raErr);
  await check("M3: forced re-attest spends nothing", ra0.photographer === ra1.photographer && ra0.paprika === ra1.paprika);
  // M6: an empty file is refused; a non-image is accepted with a warning.
  await t("input-capture-file").setInputFiles({ name: "empty.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(0) });
  await page.waitForTimeout(150); await idle();
  await check("M6: empty file refused (capture)", (await t("error-banner").isVisible()) && /empty/i.test(await text("error-message")));
  if (await t("error-banner").isVisible()) await t("btn-dismiss-error").click();
  await t("input-capture-file").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a photo") });
  await page.waitForTimeout(150); await idle();
  await check("M6: non-image warned (capture)", (await t("capture-warning").isVisible()) && /not look like an image/i.test(await text("capture-warning")));
  await t("tab-verifier").click();
  await t("input-verify-file").setInputFiles({ name: "empty.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(0) });
  await page.waitForTimeout(150); await idle();
  await check("M6: empty file refused (verifier)", (await t("error-banner").isVisible()) && /empty/i.test(await text("error-message")));
  if (await t("error-banner").isVisible()) await t("btn-dismiss-error").click();

  // 3. Verify -> attested
  await verifyFile(file1);
  await eq("verify: verdict attested", await verdict(), "attested");
  await check("F2: 'Not shown: that a camera took this photo' visible", /Not shown: that a camera took this photo/.test(await text("verify-not-shown")));
  await check("verify: honest sentence names block a", (await text("verify-honest-sentence")).includes(String(r1.anchorBlock)));
  await t("tab-verifier").click();
  await clickOk("verify last attested", "btn-verify-last");
  await eq("verify last: verdict attested", await verdict(), "attested");

  // 4. One pixel changed -> no record
  await clickOk("change pixel", "btn-change-pixel");
  await eq("change pixel: verdict no-record", await verdict(), "no-record");

  // 5-7. Accuse, vote "does not prove"
  const before = await money();
  const c1 = await accuse(photo1, false);
  const after = await headerMatchesChain("after vote not proven");
  await eq("vote not proven: outcome shown", await t("settle-outcome").getAttribute("data-outcome"), "not-proven");
  await eq("vote not proven: chain record attested again", (await chainRecord(photo1.photoHash, photo1.keyId)).state, "attested");
  await eq("vote not proven: accuser lost B (wallet + credit)", (after.accuser + after.cAcc) - (c1.accuser + c1.cAcc) - B, -B);
  await eq("vote not proven: depositor credit +B - fB", after.cPh - before.cPh, B - fB);
  await eq("vote not proven: Store +fB", after.store - before.store, fB);
  await eq("vote not proven: page accuser delta = rule", await text("settle-accuser"), await text("settle-expected-accuser"));
  await eq("vote not proven: page depositor delta = rule", await text("settle-depositor"), await text("settle-expected-depositor"));
  await eq("vote not proven: page store delta = rule", await text("settle-store"), await text("settle-expected-store"));
  const rAfterVote = await chainRecord(photo1.photoHash, photo1.keyId);
  await check("vote not proven: challenge period extended", rAfterVote.accusableUntil > r1.accusableUntil,
    `${r1.accusableUntil} -> ${rAfterVote.accusableUntil}`);

  // Withdraw credit
  await t("tab-photographer").click();
  const w0 = await money();
  await clickOk("withdraw photographer credit", "btn-deposits-withdraw");
  const w1 = await headerMatchesChain("after withdraw");
  await eq("withdraw: credit now 0 (chain)", w1.cPh, 0n);
  await eq("withdraw: wallet +credit (chain)", w1.photographer - w0.photographer, w0.cPh);

  // Advance time, refund
  await clickOk("advance time", "btn-advance-time");
  const ci = await lib.chainInfo(ctx);
  const rBeforeRefund = await chainRecord(photo1.photoHash, photo1.keyId);
  await check("advance: chain time >= refundableAt", ci.timestamp >= rBeforeRefund.refundableAt, `${ci.timestamp} vs ${rBeforeRefund.refundableAt}`);
  await check("advance: refund button enabled", await t("btn-refund").first().isEnabled());
  const f0 = await money();
  await clickOk("refund", t("btn-refund").first());
  const f1 = await headerMatchesChain("after refund");
  await eq("refund: chain record refunded", (await chainRecord(photo1.photoHash, photo1.keyId)).state, "refunded");
  await eq("refund: photographer credit +B", f1.cPh - f0.cPh, B);
  await eq("refund: My photos row refunded", await t("deposit-row").first().getAttribute("data-state"), "refunded");
  await verifyFile(file1);
  await eq("verify after refund: unchallenged", await verdict(), "unchallenged");
  await check("F2: refunded after a rejected accusation says what happened", /accusation rejected · deposit returned/.test(await text("verify-title")));
  // B4: a refunded photo is not offered to the accuser, and the reason is shown.
  await t("tab-accuser").click();
  const opts1 = await t("select-accuse-photo").locator("option").evaluateAll((os) => os.map((o) => o.value));
  await check("B4: refunded photo not offered", !opts1.some((v) => v.startsWith(photo1.photoHash)), opts1.join(","));
  await check("B4: reason for not offering shown", /refunded/.test(await text("accuse-not-accusable")));

  // Second photo: proven fake
  const photo2 = await attestSample();
  const a0 = await money();
  const c2 = await accuse(photo2, true);
  const a1 = await headerMatchesChain("after vote fake proven");
  await eq("vote fake: outcome shown", await t("settle-outcome").getAttribute("data-outcome"), "fake-proven");
  await eq("vote fake: chain record fake", (await chainRecord(photo2.photoHash, photo2.keyId)).state, "fake");
  const dev = await deviceOnChain(photo2.keyId);
  await eq("vote fake: device flagged (chain)", dev.status, "flagged");
  await eq("vote fake: reason fake-proven (chain)", dev.reason, "fake-proven");
  await eq("vote fake: accuser net +B - fB (chain)", (a1.accuser + a1.cAcc) - (c2.accuser + c2.cAcc) - B, B - fB);
  await eq("vote fake: Store +fB (chain)", a1.store - a0.store, fB);
  await eq("vote fake: page accuser delta = rule", await text("settle-accuser"), await text("settle-expected-accuser"));
  await eq("vote fake: page depositor delta = rule", await text("settle-depositor"), await text("settle-expected-depositor"));
  await t("tab-accuser").click();
  await clickOk("withdraw accuser credit", "btn-withdraw-accuser");
  await eq("withdraw accuser: credit 0 (chain)", (await money()).cAcc, 0n);
  const opts2 = await t("select-accuse-photo").locator("option").evaluateAll((os) => os.map((o) => o.value));
  await check("B4: proven-fake photo not offered", !opts2.some((v) => v.startsWith(photo2.photoHash)), opts2.join(","));
  await click("btn-accuse-verify");
  await eq("verifier: proven fake", await verdict(), "fake");
  await t("tab-photographer").click();
  await eq("photographer: device flagged (page)", await t("device-status").getAttribute("data-status"), "flagged");
  await clickOk("sample image (flagged device)", "btn-sample-image");
  const attestEnabled = await t("btn-attest").isEnabled();
  if (attestEnabled) {
    const err = await click("btn-attest");
    await check("attest with flagged device is refused", /not active/i.test(err), err);
  } else {
    await check("attest with flagged device is refused (button disabled)", true);
  }

  // Revoke on a new device
  await clickOk("new key", "btn-generate-key");
  await clickOk("register new key", "btn-register");
  const key2 = await page.evaluate(() => window.paprikaState.device.keyId);
  await check("new key differs", key2 && key2 !== key1);
  await eq("new key active (chain)", (await deviceOnChain(key2)).status, "active");
  const photo3 = await attestSample();
  const v0 = await money();
  await clickOk("revoke", "btn-revoke");
  const v1 = await money();
  await eq("revoke: device-status flagged (page)", await t("device-status").getAttribute("data-status"), "flagged");
  const dev2 = await deviceOnChain(key2);
  await eq("revoke: device flagged (chain)", dev2.status, "flagged");
  await eq("revoke: reason key-revoked (chain)", dev2.reason, "key-revoked");
  await check("revoke: no WETH moved", v0.photographer === v1.photographer && v0.paprika === v1.paprika && v0.cPh === v1.cPh);
  await t("tab-verifier").click();
  await clickOk("verify last (revoked)", "btn-verify-last");
  await eq("verify: key revoked", await verdict(), "flagged-key-revoked");
  await eq("verify: record of photo3 still attested (chain)", (await chainRecord(photo3.photoHash, photo3.keyId)).state, "attested");

  // timeline lists transactions
  await check("activity log has rows", (await t("activity-row").count()) > 10);

  // Camera path with Chromium's fake camera: selfie -> still -> attest -> download -> verify.
  await t("tab-photographer").click();
  await clickOk("key 3", "btn-generate-key");
  await clickOk("register key 3", "btn-register");
  await clickOk("start camera", "btn-start-camera");
  await check("camera: live preview with Take a selfie", await t("btn-take-photo").isVisible());
  await clickOk("take a selfie", "btn-take-photo");
  await check("camera: still shown, Sign & attest enabled", await t("btn-attest").isEnabled());
  await check("camera: Retake offered", await t("btn-retake").isVisible());
  await check("camera: mirror preview off by default", !(await t("toggle-mirror").isChecked()));
  await clickOk("attest selfie", "btn-attest");
  const selfie = await page.evaluate(() => ({ photoHash: window.paprikaState.attested?.photoHash, keyId: window.paprikaState.attested?.keyId }));
  await eq("camera: selfie attested (chain)", (await chainRecord(selfie.photoHash, selfie.keyId))?.state, "attested");
  const nRows = await t("btn-download").count();
  const selfieFile = await downloadLast(nRows - 1);
  await verifyFile(selfieFile);
  await eq("camera: downloaded selfie verifies as attested", await verdict(), "attested");

  // B2: reload after commit keeps the commitment; the reveal still works.
  await t("tab-accuser").click();
  if (await t("btn-accuse-new").isEnabled()) await click("btn-accuse-new");
  await t("select-accuse-photo").selectOption(`${selfie.photoHash}|${selfie.keyId}`);
  await clickOk("commit (selfie)", "btn-commit");
  await page.reload(); await page.waitForTimeout(800); await idle();
  await t("tab-accuser").click();
  await check("B2: after reload, reveal is still possible", await t("btn-reveal").isEnabled());
  await check("B2: after reload, the reveal countdown is shown", /Reveal before/.test(await text("reveal-deadline")));
  await clickOk("reveal after reload", "btn-reveal");
  await eq("B2: reveal after reload: chain record accused", (await chainRecord(selfie.photoHash, selfie.keyId)).state, "accused");
  // B3: reload after reveal, and a fresh browser, both offer the vote.
  await page.reload(); await page.waitForTimeout(800); await idle();
  await t("tab-accuser").click();
  await check("B3: after reload, the vote is offered", await t("btn-vote-not-fake").isEnabled());
  const fresh = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p2 = await fresh.newPage();
  await p2.goto(BASE + "/#accuser"); await p2.waitForTimeout(1000);
  await p2.waitForFunction(() => document.querySelector('[data-testid="busy-indicator"]')?.classList.contains("hidden"), null, { timeout: 60000 });
  await check("B3: a fresh browser rebuilds the open accusation and offers the vote", await p2.getByTestId("btn-vote-not-fake").isEnabled());
  await check("B1: a fresh browser also blocks the time skip", !(await p2.getByTestId("btn-advance-time").isEnabled()));
  await fresh.close();
  await clickOk("vote not fake (after reloads)", "btn-vote-not-fake");
  await eq("B3: vote after reloads: outcome shown", await t("settle-outcome").getAttribute("data-outcome"), "not-proven");
  await eq("B3: vote after reloads: chain record attested again", (await chainRecord(selfie.photoHash, selfie.keyId)).state, "attested");
  await t("tab-photographer").click();
  await check("B1: advance time enabled again after the vote", await t("btn-advance-time").isEnabled());

  const userTxs = await page.evaluate(() => window.paprikaState.timeline.flatMap((e) => (e.items || [])
    .filter((i) => i.role === "photographer" || i.role === "accuser").map((i) => ({ hash: i.txHash, role: i.role }))));
  await signedByWallets(userTxs);

  // A second browser context gets its own wallet.
  const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const po = await other.newPage();
  await po.goto(BASE + "/#photographer"); await po.waitForTimeout(800);
  const addrOther = await connectWallet("photographer", po);
  await check("wallet: a second browser context gets its own wallet", !!addrOther && addrOther.toLowerCase() !== W.photographer.toLowerCase(), addrOther);
  await other.close();

  // MetaMask path, run with a SCRIPTED FAKE EIP-1193 provider (not real MetaMask): window.ethereum forwards every
  // request to this test, which signs with an ethers Wallet. It exercises the page's injected-wallet code in CI.
  const { ethers } = await import("ethers");
  const fakeKey = ethers.Wallet.createRandom();
  const rpc = new ethers.JsonRpcProvider(`http://127.0.0.1:${RPC_PORT}`, undefined, { staticNetwork: true, cacheTimeout: -1 });
  const fake = fakeKey.connect(rpc);
  const mm = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await mm.exposeFunction("__fakeWallet", async (method, params) => {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [fake.address];
    if (method === "wallet_switchEthereumChain" || method === "wallet_addEthereumChain") return null;
    if (method === "eth_sendTransaction") {
      const t0 = params[0];
      const sent = await fake.sendTransaction({ to: t0.to, data: t0.data, value: t0.value ?? 0, gasLimit: t0.gas ?? t0.gasLimit });
      return sent.hash;
    }
    return rpc.send(method, params ?? []);
  });
  await mm.addInitScript(() => {
    window.ethereum = { isMetaMask: true, isFakeForTests: true,
      request: ({ method, params }) => window.__fakeWallet(method, params),
      on() {}, removeListener() {} };
  });
  const pm = await mm.newPage();
  await pm.goto(BASE + "/#photographer"); await pm.waitForTimeout(800);
  await pm.getByTestId("btn-wallet-metamask-photographer").click(); await pm.waitForTimeout(300);
  await pm.waitForFunction(() => document.querySelector('[data-testid="busy-indicator"]')?.classList.contains("hidden"), null, { timeout: 60000 });
  await eq("fake EIP-1193 (scripted, not real MetaMask): page connected the injected wallet", (await pm.evaluate(() => window.paprikaState.wallets.photographer?.address || "")).toLowerCase(), fake.address.toLowerCase());
  await pm.getByTestId("btn-faucet-photographer").click(); await pm.waitForTimeout(300);
  await pm.waitForFunction(() => document.querySelector('[data-testid="busy-indicator"]')?.classList.contains("hidden"), null, { timeout: 60000 });
  await pm.getByTestId("btn-register").click(); await pm.waitForTimeout(300);
  await pm.waitForFunction(() => document.querySelector('[data-testid="busy-indicator"]')?.classList.contains("hidden"), null, { timeout: 60000 });
  const regHash = await pm.evaluate(() => window.paprikaState.registered?.txHash || "");
  const regTx = regHash ? await ctx.provider.getTransaction(regHash) : null;
  await check("fake EIP-1193 (scripted, not real MetaMask): register signed by the injected wallet", !!regTx && regTx.from.toLowerCase() === fake.address.toLowerCase(), regHash);
  await check("fake EIP-1193: timeline says 'signed in MetaMask'", /signed by .* in MetaMask/.test(await pm.getByTestId("activity-log-table").innerText()));
  await mm.close();

  // M4: a restarted or redeployed chain is detected (simulated: another stored fingerprint), local state cleared.
  await page.evaluate(() => localStorage.setItem("paprika-fingerprint", "another-chain"));
  await page.reload(); await page.waitForTimeout(800); await idle();
  await check("M4: chain change announced", (await t("error-banner").isVisible()) && /restarted or Paprika was redeployed/.test(await text("error-message")));
  await eq("M4: saved device key cleared", await t("device-status").getAttribute("data-status"), "none");
}

// Every write of the story was signed by the page's own wallets: read each transaction's sender on chain.
async function signedByWallets(hashes) {
  let n = 0, bad = [];
  for (const { hash, role } of hashes) {
    const tx = await ctx.provider.getTransaction(hash);
    if (!tx) continue;
    n += 1;
    if (tx.from.toLowerCase() !== W[role].toLowerCase()) bad.push(`${hash.slice(0, 10)} from ${tx.from} (expected ${role} ${W[role]})`);
  }
  await check(`signing: all ${n} user transactions were signed by the user's browser wallets`, n > 10 && bad.length === 0, bad.join(" | "));
}

// ------------------------------------------------------------------ main

let exitCode = 1;
try {
  console.log(`Starting a fresh instance: chain ${RPC_PORT}, web ${WEB_PORT} ...`);
  await startInstance();
  const suffix = RPC_PORT === 8545 ? "" : `-${RPC_PORT}`;
  const deployment = JSON.parse(fs.readFileSync(path.join(APP, "web", `deployment${suffix}.json`), "utf8"));
  lib = await import(path.join(APP, "lib", "paprika.js"));
  ctx = lib.connect({ rpcUrl: `http://127.0.0.1:${RPC_PORT}`, deployment });

  browser = await chromium.launch({ headless: !process.env.HEADED, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await context.grantPermissions(["camera"], { origin: BASE });
  page = await context.newPage();
  page.on("pageerror", (e) => consoleErrors.push("pageerror: " + e.message));
  page.on("console", (m) => { if (m.type() === "error") consoleErrors.push("console: " + m.text()); });
  page.on("requestfailed", (r) => failedRequests.push(`${r.method()} ${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => { if (r.status() >= 400) failedRequests.push(`${r.status()} ${r.url()}`); });

  await story();
  await check("no page errors / console errors", consoleErrors.length === 0, consoleErrors.join(" | "));
  await check("no failed network requests", failedRequests.length === 0, failedRequests.join(" | "));
  exitCode = results.every((r) => r.ok) ? 0 : 1;
} catch (e) {
  console.error("ABORTED:", e.stack || e.message);
  if (page) await page.screenshot({ path: path.join(OUT, "aborted.png"), fullPage: true }).catch(() => {});
  exitCode = 1;
} finally {
  await browser?.close().catch(() => {});
  stopInstance();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
for (const f of failed) console.log(`  FAIL ${f.name}${f.detail ? "  -- " + f.detail : ""}`);
process.exit(exitCode);
