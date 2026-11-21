// Paprika: systematic visual crawl of the web app (Playwright, Chromium, fake camera, MetaMask stand-in).
//
// Drives the app through the UI into ~50 named STATES (no wallet ... key revoked, explorer pages, dialogs, menus),
// then, in each state: full-page screenshots at 5 viewports with automated visual checks on the DOM, a keyboard
// focus pass, and for EVERY visible interactive element: screenshot before, click / type, settle, screenshot after,
// console + page errors + failed requests, pixel diff, visual checks on the new DOM. Every click starts from the same
// point: the chain is reverted to an evm_snapshot taken when the state was seeded, localStorage and the MetaMask
// stand-in are restored, the page is reloaded and the UI-only part of the state (menu, dialog, camera) is redone.
//
// It runs N shards in parallel, each with its OWN fresh instance (chain + web) on spare ports, then merges them into
//   app/output/crawl/index.html     gallery (self-contained, images in app/output/crawl/img/)
//   app/output/crawl-report.md      findings, most severe first
//
//   cd app && npm run crawl
//   Environment: CRAWL_RPC_PORT (9945) and CRAWL_WEB_PORT (6545) = first shard's ports (shard i uses +i),
//   CRAWL_SHARDS (6), CRAWL_STATES (comma-separated state names: only these), CRAWL_REPORT_ONLY=1 (rebuild outputs).
// It stops only the instances it started.

import { spawn } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { APP, startInstance, driver } from "./helpers.mjs";

const SELF = fileURLToPath(import.meta.url);
const OUT = path.join(APP, "output", "crawl");
const IMG = path.join(OUT, "img");
const RPC0 = Number(process.env.CRAWL_RPC_PORT || 9945);
const WEB0 = Number(process.env.CRAWL_WEB_PORT || 6545);
const SHARDS = Number(process.env.CRAWL_SHARDS || 6);
const ONLY = process.env.CRAWL_STATES ? new Set(process.env.CRAWL_STATES.split(",")) : null;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const VIEWPORTS = [
  { name: "1440x900", width: 1440, height: 900 },
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1024x768", width: 1024, height: 768 },
  { name: "800x900", width: 800, height: 900 },
  // Browser zoom 125% on a 1440x900 window = a 1152x720 CSS viewport (same layout; the device pixel ratio only
  // changes sharpness), so it is emulated with that viewport.
  { name: "1440@125%", width: 1152, height: 720 },
];

// ==================================================================================================== states
// Each step seeds the chain/page further through the UI; its states are crawled right after it (from a snapshot).
// State: { name, title, who: "alice" | "bob", url(v), prep?(x), expect?(x) -> null | "what is wrong" }.
const STEPS = [
  { name: "fresh", seed: async (x) => { await x.goto("#/verify"); },
    states: [
      { name: "no-wallet-verify", title: "Verify (home), no wallet", url: () => "#/verify" },
      { name: "no-wallet-attest", title: "Attest, no wallet", url: () => "#/attest" },
      { name: "no-wallet-attest-photo", title: "Attest, no wallet, sample photo chosen", url: () => "#/attest", prep: async (x) => { await x.d.click("btn-sample-image"); } },
      { name: "record-not-found", title: "Record page of an unknown hash", url: () => `#/record/0x${"ab".repeat(32)}` },
      { name: "explorer-home-empty", title: "Explorer home on a fresh chain", url: () => "#/explorer" },
    ] },
  { name: "connect-alice", seed: async (x) => { await x.goto("#/verify"); await x.d.click("btn-connect"); },
    states: [
      { name: "alice-unprepared-verify", title: "Alice connected, not prepared (Verify)", url: () => "#/verify", expect: async (x) => (await x.text("account-name")) === "Alice" ? null : "header does not show Alice" },
      { name: "alice-unprepared-attest", title: "Alice connected, not prepared (Attest with a photo)", url: () => "#/attest", prep: async (x) => { await x.d.click("btn-sample-image"); } },
      { name: "activity-empty", title: "My activity, empty (Alice)", url: () => "#/activity" },
      { name: "menu-unprepared", title: "Account menu open (unprepared)", url: () => "#/verify", prep: async (x) => { await x.d.t("account-button").click(); await x.settle(); } },
      { name: "dialog-prepare", title: "Prepare account dialog", url: () => "#/verify", prep: async (x) => { await x.d.t("account-button").click(); await x.d.t("btn-prepare").click(); await x.settle(); } },
      { name: "wrong-network", title: "MetaMask on another network", url: () => "#/attest", prep: async (x) => { await x.mm.setChain(1); await x.settle(600); } },
    ] },
  { name: "prepare-register", seed: async (x) => { await x.goto("#/verify"); await x.d.t("account-button").click(); await x.d.clickConfirm("btn-prepare", "prepare"); await x.d.click("btn-register"); await x.closeMenu(); },
    states: [
      { name: "alice-prepared-attest", title: "Alice prepared, device key active (Attest)", url: () => "#/attest" },
      { name: "menu-prepared", title: "Account menu open (prepared, key active)", url: () => "#/attest", prep: async (x) => { await x.d.t("account-button").click(); await x.settle(); } },
      { name: "camera-live", title: "Camera live", url: () => "#/attest", prep: async (x) => { await x.d.click("btn-start-camera"); await x.settle(1200); } },
      { name: "photo-taken", title: "Photo taken, ready to attest", url: () => "#/attest", prep: async (x) => { await x.d.click("btn-start-camera"); await x.settle(800); await x.d.click("btn-take-photo"); } },
      { name: "dialog-confirm-attest", title: "Confirm attest dialog", url: () => "#/attest", prep: async (x) => { await x.d.click("btn-sample-image"); await x.d.t("btn-attest").click(); await x.settle(); } },
      { name: "toast-rejected", title: "Error toast (attest rejected in MetaMask)", url: () => "#/attest", prep: async (x) => { await x.d.click("btn-sample-image"); x.mm.reject(true); await x.d.clickConfirm("btn-attest", "confirm-attest"); x.mm.reject(false); await x.settle(); } },
    ] },
  { name: "attest-p1", seed: async (x) => {
      await x.goto("#/attest"); await x.d.click("btn-start-camera"); await x.settle(800); await x.d.click("btn-take-photo");
      await x.d.clickConfirm("btn-attest", "confirm-attest");
      x.v.p1 = await x.page.evaluate(() => window.paprikaState.lastAttested);
      x.v.attestTx = x.mm.state.sent.at(-1).hash;
      await x.d.click("btn-view-record");
      x.v.file1 = await x.download("p1");
    },
    states: [
      { name: "attested-alice", title: "Photo attested, open to challenge (Alice, record page)", url: (v) => `#/record/${v.p1}`, expect: async (x) => x.stateIs("record-verdict", "attested") },
      { name: "attest-done", title: "Attest page right after attesting (result box)", url: () => "#/attest", prep: async (x) => { await x.d.click("btn-sample-image"); await x.d.clickConfirm("btn-attest", "confirm-attest"); } },
      { name: "verify-attested", title: "Verify: an attested file dropped", url: () => "#/verify", prep: async (x) => { await x.d.t("input-verify-file").setInputFiles(x.v.file1); await x.settle(800); }, expect: async (x) => x.stateIs("verify-status", "attested") },
      { name: "verify-no-record", title: "Verify: a file with no record", url: () => "#/verify", prep: async (x) => { await x.d.t("input-verify-file").setInputFiles(x.files.img); await x.settle(800); } },
      { name: "explorer-tx-attest", title: "Explorer: the attest transaction", url: (v) => `#/tx/${v.attestTx}` },
    ] },
  { name: "bob-prepared", seed: async (x) => { await x.use("bob"); await x.goto(`#/record/${x.v.p1}`); await x.d.t("account-button").click(); await x.d.clickConfirm("btn-prepare", "prepare"); await x.closeMenu(); },
    states: [
      { name: "bob-record", title: "Bob on the record page", who: "bob", url: (v) => `#/record/${v.p1}`, expect: async (x) => ((await x.vis("btn-accuse")) ? null : "Bob is not offered Accuse") },
      { name: "bob-accuse-form", title: "Bob: accuse panel", who: "bob", url: (v) => `#/record/${v.p1}/accuse` },
      { name: "dialog-confirm-commit", title: "Confirm commit dialog", who: "bob", url: (v) => `#/record/${v.p1}/accuse`, prep: async (x) => { await x.d.t("input-evidence").fill("The same image was published at https://example.org/listing before the anchor block."); await x.d.t("btn-commit").click(); await x.settle(); } },
    ] },
  { name: "commit", seed: async (x) => { await x.goto(`#/record/${x.v.p1}/accuse`); await x.d.t("input-evidence").fill("The same image was published at https://example.org/listing before the anchor block."); await x.d.clickConfirm("btn-commit", "confirm-commit"); },
    states: [
      { name: "committed", title: "Accusation committed (reveal countdown)", who: "bob", url: (v) => `#/record/${v.p1}/accuse`, expect: async (x) => ((await x.vis("btn-reveal")) ? null : "no Reveal after the commit") },
    ] },
  { name: "reveal", seed: async (x) => { await x.goto(`#/record/${x.v.p1}/accuse`); await x.d.click("btn-reveal"); },
    states: [
      { name: "accused-bob", title: "Under accusation (Bob)", who: "bob", url: (v) => `#/record/${v.p1}`, expect: async (x) => x.stateIs("record-verdict", "accused") },
      { name: "accused-alice", title: "Under accusation (Alice, the depositor)", url: (v) => `#/record/${v.p1}` },
      { name: "local-tools-open", title: "Local network tools open", who: "bob", url: (v) => `#/record/${v.p1}`, prep: async (x) => { await x.d.t("local-tools-toggle").click(); await x.settle(); } },
      { name: "protocol-open", title: "Protocol view drawer open", who: "bob", url: (v) => `#/record/${v.p1}`, prep: async (x) => { await x.d.t("protocol-toggle").check(); await x.settle(); } },
    ] },
  { name: "vote-not-proven", seed: async (x) => { await x.goto(`#/record/${x.v.p1}`); await x.d.click("btn-vote-not-fake-inline"); },
    states: [
      { name: "not-proven-bob", title: "Outcome: not proven (Bob)", who: "bob", url: (v) => `#/record/${v.p1}` },
      { name: "claimable-alice", title: "Alice with claimable credit", url: (v) => `#/record/${v.p1}` },
    ] },
  { name: "claim-skip", seed: async (x) => { await x.use("alice"); await x.goto(`#/record/${x.v.p1}`); await x.d.click("btn-claim-record"); await x.d.click("btn-skip-wait"); },
    states: [
      { name: "refundable", title: "Refundable (Alice)", url: (v) => `#/record/${v.p1}`, expect: async (x) => ((await x.vis("btn-refund")) ? null : "no Refund offered") },
    ] },
  { name: "refund", seed: async (x) => { await x.goto(`#/record/${x.v.p1}`); await x.d.click("btn-refund"); x.v.refundTx = x.mm.state.sent.at(-1).hash; },
    states: [
      { name: "refunded", title: "Refunded (Alice)", url: (v) => `#/record/${v.p1}`, expect: async (x) => x.stateIs("record-verdict", "unchallenged") },
      { name: "verify-refunded", title: "Verify: the refunded file", url: () => "#/verify", prep: async (x) => { await x.d.t("input-verify-file").setInputFiles(x.v.file1); await x.settle(800); } },
    ] },
  { name: "fake-proven", seed: async (x) => {
      await x.goto("#/attest"); await x.d.click("btn-sample-image"); await x.d.clickConfirm("btn-attest", "confirm-attest");
      x.v.p2 = await x.page.evaluate(() => window.paprikaState.lastAttested);
      await x.d.click("btn-view-record"); x.v.file2 = await x.download("p2");
      x.v.key1 = await x.page.evaluate(() => { const k = window.paprikaState.device?.keyId; if (!k) return ""; return typeof k === "string" ? k : "0x" + [...k].map((b) => b.toString(16).padStart(2, "0")).join(""); });
      await x.use("bob"); await x.goto(`#/record/${x.v.p2}/accuse`); await x.d.t("btn-evidence-example").click(); await x.settle();
      await x.d.clickConfirm("btn-commit", "confirm-commit"); await x.d.click("btn-reveal"); await x.d.click("btn-vote-fake-inline");
      await x.use("alice");
    },
    states: [
      { name: "fake-proven-bob", title: "Outcome: fake proven (Bob)", who: "bob", url: (v) => `#/record/${v.p2}`, expect: async (x) => x.stateIs("record-verdict", "fake") },
      { name: "fake-proven-alice", title: "Outcome: fake proven (Alice)", url: (v) => `#/record/${v.p2}` },
      { name: "device-flagged-attest", title: "Device key flagged (Attest with a photo)", url: () => "#/attest", prep: async (x) => { await x.d.click("btn-sample-image"); } },
      { name: "menu-flagged", title: "Account menu, device flagged", url: () => "#/attest", prep: async (x) => { await x.d.t("account-button").click(); await x.settle(); } },
      { name: "verify-fake", title: "Verify: the proven-fake file", url: () => "#/verify", prep: async (x) => { await x.d.t("input-verify-file").setInputFiles(x.v.file2); await x.settle(800); } },
    ] },
  { name: "new-key", seed: async (x) => {
      await x.goto("#/attest"); if (await x.vis("btn-new-photo")) await x.d.t("btn-new-photo").click(); await x.d.click("btn-sample-image");
      await x.d.click("btn-new-key-attest"); await x.d.clickConfirm("btn-attest", "confirm-attest");
      x.v.p3 = await x.page.evaluate(() => window.paprikaState.lastAttested);
    },
    states: [
      { name: "dialog-revoke", title: "Revoke key dialog", url: () => "#/attest", prep: async (x) => { await x.d.t("account-button").click(); await x.d.t("btn-revoke").click(); await x.settle(); } },
    ] },
  { name: "revoke", seed: async (x) => { await x.goto("#/attest"); await x.d.t("account-button").click(); await x.d.clickConfirm("btn-revoke", "revoke"); await x.closeMenu(); },
    states: [
      { name: "key-revoked", title: "Key revoked (record page)", url: (v) => `#/record/${v.p3}`, expect: async (x) => x.stateIs("record-verdict", "flagged-key-revoked") },
      { name: "menu-revoked", title: "Account menu, key revoked", url: () => "#/attest", prep: async (x) => { await x.d.t("account-button").click(); await x.settle(); } },
      { name: "activity-full", title: "My activity, full (Alice)", url: () => "#/activity" },
      { name: "activity-bob", title: "My activity (Bob)", who: "bob", url: () => "#/activity" },
      { name: "verify-home-full", title: "Verify home with recent records", url: () => "#/verify" },
      { name: "explorer-home", title: "Explorer home", url: () => "#/explorer" },
      { name: "explorer-tx-refund", title: "Explorer: refund transaction", url: (v) => `#/tx/${v.refundTx}` },
      { name: "explorer-block", title: "Explorer: block page", url: () => "#/block/5" },
      { name: "explorer-address", title: "Explorer: Alice's address", url: (v) => `#/address/${v.alice}` },
      { name: "explorer-device", title: "Explorer: device page", url: (v) => `#/device/${v.key1}` },
      { name: "explorer-search-result", title: "Explorer: search by photo hash (result)", url: () => "#/explorer", prep: async (x) => { await x.d.t("explorer-search").fill(x.v.p2); await x.d.t("btn-explorer-search").click(); await x.settle(800); } },
      { name: "explorer-search-nothing", title: "Explorer: search with no result", url: () => "#/explorer", prep: async (x) => { await x.d.t("explorer-search").fill("nothing-here"); await x.d.t("btn-explorer-search").click(); await x.settle(800); } },
      { name: "explorer-tx-not-found", title: "Explorer: unknown transaction", url: () => `#/tx/0x${"de".repeat(32)}` },
      { name: "explorer-block-not-found", title: "Explorer: block beyond the head", url: () => "#/block/999999" },
      { name: "explorer-address-bad", title: "Explorer: malformed address", url: () => "#/address/0x1234" },
    ] },
];

