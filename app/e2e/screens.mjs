// Paprika demo: screenshot walk-through.
// Drives the web UI through the whole demo story with Playwright (Chromium, 1440x900) and saves one PNG per state to
// app/output/screens/NN-<name>.png, for the slides and the documentation. It also checks the key states on the way
// and exits with code 1 if one is wrong, so it doubles as a smoke test.
//
// Needs: the system running (`npm start` in app/) on a FRESH chain, and Playwright with Chromium
// (`npm i -D playwright && npx playwright install chromium`).
// Environment: BASE_URL (default http://127.0.0.1:5173), OUT (default app/output/screens).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

let chromium;
try {
  ({ chromium } = await import("playwright"));
} catch {
  console.error("Playwright is not installed: run `npm i -D playwright && npx playwright install chromium` in app/.");
  process.exit(1);
}

const HERE = path.dirname(fileURLToPath(import.meta.url));
const BASE = process.env.BASE_URL || "http://127.0.0.1:5173";
const OUT = process.env.OUT || path.join(HERE, "..", "output", "screens");
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
const page = await context.newPage();
const problems = [];
page.on("pageerror", (e) => problems.push("page error: " + e.message));

const t = (id) => page.getByTestId(id);
const text = async (id) => (await t(id).innerText()).trim();
let n = 0;

// Waits until the page is not running an action any more.
async function idle() {
  await page.waitForFunction(() => document.querySelector('[data-testid="busy-indicator"]').classList.contains("hidden"), null, { timeout: 60000 });
}
// Clicks a button and waits for its action to finish; reports an unexpected error banner.
async function click(locatorOrId, { expectError = false } = {}) {
  const loc = typeof locatorOrId === "string" ? t(locatorOrId) : locatorOrId;
  await loc.click();
  await page.waitForTimeout(150);
  await idle();
  const err = await t("error-banner").isVisible();
  if (err && !expectError) problems.push(`error after ${locatorOrId}: ${await text("error-message")}`);
  if (err && !expectError) await t("btn-dismiss-error").click();
}
// Saves a screenshot of the viewport, with the element `focus` scrolled into view first.
async function shot(name, focus) {
  if (focus) await t(focus).first().evaluate((el) => el.scrollIntoView({ block: "center" }));
  else await page.evaluate(() => scrollTo(0, 0));
  await page.waitForTimeout(200);
  n += 1;
  const file = path.join(OUT, `${String(n).padStart(2, "0")}-${name}.png`);
  await page.screenshot({ path: file });
  console.log("saved", path.relative(process.cwd(), file));
}
// Records a failed expectation.
function expect(cond, msg) {
  if (!cond) problems.push("expected: " + msg);
}
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
// Attests one sample image as the Photographer.
async function attestSample() {
  await t("tab-photographer").click();
  await click("btn-sample-image");
  await click("btn-attest");
}
// Commits, reveals and runs the UMA vote on the photo selected in the Accuser tab.
async function accuse(fake, shots) {
  await t("tab-accuser").click();
  if (await t("btn-accuse-new").isEnabled()) await click("btn-accuse-new");
  await click("btn-commit");
  if (shots) await shot("accuser-committed", "accuse-panel-commit");
  await click("btn-reveal");
  if (shots) await shot("accuser-revealed-sent-to-uma", "accuse-panel-reveal");
  await click(fake ? "btn-vote-fake" : "btn-vote-not-fake");
}

await page.goto(BASE);
await page.waitForTimeout(1000);
await idle();
expect(!(await t("fatal-message").isVisible()), "the app connects to the chain");
await shot("start-photographer");

// Photographer: register, attest.
await click("btn-register");
expect((await t("device-status").getAttribute("data-status")) === "active", "device active after registration");
await shot("device-registered");
await click("btn-sample-image");
await click("btn-attest");
await page.locator('[data-testid="capture-details"] summary').click();
await shot("photo-attested", "btn-attest");

// Download the attested bytes from "My photos".
const dl = page.waitForEvent("download");
await t("btn-download").first().click();
const photo1 = path.join(os.tmpdir(), "paprika-photo-1.jpg");
await (await dl).saveAs(photo1);

