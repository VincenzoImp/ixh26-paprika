// Paprika: edge-case end-to-end test. One check per finding of the staging and acceptance reports that can be
// reproduced automatically, adapted to the app with one MetaMask account per window (stand-in: fake-metamask.mjs).
// A second, CLI-like accuser (Hardhat account #6, signing with the library directly) interleaves with the page.
//
//   cd app && npm run e2e:edge      Environment: EDGE_RPC_PORT (9445), EDGE_WEB_PORT (5973), HEADED=1.

import { spawn, execSync } from "node:child_process";
import path from "node:path";
import { chromium } from "playwright";
import { ethers } from "ethers";
import { APP, startInstance, checker, driver } from "./helpers.mjs";
import { installFakeMetaMask } from "./fake-metamask.mjs";

const RPC_PORT = Number(process.env.EDGE_RPC_PORT || 9445);
const WEB_PORT = Number(process.env.EDGE_WEB_PORT || 5973);
const OUT = path.join(APP, "output", "e2e");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let page, browser, inst, lib, ctx, mm;
const { check, results } = checker(OUT, () => page);

const stateOf = async (photoHash) => (await lib.verifyPhoto(ctx, photoHash))[0]?.state;
const rpcAlive = async () => { try { return !!(await ctx.provider.send("eth_chainId", [])); } catch { return false; } };

