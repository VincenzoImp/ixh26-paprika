// Staging-2 exploration 6: chain stopped while the page is open; chain restarted with a NEW deployment and other
// parameters (BOND=2, PHOTO_WINDOW=600, REVEAL_WINDOW=300) while the page is open; web server restarted.
// It STOPS the instance on RPC_PORT/WEB_PORT (default 8945/5573) and starts it again step by step
// (npm run chain / deploy / web). At the end it leaves nothing running on those ports.
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import { APP, RPC_PORT, WEB_PORT, BASE, lib, newBrowser, newPage, helpers, note, notes, SHOTS, money, conservation } from "./harness.mjs";

const env = { ...process.env, RPC_PORT: String(RPC_PORT), WEB_PORT: String(WEB_PORT) };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const procs = [];
function bg(script, extra = {}) {
  const p = spawn("npm", ["run", script], { cwd: APP, env: { ...env, ...extra }, detached: true, stdio: ["ignore", fs.openSync(`/tmp/qa-s6-${script}.log`, "a"), fs.openSync(`/tmp/qa-s6-${script}.log`, "a")] });
  procs.push(p); return p;
}
const kill = (p) => { try { process.kill(-p.pid, "SIGTERM"); } catch {} };
async function waitHttp(url, ok = (r) => r.ok) { for (let i = 0; i < 150; i++) { try { if (ok(await fetch(url, { method: url.endsWith("/rpc") ? "POST" : "GET", headers: { "content-type": "application/json" }, body: url.endsWith("/rpc") ? '{"jsonrpc":"2.0","id":1,"method":"eth_chainId","params":[]}' : undefined }))) return true; } catch {} await sleep(300); } return false; }
const expect = (name, ok, detail = "") => { note(ok ? "ok" : "FAIL", `${name}${ok ? "" : " -- " + detail}`); return ok; };

const browser = await newBrowser();
const page = await newPage(browser);
const H = helpers(page);
const { t, text, click, open, shot } = H;
await open();
let r = await click("btn-register"); expect("register", !r, r);
await click("btn-sample-image");
r = await click("btn-attest"); expect("attest", !r, r);
await t("tab-accuser").click();
r = await click("btn-commit"); expect("commit (left pending)", !r, r);

// 1. stop everything of this instance (npm start stops the web server too when the chain stops)
execSync("npm run stop", { cwd: APP, env, stdio: "ignore" });
await sleep(4000);
note("obs", `chain stopped: chain-dot off=${await t("chain-dot").evaluate((e) => e.classList.contains("off"))} label="${await text("chain-label")}"`);
await t("tab-photographer").click();
note("obs", `chain stopped: sample enabled=${await t("btn-sample-image").isEnabled()} register=${await t("btn-register").isEnabled()} advance=${await t("btn-advance-time").isEnabled()}`);
r = await click("btn-sample-image"); note("obs", `chain stopped: sample image -> ${r || "ok"}`);
if (await t("btn-attest").isEnabled()) { r = await click("btn-attest"); note("obs", `chain stopped: attest -> ${r}`); }
await shot("s6-01-chain-stopped");

