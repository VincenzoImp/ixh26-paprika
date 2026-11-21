// Paprika: edge-case end-to-end test. Each check covers one edge case of the web app, the server or the scripts:
// concurrent actions, reloads, odd inputs, the /rpc relay, restarts. Every check must pass.
//
// It starts its OWN fresh instance (chain + deploy + web) on spare ports, drives the page with Playwright (Chromium,
// headless) and the chain with app/lib/paprika.js, and stops the instance at the end.
//
//   cd app && npm run e2e:edge         (package.json: "e2e:edge": "node e2e/edge.e2e.mjs")
//
// Environment: EDGE_RPC_PORT (default 9445), EDGE_WEB_PORT (default 5973), HEADED=1 to watch.
// Screenshots of failures: app/output/e2e/edge-*.png. Exit code 0 = all checks passed.

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const RPC_PORT = Number(process.env.EDGE_RPC_PORT || 9445);
const WEB_PORT = Number(process.env.EDGE_WEB_PORT || 5973);
const BASE = `http://127.0.0.1:${WEB_PORT}`;
const RPC = `http://127.0.0.1:${RPC_PORT}`;
const OUT = path.join(APP, "output", "e2e");
fs.mkdirSync(OUT, { recursive: true });
const env = { ...process.env, RPC_PORT: String(RPC_PORT), WEB_PORT: String(WEB_PORT) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const results = [];
let browser, page, server, lib, ctx;

// ------------------------------------------------------------------ instance

async function rpcCall(method, params = []) {
  const r = await fetch(RPC, { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }), signal: AbortSignal.timeout(2000) });
  return (await r.json()).result;
}
const rpcAlive = async () => { try { return !!(await rpcCall("eth_chainId")); } catch { return false; } };

async function startInstance() {
  if (await rpcAlive()) throw new Error(`port ${RPC_PORT} is busy: a fresh chain is needed (set EDGE_RPC_PORT)`);
  server = spawn(process.execPath, ["scripts/start.js"], { cwd: APP, detached: true, stdio: ["ignore", "pipe", "pipe"], env });
  let log = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("instance did not start in 180 s:\n" + log)), 180000);
    const onData = (d) => { log += d; if (/Paprika is running/.test(log)) { clearTimeout(timer); resolve(); } if (/Start failed/.test(log)) { clearTimeout(timer); reject(new Error(log)); } };
    server.stdout.on("data", onData); server.stderr.on("data", onData);
    server.on("exit", (c) => { clearTimeout(timer); reject(new Error(`start.js exited (${c}):\n${log}`)); });
  });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await sleep(200); }
}
function stopInstance() {
  if (server) { try { process.kill(-server.pid, "SIGINT"); } catch {} server = null; }
  try { execSync("node scripts/stop.js", { cwd: APP, env, stdio: "ignore" }); } catch {}
}

// ------------------------------------------------------------------ checks and page helpers

