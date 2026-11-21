// Staging-2 exploration 3: inputs (empty, 1 byte, 10/30 MB, PNG/GIF/HEIC/PDF/binary, unicode names), several files
// dropped at once, evidence (XSS, very long, empty), the camera (live, still, retake, mirror, attest, download,
// verify the download and a re-encoded copy). Input files in QA_FILES (default /tmp/qa-files).
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { connectLib, newBrowser, newPage, helpers, lib, note, notes, SHOTS } from "./harness.mjs";

const DIR = process.env.QA_FILES || "/tmp/qa-files";
const ctx = await connectLib();
const browser = await newBrowser();
const page = await newPage(browser);
const H = helpers(page);
const { t, text, click, open, shot, state } = H;
const expect = (name, ok, detail = "") => { note(ok ? "ok" : "FAIL", `${name}${ok ? "" : " -- " + detail}`); return ok; };
let alerts = 0; page.on("dialog", (d) => { alerts += 1; d.dismiss(); });

await open();
let r = await click("btn-register"); expect("register", !r, r);

async function load(file) {
  const t0 = Date.now();
  await t("tab-photographer").click();
  await t("input-capture-file").setInputFiles(path.join(DIR, file));
  await page.waitForTimeout(150); await H.idle();
  let err = "";
  if (await t("error-banner").isVisible()) { err = await text("error-message"); await t("btn-dismiss-error").click(); }
  return { err, ms: Date.now() - t0, name: await text("capture-file-name"), warn: (await t("capture-warning").isVisible()) ? await text("capture-warning") : "", attest: await t("btn-attest").isEnabled() };
}
const attested = {};
for (const f of ["empty.jpg", "one.bin", "a.png", "a.gif", "fake.heic", "doc.pdf", "my photo é 日本 🌶.png", "big10.png", "big30.png"]) {
  const l = await load(f);
  note("obs", `load ${f}: ${JSON.stringify(l)}`);
  if (l.attest) {
    const t0 = Date.now();
    r = await click("btn-attest");
    note("obs", `attest ${f}: ${r || "ok"} in ${Date.now() - t0} ms`);
    if (!r) attested[f] = (await state()).attested;
  }
}
await shot("s3-01-after-inputs");
// "a.png" and the unicode-named copy have the same bytes: the second is refused as already attested?
note("obs", `unicode copy of a.png attested separately? ${!!attested["my photo é 日本 🌶.png"]}`);

// Download names/extensions for non-JPEG files
await t("tab-photographer").click();
const rows = await t("deposit-row").count();
for (let i = 0; i < rows; i++) {
  const row = t("deposit-row").nth(i);
  const h = await row.getAttribute("data-photo-hash");
  const dlb = row.getByTestId("btn-download");
  if (!(await dlb.count())) continue;
  const ev = page.waitForEvent("download");
  await dlb.click();
  const d = await ev;
  const file = Object.entries(attested).find(([, v]) => v.photoHash === h)?.[0];
  const out = path.join("/tmp", "qa-dl-" + d.suggestedFilename());
  await d.saveAs(out);
  const same = file ? Buffer.compare(fs.readFileSync(out), fs.readFileSync(path.join(DIR, file))) === 0 : null;
  note("obs", `download of ${file}: suggested ${d.suggestedFilename()} same bytes=${same}`);
  if (file && /\.(gif|pdf|bin|heic)$/.test(file)) expect(`download extension matches the type (${file})`, !/\.jpg$/.test(d.suggestedFilename()) || /\.jpe?g$/.test(file), d.suggestedFilename());
}

// Verifier: several files dropped at once
await t("tab-verifier").click();
const dt = await page.evaluateHandle(async () => {
  const d = new DataTransfer();
  d.items.add(new File([new Uint8Array([1, 2, 3])], "one.bin", { type: "application/octet-stream" }));
  d.items.add(new File([new Uint8Array([4, 5, 6])], "two.bin", { type: "application/octet-stream" }));
  return d;
});
await t("verify-dropzone").dispatchEvent("drop", { dataTransfer: dt });
await page.waitForTimeout(300); await H.idle();
note("obs", `drop of 2 files: shows "${await text("verify-file-name")}" state=${await t("verify-status").getAttribute("data-state")}; any notice? banner=${await t("error-banner").isVisible()}`);
await shot("s3-02-drop-two-files");
// Verifier with an empty file, a 30 MB file, HEIC change-pixel
for (const f of ["empty.jpg", "big30.png", "fake.heic", "a.gif"]) {
  const t0 = Date.now();
  await t("input-verify-file").setInputFiles(path.join(DIR, f));
  await page.waitForTimeout(150); await H.idle();
  let err = ""; if (await t("error-banner").isVisible()) { err = await text("error-message"); await t("btn-dismiss-error").click(); }
  note("obs", `verify ${f}: ${err || (await t("verify-status").getAttribute("data-state"))} in ${Date.now() - t0} ms; pixel btn=${await t("btn-change-pixel").isEnabled()}`);
  if (await t("btn-change-pixel").isEnabled()) { r = await click("btn-change-pixel"); note("obs", `  change pixel ${f}: ${r || (await t("verify-status").getAttribute("data-state"))} name="${await text("verify-file-name")}"`); }
}

