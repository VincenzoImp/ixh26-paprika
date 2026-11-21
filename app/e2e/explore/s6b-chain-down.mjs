// Staging-2: page loaded while the web server runs but the chain is down (fatal message and its texts).
import { newBrowser, newPage, helpers, note } from "./harness.mjs";
const browser = await newBrowser();
const page = await newPage(browser);
const H = helpers(page);
await page.goto((await import("./harness.mjs")).BASE + "/");
await page.waitForTimeout(2500);
note("obs", `fatal=${await H.t("fatal-message").isVisible()} title="${await H.t("fatal-title").innerText()}" reason="${await H.t("fatal-reason").innerText()}" howto="${await H.t("fatal-howto").innerText().catch(() => "")}"`);
await H.shot("s6b-chain-down-fatal");
note("obs", `console: ${JSON.stringify(page.qa.console.slice(0, 4))}`);
await browser.close();
