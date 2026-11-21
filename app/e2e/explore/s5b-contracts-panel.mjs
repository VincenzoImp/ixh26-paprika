// Staging-2: the "contracts" panel opened, and the footer, at 800 and 1024 px.
import { newBrowser, newPage, helpers, note } from "./harness.mjs";
const browser = await newBrowser();
for (const w of [800, 1024, 1440]) {
  const page = await newPage(browser, { width: w });
  const H = helpers(page);
  await H.open();
  await H.t("params-toggle").click();
  await page.waitForTimeout(200);
  const o = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const over = [...document.querySelectorAll('[data-testid="contracts-panel"] [data-testid]')].map((el) => [el.dataset.testid, Math.round(el.getBoundingClientRect().right)]).filter(([, r]) => r > vw);
    const f = document.querySelector('[data-testid="footer"]');
    return { vw, sw: document.documentElement.scrollWidth, over, footerClipped: f.scrollWidth > f.clientWidth, footer: f.textContent.trim() };
  });
  note(o.over.length || o.sw > o.vw ? "FAIL" : "ok", `${w}: contracts panel open: overflow ${JSON.stringify(o.over)} sw=${o.sw}`);
  note(o.footerClipped ? "FAIL" : "ok", `${w}: footer clipped=${o.footerClipped}: "${o.footer}"`);
  await page.screenshot({ path: `${process.env.SHOTS || "output/staging-2"}/s5b-${w}-contracts-open.png` });
  await page.close();
}
await browser.close();
