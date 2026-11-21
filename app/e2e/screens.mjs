// Paprika: screenshot walk-through of the demo story (Playwright, Chromium, 1440x900).
// Starts its OWN fresh instance on spare ports, uses the MetaMask stand-in (Alice and Bob, switched in one window
// as the presenter does) and Chromium's fake camera, and saves one PNG per state to app/output/screens/NN-<name>.png.
// It checks the key states on the way and exits with code 1 if one is wrong.
//
//   cd app && npm run screens      Environment: SCREENS_RPC_PORT (8745), SCREENS_WEB_PORT (5373), OUT.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";
import { APP, startInstance, driver } from "./helpers.mjs";
import { installFakeMetaMask } from "./fake-metamask.mjs";

const RPC_PORT = Number(process.env.SCREENS_RPC_PORT || 8745);
const WEB_PORT = Number(process.env.SCREENS_WEB_PORT || 5373);
const OUT = process.env.OUT || path.join(APP, "output", "screens");
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });

let page, browser, inst, mm;
const problems = [];
let n = 0;
const expect = (cond, msg) => { if (!cond) problems.push("expected: " + msg); };

// Saves the viewport, with an element scrolled into view first; toasts are cleared so they do not cover content.
async function shot(name, focus, { keepToasts = false } = {}) {
  if (!keepToasts) await page.evaluate(() => document.querySelectorAll('[data-testid="toast"]').forEach((t) => t.remove()));
  if (focus) await page.getByTestId(focus).first().evaluate((el) => el.scrollIntoView({ block: "center" })).catch(() => {});
  else await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(250);
  n += 1;
  const file = path.join(OUT, `${String(n).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  console.log("saved", path.relative(APP, file));
}

let code = 1;
try {
  inst = await startInstance(RPC_PORT, WEB_PORT);
  browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await context.grantPermissions(["camera"], { origin: inst.base });
  mm = await installFakeMetaMask(context, inst.rpc);
  page = await context.newPage();
  page.on("pageerror", (e) => problems.push("page error: " + e.message));
  const { t, click, clickConfirm, go, idle, text } = driver(page);
  const state = (id) => t(id).getAttribute("data-state");

  await page.goto(`${inst.base}/#/verify`); await page.waitForTimeout(1200); await idle();
  await shot("verify-home-no-wallet");
  await go("#/attest");
  await shot("attest-before-connecting");

  // Alice: connect, prepare, register.
  await click("btn-connect");
  await t("account-button").click();
  await shot("account-menu-alice");
  await clickConfirm("btn-prepare", "prepare");
  await click("btn-register");
  await t("account-button").click();

  // Selfie from the (fake) camera, then attest with one confirmation.
  await click("btn-start-camera");
  await shot("attest-camera-live", "capture-preview");
  await click("btn-take-photo");
  await t("btn-attest").click();
  await shot("attest-confirm-dialog");
  await t("confirm-attest-ok").click(); await page.waitForTimeout(150); await idle();
  expect((await text("capture-result")).includes("Recorded"), "selfie attested");
  await shot("attest-done", "capture-result-box", { keepToasts: true });
  const photo1 = await page.evaluate(() => window.paprikaState.lastAttested);
  await click("btn-view-record");
  expect((await state("record-verdict")) === "attested", "record open to challenge");
  await shot("record-open-to-challenge");

  // Verify the downloaded file; tamper test.
  const dl = page.waitForEvent("download");
  await t("btn-download").click();
  const file1 = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "paprika-")), "selfie.jpg");
  await (await dl).saveAs(file1);
  await go("#/verify");
  await t("input-verify-file").setInputFiles(file1);
  await page.waitForFunction(() => document.querySelector('[data-testid="verify-status"]')?.dataset.state === "attested", null, { timeout: 8000 });
  await shot("verify-signed-and-staked");
  await t("btn-change-pixel").click();
  await page.waitForFunction(() => document.querySelector('[data-testid="verify-status"]')?.dataset.state === "no-record", null, { timeout: 8000 });
  await shot("verify-tamper-no-record");

  // Bob (MetaMask account switch): accuse.
  await mm.use("bob"); await page.waitForTimeout(800); await idle();
  await t("account-button").click(); await clickConfirm("btn-prepare", "prepare"); await t("account-button").click();
  await go(`#/record/${photo1}/accuse`);
  await t("input-evidence").fill("The same image was published at https://example.org/listing before the anchor block.");
  await shot("bob-accuse-form", "accuse-panel");
  await t("btn-commit").click();
  await shot("commit-confirm-dialog");
  await t("confirm-commit-ok").click(); await page.waitForTimeout(150); await idle();
  await shot("committed-reveal-countdown", "accuse-panel");
  await click("btn-reveal");
  expect((await state("record-verdict")) === "accused", "record under accusation");
  await shot("under-accusation-vote-pending");
  await t("network-pill").click();
  await shot("local-network-tools");
  await t("local-tools-close").click();
  await click("btn-vote-not-fake-inline");
  expect(/Accusation rejected/.test(await text("settle-outcome")), "outcome not proven");
  await shot("outcome-not-proven", "record-accusations");
  await t("protocol-toggle").check();
  await shot("protocol-view-drawer");
  await t("protocol-toggle").uncheck();

  // Alice: claim, skip wait, refund; the explorer shows the decoded refund.
  await mm.use("alice"); await page.waitForTimeout(800); await idle();
  await shot("alice-claimable-credit");
  await t("account-button").click();
  await shot("alice-account-menu-claim");
  await click("btn-claim");
  await t("account-button").click();   // close the menu
  await click("btn-skip-wait");
  await shot("record-refundable");
  await click("btn-refund");
  expect((await state("record-verdict")) === "unchallenged", "refunded: not proven fake");
  await shot("record-refunded");
  const refundTx = mm.state.sent[mm.state.sent.length - 1].hash;
  await go("#/explorer");
  await page.waitForTimeout(1200);
  await shot("explorer-home");
  await go(`#/tx/${refundTx}`);
  await page.waitForTimeout(800);
  expect((await t("tx-call").getAttribute("data-method")) === "Paprika.refund", "refund decoded");
  await shot("explorer-tx-refund-decoded");

  // A second photo proven fake (sample image), then Activity and a wrong network.
  await go("#/attest");
  await click("btn-new-photo").catch(() => {});
  await click("btn-sample-image");
  await clickConfirm("btn-attest", "confirm-attest");
  const photo2 = await page.evaluate(() => window.paprikaState.lastAttested);
  await mm.use("bob"); await page.waitForTimeout(800); await idle();
  await go(`#/record/${photo2}/accuse`);
  await t("btn-evidence-example").click();
  await clickConfirm("btn-commit", "confirm-commit");
  await click("btn-reveal");
  await click("btn-vote-fake-inline");
  expect((await state("record-verdict")) === "fake", "proven fake");
  await shot("record-proven-fake");
  await mm.use("alice"); await page.waitForTimeout(800); await idle();
  await go("#/activity");
  await shot("activity-alice");
  await mm.setChain(1); await page.waitForTimeout(500);
  await shot("wrong-network-switch-prompt");
  await click("btn-switch-chain");
  code = problems.length ? 1 : 0;
} catch (e) {
  problems.push("ABORTED: " + (e.stack || e.message));
  if (page) await page.screenshot({ path: path.join(OUT, "aborted.png") }).catch(() => {});
} finally {
  await browser?.close().catch(() => {});
  inst?.stop();
}
if (problems.length) console.error("\nPROBLEMS:\n" + problems.join("\n"));
else console.log("\nAll states as expected.");
process.exit(code);
