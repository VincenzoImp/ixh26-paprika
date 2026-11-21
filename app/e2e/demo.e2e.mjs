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
async function money() {
  const b = await lib.balances(ctx);
  return {
    photographer: b.photographer, accuser: b.accuser, store: b.store, paprika: b.paprika, oo: b.oo,
    cPh: await lib.credits(ctx, ctx.accounts.photographer), cAcc: await lib.credits(ctx, ctx.accounts.accuser),
  };
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
  const afterCommit = await money();   // the bond B is now locked in Paprika (wrapped from ETH if needed)
  await eq("commit: chain record still attested (hidden commit)", (await chainRecord(photo.photoHash, photo.keyId)).state, "attested");
  await clickOk("reveal", "btn-reveal");
  const m = await money();
  await eq("reveal: chain record accused", (await chainRecord(photo.photoHash, photo.keyId)).state, "accused");
  await eq("reveal: UMA OOv3 holds 2 x B", m.oo, 2n * ctx.params.bond);
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

  // 3. Verify -> attested
  await verifyFile(file1);
  await eq("verify: verdict attested", await verdict(), "attested");
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

  browser = await chromium.launch({ headless: !process.env.HEADED });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
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
