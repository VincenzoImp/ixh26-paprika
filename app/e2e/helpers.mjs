// Paprika tests: shared helpers for demo.e2e.mjs, edge.e2e.mjs and screens.mjs.
// Starts a fresh instance (chain + deploy + web) on spare ports, records checks, and drives the page through its
// data-testids. Pages get the MetaMask stand-in of fake-metamask.mjs (Alice = Hardhat #1, Bob = Hardhat #2).

import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const APP = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

// Starts scripts/start.js on the given ports and waits until the web server answers. Returns a stop function.
export async function startInstance(rpcPort, webPort) {
  const base = `http://127.0.0.1:${webPort}`;
  try {
    const r = await fetch(`http://127.0.0.1:${rpcPort}`, { method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "eth_chainId", params: [] }), signal: AbortSignal.timeout(1000) });
    if (r.ok) throw new Error(`port ${rpcPort} is busy: a fresh chain is needed`);
  } catch (e) { if (/busy/.test(e.message)) throw e; }
  const env = { ...process.env, RPC_PORT: String(rpcPort), WEB_PORT: String(webPort) };
  const child = spawn(process.execPath, ["scripts/start.js"], { cwd: APP, detached: true, stdio: ["ignore", "pipe", "pipe"], env });
  let log = "";
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("instance did not start in 180 s:\n" + log)), 180000);
    const onData = (d) => { log += d; if (/Paprika is running/.test(log)) { clearTimeout(timer); resolve(); } if (/Start failed/.test(log)) { clearTimeout(timer); reject(new Error(log)); } };
    child.stdout.on("data", onData); child.stderr.on("data", onData);
    child.on("exit", (c) => { clearTimeout(timer); reject(new Error(`start.js exited (${c}):\n${log}`)); });
  });
  for (let i = 0; i < 50; i++) { try { if ((await fetch(base)).ok) break; } catch {} await new Promise((r) => setTimeout(r, 200)); }
  const stop = () => {
    try { process.kill(-child.pid, "SIGINT"); } catch {}
    try { execSync("node scripts/stop.js", { cwd: APP, env, stdio: "ignore" }); } catch {}
  };
  return { base, rpc: `http://127.0.0.1:${rpcPort}`, stop, env };
}

// A check recorder: check(name, cond, detail) and eq(name, actual, expected); failures get a screenshot.
export function checker(outDir, getPage) {
  const results = [];
  let n = 0;
  async function check(name, cond, detail = "") {
    let ok;
    try { ok = typeof cond === "function" ? await cond() : cond; } catch (e) { ok = false; detail = `${detail} ${e.message}`.trim(); }
    results.push({ name, ok: !!ok, detail });
    console.log(`${ok ? "PASS" : "FAIL"}  ${name}${!ok && detail ? "  -- " + detail : ""}`);
    const page = getPage?.();
    if (!ok && page) {
      n += 1;
      fs.mkdirSync(outDir, { recursive: true });
      await page.screenshot({ path: path.join(outDir, `fail-${String(n).padStart(2, "0")}-${name.replace(/[^a-z0-9]+/gi, "-").slice(0, 60)}.png`) }).catch(() => {});
    }
    return !!ok;
  }
  const show = (v) => (typeof v === "bigint" ? v.toString() : JSON.stringify(v));
  const eq = (name, actual, expected) => check(name, actual === expected, `expected ${show(expected)}, got ${show(actual)}`);
  return { check, eq, results };
}

// Page helpers bound to one page.
export function driver(page) {
  const t = (id) => page.getByTestId(id);
  const idle = () => page.waitForFunction(() => window.paprikaState && !window.paprikaState.busy, null, { timeout: 120000 });
  // Clicks and waits for the action; returns the last toast's { status, text } (or null).
  async function click(idOrLoc) {
    const loc = typeof idOrLoc === "string" ? t(idOrLoc).first() : idOrLoc;
    await loc.click();
    await page.waitForTimeout(150);
    await idle();
    return lastToast();
  }
  async function lastToast() {
    const toasts = page.getByTestId("toast");
    const k = await toasts.count();
    if (!k) return null;
    const el = toasts.nth(k - 1);
    return { status: await el.getAttribute("data-status"), text: (await el.innerText()).replace(/\s+/g, " "), action: await el.getAttribute("data-action") };
  }
  // Clicks a button that opens a confirmation dialog, then confirms it.
  async function clickConfirm(id, dialog) {
    await t(id).first().click();
    await t(`${dialog}-ok`).click();
    await page.waitForTimeout(150);
    await idle();
    return lastToast();
  }
  const text = async (id) => (await t(id).first().innerText()).trim();
  const go = async (hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await page.waitForTimeout(400); await idle(); };
  return { t, idle, click, clickConfirm, lastToast, text, go };
}