// 2. step-by-step restart with other parameters, page left open
bg("chain");
expect("chain up", await waitHttp(`http://127.0.0.1:${RPC_PORT}/rpc`.replace("/rpc", ""), (x) => x.ok));
execSync("npm run deploy", { cwd: APP, env: { ...env, BOND: "2", PHOTO_WINDOW: "600", REVEAL_WINDOW: "300" }, stdio: "ignore" });
bg("web");
expect("web up", await waitHttp(BASE + "/deployment.json"));
await sleep(8000);
note("obs", `after restart: url=${page.url()} banner=${await t("error-banner").isVisible() ? await text("error-message") : "(none)"} fatal=${await t("fatal-message").isVisible()}`);
await shot("s6-02-after-restart");
const params = { bond: await text("param-bond"), tp: await text("param-photo-window"), tr: await text("param-reveal-window"), fee: await text("param-fee") };
note("obs", `params shown: ${JSON.stringify(params)}`);
expect("B shown = 2 WETH", params.bond === "2 WETH", params.bond);
expect("T_photo shown = 10 minutes", params.tp === "10 minutes", params.tp);
expect("T_reveal shown = 5 minutes", params.tr === "5 minutes", params.tr);
// every visible text that names an amount or a duration
const bodyText = await page.evaluate(() => document.body.innerText);
const stale = (bodyText.match(/[^\n]*(1 WETH|1 hour|15 minutes|3600|900 s)[^\n]*/g) || []).slice(0, 8);
expect("no default-parameter value left in the page text", stale.length === 0, JSON.stringify(stale));
note("obs", `advance title: ${await t("btn-advance-time").getAttribute("title")}`);
expect("device state reset (register enabled)", await t("btn-register").isEnabled());
r = await click("btn-register"); expect("register on new chain", !r, r);
await click("btn-sample-image");
r = await click("btn-attest"); expect("attest on new chain", !r, r);
const deployment = await (await fetch(BASE + "/deployment.json")).json();
const ctx = lib.connect({ rpcUrl: `http://127.0.0.1:${RPC_PORT}`, deployment });
expect("contract BOND = 2e18", (await ctx.contracts.paprika.BOND()) === 2n * 10n ** 18n);
const m = await money(ctx);
expect("delta-photographer = −2 WETH", (await text("delta-photographer")) === "−2 WETH", await text("delta-photographer"));
expect("header photographer = chain", (await text("balance-photographer")) === lib.formatToken(ctx, m.photographer));
note("obs", `capture-result: ${await text("capture-result")}`);
note("obs", `deposit-when: ${await text("deposit-when")}`);
await t("tab-accuser").click();
note("obs", `accuser tab after restart: commit-status="${await text("commit-status")}" commit enabled=${await t("btn-commit").isEnabled()} reveal=${await t("btn-reveal").isEnabled()}`);
r = await click("btn-commit"); expect("commit on new chain", !r, r);
r = await click("btn-reveal"); expect("reveal on new chain", !r, r);
r = await click("btn-vote-not-fake"); expect("vote on new chain", !r, r);
note("obs", `settle (B=2): ${await text("settle-accuser")} / ${await text("settle-depositor")} / ${await text("settle-store")} / ${await text("settle-check")}; expected ${await text("settle-expected-accuser")} / ${await text("settle-expected-depositor")} / ${await text("settle-expected-store")}`);
await shot("s6-03-bond2-settle");
const c = await conservation(ctx); expect("conservation B=2", c.ok);
await t("tab-photographer").click();
r = await click("btn-advance-time"); expect("advance B=2", !r, r);
note("obs", `advance timeline note: ${(await page.getByTestId("activity-row").last().innerText()).trim()}`);
r = await click(t("btn-refund").first()); expect("refund B=2", !r, r);

// 3. web server restart only
const web = procs[procs.length - 1]; kill(web);
await sleep(4000);
note("obs", `web server down: chain-dot off=${await t("chain-dot").evaluate((e) => e.classList.contains("off"))} label="${await text("chain-label")}"`);
await shot("s6-04-web-down");
bg("web");
expect("web up again", await waitHttp(BASE + "/deployment.json"));
await sleep(4000);
note("obs", `web back: label="${await text("chain-label")}" dot off=${await t("chain-dot").evaluate((e) => e.classList.contains("off"))} banner=${await t("error-banner").isVisible()}`);
r = await click("btn-deposits-withdraw"); expect("withdraw after web restart", !r, r);

// 4. chain stopped while the web server keeps running
const chain = procs[0]; kill(chain);
execSync(`pkill -f "hardhat node --hostname 127.0.0.1 --port ${RPC_PORT}" || true`);
await sleep(4000);
note("obs", `chain down, web up: label="${await text("chain-label")}"`);
await page.reload(); await sleep(2500);
note("obs", `reload with chain down: fatal=${await t("fatal-message").isVisible()} reason="${await t("fatal-reason").innerText().catch(() => "")}"`);
await shot("s6-05-chain-down-reload");
note("obs", `console: ${JSON.stringify(page.qa.console.slice(0, 6))}`);
fs.writeFileSync(`${SHOTS}/s6-notes.json`, JSON.stringify(notes, null, 1));
await browser.close();
for (const p of procs) kill(p);
execSync("npm run stop", { cwd: APP, env, stdio: "ignore" });
