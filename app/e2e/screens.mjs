// Paprika demo: screenshot walk-through.
// Starts its OWN fresh instance (chain + deploy + web) on spare ports, drives the web UI through the whole demo story
// with Playwright (Chromium, 1440x900, with Chromium's fake camera so the selfie path is exercised), and saves one PNG
// per state to app/output/screens/NN-<name>.png for the slides and the documentation. It checks the key states on
// the way and exits with code 1 if one is wrong, so it doubles as a smoke test. It stops the instance at the end.
//
//   cd app && npm run screens          (package.json: "screens": "node e2e/screens.mjs")
//
// Environment: SCREENS_RPC_PORT (default 8745), SCREENS_WEB_PORT (default 5373), OUT (default app/output/screens).

import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const APP = path.resolve(HERE, "..");
const RPC_PORT = Number(process.env.SCREENS_RPC_PORT || 8745);
const WEB_PORT = Number(process.env.SCREENS_WEB_PORT || 5373);
const BASE = `http://127.0.0.1:${WEB_PORT}`;
const OUT = process.env.OUT || path.join(APP, "output", "screens");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

// ------------------------------------------------------------------ instance (same as demo.e2e.mjs)
let server;
async function startInstance() {
  server = spawn(process.execPath, ["scripts/start.js"], {
    cwd: APP, detached: true, stdio: ["ignore", "pipe", "pipe"],
    env: { ...process.env, RPC_PORT: String(RPC_PORT), WEB_PORT: String(WEB_PORT) },
  });
  let log = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("instance did not start in 180 s:\n" + log)), 180000);
    const onData = (d) => { log += d; if (/Paprika is running/.test(log)) { clearTimeout(timer); resolve(); } };
    server.stdout.on("data", onData);
    server.stderr.on("data", onData);
    server.on("exit", (c) => { clearTimeout(timer); reject(new Error(`start.js exited (${c}):\n${log}`)); });
  });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
}
function stopInstance() { if (server) { try { process.kill(-server.pid, "SIGINT"); } catch {} server = null; } }

// ------------------------------------------------------------------ helpers
let page;
const problems = [];
const t = (id) => page.getByTestId(id);
const text = async (id) => (await t(id).first().innerText()).trim();
let n = 0;