// Verifier: drop the downloaded file (real drop), then one pixel changed.
await t("tab-verifier").click();
await dropFile("verify-dropzone", photo1, "image/jpeg");
expect((await verdict()) === "attested", "dropped file verifies as attested");
await shot("verifier-attested");
await click("btn-change-pixel");
expect((await verdict()) === "no-record", "one pixel changed gives no record");
await shot("verifier-one-pixel-changed");
await t("input-verify-file").setInputFiles(photo1);
await page.waitForTimeout(150); await idle();
expect((await verdict()) === "attested", "file input verifies as attested");

// Accuser: false accusation, rejected by the vote.
await accuse(false, true);
expect((await t("settle-outcome").getAttribute("data-outcome")) === "not-proven", "outcome not proven");
expect((await text("settle-accuser")) === (await text("settle-expected-accuser")), "accuser money matches the rule");
await shot("uma-vote-not-proven", "accuse-panel-settle");

// Photographer: withdraw credit, advance the clock, refund.
await t("tab-photographer").click();
await click("btn-deposits-withdraw");
await shot("my-photos-credit-withdrawn", "deposits-table");
await click("btn-advance-time");
expect(await t("btn-refund").first().isEnabled(), "refund enabled after advancing time");
await shot("time-advanced-refund-possible", "deposits-table");
await click(t("btn-refund").first());
await shot("deposit-refunded", "deposits-table");
await t("tab-verifier").click();
await click("btn-verify-last");
expect((await verdict()) === "unchallenged", "refunded photo shows unchallenged");
await shot("verifier-unchallenged");

// Second and third photo; the third is proven fake, so the device is flagged.
await attestSample();
await attestSample();
await accuse(true, false);
expect((await t("settle-outcome").getAttribute("data-outcome")) === "fake-proven", "outcome fake proven");
await shot("uma-vote-fake-proven", "accuse-panel-settle");
await click("btn-withdraw-accuser");
await click("btn-accuse-verify");
expect((await verdict()) === "fake", "verifier shows proven fake");
await shot("verifier-proven-fake");
await t("tab-accuser").click();
await page.waitForTimeout(100);
// Verify the second photo (same device, recorded before the flag) by its download.
await t("tab-photographer").click();
const dl2 = page.waitForEvent("download");
await t("btn-download").nth(1).click();
const photo2 = path.join(os.tmpdir(), "paprika-photo-2.jpg");
await (await dl2).saveAs(photo2);
await t("tab-verifier").click();
await dropFile("verify-dropzone", photo2, "image/jpeg");
expect((await verdict()) === "flagged-fake-proven", "earlier photo shows device flagged (fake proven)");
await shot("verifier-device-flagged");

// New key, one photo, then revoke the key.
await t("tab-photographer").click();
await click("btn-generate-key");
await click("btn-register");
await click("btn-sample-image");
await click("btn-attest");
await click("btn-revoke");
expect((await t("device-status").getAttribute("data-status")) === "flagged", "device flagged after revoke");
await shot("key-revoked", "btn-revoke");
await t("tab-verifier").click();
await click("btn-verify-last");
expect((await verdict()) === "flagged-key-revoked", "photo of revoked key shows device flagged (key revoked)");
await shot("verifier-key-revoked");

// A rejected action: attest with the revoked key.
await t("tab-photographer").click();
await click("btn-sample-image");
await page.evaluate(() => { document.querySelector('[data-testid="btn-attest"]').disabled = false; });   // force the click
await t("btn-attest").evaluate((b) => b.click());
await page.waitForTimeout(150); await idle();
expect(await t("error-banner").isVisible(), "a rejected attest shows the error banner");
await shot("rejected-attest-revoked-key");
await t("btn-dismiss-error").click();

// Parameters panel and the raw timeline.
await t("params-toggle").click();
await shot("parameters-and-contracts");
await t("timeline-raw-toggle").check();
await shot("timeline-raw-calls", "activity-log");

await browser.close();
if (problems.length) {
  console.error("\nPROBLEMS:\n" + problems.join("\n"));
  process.exit(1);
}
console.log("\nAll states as expected.");
