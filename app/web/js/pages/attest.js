// Paprika web app: Attest a photo. Camera (or a file) → summary → "Attest photo" → confirmation → one MetaMask
// signature (when the account is prepared). The device key of this browser signs the photo hash with a recent
// block hash; the connected account sends it and locks the deposit.

import { h, mount } from "../dom.js";
import { S, emit } from "../state.js";
import { blobBytes, sampleImage, videoFrame, showImage, toHex, same } from "../../util.js";
import { hashLink, tok, size, dur } from "../format.js";
import { act } from "../actions.js";
import { confirmDialog } from "../toasts.js";
import { accountBlocker, prepared, createAndRegister, prepareAccount } from "../wallet.js";
import { isLocal } from "../localtools.js";

// Page state: the loaded photo, the camera stream, the last result.
const A = { photo: null, stream: null, mirror: false, error: "", done: null };

// Stops the camera.
function stopCamera() { if (A.stream) for (const t of A.stream.getTracks()) t.stop(); A.stream = null; }

// Loads photo bytes (camera still, file, sample). An empty file is refused and clears the previous photo.
async function loadPhoto(bytes, type, name, fromCamera = false) {
  stopCamera();
  A.done = null;
  if (!bytes.length) { A.photo = null; A.error = "This file is empty (0 bytes): nothing to attest. Choose another photo."; emit("change"); return; }
  A.error = "";
  const hash = toHex(await S.dev.sha256(bytes));
  const rows = await S.lib.verifyPhoto(S.ctx, hash);
  A.photo = { bytes, type, name, hash, fromCamera, already: !!S.device && rows.some((r) => same(r.keyId, S.device.keyId)) };
  emit("change");
}

// Starts the live camera (https or localhost only).
async function startCamera() {
  if (!navigator.mediaDevices?.getUserMedia) { A.error = "The camera needs localhost or https. Choose a file instead."; emit("change"); return; }
  try {
    A.stream = await navigator.mediaDevices.getUserMedia({ video: { width: { ideal: 1280 }, height: { ideal: 960 } }, audio: false });
    A.photo = null; A.error = ""; A.done = null;
  } catch (e) { A.error = `The camera could not start: ${e.message}`; }
  emit("change");
}

// Why "Attest photo" is blocked ("" when it can run).
function blocker() {
  const b = accountBlocker(true);
  if (b) return b;
  if (!S.device || S.deviceInfo?.status === "none") return "This browser has no registered device key yet.";
  if (S.deviceInfo?.status === "flagged") return `This device key is flagged (${S.deviceInfo.reason}); it can never attest again. Register a new key.`;
  if (A.photo?.already) return "This key already attested this exact file.";
  return "";
}

// Asks for confirmation, then attests.
async function attest() {
  const B = S.ctx.params.bond;
  const p = S.ctx.params;
  const sigs = prepared() ? "1 signature in MetaMask" : "up to 3 signatures in MetaMask (wrap ETH, approve WETH, attest) · prepare the account once to need only 1";
  const fB = (B * BigInt(Math.round(Number(p.feeShare) * 1e9))) / 1000000000n;
  const ok = await confirmDialog({ title: "Attest this photo", testid: "confirm-attest", confirm: "Attest in MetaMask",
    lines: [["Photo", hashLink(A.photo.hash, "hash")], ["You lock", `${tok(B)} deposit`],
      ["You get it back", `after ${dur(Number(p.photoWindow) + Number(p.revealWindow))} (challenge + reveal period), unless UMA's voters find it fake`],
      ["If proven fake", `you lose ${tok(B)}: ${tok(B - fB)} to the accuser, ${tok(fB)} to UMA as its fee`],
      ["Device key", "this browser's device key signs the photo hash with a recent block hash"], ["Signatures", sigs]] });
  if (!ok) return;
  const { bytes, type, name, hash } = A.photo;
  const res = await act("Attest photo", async () => {
    const pre = await S.lib.verifyPhoto(S.ctx, bytes);
    if (pre.some((r) => same(r.keyId, S.device.keyId))) throw new Error("This key already attested this exact file (nothing was sent).");
    return S.lib.attestPhoto(S.ctx, "photographer", S.device, bytes);
  }, { step: { key: "attest" } });
  if (res) {
    S.files[hash] = { bytes, type, name };
    S.lastAttested = hash;
    A.photo.already = true;
    A.done = { hash };
    emit("change");
  }
}

