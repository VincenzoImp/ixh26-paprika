// Staging-2 exploration 1: the full demo story in the web, with a chain comparison after every action,
// the button states in each state, a reload at each step, and the flagged / revoked combinations.
// Needs a running instance: RPC_PORT=8945 WEB_PORT=5573 npm start ; then: node e2e/explore/s1-web-story.mjs
import fs from "node:fs";
import { BASE, connectLib, newBrowser, newPage, helpers, money, conservation, lib, note, notes, SHOTS } from "./harness.mjs";

const ctx = await connectLib();
const fmt = (v) => lib.formatToken(ctx, v);
const B = ctx.params.bond;
const browser = await newBrowser();
const page = await newPage(browser);
const { t, text, click, open, shot, state, buttons } = helpers(page);
const expect = (name, ok, detail = "") => { note(ok ? "ok" : "FAIL", `${name}${ok ? "" : " -- " + detail}`); return ok; };
const btnLog = {};
async function snapButtons(label) { btnLog[label] = (await buttons()).filter((b) => b.visible || b.enabled).map((b) => `${b.id}:${b.enabled ? "on" : "off"}${b.visible ? "" : "(hidden)"}`); }

async function compare(label) {
  const m = await money(ctx);
  expect(`${label}: header photographer`, (await text("balance-photographer")) === fmt(m.photographer), `${await text("balance-photographer")} vs ${fmt(m.photographer)}`);
  expect(`${label}: header accuser`, (await text("balance-accuser")) === fmt(m.accuser), `${await text("balance-accuser")} vs ${fmt(m.accuser)}`);
  expect(`${label}: header store`, (await text("balance-store")) === fmt(m.store), `${await text("balance-store")} vs ${fmt(m.store)}`);
  const cp = await text("header-credit-photographer");
  expect(`${label}: header credit ph`, cp === (m.cPh ? `+ ${fmt(m.cPh)} credit` : ""), `${cp} vs ${fmt(m.cPh)}`);
  const ca = await text("header-credit-accuser");
  expect(`${label}: header credit acc`, ca === (m.cAcc ? `+ ${fmt(m.cAcc)} credit` : ""), `${ca} vs ${fmt(m.cAcc)}`);
  const c = await conservation(ctx);
  expect(`${label}: WETH conservation`, c.ok, `supply ${c.supply} sum ${c.sum}`);
  return { m, deltas: { ph: await text("delta-photographer"), acc: await text("delta-accuser"), st: await text("delta-store") } };
}

await open();
expect("no fatal", !(await t("fatal-message").isVisible()));
await snapButtons("0-fresh");
await shot("s1-00-fresh");
// Click every enabled button that needs no prior state (should be harmless or explain itself).
for (const id of ["btn-verify-last", "btn-change-pixel", "btn-commit", "btn-reveal", "btn-vote-fake", "btn-revoke", "btn-refresh-records"]) {
  const en = await t(id).isEnabled().catch(() => false);
  if (en && id !== "btn-refresh-records") note("obs", `fresh page: ${id} enabled`);
}
let r = await click("btn-advance-time");
note("obs", `fresh page: advance time click -> ${r || "no error"}`);

// 1 register
let before = await money(ctx);
r = await click("btn-register");
expect("register no error", !r, r);
const s = await state();
const d = await ctx.contracts.paprika.devices(s.device);
expect("register: device active on chain", Number(d.status ?? d[1]) === 1);
await snapButtons("1-registered");
await compare("after register");
r = await click("btn-register");
note("obs", `register twice: button ${await t("btn-register").isEnabled() ? "enabled" : "disabled"} ${r}`);