// ==================================================================================================== in-page code
// Enumerates the visible interactive elements. Returns descriptors with a locator (test id + index, or CSS path).
function enumerateInPage() {
  const vis = (el) => el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false && el.getClientRects().length && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const cssPath = (el) => { const parts = []; while (el && el.nodeType === 1 && el !== document.body) { const p = el.parentElement; const i = [...p.children].indexOf(el) + 1; parts.unshift(`${el.tagName.toLowerCase()}:nth-child(${i})`); el = p; } return "body > " + parts.join(" > "); };
  const set = new Set(document.querySelectorAll('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=menuitem],[role=switch],[role=link],[tabindex]:not([tabindex="-1"])'));
  for (const el of document.querySelectorAll("body *")) {
    if (getComputedStyle(el).cursor === "pointer" && el.parentElement && getComputedStyle(el.parentElement).cursor !== "pointer") set.add(el);
  }
  const out = [];
  for (const el of set) {
    if (!vis(el)) continue;
    if (el.tagName === "LABEL" && el.querySelector("input,select,textarea")) continue;   // the control inside is the target
    if ([...set].some((o) => o !== el && o.contains(el) && /^(A|BUTTON|SUMMARY)$/.test(o.tagName))) continue;
    const tid = el.getAttribute("data-testid");
    const all = tid ? [...document.querySelectorAll(`[data-testid="${tid}"]`)] : [];
    const near = el.closest("[data-testid]");
    const text = (el.innerText || el.value || el.getAttribute("aria-label") || el.getAttribute("title") || el.getAttribute("placeholder") || "").replace(/\s+/g, " ").trim().slice(0, 80);
    const type = (el.getAttribute("type") || "").toLowerCase();
    let kind = "click";
    if (el.tagName === "TEXTAREA" || (el.tagName === "INPUT" && !["checkbox", "radio", "button", "submit", "file", "range", "color"].includes(type))) kind = "type";
    if (el.tagName === "SELECT") kind = "select";
    if (el.tagName === "INPUT" && type === "file") kind = "file";
    out.push({ testid: tid || "", index: tid ? all.indexOf(el) : 0, css: cssPath(el), tag: el.tagName.toLowerCase(), type, role: el.getAttribute("role") || "",
      near: near?.getAttribute("data-testid") || "", text, kind, disabled: !!el.disabled || el.getAttribute("aria-disabled") === "true",
      href: el.getAttribute("href") || "", target: el.getAttribute("target") || "", title: el.getAttribute("title") || "" });
  }
  return out;
}

