// QA exploration harness (staging test 2): connects Playwright and the library to an ALREADY RUNNING instance.
// Env: RPC_PORT (default 8945), WEB_PORT (default 5573). Start the instance first:
//   RPC_PORT=8945 WEB_PORT=5573 npm start
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

export const HERE = path.dirname(fileURLToPath(import.meta.url));
export const APP = path.resolve(HERE, "..", "..");
export const RPC_PORT = Number(process.env.RPC_PORT || 8945);
export const WEB_PORT = Number(process.env.WEB_PORT || 5573);
export const BASE = `http://127.0.0.1:${WEB_PORT}`;
export const SHOTS = path.join(APP, "output", "staging-2");
fs.mkdirSync(SHOTS, { recursive: true });

export const lib = await import(path.join(APP, "lib", "paprika.js"));
export const dev = await import(path.join(APP, "lib", "device.js"));

export async function connectLib() {
  const deployment = await (await fetch(`${BASE}/deployment.json`)).json();
  return lib.connect({ rpcUrl: `http://127.0.0.1:${RPC_PORT}`, deployment });
}

export const notes = [];
export function note(kind, msg) { notes.push({ kind, msg }); console.log(`[${kind}] ${msg}`); }

export async function newBrowser() {
  return chromium.launch({ headless: !process.env.HEADED, args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
}
export async function newPage(browser, { width = 1440, height = 900, ctxOpts = {} } = {}) {
  const context = ctxOpts.context || await browser.newContext({ viewport: { width, height }, acceptDownloads: true, permissions: ["camera"], ...ctxOpts });
  const page = await context.newPage();
  page.qa = { console: [], failed: [] };
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) page.qa.console.push(`${m.type()}: ${m.text()}`); });
  page.on("pageerror", (e) => page.qa.console.push(`pageerror: ${e.message}`));
  page.on("requestfailed", (r) => page.qa.failed.push(`${r.url()} ${r.failure()?.errorText}`));
  page.on("response", (r) => { if (r.status() >= 400) page.qa.failed.push(`${r.status()} ${r.url()}`); });
  return page;
}

export function helpers(page) {
  const t = (id) => page.getByTestId(id);
  const text = async (id) => (await t(id).first().innerText()).trim();
  const idle = () => page.waitForFunction(() => document.querySelector('[data-testid="busy-indicator"]')?.classList.contains("hidden"), null, { timeout: 120000 });
  async function click(idOrLoc) {
    const loc = typeof idOrLoc === "string" ? t(idOrLoc) : idOrLoc;
    if (!(await loc.isEnabled())) return "DISABLED";
    await loc.click();
    await page.waitForTimeout(150);
    await idle();
    if (await t("error-banner").isVisible()) {
      const msg = await text("error-message");
      const info = await t("error-banner").evaluate((e) => e.classList.contains("info"));
      await t("btn-dismiss-error").click();
      return (info ? "INFO: " : "") + (msg || "(error banner without text)");
    }
    return "";
  }
  async function open(hash = "") {
    await page.goto(BASE + "/" + hash);
    await page.reload();   // goto to a URL that differs only by its hash is not a reload
    await page.waitForTimeout(600);
    await idle();
  }
  async function shot(name) {
    const f = path.join(SHOTS, `${name}.png`);
    await page.screenshot({ path: f, fullPage: true });
    return path.relative(APP, f);
  }
  const state = () => page.evaluate(() => {
    const S = window.paprikaState;
    return JSON.parse(JSON.stringify({ acc: S.acc, attested: S.attested && { photoHash: S.attested.photoHash, keyId: S.attested.keyId },
      device: S.device && S.device.keyId, registered: S.registered, chain: S.chain }, (k, v) => (typeof v === "bigint" ? v.toString() : v)));
  });
  // Every button and its enabled state, per visible view.
  const buttons = () => page.evaluate(() => [...document.querySelectorAll("button")].map((b) => ({
    id: b.dataset.testid, text: b.textContent.trim().slice(0, 40), enabled: !b.disabled,
    visible: !!(b.offsetWidth || b.offsetHeight || b.getClientRects().length),
  })));
  return { t, text, idle, click, open, shot, state, buttons };
}

export async function money(ctx) {
  const b = await lib.balances(ctx);
  return { ...b, cPh: await lib.credits(ctx, ctx.accounts.photographer), cAcc: await lib.credits(ctx, ctx.accounts.accuser) };
}

// WETH conservation: total supply == sum of every holder we know.
export async function conservation(ctx) {
  const token = ctx.contracts.token;
  const supply = await token.totalSupply();
  const holders = { ...ctx.accounts };
  for (const [i, v] of (ctx.voters || []).entries()) holders[`voter${i}`] = v.address;
  holders.store = ctx.addresses.store; holders.paprika = ctx.addresses.paprika; holders.oo = ctx.addresses.oo;
  holders.dead = "0x000000000000000000000000000000000000dEaD";
  let sum = 0n; const parts = {};
  for (const [k, a] of Object.entries(holders)) { if (typeof a !== "string") continue; const v = await token.balanceOf(a); parts[k] = v; sum += v; }
  // Paprika's own holdings must cover all credits plus attested deposits plus live commitment bonds.
  return { supply, sum, ok: supply === sum, parts };
}

export function tmpFile(name, bytes) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "paprika-qa-"));
  const f = path.join(dir, name);
  fs.writeFileSync(f, bytes);
  return f;
}