// 2 attest
await click("btn-sample-image");
await snapButtons("2-photo-loaded");
r = await click("btn-attest");
expect("attest no error", !r, r);
const p1 = (await state()).attested;
const rec1 = (await lib.verifyPhoto(ctx, p1.photoHash)).find((x) => x.keyId.toLowerCase() === p1.keyId.toLowerCase());
let cmp = await compare("after attest");
expect("attest delta ph = -B", cmp.deltas.ph === `−${fmt(B)}`, cmp.deltas.ph);
const cr = await text("capture-result");
expect("capture-result names record block", cr.includes(`and ${rec1.recordedBlock}`), cr);
await snapButtons("3-attested");
// double-click attest of the same photo: should be disabled
expect("attest disabled after attest (same file)", !(await t("btn-attest").isEnabled()));
// deposit row
const row = t("deposit-row").first();
expect("deposit row state attested", (await row.getAttribute("data-state")) === "attested");
expect("refund disabled now", !(await t("btn-refund").first().isEnabled()));
const when = await text("deposit-when");
note("obs", `deposit-when: ${when}`);

// 3 verify
await t("tab-verifier").click();
await click("btn-verify-last");
expect("verify attested", (await t("verify-status").getAttribute("data-state")) === "attested");
await click("btn-change-pixel");
expect("pixel no-record", (await t("verify-status").getAttribute("data-state")) === "no-record");
await snapButtons("4-verifier-pixel");

// 4 commit; reload; reveal
await t("tab-accuser").click();
await snapButtons("5-accuser-before-commit");
before = await money(ctx);
r = await click("btn-commit");
expect("commit no error", !r, r);
cmp = await compare("after commit");
expect("commit delta acc = -B", cmp.deltas.acc === `−${fmt(B)}`, cmp.deltas.acc);
await snapButtons("6-committed");
await open("#accuser");
expect("reveal enabled after reload", await t("btn-reveal").isEnabled());
r = await click("btn-reveal");
expect("reveal no error", !r, r);
expect("chain accused", (await lib.verifyPhoto(ctx, p1.photoHash))[0].state === "accused");
cmp = await compare("after reveal");
await snapButtons("7-revealed");
await t("tab-photographer").click();
const st7 = await text("deposit-state"); const wh7 = await text("deposit-when");
note("obs", `photographer row during accusation: ${st7} / ${wh7}; refund ${await t("btn-refund").first().isEnabled()}`);
await t("tab-verifier").click();
await click("btn-verify-last");
note("obs", `verifier during accusation: ${await text("verify-title")} / deposit: ${await text("verify-deposit")}`);
await open("#accuser");
expect("vote enabled after reload", await t("btn-vote-not-fake").isEnabled());

// 5 vote not fake
r = await click("btn-vote-not-fake");
expect("vote no error", !r, r);
cmp = await compare("after vote NO");
const settle = { a: await text("settle-accuser"), d: await text("settle-depositor"), s: await text("settle-store"), check: await text("settle-check") };
note("obs", `settle NO: ${JSON.stringify(settle)} deltas ${JSON.stringify(cmp.deltas)}`);
expect("settle check ok", settle.check.includes("✓"), settle.check);
await snapButtons("8-voted");
await shot("s1-08-voted-no");
r = await click("btn-vote-not-fake");
note("obs", `vote again after vote: enabled=${await t("btn-vote-not-fake").isEnabled()} ${r}`);

// 6 advance + refund + withdraw
await t("tab-photographer").click();
r = await click("btn-advance-time");
expect("advance no error", !r, r);
expect("refund enabled", await t("btn-refund").first().isEnabled());
r = await click(t("btn-refund").first());
expect("refund no error", !r, r);
cmp = await compare("after refund");
expect("chain refunded", (await lib.verifyPhoto(ctx, p1.photoHash))[0].state === "refunded");
note("obs", `after refund row: ${await text("deposit-state")} / ${await text("deposit-when")}; deltas ${JSON.stringify(cmp.deltas)}`);
await snapButtons("9-refunded");
r = await click("btn-deposits-withdraw");
expect("withdraw no error", !r, r);
cmp = await compare("after withdraw ph");
note("obs", `withdraw deltas ${JSON.stringify(cmp.deltas)}`);
await t("tab-accuser").click();
note("obs", `accuser withdraw enabled with credit ${fmt(await lib.credits(ctx, ctx.accounts.accuser))}: ${await t("btn-withdraw-accuser").isEnabled()}`);

