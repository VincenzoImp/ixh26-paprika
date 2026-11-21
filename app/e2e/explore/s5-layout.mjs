// Staging-2 exploration 5: layout at 1440, 1280, 1024 and 800 px, and at 125 % zoom (1440 px screen = 1152 CSS px
// at device scale 1.25). Horizontal overflow, clipped buttons, every tab screenshotted. Uses the state the other
// scripts left on the chain (records in every state). Needs a running instance.
import fs from "node:fs";
import { newBrowser, newPage, helpers, note, notes, SHOTS } from "./harness.mjs";

const browser = await newBrowser();
const sizes = [["1440", 1440, 1], ["1280", 1280, 1], ["1024", 1024, 1], ["800", 800, 1], ["zoom125", 1152, 1.25]];
for (const [label, width, dsf] of sizes) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, deviceScaleFactor: dsf });
  const page = await newPage(browser, { ctxOpts: { context } });
  const H = helpers(page);
  await H.open();
  await H.click("btn-register");
  await H.click("btn-sample-image");
  await H.click("btn-attest");
  for (const tab of ["photographer", "verifier", "accuser"]) {
    await H.t(`tab-${tab}`).click();
    if (tab === "verifier") await H.click("btn-verify-last");
    await page.waitForTimeout(200);
    const o = await page.evaluate(() => {
      const vw = document.documentElement.clientWidth;
      const over = [];
      for (const el of document.querySelectorAll("[data-testid]")) {
        const r = el.getBoundingClientRect();
        if (!r.width || getComputedStyle(el).visibility === "hidden") continue;
        if (r.right > vw + 1) over.push(`${el.dataset.testid}(${Math.round(r.right)})`);
        if (el.tagName === "BUTTON" && el.scrollWidth > el.clientWidth + 2) over.push(`clipped:${el.dataset.testid}`);
      }
      return { vw, sw: document.documentElement.scrollWidth, over: over.slice(0, 12) };
    });
    note(o.sw > o.vw || o.over.length ? "FAIL" : "ok", `${label} ${tab}: scrollWidth ${o.sw} > ${o.vw}? overflow: ${o.over.join(", ")}`);
    await H.shot(`s5-${label}-${tab}`);
  }
  note("obs", `${label} console: ${JSON.stringify(page.qa.console.slice(0, 4))} failed: ${JSON.stringify(page.qa.failed.slice(0, 4))}`);
  await context.close();
}
fs.writeFileSync(`${SHOTS}/s5-notes.json`, JSON.stringify(notes, null, 1));
await browser.close();