// Evidence
await t("tab-accuser").click();
const xss = `<img src=x onerror="window.__xss=1;alert(1)"><script>window.__xss=2</script>`;
await t("input-evidence").fill(xss);
r = await click("btn-commit"); note("obs", `commit with XSS evidence: ${r || "ok"}`);
await open("#accuser");
const xssRan = await page.evaluate(() => window.__xss);
expect("XSS evidence not executed", !xssRan && alerts === 0, `__xss=${xssRan} alerts=${alerts}`);
note("obs", `evidence after reload: ${(await t("input-evidence").inputValue()).slice(0, 60)}`);
r = await click("btn-reveal"); note("obs", `reveal xss: ${r || "ok"}`);
r = await click("btn-vote-not-fake"); note("obs", `vote: ${r || "ok"}`);
await click("btn-accuse-new");
await t("input-evidence").fill("   ");
r = await click("btn-commit"); note("obs", `commit with blank evidence: ${r}`);
expect("blank evidence refused", /evidence/i.test(r), r);
await t("input-evidence").fill("E".repeat(200000));
r = await click("btn-commit"); note("obs", `commit with 200 kB evidence: ${r || "ok"}`);
await shot("s3-03-long-evidence");
if (!r) { r = await click("btn-reveal"); note("obs", `reveal long: ${r || "ok"}`); r = await click("btn-vote-not-fake"); note("obs", `vote long: ${r || "ok"}`); }

// Camera
await t("tab-photographer").click();
r = await click("btn-start-camera"); note("obs", `start camera: ${r || "ok"} tag=${await text("capture-tag").catch(() => "")}`);
await page.waitForTimeout(500);
await t("toggle-mirror").check();
note("obs", `mirror on: preview mirror class=${await t("capture-preview").evaluate((e) => e.classList.contains("mirror"))}, note="${await text("mirror-note").catch(() => "")}"`);
await shot("s3-04-camera-live-mirror");
r = await click("btn-take-photo"); note("obs", `take: ${r || "ok"} tag=${await text("capture-tag").catch(() => "")}`);
const firstHash = (await page.evaluate(() => window.paprikaState.photo?.hash));
r = await click("btn-retake"); note("obs", `retake: ${r || "ok"}`);
await page.waitForTimeout(700);
r = await click("btn-take-photo");
const secondHash = (await page.evaluate(() => window.paprikaState.photo?.hash));
note("obs", `retake gives a new still: ${firstHash !== secondHash}`);
r = await click("btn-attest"); expect("attest selfie", !r, r);
const selfie = (await state()).attested;
await shot("s3-05-selfie-attested");
const ev = page.waitForEvent("download");
await t("deposit-row").filter({ has: page.locator(`[data-photo-hash="${selfie.photoHash}"]`) }).getByTestId("btn-download").click().catch(async () => {
  await page.locator(`[data-testid="deposit-row"][data-photo-hash="${selfie.photoHash}"] [data-testid="btn-download"]`).click();
});
const d = await ev; const sf = "/tmp/qa-selfie.jpg"; await d.saveAs(sf);
await t("tab-verifier").click();
await t("input-verify-file").setInputFiles(sf); await page.waitForTimeout(150); await H.idle();
expect("downloaded selfie verifies as attested", (await t("verify-status").getAttribute("data-state")) === "attested", await t("verify-status").getAttribute("data-state"));
execFileSync("convert", [sf, "-quality", "80", "/tmp/qa-selfie-reenc.jpg"]);
await t("input-verify-file").setInputFiles("/tmp/qa-selfie-reenc.jpg"); await page.waitForTimeout(150); await H.idle();
expect("re-encoded selfie has no record", (await t("verify-status").getAttribute("data-state")) === "no-record");
await shot("s3-06-reencoded");
note("obs", `console: ${JSON.stringify(page.qa.console.slice(0, 8))}`);
note("obs", `failed: ${JSON.stringify(page.qa.failed.slice(0, 8))}`);
fs.writeFileSync(`${SHOTS}/s3-notes.json`, JSON.stringify(notes, null, 1));
await browser.close();