// 7 second photo, vote fake -> device flagged
await t("tab-photographer").click();
await click("btn-sample-image");
r = await click("btn-attest");
expect("attest 2", !r, r);
const p2 = (await state()).attested;
await click("btn-sample-image");
r = await click("btn-attest");
expect("attest 3", !r, r);
const p3 = (await state()).attested;
await t("tab-accuser").click();
await click("btn-accuse-new");
await t("select-accuse-photo").selectOption(`${p2.photoHash}|${p2.keyId}`);
r = await click("btn-commit"); expect("commit 2", !r, r);
r = await click("btn-reveal"); expect("reveal 2", !r, r);
r = await click("btn-vote-fake"); expect("vote fake", !r, r);
cmp = await compare("after vote YES");
const settle2 = { a: await text("settle-accuser"), d: await text("settle-depositor"), s: await text("settle-store"), check: await text("settle-check") };
note("obs", `settle YES: ${JSON.stringify(settle2)} deltas ${JSON.stringify(cmp.deltas)}`);
await shot("s1-10-voted-yes");
await t("tab-photographer").click();
await snapButtons("10-flagged");
note("obs", `flagged: device-status ${await text("device-status")}; revoke-why ${await text("revoke-why")}; attest-why ${await text("attest-why")}`);
await click("btn-sample-image");
note("obs", `flagged + photo loaded: attest enabled=${await t("btn-attest").isEnabled()} why=${await text("attest-why")}`);
// verifier: p3 (attested record of a flagged key) and p1 (refunded)
await t("tab-verifier").click();
const { tmpFile } = await import("./harness.mjs");
const f3 = await page.evaluate((h) => Array.from(window.paprikaState.files.get(h).bytes), p3.photoHash);
await t("input-verify-file").setInputFiles(tmpFile("p3.jpg", Buffer.from(f3)));
await page.waitForTimeout(200); await helpers(page).idle();
note("obs", `verify p3 (flagged key): ${await t("verify-status").getAttribute("data-state")} / ${await text("verify-title")} / ${await text("verify-detail")}`);
note("obs", `other rows: ${await t("verify-other-row").count()}`);
await shot("s1-11-verify-flagged");

// 8 new key, register, attest, advance, revoke: verdict of a challenge-over record of a revoked key
await t("tab-photographer").click();
await click("btn-generate-key");
note("obs", `after generate key: device-status=${await text("device-status")} register enabled=${await t("btn-register").isEnabled()}`);
r = await click("btn-register"); expect("register 2nd key", !r, r);
await click("btn-sample-image");
r = await click("btn-attest"); expect("attest with 2nd key", !r, r);
const p4 = (await state()).attested;
r = await click("btn-advance-time"); expect("advance 2", !r, r);
r = await click("btn-revoke"); expect("revoke", !r, r);
await snapButtons("11-revoked");
await t("tab-verifier").click();
await click("btn-verify-last");
const vt = await text("verify-title"), vd = await text("verify-detail");
note("obs", `verify revoked+challenge over: ${vt} / ${vd}`);
const rec4 = (await lib.verifyPhoto(ctx, p4.photoHash))[0];
const now = (await lib.chainInfo(ctx)).timestamp;
expect("revoked verdict does not offer accusing after the period", !(now > rec4.accusableUntil && /can still be accused/.test(vd)), vd);
await shot("s1-12-verify-revoked-over");
await open("#photographer");
note("obs", `revoked after reload: revoke-why=${await text("revoke-why")} revoke-status=${await text("revoke-status")}`);
await snapButtons("12-revoked-reload");

fs.writeFileSync(`${SHOTS}/s1-buttons.json`, JSON.stringify(btnLog, null, 1));
note("obs", `console: ${JSON.stringify(page.qa.console.slice(0, 10))}`);
note("obs", `failed requests: ${JSON.stringify(page.qa.failed.slice(0, 10))}`);
fs.writeFileSync(`${SHOTS}/s1-notes.json`, JSON.stringify({ notes, p1, p2, p3, p4 }, null, 1));
await browser.close();
