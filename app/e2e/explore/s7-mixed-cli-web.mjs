// Staging-2 exploration 7: mixed flows. Attest from the CLI, verify in the web, the same file attested by the web
// key too (two devices), accuse the CLI-attested photo from the web, then read the result with the CLI.
// Needs a running instance (RPC_PORT / WEB_PORT, default 8945 / 5573).
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import { APP, RPC_PORT, newBrowser, newPage, helpers, note, notes, SHOTS, connectLib, conservation } from "./harness.mjs";

const cli = (...args) => { try { return execFileSync(process.execPath, ["cli.js", ...args], { cwd: APP, env: { ...process.env, RPC_PORT: String(RPC_PORT) }, encoding: "utf8" }); } catch (e) { return `EXIT ${e.status}: ${e.stdout}${e.stderr}`; } };
const file = "/tmp/qa-files/mixed é.png";
fs.copyFileSync("/tmp/qa-files/a.gif", file);
note("obs", "cli register: " + cli("register").split("\n").slice(-3).join(" | "));
note("obs", "cli attest: " + cli("attest", file).split("\n").slice(-4).join(" | "));
const ctx = await connectLib();
const browser = await newBrowser();
const page = await newPage(browser);
const H = helpers(page);
await H.open("#verifier");
await H.t("input-verify-file").setInputFiles(file); await page.waitForTimeout(150); await H.idle();
note("obs", `web verify of CLI-attested: ${await H.t("verify-status").getAttribute("data-state")} / ${await H.text("verify-title")}`);
await H.t("tab-photographer").click();
note("obs", `My photos rows: ${await H.t("deposit-row").count()}, download buttons: ${await H.t("btn-download").count()}`);
await H.click("btn-register");
await H.t("input-capture-file").setInputFiles(file); await page.waitForTimeout(150); await H.idle();
const r = await H.click("btn-attest"); note("obs", `web attests the same file with its key: ${r || "ok"}`);
await H.t("tab-verifier").click();
await H.t("input-verify-file").setInputFiles(file); await page.waitForTimeout(150); await H.idle();
note("obs", `two devices: rows=${await H.t("verify-attester-row").count()} records-count="${await H.text("verify-records-count").catch(() => "")}" title=${await H.text("verify-title")}`);
await H.shot("s7-01-two-devices");
// accuse the CLI key's record from the web
await H.t("tab-accuser").click();
const opts = await H.t("select-accuse-photo").evaluate((s) => [...s.options].map((o) => o.textContent));
note("obs", `accuser options: ${JSON.stringify(opts)}`);
const cliKey = JSON.parse(fs.readFileSync(`${APP}/.state/device-${RPC_PORT}.json`, "utf8")).keyId;
const ph = (await page.evaluate(() => window.paprikaState.verify.hash));
await H.t("select-accuse-photo").selectOption(`${ph}|${cliKey.toLowerCase()}`).catch((e) => note("FAIL", "cannot select CLI record: " + e.message));
note("obs", "commit: " + (await H.click("btn-commit") || "ok"));
note("obs", "reveal: " + (await H.click("btn-reveal") || "ok"));
note("obs", "vote YES: " + (await H.click("btn-vote-fake") || "ok"));
note("obs", `settle: ${await H.text("settle-accuser")} / ${await H.text("settle-depositor")} / ${await H.text("settle-check")}`);
await H.t("tab-verifier").click();
await H.t("input-verify-file").setInputFiles(file); await page.waitForTimeout(150); await H.idle();
note("obs", `after fake on CLI key: page main verdict=${await H.text("verify-title")}; attester rows=${JSON.stringify(await H.t("verify-attester-row").allInnerTexts())}`);
await H.shot("s7-02-after-fake-cli-key");
note("obs", "cli verify: " + cli("verify", file).replace(/\n+/g, " | ").slice(0, 600));
note("obs", "cli attest again (flagged): " + cli("attest", "/tmp/qa-files/one.bin").split("\n").slice(-2).join(" | "));
const c = await conservation(ctx); note(c.ok ? "ok" : "FAIL", `conservation ${c.supply} vs ${c.sum}`);
fs.writeFileSync(`${SHOTS}/s7-notes.json`, JSON.stringify(notes, null, 1));
await browser.close();