// Waits until the page is not running an action any more.
async function idle() {
  await page.waitForFunction(() => document.querySelector('[data-testid="busy-indicator"]').classList.contains("hidden"), null, { timeout: 90000 });
}
// Clicks a button and waits for its action to finish; reports an unexpected error banner.
async function click(locatorOrId) {
  const loc = typeof locatorOrId === "string" ? t(locatorOrId) : locatorOrId;
  await loc.click();
  await page.waitForTimeout(150);
  await idle();
  if (await t("error-banner").isVisible()) {
    problems.push(`banner after ${locatorOrId}: ${await text("error-message")}`);
    await t("btn-dismiss-error").click();
  }
}
// Saves a screenshot of the viewport, with the element `focus` scrolled into view first.
async function shot(name, focus, block = "center") {
  if (focus) await t(focus).first().evaluate((el, b) => el.scrollIntoView({ block: b }), block);
  else await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(250);
  n += 1;
  const file = path.join(OUT, `${String(n).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  console.log("saved", path.relative(APP, file));
}
function expect(cond, msg) { if (!cond) problems.push("expected: " + msg); }
// Drops a file on an element with a real DataTransfer (the way a verifier drags a file in).
async function dropFile(testid, file, type) {
  const b64 = fs.readFileSync(file).toString("base64");
  const dt = await page.evaluateHandle(({ b64, name, type }) => {
    const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
    const d = new DataTransfer();
    d.items.add(new File([bytes], name, { type }));
    return d;
  }, { b64, name: path.basename(file), type });
  await t(testid).dispatchEvent("drop", { dataTransfer: dt });
  await page.waitForTimeout(150);
  await idle();
}
const verdict = () => t("verify-status").getAttribute("data-state");
// Downloads the attested bytes of one photo from "My photos".
async function download(nth) {
  await t("tab-photographer").click();
  const dl = page.waitForEvent("download");
  await t("btn-download").nth(nth).click();
  const file = path.join(os.tmpdir(), `paprika-screens-${Date.now()}.jpg`);
  await (await dl).saveAs(file);
  return file;
}
async function attestSample() {
  await t("tab-photographer").click();
  await click("btn-sample-image");
  await click("btn-attest");
}
async function accuse(fake, shots) {
  await t("tab-accuser").click();
  if (await t("btn-accuse-new").isEnabled()) await click("btn-accuse-new");
  await click("btn-commit");
  if (shots) await shot("accuser-committed", "accuse-panel-commit", "start");
  await click("btn-reveal");
  if (shots) await shot("accuser-revealed-sent-to-uma", "accuse-panel-reveal", "start");
  await click(fake ? "btn-vote-fake" : "btn-vote-not-fake");
}

// ------------------------------------------------------------------ the story
let browser;
let code = 1;
try {
  console.log(`Starting a fresh instance: chain ${RPC_PORT}, web ${WEB_PORT} ...`);
  await startInstance();
  browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await context.grantPermissions(["camera"], { origin: BASE });
  page = await context.newPage();
  page.on("pageerror", (e) => problems.push("page error: " + e.message));

  await page.goto(BASE);
  await page.waitForTimeout(800);
  await idle();
  expect(!(await t("fatal-message").isVisible()), "the app connects to the chain");
  await shot("start-photographer");
  // Each actor signs with its own wallet: the browser wallet (a key kept in the page), funded by the local faucet.
  await click("btn-wallet-browser-photographer");
  await click("btn-faucet-photographer");
  expect(!!(await page.evaluate(() => window.paprikaState.wallets.photographer?.address)), "photographer wallet connected");
  await shot("photographer-wallet-connected-and-funded");
  await t("tab-accuser").click();
  await click("btn-wallet-browser-accuser");
  await click("btn-faucet-accuser");
  await t("tab-photographer").click();

  // Photographer: register, then a selfie from the (fake) camera.
  await click("btn-register");
  expect((await t("device-status").getAttribute("data-status")) === "active", "device active after registration");
  await shot("device-registered");
  await click("btn-start-camera");
  expect(await t("btn-take-photo").isVisible(), "camera live: Take a selfie shown");
  await shot("camera-live", "capture-preview");
  await click("btn-take-photo");
  expect(await t("btn-attest").isEnabled(), "still taken: Sign & attest enabled");
  await shot("camera-still-ready-to-attest", "capture-preview");
  await click("btn-attest");
  expect((await text("capture-result")).includes("Recorded on chain"), "selfie attested");
  await shot("selfie-attested", "capture-result-box");

  // Verifier: drop the downloaded selfie (real drop), then one pixel changed.
  const selfie = await download(0);
  await t("tab-verifier").click();
  await dropFile("verify-dropzone", selfie, "image/jpeg");
  expect((await verdict()) === "attested", "dropped selfie verifies as attested");
  await shot("verifier-signed-and-staked");
  await click("btn-change-pixel");
  expect((await verdict()) === "no-record", "one pixel changed gives no record");
  await shot("verifier-one-pixel-changed");

  // Accuser: false accusation, rejected by the vote.
  await accuse(false, true);
  expect((await t("settle-outcome").getAttribute("data-outcome")) === "not-proven", "outcome not proven");
  expect((await text("settle-check")).includes("✓"), "measured = rule");
  await shot("uma-vote-not-proven", "accuse-panel-settle", "start");

  // Photographer: withdraw credit, skip time, refund.
  await t("tab-photographer").click();
  await click("btn-deposits-withdraw");
  await shot("my-photos-after-rejected-accusation", "deposits-table");
  await click("btn-advance-time");
  expect(await t("btn-refund").first().isEnabled(), "refund enabled after the skip");
  await shot("time-skipped-refund-possible", "deposits-table");
  await click(t("btn-refund").first());
  await shot("deposit-refunded", "deposits-table");
  await t("tab-verifier").click();
  await click("btn-verify-last");
  expect((await verdict()) === "unchallenged", "refunded selfie: accusation rejected, deposit returned");
  await shot("verifier-not-proven-fake");

  // Two sample photos; the second is proven fake, so the key is flagged.
  await attestSample();
  const s2 = await download(1);
  await attestSample();
  await accuse(true, false);
  expect((await t("settle-outcome").getAttribute("data-outcome")) === "fake-proven", "outcome fake proven");
  await shot("uma-vote-fake-proven", "accuse-panel-settle", "start");
  await click("btn-withdraw-accuser");
  await click("btn-accuse-verify");
  expect((await verdict()) === "fake", "verifier: proven fake");
  await shot("verifier-proven-fake");
  await t("tab-verifier").click();
  await dropFile("verify-dropzone", s2, "image/jpeg");
  expect((await verdict()) === "flagged-fake-proven", "earlier photo: not judged, key flagged");
  await shot("verifier-not-judged-key-flagged");
  await t("tab-photographer").click();
  await click("btn-sample-image");
  expect(!(await t("btn-attest").isEnabled()), "attest blocked for a flagged key");
  await shot("attest-blocked-flagged-key", "attest-why");

  // New key, one photo, revoke.
  await click("btn-generate-key");
  await click("btn-register");
  await click("btn-attest");
  await click("btn-revoke");
  expect((await t("device-status").getAttribute("data-status")) === "flagged", "device flagged after revoke");
  await shot("key-revoked", "btn-revoke");
  await t("tab-verifier").click();
  await click("btn-verify-last");
  expect((await verdict()) === "flagged-key-revoked", "photo of revoked key: not judged, key revoked");
  await shot("verifier-not-judged-key-revoked");

  // Contracts panel and the raw timeline.
  await t("params-toggle").click();
  await shot("parameters-and-contracts");
  await t("timeline-raw-toggle").check();
  await shot("timeline-raw-calls", "activity-log");
  code = problems.length ? 1 : 0;
} catch (e) {
  problems.push("ABORTED: " + (e.stack || e.message));
  if (page) await page.screenshot({ path: path.join(OUT, "aborted.png") }).catch(() => {});
} finally {
  await browser?.close().catch(() => {});
  stopInstance();
}
if (problems.length) console.error("\nPROBLEMS:\n" + problems.join("\n"));
else console.log("\nAll states as expected.");
process.exit(code);