// Visual checks on the current DOM. opts: { scrollSteps } (also checks covering at several scroll positions).
async function auditInPage(opts) {
  const F = [];
  const vw = innerWidth, vh = innerHeight;
  const ignoreRoots = [...document.querySelectorAll("[data-crawl-ignore]")];
  const vis = (el) => el.checkVisibility?.({ opacityProperty: true, visibilityProperty: true }) !== false && el.getClientRects().length > 0 && el.getBoundingClientRect().width > 0 && el.getBoundingClientRect().height > 0;
  const short = (s, n = 50) => (s || "").replace(/\s+/g, " ").trim().slice(0, n);
  const desc = (el) => {
    if (!el || el.nodeType !== 1) return "?";
    const tid = el.getAttribute("data-testid");
    if (tid) return `[${tid}]` + (short(el.innerText, 30) ? ` "${short(el.innerText, 30)}"` : "");
    const near = el.closest("[data-testid]");
    const cls = typeof el.className === "string" && el.className.trim() ? "." + el.className.trim().split(/\s+/).join(".") : "";
    return `${near ? `[${near.getAttribute("data-testid")}] ` : ""}${el.tagName.toLowerCase()}${cls}` + (short(el.innerText, 30) ? ` "${short(el.innerText, 30)}"` : "");
  };
  const add = (type, sev, el, msg, extra = {}) => F.push({ type, sev, el: desc(el), msg, ...extra });
  const directText = (el) => [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent).join("").replace(/\s+/g, " ").trim();
  const all = [...document.querySelectorAll("body *")].filter((el) => !["SCRIPT", "STYLE", "TEMPLATE", "OPTION"].includes(el.tagName));
  const visible = all.filter(vis);
  const modal = document.querySelector(".modal-wrap, [data-testid$='-dialog']");
  const menuSlot = document.querySelector('[data-testid="account-menu-slot"]');
  const menuOpen = menuSlot && vis(menuSlot) ? menuSlot : null;   // a dropdown: covering the page under it is intended
  const interactiveSel = "a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab]";
  const interactive = visible.filter((el) => el.matches(interactiveSel));
  const textEls = visible.filter((el) => directText(el).length > 0);

  // --- horizontal scroll and elements outside the viewport
  const sw = document.documentElement.scrollWidth;
  if (sw > vw + 1) {
    const culprits = visible.filter((el) => { const r = el.getBoundingClientRect(); if (r.right <= vw + 1) return false; let p = el.parentElement; while (p && p !== document.body) { const o = getComputedStyle(p).overflowX; if (o !== "visible") return false; p = p.parentElement; } return true; })
      .filter((el) => !el.parentElement || el.parentElement.getBoundingClientRect().right <= vw + 1).slice(0, 3);
    add("overflow", 3, culprits[0] || document.body, `page scrolls horizontally: content ${sw}px wide in a ${vw}px viewport` + (culprits.length ? `; widest: ${culprits.map(desc).join(" | ")}` : ""));
  }
  // --- clipping / overflow of text containers
  for (const el of visible) {
    const cs = getComputedStyle(el);
    if (["INPUT", "TEXTAREA", "SELECT", "IMG", "VIDEO", "CANVAS", "svg", "HTML", "BODY"].includes(el.tagName)) continue;
    const ox = cs.overflowX, oy = cs.overflowY;
    const wider = el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0;
    const taller = el.scrollHeight > el.clientHeight + 2 && el.clientHeight > 0;
    if (wider && (ox === "hidden" || ox === "clip")) {
      if (cs.textOverflow === "ellipsis") { if (!el.closest("[title]")) add("clipping", 2, el, `text cut with an ellipsis and no title to read it in full (${el.scrollWidth}px of text in ${el.clientWidth}px)`); }
      else add("clipping", 3, el, `content cut horizontally (${el.scrollWidth}px in ${el.clientWidth}px, overflow ${ox})`);
    } else if (wider && ox === "visible" && el.innerText?.trim()) {
      const hasBox = cs.borderLeftWidth !== "0px" || (cs.backgroundColor !== "rgba(0, 0, 0, 0)" && cs.backgroundColor !== "transparent");
      if (hasBox) add("overflow", 3, el, `content spills out of its box (${el.scrollWidth}px in ${el.clientWidth}px)`);
    } else if (wider && (ox === "auto" || ox === "scroll") && el.tagName !== "PRE") {
      add("overflow", 1, el, `container scrolls horizontally (${el.scrollWidth}px in ${el.clientWidth}px)`);
    }
    if (taller && (oy === "hidden" || oy === "clip") && el.innerText?.trim() && !(cs.webkitLineClamp && cs.webkitLineClamp !== "none")) add("clipping", 3, el, `content cut vertically (${el.scrollHeight}px in ${el.clientHeight}px)`);
  }
  // --- text: size and contrast
  const parse = (c) => { const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const lum = ({ r, g, b }) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const blend = (top, bot) => ({ r: top.r * top.a + bot.r * (1 - top.a), g: top.g * top.a + bot.g * (1 - top.a), b: top.b * top.a + bot.b * (1 - top.a), a: 1 });
  const bgOf = (el) => {
    const layers = []; let e = el; let opacity = 1;
    while (e && e.nodeType === 1) {
      const cs = getComputedStyle(e);
      opacity *= Number(cs.opacity);
      if (cs.backgroundImage !== "none" && !/^url/.test(cs.backgroundImage) ) return { unknown: true };
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { layers.push(c); if (c.a >= 1) break; }
      e = e.parentElement;
    }
    let bg = { r: 255, g: 255, b: 255, a: 1 };
    for (const l of layers.reverse()) bg = blend(l, bg);
    return { bg, opacity };
  };
  for (const el of textEls) {
    const cs = getComputedStyle(el);
    const fs = parseFloat(cs.fontSize);
    const txt = directText(el);
    if (fs < 12 && txt.length > 1) add("small text", 1, el, `text ${fs}px (< 12px)`);
    const fg = parse(cs.color); if (!fg) continue;
    const b = bgOf(el); if (b.unknown) continue;
    let fgc = blend(fg, b.bg);
    if (b.opacity < 1) fgc = blend({ ...fgc, a: b.opacity }, b.bg);
    const L1 = lum(fgc), L2 = lum(b.bg);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const large = fs >= 24 || (fs >= 18.66 && Number(cs.fontWeight) >= 700);
    const need = large ? 3 : 4.5;
    const disabled = el.closest(":disabled, [aria-disabled=true]");
    if (ratio < need && txt.length > 1 && !disabled) add("contrast", ratio < 3 ? 2 : 1, el, `contrast ${ratio.toFixed(2)}:1 < ${need}:1 (text ${cs.color} on ${`rgb(${Math.round(b.bg.r)}, ${Math.round(b.bg.g)}, ${Math.round(b.bg.b)})`}, ${fs}px)`);
  }
  // --- tiny click targets
  for (const el of interactive) {
    let t = el;
    if (el.tagName === "INPUT" && /checkbox|radio/.test(el.type) && el.closest("label")) t = el.closest("label");
    const r = t.getBoundingClientRect();
    const inline = el.tagName === "A" && el.parentElement && directText(el.parentElement).length > 0;
    if (r.width < 32 || r.height < 32) add("tiny target", r.width < 24 || r.height < 24 ? 2 : 1, el, `click target ${Math.round(r.width)}x${Math.round(r.height)} px (< 32x32)${inline ? ", inline link in text" : ""}`);
  }
  // --- duplicated identical text blocks
  const blocks = new Map();
  for (const el of textEls) { const t = el.innerText?.replace(/\s+/g, " ").trim(); if (!t || t.length < 25) continue; if (!blocks.has(t)) blocks.set(t, []); blocks.get(t).push(el); }
  for (const [t, els] of blocks) { const top = els.filter((e) => !els.some((o) => o !== e && o.contains(e))); if (top.length > 1) add("duplicate text", 1, top[1], `the same text appears ${top.length}x on the page: "${short(t, 80)}"`); }
  // --- empty containers with borders
  for (const el of visible) {
    if (/^(INPUT|BUTTON|SELECT|TEXTAREA|IMG|VIDEO|CANVAS|HR|IFRAME|svg|path|LABEL)$/i.test(el.tagName)) continue;
    const cs = getComputedStyle(el);
    const bw = ["Top", "Right", "Bottom", "Left"].filter((s) => cs[`border${s}Style`] !== "none" && parseFloat(cs[`border${s}Width`]) > 0).length;
    if (bw < 2) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 6 || r.height < 6) continue;
    if (el.innerText.trim() || el.querySelector("img,video,canvas,svg,input,select,textarea,button")) continue;
    add("empty box", 2, el, `empty container with a border (${Math.round(r.width)}x${Math.round(r.height)})`);
  }
  // --- images without size / broken
  for (const el of visible.filter((e) => e.tagName === "IMG")) {
    if (el.complete && el.naturalWidth === 0) add("broken image", 3, el, `image does not load: ${el.getAttribute("src")?.slice(0, 60)}`);
    if (!el.getAttribute("width") && !el.getAttribute("height") && !el.style.width && !el.style.height) add("image size", 1, el, "image without width/height (layout shifts when it loads)");
  }
  // --- spacing outliers, proportions and alignment among siblings
  const parents = new Set(visible.map((e) => e.parentElement).filter(Boolean));
  for (const p of parents) {
    const kids = [...p.children].filter(vis).filter((k) => getComputedStyle(k).position !== "absolute" && getComputedStyle(k).position !== "fixed");
    const groups = new Map();
    for (const k of kids) { const key = k.tagName + "." + (typeof k.className === "string" ? k.className.trim() : ""); if (!groups.has(key)) groups.set(key, []); groups.get(key).push(k); }
    for (const [key, g] of groups) {
      if (g.length < 3) continue;
      const R = g.map((k) => k.getBoundingClientRect());
      const vertical = R.every((r, i) => i === 0 || r.top >= R[i - 1].bottom - 1);
      const horizontal = R.every((r, i) => i === 0 || (Math.abs(r.top - R[i - 1].top) < 4 && r.left >= R[i - 1].right - 1));
      if (!vertical && !horizontal) continue;
      const gaps = R.slice(1).map((r, i) => (vertical ? r.top - R[i].bottom : r.left - R[i].right));
      const sorted = [...gaps].sort((a, b) => a - b); const med = sorted[Math.floor(sorted.length / 2)];
      gaps.forEach((gp, i) => { if (Math.abs(gp - med) > Math.max(6, med * 0.5)) add("spacing", 1, g[i + 1], `gap ${Math.round(gp)}px before this ${key.toLowerCase()} vs ${Math.round(med)}px between its siblings`); });
      if (vertical) { const lefts = R.map((r) => Math.round(r.left)); const ml = lefts.sort((a, b) => a - b)[Math.floor(lefts.length / 2)]; R.forEach((r, i) => { const d = Math.abs(Math.round(r.left) - ml); if (d >= 1 && d <= 6) add("misaligned", 1, g[i], `left edge ${d}px off its siblings`); }); }
    }
    // controls side by side with different heights
    const ctrls = kids.filter((k) => k.matches("button, input:not([type=checkbox]):not([type=radio]), select, a.btn, .btn"));
    for (let i = 1; i < ctrls.length; i++) {
      const a = ctrls[i - 1].getBoundingClientRect(), b = ctrls[i].getBoundingClientRect();
      if (Math.abs(a.top - b.top) < a.height && Math.abs(a.height - b.height) > 4) add("proportion", 1, ctrls[i], `side-by-side controls of different heights: ${Math.round(a.height)}px (${desc(ctrls[i - 1])}) vs ${Math.round(b.height)}px`);
    }
  }
  // --- covered elements (something drawn on top), at several scroll positions
  const fixedBars = visible.filter((e) => { const p = getComputedStyle(e).position; return (p === "fixed" || p === "sticky") && e.getBoundingClientRect().width >= vw * 0.9; });
  const startY = scrollY;
  const maxY = Math.max(0, document.documentElement.scrollHeight - vh);
  const ys = opts?.scrollSteps ? [...new Set([0, ...Array.from({ length: 6 }, (_, i) => Math.min(maxY, Math.round((i + 1) * vh * 0.7)))])].filter((y, i, a) => y <= maxY && (i === 0 || y > a[i - 1])) : [startY];
  const seen = new Set();
  for (const y of ys) {
    if (opts?.scrollSteps) { scrollTo(0, y); await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))); }
    const barBottom = Math.max(0, ...fixedBars.filter((b) => b.getBoundingClientRect().top <= 1).map((b) => b.getBoundingClientRect().bottom));
    const cands = [...interactive, ...textEls.filter((e) => !e.closest(interactiveSel))].filter((el) => !modal || modal.contains(el));
    for (const el of cands) {
      if (seen.has(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.top < barBottom + 1 || r.bottom > vh - 1 || r.left < 0 || r.right > vw || r.width < 4 || r.height < 4) continue;
      if (fixedBars.some((b) => b.contains(el)) && getComputedStyle(el).position !== "fixed") { /* bar content is fine */ }
      const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 3, r.top + 3], [r.right - 3, r.top + 3], [r.left + 3, r.bottom - 3], [r.right - 3, r.bottom - 3]];
      let covered = 0, by = null;
      for (const [px, py] of pts) {
        const top = document.elementFromPoint(px, py);
        if (!top || el.contains(top) || top.contains(el)) continue;
        if (ignoreRoots.some((i) => i.contains(top))) continue;
        if (menuOpen && menuOpen.contains(top)) continue;
        covered++; by = top;
      }
      if (covered >= 2 || (covered >= 1 && by && pts[0] && !el.contains(document.elementFromPoint(pts[0][0], pts[0][1])) && !document.elementFromPoint(pts[0][0], pts[0][1])?.contains(el))) {
        // the covering thing must be something else than a parent's normal neighbour flow
        const coverFixed = (() => { let e = by; while (e && e !== document.body) { const p = getComputedStyle(e).position; if (p === "fixed" || p === "sticky" || p === "absolute") return e; e = e.parentElement; } return null; })();
        seen.add(el);
        add("overlap", el.matches(interactiveSel) ? 4 : 3, el, `covered by ${desc(coverFixed || by)} (${covered}/5 sample points${coverFixed ? `, ${getComputedStyle(coverFixed).position}` : ""})${opts?.scrollSteps ? ` at scroll ${Math.round(scrollY)}` : ""}`);
      }
    }
  }
  if (opts?.scrollSteps) scrollTo(0, startY);
  // --- suspicious text: raw values that should never reach a user
  const body = document.body.innerText;
  for (const [re, what] of [[/\bNaN\b/, "NaN"], [/\bundefined\b/, "undefined"], [/\[object \w+\]/, "[object …]"], [/\bInfinity\b/, "Infinity"], [/could not be drawn/i, "page could not be drawn"], [/execution reverted|CALL_EXCEPTION|missing revert data|UNKNOWN_ERROR|could not coalesce/i, "raw RPC error"]]) {
    const m = body.match(re);
    if (m) { const i = body.indexOf(m[0]); add("state bug", 4, document.body, `page shows "${what}": …${short(body.slice(Math.max(0, i - 60), i + 60), 120)}…`); }
  }
  return F;
}