let shotN = 0;
async function check(id, name, cond, detail = "") {
  let ok;
  try { ok = typeof cond === "function" ? await cond() : cond; } catch (e) { ok = false; detail = (detail + " " + e.message).trim(); }
  results.push({ id, name, ok: !!ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  [${id}] ${name}${!ok && detail ? "  -- " + detail : ""}`);
  if (!ok && page) {
    shotN += 1;
    await page.screenshot({ path: path.join(OUT, `edge-${String(shotN).padStart(2, "0")}-${id}.png`), fullPage: true }).catch(() => {});
  }
  return !!ok;
}
const t = (id, p = page) => p.getByTestId(id);
const text = async (id, p = page) => (await t(id, p).first().innerText()).trim();
const idle = (p = page) => p.waitForFunction(() => document.querySelector('[data-testid="busy-indicator"]')?.classList.contains("hidden"), null, { timeout: 120000 });
async function click(idOrLoc, p = page) {
  const loc = typeof idOrLoc === "string" ? t(idOrLoc, p) : idOrLoc;
  if (!(await loc.isEnabled())) return "DISABLED";
  await loc.click();
  await p.waitForTimeout(150);
  await idle(p);
  if (await t("error-banner", p).isVisible()) {
    const info = await t("error-banner", p).evaluate((e) => e.classList.contains("info"));
    const msg = await text("error-message", p);
    await t("btn-dismiss-error", p).click();
    return info ? "" : msg || "(error banner without text)";
  }
  return "";
}
async function must(what, r) { if (r) throw new Error(`${what}: ${r}`); }
const attested = () => page.evaluate(() => ({ photoHash: window.paprikaState.attested.photoHash, keyId: window.paprikaState.attested.keyId }));
// Wallets pay deposits and bonds themselves: top up from the local faucet when the page says the wallet is short.
async function topUp(role, pg = page) {
  const why = await t(`wallet-why-${role}`, pg).innerText().catch(() => "");
  if (!/faucet/i.test(why)) return;
  let r = await click(`btn-faucet-${role}`, pg);
  const wait = /try again in (\d+) s/.exec(r);   // the faucet allows one request per address every few seconds
  if (wait) { await sleep((Number(wait[1]) + 1) * 1000); r = await click(`btn-faucet-${role}`, pg); }
  await must(`faucet top-up ${role}`, r);
}
async function attestSample() {
  await t("tab-photographer").click();
  await topUp("photographer");
  await must("sample", await click("btn-sample-image"));
  await must("attest", await click("btn-attest"));
  return attested();
}
async function attestFile(name, bytes) {
  await t("tab-photographer").click();
  await topUp("photographer");
  const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "paprika-edge-")), name);
  fs.writeFileSync(f, bytes);
  await t("input-capture-file").setInputFiles(f);
  await page.waitForTimeout(150); await idle();
  await must("attest file", await click("btn-attest"));
  return attested();
}
async function webCommit(p, pg = page) {
  await t("tab-accuser", pg).click();
  await topUp("accuser", pg);
  if (await t("btn-accuse-new", pg).isEnabled()) { await t("btn-accuse-new", pg).click(); await pg.waitForTimeout(100); }
  await t("select-accuse-photo", pg).selectOption(`${p.photoHash}|${p.keyId}`);
  return click("btn-commit", pg);
}
async function libAccuse(p) {
  if ((await ctx.provider.getBalance(ctx.accounts.accuser)) < 2n * ctx.params.bond) await lib.requestTestFunds(ctx, ctx.accounts.accuser);
  const c = await lib.commitAccusation(ctx, "accuser", { photoHash: p.photoHash, keyId: p.keyId, evidence: "edge test evidence" });
  return lib.revealAccusation(ctx, "accuser", { photoHash: p.photoHash, keyId: p.keyId, evidenceHash: c.evidenceHash, salt: c.salt });
}
async function voteAllOpen(fake = false) {
  for (const a of (await lib.listAccusations(ctx)).filter((x) => x.open)) await lib.umaVote(ctx, a.assertionId, fake);
}
const stateOf = async (p) => (await lib.verifyPhoto(ctx, p.photoHash)).find((r) => r.keyId.toLowerCase() === p.keyId.toLowerCase())?.state;
async function mineAt(ts) { await ctx.provider.send("evm_setNextBlockTimestamp", [ts]); await ctx.provider.send("evm_mine", []); }
async function freshPage() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const p = await context.newPage();
  await p.goto(BASE + "/#accuser"); await p.waitForTimeout(600); await idle(p);
  return p;
}

// ------------------------------------------------------------------ the checks

// Connects the page's browser wallet for a role and funds it from the local faucet (each actor signs client-side).
async function connectWallet(role, p = page) {
  await t(role === "photographer" ? "tab-photographer" : "tab-accuser", p).click();
  await must(`wallet ${role}`, await click(`btn-wallet-browser-${role}`, p));
  await must(`faucet ${role}`, await click(`btn-faucet-${role}`, p));
  return p.evaluate((r) => window.paprikaState.wallets[r]?.address, role);
}

async function edge() {
  await page.goto(BASE + "/"); await page.waitForTimeout(800); await idle();
  const pageAccuser = (await connectWallet("accuser")) || "";
  await connectWallet("photographer");
  await must("register", await click("btn-register"));
  const X = await attestSample(), Y = await attestSample(), Z = await attestSample(), W = await attestSample(), V = await attestSample();

  // W-A (major): the web reveals its accusation while another accusation (from the CLI) is open on another photo.
  await must("commit Y", await webCommit(Y));
  await libAccuse(X);
  await must("reveal Y", await click("btn-reveal"));
  const acc = await page.evaluate(() => window.paprikaState.acc);
  await check("W-A", "after its reveal, the page keeps showing its own accusation (photo Y), not another open one",
    (acc?.photoHash || "").toLowerCase() === Y.photoHash.toLowerCase(), `page shows ${acc?.photoHash?.slice(0, 10)} (X=${X.photoHash.slice(0, 10)}, Y=${Y.photoHash.slice(0, 10)})`);
  await voteAllOpen(false);
  await page.reload(); await page.waitForTimeout(600); await idle();

  // W-B (major): a reveal on a photo already under accusation returns the bond; the page must say so.
  await must("commit Z", await webCommit(Z));
  await libAccuse(Z);
  const credit0 = await lib.credits(ctx, pageAccuser);
  await must("reveal Z", await click("btn-reveal"));
  const credit1 = await lib.credits(ctx, pageAccuser);
  await check("W-B", "chain: bond credited back on a reveal against an accused photo", credit1 - credit0 === ctx.params.bond);
  const explainer = await text("explainer-text"), reveal = await text("reveal-status");
  await check("W-B", "page does not claim that both stakes went to UMA when no accusation opened",
    !/2B\) are now at UMA/.test(explainer) && !/sent to UMA and disputed/.test(reveal), `explainer="${explainer.slice(0, 90)}" reveal-status="${reveal}"`);
  await check("W-B", "page says the bond was credited back", /credited back|bond.*back/i.test(explainer + " " + reveal), `explainer="${explainer.slice(0, 90)}" reveal-status="${reveal}"`);
  await voteAllOpen(false);
  await page.reload(); await page.waitForTimeout(600); await idle();

  // W-C (major): "Start a new accusation" during a live, unrevealed commitment drops the secret; the bond is stranded.
  await must("commit W", await webCommit(W));
  const newEnabled = await t("btn-accuse-new").isEnabled();
  let dialog = false;
  page.once("dialog", (d) => { dialog = true; d.dismiss(); });
  if (newEnabled) { await t("btn-accuse-new").click(); await page.waitForTimeout(300); }
  const kept = await page.evaluate(() => !!window.paprikaState.acc?.commitment);
  await check("W-C", "a live commitment is not dropped silently by 'Start a new accusation' (disabled, or asks first)",
    !newEnabled || dialog || kept, `enabled=${newEnabled} dialog=${dialog} commitment kept=${kept}`);
  if (kept && await t("btn-reveal").isEnabled()) { await click("btn-reveal"); await voteAllOpen(false); await page.reload(); await page.waitForTimeout(600); await idle(); }

  // W-E (minor): Reveal at the reveal deadline: the next block is after it, so the reveal can only fail ("too late").
  await must("commit V", await webCommit(V));
  const committedAt = await page.evaluate(() => window.paprikaState.acc.committedAt);
  await mineAt(committedAt + ctx.params.revealWindow);
  await page.waitForTimeout(3600);
  await check("W-E", "Reveal is disabled when the latest block is at the reveal deadline (the reveal would be 'too late')",
    !(await t("btn-reveal").isEnabled()), `deadline text: ${await text("reveal-deadline")}`);
  if (await t("btn-accuse-new").isEnabled()) { await t("btn-accuse-new").click(); await page.waitForTimeout(200); }

  // W-I (minor): two windows press the vote buttons at once: the loser gets a plain message, not an ethers internal.
  const U = await attestSample();
  await must("commit U", await webCommit(U));
  await must("reveal U", await click("btn-reveal"));
  const page2 = await freshPage();
  const [r1, r2] = await Promise.all([click("btn-vote-fake"), click("btn-vote-not-fake", page2)]);
  await check("W-I", "a second simultaneous vote fails with a plain message", !/coalesce|could not/i.test(r1 + r2), `window1="${r1}" window2="${r2}"`);
  await page2.context().close();
  await page.reload(); await page.waitForTimeout(600); await idle();
  // the YES vote may have flagged the key: continue with a new key
  await t("tab-photographer").click();
  await t("btn-generate-key").click(); await page.waitForTimeout(150); await idle();
  await must("register new key", await click("btn-register"));

  // W-F (minor): Download of a non-JPEG attested file keeps its type in the file name.
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  const G = await attestFile("edge.gif", gif);
  await t("tab-photographer").click();
  const ev = page.waitForEvent("download");
  await page.locator(`[data-testid="deposit-row"][data-photo-hash="${G.photoHash}"] [data-testid="btn-download"]`).click();
  const dl = await ev;
  await check("W-F", "Download of a GIF is named .gif (not .jpg)", /\.gif$/i.test(dl.suggestedFilename()), dl.suggestedFilename());

  // W-G (minor): several files dropped at once on the Verifier: the page must not silently verify only the first.
  await t("tab-verifier").click();
  const dt = await page.evaluateHandle(() => { const d = new DataTransfer();
    d.items.add(new File([new Uint8Array([1, 2, 3])], "one.bin")); d.items.add(new File([new Uint8Array([4, 5, 6])], "two.bin")); return d; });
  await t("verify-dropzone").dispatchEvent("drop", { dataTransfer: dt });
  await page.waitForTimeout(300); await idle();
  const said = (await page.evaluate(() => document.body.innerText));
  await check("W-G", "dropping 2 files says that only one file is verified (or verifies both)", /two\.bin|2 files|one file at a time|only the first/i.test(said));

  // W-H (minor): at 800 px the footer (the demo disclosure) is cut off with an ellipsis.
  await page.setViewportSize({ width: 800, height: 900 });
  await page.waitForTimeout(200);
  await check("W-H", "footer disclosure is fully visible at 800 px", await t("footer").evaluate((f) => f.scrollWidth <= f.clientWidth));
  await page.setViewportSize({ width: 1440, height: 900 });

  // W-D (minor): a record of a revoked key whose challenge period is over must not say "can still be accused until".
  await t("tab-photographer").click();
  const R = await attestSample();
  await must("advance", await click("btn-advance-time"));
  await must("revoke", await click("btn-revoke"));
  await t("tab-verifier").click();
  await must("verify last", await click("btn-verify-last"));
  const detail = await text("verify-detail");
  await check("W-D", "revoked key + challenge period over: verdict does not offer an accusation in the past",
    !/can still be accused/i.test(detail), detail);
  void R;

  // ---- refused files, simultaneous votes, timeline after a reload ----
  await t("tab-photographer").click();
  await t("btn-generate-key").click(); await page.waitForTimeout(150); await idle();
  await must("register key for A-checks", await click("btn-register"));

  // A-2 (minor): two windows vote at the same time: one vote wins, the other gets a plain message, nothing stays stuck.
  const Q = await attestSample();
  await must("commit Q", await webCommit(Q));
  await must("reveal Q", await click("btn-reveal"));
  const pageB = await freshPage();
  const [q1, q2] = await Promise.all([click("btn-vote-fake"), click("btn-vote-not-fake", pageB)]);
  const stillOpen = (await lib.listAccusations(ctx)).some((x) => x.open);
  const outA = await t("settle-outcome").getAttribute("data-outcome").catch(() => "");
  const outB = await t("settle-outcome", pageB).getAttribute("data-outcome").catch(() => "");
  await check("A-2", "simultaneous votes: no raw UMA error, the accusation is decided, both windows show the outcome",
    !/Revealed data|Cannot commit|coalesce|could not/i.test(q1 + q2) && !stillOpen && !!outA && outA === outB,
    `window1="${q1}" window2="${q2}" open=${stillOpen} outcomes=${outA}/${outB}`);
  await pageB.context().close();

  // A-4 (minor): after a refused (empty) file, the previously loaded file is cleared: nothing can be attested by mistake.
  await t("tab-photographer").click();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paprika-edge-"));
  fs.writeFileSync(path.join(dir, "one.bin"), Buffer.from([7]));
  fs.writeFileSync(path.join(dir, "empty.jpg"), Buffer.alloc(0));
  await t("input-capture-file").setInputFiles(path.join(dir, "one.bin"));
  await page.waitForTimeout(150); await idle();
  await t("input-capture-file").setInputFiles(path.join(dir, "empty.jpg"));
  await page.waitForTimeout(150); await idle();
  const refusedMsg = (await t("error-banner").isVisible()) ? await text("error-message") : "";
  if (refusedMsg) await t("btn-dismiss-error").click();
  const photoLeft = await page.evaluate(() => !!window.paprikaState.photo);
  await check("A-4", "an empty file is refused and the previous file is no longer ready to attest",
    /empty/i.test(refusedMsg) && !photoLeft && !(await t("btn-attest").isEnabled()), `msg="${refusedMsg}" photo kept=${photoLeft}`);

  // A-7 (minor): the timeline survives a reload.
  const rowsBefore = await t("activity-row").count();
  await page.reload(); await page.waitForTimeout(600); await idle();
  const rowsAfter = await t("activity-row").count();
  await check("A-7", "the timeline is still there after a reload", rowsBefore > 0 && rowsAfter >= rowsBefore, `${rowsBefore} rows before, ${rowsAfter} after`);

  // S-3 (major): a second `npm start` on ports already in use must not redeploy over the running demo.
  const before = (await (await fetch(BASE + "/deployment.json")).json()).addresses.paprika;
  const second = spawn(process.execPath, ["scripts/start.js"], { cwd: APP, detached: true, stdio: "ignore", env });
  await new Promise((r) => { second.on("exit", r); setTimeout(r, 45000); });
  try { process.kill(-second.pid, "SIGINT"); } catch {}
  const after = (await (await fetch(BASE + "/deployment.json")).json()).addresses.paprika;
  await check("S-3", "a second npm start leaves the running deployment untouched", after === before && (await ctx.provider.getCode(before)) !== "0x", `before ${before}, after ${after}`);

  // S-2 (major): /rpc allow-list bypass with a falsy element in a batch.
  const bypass = await fetch(BASE + "/rpc", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify([0, { jsonrpc: "2.0", id: 2, method: "hardhat_setBalance", params: ["0x0000000000000000000000000000000000000001", "0x1"] }]) });
  await check("S-2", "/rpc refuses a batch [0, hardhat_setBalance] with 403", bypass.status === 403, `HTTP ${bypass.status}`);

  // S-1 (major): /rpc with the body `null` crashes the Hardhat node (and npm start then stops everything).
  const nul = await fetch(BASE + "/rpc", { method: "POST", headers: { "content-type": "application/json" }, body: "null" }).catch((e) => ({ status: e.message }));
  await sleep(1500);
  await check("S-1", "/rpc with body null is refused (4xx) and the chain keeps running", String(nul.status).startsWith("4") && (await rpcAlive()), `HTTP ${nul.status}, chain alive=${await rpcAlive()}`);

  // a crashed chain (S-1) is restarted for the last check
  if (!(await rpcAlive())) { stopInstance(); await sleep(1500); await startInstance(); }

  // S-4 (minor): `npm run stop` with a port that is a prefix of this instance's port must not stop this instance.
  try { execSync("node scripts/stop.js", { cwd: APP, env: { ...process.env, RPC_PORT: String(RPC_PORT).slice(0, -1) }, stdio: "ignore" }); } catch {}
  await sleep(1500);
  await check("S-4", `RPC_PORT=${String(RPC_PORT).slice(0, -1)} npm run stop leaves the chain on ${RPC_PORT} running`, await rpcAlive());

}

// ------------------------------------------------------------------ main

let code = 1;
try {
  await startInstance();
  lib = await import(path.join(APP, "lib", "paprika.js"));
  const deployment = await (await fetch(BASE + "/deployment.json")).json();
  // The test plays a second, CLI-like accuser with its own key; demo controls (faucet, vote) run directly.
  const { demoKeys } = await import(path.join(APP, "lib", "demo-keys.js"));
  ctx = lib.connect({ rpcUrl: RPC, deployment, demoKeys: demoKeys(deployment) });
  const { ethers } = await import("ethers");
  const cliAccuser = ethers.Wallet.createRandom().connect(ctx.provider);
  await lib.requestTestFunds(ctx, cliAccuser.address);
  await lib.setSigner(ctx, "accuser", cliAccuser);
  browser = await chromium.launch({ headless: !process.env.HEADED });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  page = await context.newPage();
  await edge();
  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
  code = failed.length ? 1 : 0;
} catch (e) {
  console.error("edge test aborted:", e);
  if (page) await page.screenshot({ path: path.join(OUT, "edge-aborted.png"), fullPage: true }).catch(() => {});
} finally {
  if (browser) await browser.close().catch(() => {});
  stopInstance();
}
process.exit(code);
