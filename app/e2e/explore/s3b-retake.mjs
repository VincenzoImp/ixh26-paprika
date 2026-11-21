// Staging-2: does "Retake" give a new still from the camera? (fake camera device)
import { newBrowser, newPage, helpers, note } from "./harness.mjs";
const browser = await newBrowser();
const page = await newPage(browser);
const H = helpers(page);
await H.open();
const hashes = [];
for (let i = 0; i < 3; i++) {
  const r1 = await H.click(i === 0 ? "btn-start-camera" : "btn-retake");
  await page.waitForTimeout(1200);
  const vis = await page.evaluate(() => { const v = document.querySelector('[data-testid="camera-video"]'); return v ? { w: v.videoWidth, rs: v.readyState, t: v.currentTime } : null; });
  const r2 = await H.click("btn-take-photo");
  hashes.push(await page.evaluate(() => window.paprikaState.photo?.hash));
  note("obs", `round ${i}: start/retake="${r1}" take="${r2}" video=${JSON.stringify(vis)} hash=${hashes[i]?.slice(0, 12)} bytes=${await page.evaluate(() => window.paprikaState.photo?.bytes.length)}`);
}
note(new Set(hashes).size === 3 ? "ok" : "FAIL", `three stills differ: ${new Set(hashes).size}`);
await H.shot("s3b-retake");
await browser.close();