// ==================================================================================================== shard
async function runShard(shard, nShards) {
  const { chromium } = await import("playwright");
  const { installFakeMetaMask } = await import("./fake-metamask.mjs");
  const rpcPort = RPC0 + shard, webPort = WEB0 + shard;
  fs.mkdirSync(IMG, { recursive: true });
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `paprika-crawl-${shard}-`));
  const files = {
    img: path.join(tmp, "random.png"),
    txt: path.join(tmp, "evidence.txt"),
    json: path.join(tmp, "device-garbage.json"),
  };
  // a valid small PNG with random pixels (so it is never attested)
  fs.writeFileSync(files.img, Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP4z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64"));
  fs.writeFileSync(files.txt, "Crawler sample evidence: https://example.org/original\n");
  fs.writeFileSync(files.json, "{\"not\":\"a device key\"}");
  const data = { shard, states: [], log: [] };
  const log = (...a) => { const s = `[shard ${shard}] ${a.join(" ")}`; console.log(s); data.log.push(s); };
  let inst, browser;
  const mine = (gi) => gi % nShards === shard && (!ONLY || ONLY.has(allStates[gi].name));
  const allStates = STEPS.flatMap((s) => s.states);
  const lastStep = (() => { let gi = 0, last = -1; STEPS.forEach((s, si) => { for (const _ of s.states) { if (mine(gi)) last = si; gi++; } }); return last; })();
  if (lastStep < 0) { fs.writeFileSync(path.join(OUT, `shard-${shard}.json`), JSON.stringify(data)); return; }
  try {
    log(`starting instance chain ${rpcPort} web ${webPort}`);
    inst = await startInstance(rpcPort, webPort);
    browser = await chromium.launch({ args: ["--use-fake-device-for-media-stream", "--use-fake-ui-for-media-stream"] });
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    await context.grantPermissions(["camera"], { origin: inst.base });
    const mm = await installFakeMetaMask(context, inst.rpc);
    const page = await context.newPage();
    const diffCtx = await browser.newContext(); const diffPage = await diffCtx.newPage();
    const d = driver(page);
    const rpc = async (method, params = []) => { const r = await (await fetch(inst.rpc, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) })).json(); if (r.error) throw new Error(r.error.message); return r.result; };

    // --- event recording
    const seedErrors = { pageErrors: [] };
    let inflight = 0, rec = null;
    page.on("request", () => { inflight++; });
    page.on("requestfinished", () => { inflight = Math.max(0, inflight - 1); });
    page.on("requestfailed", (r) => { inflight = Math.max(0, inflight - 1); if (rec && !/ERR_ABORTED/.test(r.failure()?.errorText || "")) rec.failed.push(`${r.method()} ${r.url().replace(inst.base, "")} ${r.failure()?.errorText}`); });
    page.on("response", (r) => { if (rec && r.status() >= 400) rec.failed.push(`${r.request().method()} ${r.url().replace(inst.base, "")} -> HTTP ${r.status()}`); });
    page.on("console", (m) => { if (rec && (m.type() === "error" || m.type() === "warning")) rec[m.type() === "error" ? "console" : "warnings"].push(m.text().slice(0, 300)); });
    page.on("pageerror", (e) => { (rec || seedErrors).pageErrors.push(e.message.slice(0, 300)); });
    page.on("dialog", async (dl) => { if (rec) rec.dialogs.push(`${dl.type()}: ${dl.message()}`); await dl.accept().catch(() => {}); });
    page.on("download", (dl) => { if (rec) rec.downloads.push(dl.suggestedFilename()); });
    context.on("page", async (p) => { if (p === page) return; await p.waitForLoadState("domcontentloaded").catch(() => {}); if (rec) rec.popups.push(p.url().replace(inst.base, "")); await p.close().catch(() => {}); });
    let chooserFile = files.img;
    page.on("filechooser", async (fc) => { if (rec) rec.chooser.push(path.basename(chooserFile)); await fc.setFiles(chooserFile).catch(() => {}); });

    async function settle(min = 300) {
      await page.waitForTimeout(150);
      await page.waitForFunction(() => !window.paprikaState || !window.paprikaState.busy, null, { timeout: 90000 }).catch(() => {});
      const t0 = Date.now(); let quiet = Date.now();
      while (Date.now() - t0 < 10000) { if (inflight > 0) quiet = Date.now(); else if (Date.now() - quiet >= 500) break; await sleep(50); }
      await page.waitForTimeout(min);
    }
    const x = {
      page, mm, d, v: { alice: mm.address("alice") }, files, settle,
      async goto(hash) { await d.go(hash); await settle(); },
      async use(who) { await mm.use(who); await page.waitForTimeout(800); await settle(); },
      async closeMenu() { if (await page.getByTestId("account-menu").isVisible().catch(() => false)) await page.getByTestId("account-button").click(); await settle(); },
      async text(id) { return (await page.getByTestId(id).first().innerText().catch(() => "")).trim(); },
      async vis(id) { return page.getByTestId(id).first().isVisible().catch(() => false); },
      async stateIs(id, want) { const got = await page.getByTestId(id).first().getAttribute("data-state").catch(() => null); return got === want ? null : `${id} data-state is ${got}, expected ${want}`; },
      async download(tag) { const ev = page.waitForEvent("download"); await page.getByTestId("btn-download").click(); const f = path.join(tmp, `${tag}-${(await ev).suggestedFilename()}`); await (await ev).saveAs(f); return f; },
    };

    // --- screenshots (content-addressed JPEG) and pixel diff
    async function saveShot(opts = {}) {
      const buf = await page.screenshot({ type: "jpeg", quality: opts.full ? 70 : 62, animations: "disabled", caret: "hide", fullPage: !!opts.full });
      const name = crypto.createHash("sha1").update(buf).digest("hex").slice(0, 16) + ".jpg";
      const f = path.join(IMG, name);
      if (!fs.existsSync(f)) { fs.writeFileSync(f + `.${shard}.tmp`, buf); fs.renameSync(f + `.${shard}.tmp`, f); }
      return { file: `img/${name}`, buf };
    }
    async function pixelDiff(a, b, box) {
      if (a.equals(b)) return { frac: 0, outside: 0 };
      return diffPage.evaluate(async ([sa, sb, bx]) => {
        const load = async (s) => createImageBitmap(await (await fetch("data:image/jpeg;base64," + s)).blob());
        const [ia, ib] = await Promise.all([load(sa), load(sb)]);
        if (ia.width !== ib.width || ia.height !== ib.height) return { frac: 1, outside: 1 };
        const c = new OffscreenCanvas(ia.width, ia.height); const g = c.getContext("2d");
        g.drawImage(ia, 0, 0); const A = g.getImageData(0, 0, ia.width, ia.height).data;
        g.drawImage(ib, 0, 0); const B = g.getImageData(0, 0, ia.width, ia.height).data;
        let n = 0, out = 0;
        for (let i = 0; i < A.length; i += 4) {
          if (Math.max(Math.abs(A[i] - B[i]), Math.abs(A[i + 1] - B[i + 1]), Math.abs(A[i + 2] - B[i + 2])) <= 40) continue;
          n++;
          const px = (i / 4) % ia.width, py = Math.floor(i / 4 / ia.width);
          if (!bx || px < bx.x - 8 || px > bx.x + bx.width + 8 || py < bx.y - 8 || py > bx.y + bx.height + 8) out++;
        }
        const tot = ia.width * ia.height;
        return { frac: n / tot, outside: out / tot };
      }, [a.toString("base64"), b.toString("base64"), box]);
    }
    const audit = (scrollSteps) => page.evaluate(auditInPage, { scrollSteps }).catch((e) => [{ type: "crawler", sev: 0, el: "-", msg: "audit failed: " + e.message }]);

    // --- snapshots and restore
    let snap = null, stepLS = {}, stepWho = "alice";
    async function revert() { const ok = await rpc("evm_revert", [snap]); if (!ok) throw new Error("evm_revert failed"); snap = await rpc("evm_snapshot"); }
    async function restore(st) {
      rec = null;
      await revert();
      mm.state.current = st.who || "alice"; mm.state.chainId = 31337; mm.reject(false);
      await page.goto(`${inst.base}/crawl-blank`).catch(() => {});
      await page.evaluate((ls) => { localStorage.clear(); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); }, stepLS);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${inst.base}/${st.url(x.v)}`);
      await page.waitForFunction(() => window.paprikaState?.ctx && document.querySelector('[data-testid="page"]')?.dataset.page && !/connecting/.test(document.querySelector('[data-testid="network-pill"]')?.textContent || ""), null, { timeout: 30000 });
      await settle(500);
      await page.mouse.move(2, 450);
      if (st.prep) await st.prep(x);
      await page.evaluate(() => scrollTo(0, 0));
      await page.mouse.move(2, 450);
      await settle(200);
    }

    async function crawlState(st, gi) {
      const S = { id: gi, name: st.name, title: st.title, who: st.who || "alice", url: st.url(x.v), viewports: [], focus: [], elements: [], findings: [], notes: [] };
      data.states.push(S);
      log(`state ${st.name}`);
      try { await restore(st); } catch (e) { S.findings.push({ type: "state bug", sev: 4, el: "-", msg: `could not seed the state: ${e.message.split("\n")[0]}` }); await page.screenshot({ path: path.join(OUT, `seed-fail-${st.name}.png`) }).catch(() => {}); return; }
      if (st.expect) { const bad = await st.expect(x).catch((e) => e.message); if (bad) S.findings.push({ type: "state bug", sev: 4, el: "-", msg: `state not as expected: ${bad}` }); }
      // viewports
      for (const vp of VIEWPORTS) {
        await page.setViewportSize({ width: vp.width, height: vp.height }); await page.waitForTimeout(350);
        const f = await audit(true);
        await page.evaluate(() => scrollTo(0, 0)); await page.waitForTimeout(100);
        const shot = await saveShot({ full: true });
        S.viewports.push({ vp: vp.name, file: shot.file, findings: f });
      }
      await page.setViewportSize({ width: 1440, height: 900 }); await page.waitForTimeout(300);
      // keyboard focus pass: Tab through the page; every focused element must show a focus indicator
      try {
        await page.evaluate(() => { document.activeElement?.blur?.(); scrollTo(0, 0); });
        const seenF = new Set();
        for (let i = 0; i < 45; i++) {
          await page.keyboard.press("Tab"); await page.waitForTimeout(40);
          const info = await page.evaluate(() => {
            const el = document.activeElement; if (!el || el === document.body) return null;
            const cs = getComputedStyle(el);
            const tid = el.getAttribute("data-testid") || el.closest("[data-testid]")?.getAttribute("data-testid") || el.tagName.toLowerCase();
            const outline = cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0;
            const shadow = cs.boxShadow && cs.boxShadow !== "none";
            return { key: tid + "|" + (el.innerText || el.value || "").slice(0, 30), el: `[${tid}] ${el.tagName.toLowerCase()} "${(el.innerText || el.value || el.placeholder || "").replace(/\s+/g, " ").trim().slice(0, 30)}"`, ok: outline || shadow, outline: `${cs.outlineStyle} ${cs.outlineWidth}`, inPage: document.contains(el) };
          });
          if (!info) continue;
          if (seenF.has(info.key)) break;
          seenF.add(info.key);
          S.focus.push(info);
          if (!info.ok) S.findings.push({ type: "focus", sev: 2, el: info.el, msg: `no visible focus indicator when reached with Tab (outline ${info.outline}, no box-shadow)`, vp: "1440x900" });
        }
      } catch (e) { S.notes.push("focus pass failed: " + e.message); }
      // elements
      let els = await page.evaluate(enumerateInPage);
      const perKey = new Map(); const skipped = [];
      els = els.filter((e) => {
        const key = e.testid || `${e.tag}|${e.role}|${e.near}|${e.text.replace(/0x[0-9a-f…\.]+/gi, "H").replace(/\d+/g, "N")}`;
        const n = (perKey.get(key) || 0) + 1; perKey.set(key, n);
        if (n > 2) { skipped.push(e); return false; }
        return true;
      }).slice(0, 70);
      if (skipped.length) S.notes.push(`${skipped.length} repeated elements (3rd+ row of the same kind) not clicked: ${[...new Set(skipped.map((e) => e.testid || e.text.slice(0, 20)))].slice(0, 8).join(", ")}`);
      const baseKeys = new Set(S.viewports[0].findings.map((f) => f.type + "|" + f.el + "|" + f.msg.replace(/\d+/g, "N")));
      for (const [ei, el] of els.entries()) {
        const E = { ...el, n: ei };
        S.elements.push(E);
        try {
          if (ei > 0) await restore(st);
          const loc = el.testid ? page.locator(`[data-testid="${el.testid}"]`).nth(el.index) : page.locator(el.css);
          if (!(await loc.count())) { E.missing = true; E.findings = [{ type: "state bug", sev: 2, el: el.testid || el.text, msg: "element present at enumeration is missing after the same state is restored (unstable rendering)" }]; continue; }
          await loc.scrollIntoViewIfNeeded({ timeout: 2000 }).catch(() => {});
          if (!el.disabled) await loc.hover({ timeout: 1500 }).catch(() => {});
          await page.waitForTimeout(120);
          const box = await loc.boundingBox();
          const vs = page.viewportSize();
          E.box = box ? { x: box.x, y: box.y, width: box.width, height: box.height } : null; E.vw = vs.width; E.vh = vs.height;
          const before = await saveShot();
          E.before = before.file; E.urlBefore = page.url().replace(inst.base, "");
          const toastsBefore = await page.getByTestId("toast").count();
          const menuBefore = await page.getByTestId("account-menu").isVisible().catch(() => false);
          rec = { console: [], warnings: [], pageErrors: [], failed: [], dialogs: [], downloads: [], popups: [], chooser: [] };
          chooserFile = /import-device/.test(el.testid) ? files.json : /evidence/.test(el.testid) ? files.txt : /verify/.test(el.testid) ? (x.v.file1 || files.img) : files.img;
          const t0 = Date.now();
          if (el.disabled) { E.action = "disabled (not clicked)"; }
          else if (el.kind === "type") { E.action = "type"; await loc.fill(/search/.test(el.testid) ? (x.v.p1 || "1") : "Sample text typed by the crawler 0123456789", { timeout: 3000 }); if (/search/.test(el.testid)) await loc.press("Enter"); }
          else if (el.kind === "select") { E.action = "select"; const opts = await loc.locator("option").allInnerTexts(); await loc.selectOption({ index: Math.min(1, opts.length - 1) }); }
          else {
            E.action = "click";
            try { await loc.click({ timeout: 3000 }); }
            catch (e) {
              const m = e.message.match(/<[^>]+> (?:from <[^>]+> subtree )?intercepts pointer events/);
              E.blocked = m ? m[0].slice(0, 200) : e.message.split("\n")[0].slice(0, 200);
              await loc.click({ force: true, timeout: 3000 }).catch((e2) => { E.clickError = e2.message.split("\n")[0].slice(0, 200); });
            }
          }
          await settle(300);
          E.ms = Date.now() - t0;
          E.urlAfter = page.url().replace(inst.base, "");
          const after = await saveShot();
          E.after = after.file;
          E.events = rec; rec = null;
          E.diff = await pixelDiff(before.buf, after.buf, E.box);
          E.toastsAdded = (await page.getByTestId("toast").count()) - toastsBefore;
          const lastToast = E.toastsAdded > 0 ? await d.lastToast() : null;
          if (lastToast) E.toast = lastToast;
          const fa = await audit(false);
          E.findings = fa.filter((f) => !baseKeys.has(f.type + "|" + f.el + "|" + f.msg.replace(/\d+/g, "N")));
          if (E.blocked) E.findings.push({ type: "overlap", sev: 4, el: el.testid || el.text, msg: `click blocked: ${E.blocked}` });
          if (E.clickError) E.findings.push({ type: "dead click", sev: 3, el: el.testid || el.text, msg: `could not click: ${E.clickError}` });
          const changed = E.diff.outside > 0.0004 || E.urlAfter !== E.urlBefore || E.events.downloads.length || E.events.popups.length || E.events.dialogs.length || E.events.chooser.length || E.toastsAdded > 0;
          E.changed = !!changed;
          const selfLink = el.href && el.href.startsWith("#") && E.urlBefore.endsWith(el.href);
          if (menuBefore && E.urlAfter !== E.urlBefore && (await page.getByTestId("account-menu").isVisible().catch(() => false))) E.findings.push({ type: "state bug", sev: 2, el: el.testid || el.text, msg: "the account menu stays open over the new page after navigating" });
          if (!changed && !el.disabled && E.action === "click" && selfLink) E.findings.push({ type: "dead click", sev: 1, el: el.testid || `${el.tag} "${el.text}"`, msg: "link to the page already shown: nothing happens (expected)" });
          else if (!changed && !el.disabled && E.action === "click") E.findings.push({ type: "dead click", sev: 3, el: el.testid || `${el.tag} "${el.text}"`, msg: `click produced no visible change (pixels outside the element changed: ${(E.diff.outside * 100).toFixed(3)}%, no navigation, download, popup or toast)` });
          for (const pe of E.events.pageErrors) E.findings.push({ type: "error", sev: 5, el: el.testid || el.text, msg: `page error: ${pe}` });
          for (const ce of E.events.console) E.findings.push({ type: "error", sev: 4, el: el.testid || el.text, msg: `console error: ${ce}` });
          for (const fr of E.events.failed) E.findings.push({ type: "error", sev: 3, el: el.testid || el.text, msg: `failed request: ${fr}` });
          if (lastToast && /failed/.test(lastToast.status)) E.findings.push({ type: "error", sev: 3, el: el.testid || el.text, msg: `toast "${lastToast.status}": ${lastToast.text.slice(0, 160)}` });
        } catch (e) {
          E.crawlError = e.message.split("\n")[0].slice(0, 300);
          E.findings = [...(E.findings || []), { type: "crawler", sev: 0, el: el.testid || el.text, msg: `crawler step failed: ${E.crawlError}` }];
          rec = null;
          log(`  element ${el.testid || el.text}: ${E.crawlError}`);
        }
      }
      if (seedErrors.pageErrors.length) { S.findings.push(...seedErrors.pageErrors.map((m) => ({ type: "error", sev: 5, el: "-", msg: `page error while seeding/restoring: ${m}` }))); seedErrors.pageErrors = []; }
      log(`  ${S.elements.length} elements`);
    }

    // --- the timeline
    await page.goto(`${inst.base}/#/verify`);
    await page.waitForFunction(() => window.paprikaState?.ctx, null, { timeout: 30000 }); await settle(800);
    let gi = 0;
    for (const [si, step] of STEPS.entries()) {
      if (si > lastStep) break;
      log(`seed ${step.name}`);
      try { await step.seed(x); } catch (e) { log(`SEED FAILED ${step.name}: ${e.message.split("\n")[0]}`); data.seedFailure = `${step.name}: ${e.message.split("\n")[0]}`; await page.screenshot({ path: path.join(OUT, `seed-fail-${shard}-${step.name}.png`) }).catch(() => {}); break; }
      await settle(400);
      stepWho = mm.state.current;
      stepLS = await page.evaluate(() => ({ ...localStorage }));
      snap = await rpc("evm_snapshot");
      for (const st of step.states) { if (mine(gi)) await crawlState(st, gi); gi++; }
      // back to the end of the seed, to continue the story
      await revert();
      mm.state.current = stepWho; mm.state.chainId = 31337; mm.reject(false);
      await page.goto(`${inst.base}/crawl-blank`).catch(() => {});
      await page.evaluate((ls) => { localStorage.clear(); for (const [k, v] of Object.entries(ls)) localStorage.setItem(k, v); }, stepLS);
      await page.setViewportSize({ width: 1440, height: 900 });
      await page.goto(`${inst.base}/#/verify`);
      await page.waitForFunction(() => window.paprikaState?.ctx, null, { timeout: 30000 }); await settle(500);
    }
  } catch (e) {
    log("ABORTED: " + (e.stack || e.message));
    data.aborted = e.message;
  } finally {
    await browser?.close().catch(() => {});
    inst?.stop();
    fs.writeFileSync(path.join(OUT, `shard-${shard}.json`), JSON.stringify(data));
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// ==================================================================================================== merge + outputs
const SEV = { 5: "critical", 4: "high", 3: "medium", 2: "low", 1: "info", 0: "crawler" };
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]);
const md = (s) => String(s ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");

function fixFor(type, msg) {
  if (type === "overlap") return /toast/.test(msg) ? "Keep toasts out of the content column (reserve space or stack them above the local-tools pill)" : /local/.test(msg) ? "Give the floating pill/bar a reserved gutter or bottom padding on the page so it never sits on content" : "Give the covering element a reserved area (padding/margin) or a lower z-index";
  if (type === "clipping") return /ellipsis/.test(msg) ? "Add a title attribute (full value) or a copy button to truncated text" : "Let the text wrap (overflow-wrap:anywhere) or widen the box";
  if (type === "overflow") return /page scrolls/.test(msg) ? "Constrain the widest element (max-width:100%, overflow-wrap:anywhere, wrap the flex row)" : "Wrap long values (overflow-wrap:anywhere) or let the box grow";
  if (type === "contrast") return "Darken the text colour (or lighten the background) to reach 4.5:1";
  if (type === "small text") return "Use at least 12px for text";
  if (type === "tiny target") return "Pad the control to at least 32x32 px (min-height/min-width or padding)";
  if (type === "focus") return "Add a :focus-visible outline for this control";
  if (type === "dead click") return "Make it do something visible (or don't style it as clickable)";
  if (type === "error") return "Handle the failure and show a plain message instead of a raw error";
  if (type === "state bug") return "Fix the state shown or the action that leads to it";
  if (type === "spacing") return "Use the same gap between all siblings (one margin/gap rule)";
  if (type === "misaligned") return "Align the left edges (same margin/padding)";
  if (type === "proportion") return "Give side-by-side controls the same height";
  if (type === "duplicate text") return "Show the sentence once";
  if (type === "empty box") return "Hide the container when it has no content";
  if (type === "image size") return "Set width/height (or aspect-ratio) on the image";
  if (type === "inconsistency") return "Use one label per action (rename one of them)";
  return "-";
}

function build() {
  const shards = fs.readdirSync(OUT).filter((f) => /^shard-\d+\.json$/.test(f)).map((f) => JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8")));
  const states = shards.flatMap((s) => s.states).sort((a, b) => a.id - b.id);
  const all = [];   // { ...finding, state, vp, shot }
  for (const S of states) {
    for (const f of S.findings) all.push({ ...f, state: S.name, vp: f.vp || "1440x900", shot: S.viewports[0]?.file });
    for (const v of S.viewports) for (const f of v.findings) all.push({ ...f, state: S.name, vp: v.vp, shot: v.file });
    for (const E of S.elements) for (const f of E.findings || []) {
      // reclassify expected outcomes: clicks behind an open modal / dropdown, feedback only on the control itself
      const inDialog = /-dialog$/.test(E.near) || /-(ok|cancel)$/.test(E.testid);
      const inMenu = /account-menu/.test(E.near) || E.testid === "account-button";
      if (/^dialog-/.test(S.name) && !inDialog && /dead click|overlap/.test(f.type)) { f.sev = 1; f.msg = "behind the open confirmation dialog: the click is blocked (expected; clicking the backdrop does not close the dialog)"; f.el = "(controls behind the dialog)"; }
      else if (/^menu-/.test(S.name) && !inMenu && /click blocked|could not click|no visible change/.test(f.msg) && f.sev >= 3) { f.sev = 1; f.msg = "under the open account menu: the click lands on the menu (expected for a dropdown)"; }
      else if (f.type === "dead click" && f.sev >= 3 && E.text === "⧉") { f.sev = 1; f.msg = "copy button: the ✓ mark lasts only 0.9 s (gone before the page settled); no other feedback"; }
      else if (f.type === "dead click" && f.sev >= 3 && E.diff && E.diff.frac > 0.00002) { f.sev = 1; f.msg = `only the control itself changed (${(E.diff.frac * 100).toFixed(3)}% of pixels), nothing else on the page`; }
      all.push({ ...f, state: S.name, vp: "1440x900", shot: E.after || E.before, before: E.before, click: E.testid || E.text });
    }
  }
  // same label, different actions
  const byLabel = new Map();
  for (const S of states) for (const E of S.elements) {
    if (E.tag !== "button" || !E.text) continue;
    const label = E.text.replace(/\s+/g, " ").trim();
    if (!byLabel.has(label)) byLabel.set(label, new Map());
    const id = E.testid || "(no test id)";
    if (!byLabel.get(label).has(id)) byLabel.get(label).set(id, `${S.name}`);
  }
  for (const [label, ids] of byLabel) if (ids.size > 1) all.push({ type: "inconsistency", sev: 2, el: [...ids.keys()].join(" / "), msg: `the button label "${label}" is used by ${ids.size} different controls: ${[...ids].map(([k, v]) => `${k} (${v})`).join(", ")}`, state: [...ids.values()][0], vp: "1440x900" });
  // group
  const groups = new Map();
  for (const f of all) {
    const cover = f.type === "overlap" ? (f.msg.match(/covered by (.*?) \(/)?.[1] || "").replace(/"[^"]*"/g, "") : "";
    const k = cover ? `overlap|${cover}|${f.click ? "after-click" : "state"}|${f.sev}` : `${f.type}|${f.el.replace(/"[^"]*"/g, "").replace(/0x[0-9a-f…]+/gi, "H").trim()}|${f.msg.replace(/\d+(\.\d+)?/g, "N").replace(/"[^"]*"/g, "\"…\"").slice(0, 140)}`;
    if (!groups.has(k)) groups.set(k, { ...f, states: new Set(), vps: new Set(), shots: [], n: 0, els: new Set() });
    const g = groups.get(k); g.n++; g.els.add(f.el.slice(0, 45));
    if (cover) { g.el = [...g.els].slice(0, 4).join("; ") + (g.els.size > 4 ? ` +${g.els.size - 4} more` : ""); g.msg = `${g.els.size} element(s) covered by ${cover.trim()}${f.click ? " (seen after clicks such as " + f.click + ")" : ""}; e.g. ${f.msg.slice(0, 120)}`; } g.states.add(f.state); g.vps.add(f.vp); g.sev = Math.max(g.sev, f.sev);
    if (f.shot && g.shots.length < 3 && !g.shots.includes(f.shot)) g.shots.push(f.shot);
  }
  const list = [...groups.values()].filter((g) => g.sev > 0).sort((a, b) => b.sev - a.sev || b.states.size - a.states.size || b.n - a.n);
  list.forEach((g, i) => { g.id = `F${String(i + 1).padStart(3, "0")}`; });
  const elements = states.flatMap((s) => s.elements);
  const clicks = elements.filter((e) => e.action && e.action !== "disabled (not clicked)");
  const shots = new Set(); for (const S of states) { for (const v of S.viewports) shots.add(v.file); for (const e of S.elements) { if (e.before) shots.add(e.before); if (e.after) shots.add(e.after); } }
  const shotCount = states.reduce((n, S) => n + S.viewports.length + S.elements.reduce((m, e) => m + (e.before ? 1 : 0) + (e.after ? 1 : 0), 0), 0);
  let bytes = 0; for (const f of fs.readdirSync(IMG)) bytes += fs.statSync(path.join(IMG, f)).size;
  const counts = { states: states.length, elements: elements.length, clicks: clicks.length, disabled: elements.filter((e) => e.action === "disabled (not clicked)").length, screenshots: shotCount, files: shots.size, mb: (bytes / 1e6).toFixed(0),
    dead: clicks.filter((e) => e.findings?.some((f) => f.type === "dead click" && f.sev >= 3)).length, errors: clicks.filter((e) => e.findings?.some((f) => f.type === "error")).length, findings: list.length, raw: all.length };
  fs.writeFileSync(path.join(OUT, "findings.json"), JSON.stringify(list.map((g) => ({ ...g, states: [...g.states], vps: [...g.vps] })), null, 1));

  // ---- report
  const L = [];
  L.push("# Paprika web app: systematic visual crawl", "");
  L.push(`Generated ${new Date().toISOString()} by \`app/e2e/crawl.mjs\` (\`cd app && npm run crawl\`). Gallery: \`app/output/crawl/index.html\`.`, "");
  L.push("## Counts", "");
  L.push(`| States | Elements | Clicks/typing | Disabled (shot, not clicked) | Screenshots (files) | Image size | Dead clicks | Clicks with errors | Findings (grouped / raw) |`, "|---|---|---|---|---|---|---|---|---|");
  L.push(`| ${counts.states} | ${counts.elements} | ${counts.clicks} | ${counts.disabled} | ${counts.screenshots} (${counts.files}) | ${counts.mb} MB | ${counts.dead} | ${counts.errors} | ${counts.findings} / ${counts.raw} |`, "");
  L.push("Viewports per state: " + VIEWPORTS.map((v) => v.name).join(", ") + ". 125% zoom on 1440x900 is emulated as a 1152x720 CSS viewport (identical layout).", "");
  const notes = states.flatMap((s) => s.notes.map((n) => `${s.name}: ${n}`));
  const failures = shards.filter((s) => s.aborted || s.seedFailure).map((s) => `shard ${s.shard}: ${s.aborted || s.seedFailure}`);
  if (failures.length) L.push("**Crawler problems:** " + failures.join("; "), "");
  L.push("## Method", "",
    "Each state is seeded through the UI (MetaMask stand-in, Chromium fake camera), then an `evm_snapshot` is taken. Before every click the chain is reverted to that snapshot, localStorage and the wallet account/chain are restored, the page is reloaded and the UI part of the state (menu, dialog, camera, chosen file) is redone, so every element is exercised from the same starting point. No click was skipped as destructive (the snapshot makes every one reversible); disabled controls are screenshotted but not clicked; the 3rd+ repeated row of the same kind (table rows) is not clicked. File pickers get a sample image / text / garbage JSON. A click is \"dead\" when no pixel outside the element (±8 px) changed and there was no navigation, download, popup, dialog, file picker or toast. Findings of the visual checks after a click are listed only if the state itself did not already have them.", "");
  L.push("Severity: critical (page error) > high (covered controls, raw values/errors on screen, state mismatch, console errors) > medium (dead click, cut/overflowing content, failed request) > low > info.", "");
  L.push("## Findings (most severe first, duplicates grouped)", "");
  L.push("| id | sev | type | state(s) | viewport(s) | element | what is wrong | screenshot(s) | suggested fix |", "|---|---|---|---|---|---|---|---|---|");
  for (const g of list) {
    const st = [...g.states]; const vps = [...g.vps];
    L.push(`| ${g.id} | ${SEV[g.sev]} | ${g.type} | ${md(st.slice(0, 4).join(", "))}${st.length > 4 ? ` +${st.length - 4}` : ""} | ${md(vps.length === VIEWPORTS.length ? "all" : vps.join(", "))} | ${md(g.el.slice(0, 70))}${g.click && g.click !== g.el ? ` (after clicking ${md(String(g.click).slice(0, 30))})` : ""} | ${md(g.msg.slice(0, 260))}${g.n > 1 ? ` (${g.n}x)` : ""} | ${g.shots.map((s) => `output/crawl/${s}`).join(" ")} | ${md(fixFor(g.type, g.msg))} |`);
  }
  if (notes.length) { L.push("", "## Crawler notes", ""); for (const n of notes) L.push(`- ${n}`); }
  L.push("", "## States", "", "| # | state | elements | dead | errors | url |", "|---|---|---|---|---|---|");
  for (const S of states) L.push(`| ${S.id} | ${S.name}: ${md(S.title)} | ${S.elements.length} | ${S.elements.filter((e) => e.findings?.some((f) => f.type === "dead click")).length} | ${S.elements.filter((e) => e.findings?.some((f) => f.type === "error")).length} | \`${md(S.url.slice(0, 60))}\` |`);
  fs.writeFileSync(path.join(APP, "output", "crawl-report.md"), L.join("\n") + "\n");

  // ---- gallery
  const idOf = new Map(); for (const g of list) idOf.set(g, g.id);
  const fl = (fs_) => fs_ && fs_.length ? `<ul class="f">${fs_.map((f) => `<li class="s${f.sev}"><b>${esc(SEV[f.sev])} · ${esc(f.type)}</b> ${esc(f.el)}: ${esc(f.msg)}</li>`).join("")}</ul>` : `<p class="ok">no defect detected</p>`;
  const H = [];
  H.push(`<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Paprika crawl gallery</title><style>
body{font:14px/1.45 system-ui,sans-serif;margin:0;background:#f4f4f6;color:#1d1d24}
header{position:sticky;top:0;background:#1d1d24;color:#fff;padding:10px 18px;z-index:5;display:flex;gap:18px;align-items:center;flex-wrap:wrap}
header a{color:#ffd28a} main{padding:18px;max-width:1700px} h2{margin:34px 0 6px;border-top:3px solid #c33;padding-top:10px}
.vps{display:flex;gap:12px;overflow-x:auto;padding-bottom:6px}.vp{flex:0 0 280px;background:#fff;border:1px solid #ddd;padding:6px}
.vp img{width:100%;max-height:420px;object-fit:cover;object-position:top;border:1px solid #ccc}
.f{margin:4px 0;padding-left:18px;font-size:12px;max-height:180px;overflow:auto}.f li.s5,.f li.s4{color:#a00}.f li.s3{color:#a45a00}.f li.s1,.f li.s0{color:#666}
.ok{color:#287a2e;font-size:12px;margin:4px 0} .el{background:#fff;border:1px solid #ddd;margin:10px 0;padding:8px}
.pair{display:flex;gap:10px}.shot{position:relative;flex:1}.shot img{width:100%;display:block;border:1px solid #bbb}
.hl{position:absolute;border:3px solid #ff2d2d;box-shadow:0 0 0 2000px rgba(0,0,0,.08);pointer-events:none}
.meta{font-size:12px;color:#444}.dead{background:#fff2f2}.tag{display:inline-block;padding:0 6px;border-radius:8px;background:#eee;font-size:11px;margin-left:4px}
details>summary{cursor:pointer;font-weight:600} table{border-collapse:collapse;font-size:12px}td,th{border:1px solid #ddd;padding:3px 6px;vertical-align:top}
</style></head><body><header><b>Paprika crawl</b><span>${counts.states} states · ${counts.elements} elements · ${counts.clicks} clicks · ${counts.screenshots} screenshots · ${counts.findings} grouped findings</span><a href="#findings">findings</a>
<select onchange="location.hash=this.value"><option value="">jump to state…</option>${states.map((s) => `<option value="#s-${esc(s.name)}">${esc(s.name)}</option>`).join("")}</select>
<label><input type="checkbox" onchange="document.body.classList.toggle('onlybad',this.checked)"> only elements with findings</label></header><main>
<style>.onlybad .el.clean{display:none}</style>`);
  H.push(`<h2 id="findings">Findings (grouped, most severe first)</h2><details open><summary>${list.length} findings</summary><table><tr><th>id</th><th>sev</th><th>type</th><th>states</th><th>viewports</th><th>element</th><th>what</th><th>shots</th></tr>${list.map((g) => `<tr><td>${g.id}</td><td>${SEV[g.sev]}</td><td>${esc(g.type)}</td><td>${[...g.states].map((s) => `<a href="#s-${esc(s)}">${esc(s)}</a>`).join(" ")}</td><td>${esc([...g.vps].join(", "))}</td><td>${esc(g.el)}</td><td>${esc(g.msg)}${g.n > 1 ? ` (${g.n}x)` : ""}</td><td>${g.shots.map((s, i) => `<a href="${s}" target="_blank">${i + 1}</a>`).join(" ")}</td></tr>`).join("")}</table></details>`);
  for (const S of states) {
    H.push(`<h2 id="s-${esc(S.name)}">${S.id}. ${esc(S.name)} <small>${esc(S.title)} · as ${esc(S.who)} · <code>${esc(S.url)}</code></small></h2>`);
    if (S.findings.length) H.push(fl(S.findings));
    if (S.notes.length) H.push(`<p class="meta">${S.notes.map(esc).join("<br>")}</p>`);
    H.push(`<div class="vps">${S.viewports.map((v) => `<div class="vp"><b>${esc(v.vp)}</b> <a href="${v.file}" target="_blank">full size</a><a href="${v.file}" target="_blank"><img loading="lazy" src="${v.file}"></a><details><summary>${v.findings.length} checks flagged</summary>${fl(v.findings)}</details></div>`).join("")}</div>`);
    for (const E of S.elements) {
      const bad = (E.findings || []).length > 0;
      const box = E.box && E.vw ? `left:${(E.box.x / E.vw) * 100}%;top:${(E.box.y / E.vh) * 100}%;width:${(E.box.width / E.vw) * 100}%;height:${(E.box.height / E.vh) * 100}%` : "display:none";
      const ev = E.events || {};
      H.push(`<div class="el ${bad ? "" : "clean"} ${E.findings?.some((f) => f.type === "dead click") ? "dead" : ""}"><div class="meta"><b>#${E.n} ${esc(E.testid || "(no test id)")}</b> <span class="tag">${esc(E.tag)}${E.type ? ":" + esc(E.type) : ""}</span> "${esc(E.text)}" · ${esc(E.action || "-")}${E.changed === false ? ' <span class="tag">no change</span>' : ""}${E.diff ? ` · Δ ${(E.diff.frac * 100).toFixed(2)}% (outside element ${(E.diff.outside * 100).toFixed(2)}%)` : ""}${E.urlAfter && E.urlAfter !== E.urlBefore ? ` · → <code>${esc(E.urlAfter)}</code>` : ""}${E.toast ? ` · toast ${esc(E.toast.status)}: ${esc(E.toast.text.slice(0, 100))}` : ""}${ev.downloads?.length ? ` · download ${esc(ev.downloads.join(", "))}` : ""}${ev.popups?.length ? ` · popup ${esc(ev.popups.join(", "))}` : ""}${ev.chooser?.length ? ` · file chooser (${esc(ev.chooser.join(","))})` : ""}${E.ms ? ` · ${E.ms} ms` : ""}</div>
<div class="pair">${E.before ? `<div class="shot"><a href="${E.before}" target="_blank"><img loading="lazy" src="${E.before}"></a><div class="hl" style="${box}"></div><div class="meta">before</div></div>` : ""}${E.after ? `<div class="shot"><a href="${E.after}" target="_blank"><img loading="lazy" src="${E.after}"></a><div class="meta">after</div></div>` : ""}</div>${bad ? fl(E.findings) : ""}${ev.warnings?.length ? `<p class="meta">console warnings: ${esc(ev.warnings.join(" | ").slice(0, 400))}</p>` : ""}</div>`);
    }
  }
  H.push("</main></body></html>");
  fs.writeFileSync(path.join(OUT, "index.html"), H.join("\n"));
  console.log(`\nGallery: ${path.join(OUT, "index.html")}\nReport:  ${path.join(APP, "output", "crawl-report.md")}`);
  console.log(JSON.stringify(counts));
  return counts;
}

// ==================================================================================================== main
if (process.env.CRAWL_SHARD !== undefined) {
  await runShard(Number(process.env.CRAWL_SHARD), Number(process.env.CRAWL_SHARDS || 1));
  process.exit(0);
} else if (process.env.CRAWL_REPORT_ONLY) {
  build();
} else {
  fs.rmSync(OUT, { recursive: true, force: true });
  fs.mkdirSync(IMG, { recursive: true });
  const t0 = Date.now();
  const kids = [];
  for (let i = 0; i < SHARDS; i++) {
    const logf = fs.createWriteStream(path.join(OUT, `shard-${i}.log`));
    const child = spawn(process.execPath, [SELF], { cwd: APP, env: { ...process.env, CRAWL_SHARD: String(i), CRAWL_SHARDS: String(SHARDS) }, stdio: ["ignore", "pipe", "pipe"] });
    child.stdout.on("data", (b) => { logf.write(b); process.stdout.write(String(b).split("\n").filter((l) => /^\[shard \d+\] (state|seed|SEED|ABORT|starting)/.test(l)).map((l) => l + "\n").join("")); });
    child.stderr.on("data", (b) => logf.write(b));
    kids.push(new Promise((r) => child.on("exit", r)));
    const stopAll = () => { try { child.kill("SIGINT"); } catch {} };
    process.on("SIGINT", stopAll);
    await sleep(5000);   // stagger the instance starts
  }
  await Promise.all(kids);
  console.log(`crawl finished in ${Math.round((Date.now() - t0) / 1000)} s`);
  build();
}