// Draws the page.
export function render(root) {
  const fileIn = h("input", { type: "file", class: "hidden", testid: "input-capture-file",
    onchange: async (e) => { const f = e.target.files[0]; e.target.value = ""; if (f) await loadPhoto(await blobBytes(f), f.type, f.name); } });
  const preview = h("div", { class: `cambig${A.mirror ? " mirror" : ""}`, testid: "capture-preview" });
  if (A.stream) {
    const v = h("video", { testid: "camera-video", autoplay: true, playsinline: true });
    v.muted = true; v.srcObject = A.stream;
    preview.appendChild(v);
  } else if (A.photo) showImage(preview, A.photo.bytes, A.photo.type);
  else preview.appendChild(h("span", { class: "ph", testid: "capture-placeholder" }, "No photo yet"));
  if (A.stream) preview.appendChild(h("button", { class: "mirrorbtn", testid: "toggle-mirror", title: "Mirror the preview only: the attested file is always the true camera image",
    onclick: () => { A.mirror = !A.mirror; emit("change"); } }, "⇋ Mirror"));

  const p = S.ctx.params;
  const why = blocker();
  const noKey = !S.device || S.deviceInfo?.status !== "active";
  const camBtn = A.stream ? h("button", { class: "pri", testid: "btn-take-photo", onclick: async () => {
    const bytes = await videoFrame(document.querySelector('[data-testid="camera-video"]')); await loadPhoto(bytes, "image/jpeg", "selfie.jpg", true); } }, "Take photo")
    : h("button", { class: A.photo ? "" : "pri", testid: "btn-start-camera", onclick: startCamera }, A.photo?.fromCamera ? "Retake" : "Start camera");

  mount(root,
    h("h1", {}, "Attest a photo"),
    h("p", { class: "sub" }, `Locks ${tok(p.bond)}. Returned after ${dur(Number(p.photoWindow) + Number(p.revealWindow))} if nobody proves it fake.`),
    h("div", { class: "attest-grid" },
      h("div", {}, preview,
        h("div", { class: "row center" }, camBtn,
          h("span", { class: "d" }, "or ", h("button", { class: "link", testid: "btn-choose-file", onclick: () => fileIn.click() }, "use a file instead"),
            isLocal() ? [" · ", h("button", { class: "link", testid: "btn-sample-image", onclick: async () => loadPhoto(await sampleImage(), "image/jpeg", "sample.jpg") }, "use a sample image (local)")] : null),
          fileIn),
        A.error ? h("div", { class: "t-bad", testid: "capture-error" }, A.error) : null,
        A.photo && !/^image\//.test(A.photo.type || "") ? h("div", { class: "hint", testid: "capture-warning" }, `This file does not look like an image (${A.photo.type || "unknown type"}). It can still be attested.`) : null),
      h("div", { class: "card summary", testid: "attest-summary" },
        h("h2", {}, "Summary"),
        h("dl", { class: "kv" },
          h("dt", {}, "File"), h("dd", { testid: "capture-file-name" }, A.photo ? `${A.photo.name} · ${size(A.photo.bytes.length)}` : "—"),
          h("dt", {}, "Hash"), h("dd", { testid: "capture-hash" }, A.photo ? hashLink(A.photo.hash, "hash") : "—"),
          h("dt", {}, "Device key"), h("dd", { testid: "attest-device" }, S.device ? [hashLink(S.device.keyId, "device", { copy: false }), " ", S.deviceInfo?.status || ""] : "none"),
          h("dt", {}, "Deposit"), h("dd", {}, `${tok(p.bond)} (refundable)`)),
        A.done ? h("div", { class: "result", testid: "capture-result-box" },
          h("div", { class: "big", testid: "capture-result" }, `✓ Recorded on chain · ${tok(p.bond)} locked`),
          h("div", { class: "row" }, h("a", { class: "btn pri", href: `#/record/${A.done.hash}`, testid: "btn-view-record" }, "View record →"),
            h("button", { testid: "btn-new-photo", onclick: () => { A.photo = null; A.done = null; emit("change"); } }, "Take another photo")))
          : [
            noKey && S.account && !accountBlocker() ? h("div", { class: "refusal", testid: "attest-refusal" },
              h("span", { testid: "attest-why" }, S.deviceInfo?.status === "flagged" ? "This device key is flagged; it can never attest again." : "This browser has no registered device key yet."),
              h("button", { class: "pri", testid: "btn-new-key-attest", onclick: () => createAndRegister() }, S.deviceInfo?.status === "flagged" ? "Register a new device key (free)" : "Create & register a device key (free)")) : null,
            S.account && !prepared() && !accountBlocker() ? h("div", { class: "d", testid: "attest-prepare-hint" }, "Tip: ", h("button", { class: "link", testid: "btn-prepare-inline", onclick: () => prepareAccount() }, "prepare the account"), " once so that each attest needs one signature.") : null,
            h("button", { class: "pri big", testid: "btn-attest", disabled: !A.photo || !!why || S.busy, onclick: attest }, "Attest photo"),
            A.photo && why && !(noKey && S.account && !accountBlocker()) ? h("div", { class: "why", testid: "attest-blocked" }, why) : null,
            !A.photo ? h("div", { class: "d" }, "Take or choose a photo first.") : null,
          ])));
}

export { A as attestState };