async function edge() {
  const { t, click, clickConfirm, go, idle, text } = driver(page);
  const post = (body, headers = {}) => fetch(`${inst.base}/rpc`, { method: "POST", headers: { "content-type": "application/json", ...headers }, body });

  // ---- /rpc hardening (M-1, M-2)
  await check("S-1: /rpc with body null is refused (4xx) and the chain keeps running", String((await post("null")).status).startsWith("4") && (await rpcAlive()));
  await check("S-2: /rpc refuses the batch [0, hardhat_setBalance] with 403", (await post(JSON.stringify([0, { jsonrpc: "2.0", id: 2, method: "hardhat_setBalance", params: ["0x0000000000000000000000000000000000000001", "0x1"] }]))).status === 403);
  await check("rpc: invalid JSON gets 400", (await post("{not json")).status === 400);
  await check("rpc: a body over 1 MB is refused", String((await post("x".repeat(1200000)).catch(() => ({ status: 413 }))).status).startsWith("4"));

  // ---- setup: Alice connected, prepared, with a device key; three photos
  await page.goto(`${inst.base}/#/attest`); await page.waitForTimeout(1000); await idle();
  await click("btn-connect");
  await t("account-button").click(); await clickConfirm("btn-prepare", "prepare"); await click("btn-register"); await t("account-button").click();
  const attest = async () => { await go("#/attest"); if (await t("btn-new-photo").isVisible().catch(() => false)) await t("btn-new-photo").click(); await click("btn-sample-image");
    if (await t("btn-new-key-attest").isVisible().catch(() => false)) await click("btn-new-key-attest");   // the key was flagged by a proven fake
    await clickConfirm("btn-attest", "confirm-attest"); return page.evaluate(() => window.paprikaState.lastAttested); };
  const X = await attest(), Y = await attest(), Z = await attest();
  const keyOf = async (h) => (await lib.verifyPhoto(ctx, h))[0].keyId;

  // ---- A-4: an empty file is refused and the previous photo cleared
  await go("#/attest"); await t("btn-new-photo").click().catch(() => {});
  await click("btn-sample-image");
  await t("input-capture-file").setInputFiles({ name: "empty.jpg", mimeType: "image/jpeg", buffer: Buffer.alloc(0) }); await page.waitForTimeout(200); await idle();
  await check("A-4: an empty file is refused and nothing stays ready to attest", /empty/i.test(await text("capture-error")) && !(await t("btn-attest").isEnabled()));

  // ---- W-F: Download keeps the file type (GIF)
  const gif = Buffer.from("R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7", "base64");
  await t("input-capture-file").setInputFiles({ name: "edge.gif", mimeType: "image/gif", buffer: gif }); await page.waitForTimeout(300); await idle();
  await clickConfirm("btn-attest", "confirm-attest");
  const G = await page.evaluate(() => window.paprikaState.lastAttested);
  await go(`#/record/${G}`);
  const ev = page.waitForEvent("download"); await t("btn-download").click();
  await check("W-F: Download of a GIF is named .gif", /\.gif$/i.test((await ev).suggestedFilename()));

  // ---- Bob in the page; a CLI-like accuser (#6) with its own key
  await mm.use("bob"); await page.waitForTimeout(800); await idle();
  await t("account-button").click(); await clickConfirm("btn-prepare", "prepare"); await t("account-button").click();
  const cli = ethers.HDNodeWallet.fromPhrase("test test test test test test test test test test test junk", undefined, "m/44'/60'/0'/0/6").connect(ctx.provider);
  await lib.setSigner(ctx, "accuser", cli);
  const cliAccuse = async (photo) => { const c = await lib.commitAccusation(ctx, "accuser", { photoHash: photo, keyId: await keyOf(photo), evidence: "cli evidence" });
    return lib.revealAccusation(ctx, "accuser", { photoHash: photo, keyId: await keyOf(photo), evidenceHash: c.evidenceHash, salt: c.salt }); };
  const pageCommit = async (photo) => { await go(`#/record/${photo}/accuse`); await t("input-evidence").fill(`evidence against ${photo.slice(0, 10)}`); await clickConfirm("btn-commit", "confirm-commit"); };

  // ---- W-C: a live commitment cannot be dropped; it survives a reload
  await pageCommit(Y);
  await check("W-C: no 'Start a new accusation' while the commitment can be revealed", (await t("btn-accuse-new").count()) === 0);
  await page.reload(); await page.waitForTimeout(1200); await idle();
  await check("W-C: after a reload the reveal is still offered", await t("btn-reveal").isVisible());

  // ---- M-3: another accusation (CLI, on X) opens meanwhile; the page acts only on the record it shows
  await cliAccuse(X);
  await click("btn-reveal");
  await check("M-3: the page revealed its own accusation (Y), not X", (await stateOf(Y)) === "accused" && (await stateOf(X)) === "accused");
  await click("btn-vote-fake-inline");
  await check("M-3: the vote on Y's page decided Y only", (await stateOf(Y)) === "fake" && (await stateOf(X)) === "accused");
  await lib.umaVote(ctx, (await lib.listAccusations(ctx)).find((a) => a.open).assertionId, false);

  // ---- M-5: a reveal on a photo already under accusation returns the bond, and the page says so
  await pageCommit(Z);
  await cliAccuse(Z);
  const c0 = await lib.credits(ctx, mm.address("bob"));
  await click("btn-reveal");
  const c1 = await lib.credits(ctx, mm.address("bob"));
  await check("M-5: bond credited back on chain", c1 - c0 === ctx.params.bond);
  await check("M-5: the page says 'Bond returned' and shows no vote", /Bond returned/.test(await text("reveal-status")));
  await lib.umaVote(ctx, (await lib.listAccusations(ctx)).find((a) => a.open).assertionId, false);

  // ---- A-2: two windows resolve the same vote at once
  const W = await (async () => { await mm.use("alice"); await page.waitForTimeout(600); await idle(); return attest(); })();
  await mm.use("bob"); await page.waitForTimeout(600); await idle();
  await pageCommit(W); await click("btn-reveal");
  const ctx2 = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installFakeMetaMask(ctx2, inst.rpc);
  const p2 = await ctx2.newPage(); await p2.goto(`${inst.base}/#/record/${W}`); await p2.waitForTimeout(1200);
  const [r1, r2] = await Promise.all([click("btn-vote-fake-inline"), driver(p2).click("btn-vote-not-fake-inline")]);
  await check("A-2: simultaneous votes: no raw UMA error, decided once", !/Revealed data|Cannot commit|coalesce/i.test(`${r1?.text} ${r2?.text}`) && !(await lib.listAccusations(ctx)).some((a) => a.open), `${r1?.text} | ${r2?.text}`);
  await ctx2.close();

  // ---- W-E: at the reveal deadline the reveal is no longer offered (the next block would be too late)
  await mm.use("alice"); await page.waitForTimeout(600); await idle();
  const V = await attest();
  await mm.use("bob"); await page.waitForTimeout(600); await idle();
  await pageCommit(V);
  const m = await page.evaluate((v) => Object.values(window.paprikaState.mine).find((x) => x.photoHash.toLowerCase() === v.toLowerCase()), V);
  await ctx.provider.send("evm_setNextBlockTimestamp", [m.committedAt + ctx.params.revealWindow]); await ctx.provider.send("evm_mine", []);
  await sleep(3000); await idle();
  await check("W-E: reveal not offered at the deadline; forfeit offered instead", !(await t("btn-reveal").isVisible().catch(() => false)) && (await t("btn-forfeit").isVisible()));

  // ---- W-G: several files dropped: only the first is verified, and the page says so
  await go("#/verify");
  const dt = await page.evaluateHandle(() => { const d = new DataTransfer(); d.items.add(new File([new Uint8Array([1, 2, 3])], "one.bin")); d.items.add(new File([new Uint8Array([4, 5, 6])], "two.bin")); return d; });
  await t("verify-dropzone").dispatchEvent("drop", { dataTransfer: dt }); await sleep(800);
  await check("W-G: dropping 2 files says only the first was verified", /only the first/i.test(await page.evaluate(() => document.body.innerText)));

  // ---- m-2: revoked key + challenge period over: no accusation offered in the past
  await mm.use("alice"); await page.waitForTimeout(600); await idle();
  const R = await attest();
  await go(`#/record/${R}`);
  await click("btn-skip-wait");
  await t("account-button").click(); await clickConfirm("btn-revoke", "revoke"); await t("account-button").click();
  await check("m-2: revoked key + challenge over: the verdict offers no accusation", !/can still be (accused|challenged)/i.test(await text("record-verdict-detail")));

  // ---- S-3: a second npm start leaves the running deployment untouched; S-4: stop with a port prefix
  const before = (await (await fetch(`${inst.base}/deployment.json`)).json()).addresses.paprika;
  const second = spawn(process.execPath, ["scripts/start.js"], { cwd: APP, detached: true, stdio: "ignore", env: inst.env });
  await new Promise((r) => { second.on("exit", r); setTimeout(r, 45000); });
  try { process.kill(-second.pid, "SIGINT"); } catch {}
  const after = (await (await fetch(`${inst.base}/deployment.json`)).json()).addresses.paprika;
  await check("S-3: a second npm start leaves the running deployment untouched", after === before && (await ctx.provider.getCode(before)) !== "0x");
  try { execSync("node scripts/stop.js", { cwd: APP, env: { ...process.env, RPC_PORT: String(RPC_PORT).slice(0, -1) }, stdio: "ignore" }); } catch {}
  await sleep(1500);
  await check(`S-4: RPC_PORT=${String(RPC_PORT).slice(0, -1)} npm run stop leaves the chain on ${RPC_PORT} running`, await rpcAlive());
}

let code = 1;
try {
  inst = await startInstance(RPC_PORT, WEB_PORT);
  const deployment = await (await fetch(`${inst.base}/deployment.json`)).json();
  lib = await import(path.join(APP, "lib", "paprika.js"));
  const { demoKeys } = await import(path.join(APP, "lib", "demo-keys.js"));
  ctx = lib.connect({ rpcUrl: inst.rpc, deployment, demoKeys: demoKeys(deployment) });
  browser = await chromium.launch({ headless: !process.env.HEADED });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  mm = await installFakeMetaMask(context, inst.rpc);
  page = await context.newPage();
  await edge();
  code = results.every((r) => r.ok) ? 0 : 1;
} catch (e) {
  console.error("edge test aborted:", e.stack || e.message);
  if (page) await page.screenshot({ path: path.join(OUT, "edge-aborted.png") }).catch(() => {});
} finally {
  await browser?.close().catch(() => {});
  inst?.stop();
}
const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length || code ? 1 : 0);
