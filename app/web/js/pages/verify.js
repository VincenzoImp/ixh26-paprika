// Paprika web app: Verify (home). Drop or choose a file; the page hashes it in the browser and reads the contract.
// No wallet, no transaction. Shows the verdict, what the record shows and does not, a link to the record page,
// a tamper test (change one pixel), and the most recent records.

import { h, mount } from "../dom.js";
import { S, emit } from "../state.js";
import { blobBytes, changeOnePixel, showImage, toHex } from "../../util.js";
import { verdictCard, scopeLines, stateChip } from "../verdict.js";
import { hashLink, addrLink, rel, size } from "../format.js";
import { getRecords } from "../api.js";
import { record as recordStep } from "../drawer.js";

// What the page holds between renders: the file being verified and its result.
const V = { bytes: null, type: "", name: "", hash: "", prevHash: "", records: null, warning: "", error: "" };

// Loads a file (bytes) and verifies it. prevHash: the hash before a tamper test.
export async function verifyBytes(bytes, type, name, prevHash = "") {
  if (!bytes?.length) {   // refused: clear the previous file too
    Object.assign(V, { bytes: null, type: "", name: "", hash: "", prevHash: "", records: null, warning: "", error: "This file is empty (0 bytes): there is nothing to verify." });
    emit("change");
    return;
  }
  Object.assign(V, { bytes, type, name, prevHash, error: "", warning: /^image\//.test(type || "") ? "" : `This file does not look like an image (${type || "unknown type"}); it is checked anyway.` });
  V.hash = toHex(await S.dev.sha256(bytes));
  V.records = await getRecords(V.hash);
  S.files[V.hash] = S.files[V.hash] || { bytes, type, name };
  recordStep({ key: prevHash ? "pixel" : "verify" });
  emit("change");
}

// Verifies the first dropped/chosen file; says so when several were given.
async function verifyFiles(files) {
  if (!files.length) return;
  const f = files[0];
  await verifyBytes(await blobBytes(f), f.type, f.name);
  if (files.length > 1) { V.warning = `${files.length} files given: only the first (${f.name}) was verified. Verify one file at a time.`; emit("change"); }
}

// The record to headline when several keys attested the file: the worst state first, else the newest.
function mainRecord(records) {
  return records.find((r) => String(r.state) === "fake") || records.find((r) => String(r.state) === "accused") || records[records.length - 1];
}

// Draws the page.
export function render(root) {
  const input = h("input", { type: "file", class: "hidden", testid: "input-verify-file",
    onchange: (e) => { verifyFiles([...e.target.files]); e.target.value = ""; } });
  const drop = h("div", { class: "dropzone", testid: "verify-dropzone",
    ondragover: (e) => { e.preventDefault(); drop.classList.add("drag"); },
    ondragleave: () => drop.classList.remove("drag"),
    ondrop: (e) => { e.preventDefault(); drop.classList.remove("drag"); verifyFiles([...e.dataTransfer.files]); } },
    V.bytes ? null : h("div", { class: "dz-text" }, "⬇ Drop a photo here, or ", h("button", { class: "link", testid: "btn-verify-choose-file", onclick: () => input.click() }, "choose a file")),
    input);
  if (V.bytes) showImage(drop, V.bytes, V.type);
  const last = S.lastAttested && S.files[S.lastAttested];
  const main = V.records?.length ? mainRecord(V.records) : null;
  mount(root,
    h("h1", {}, "Verify a photo"),
    h("p", { class: "sub" }, "Check a file against Paprika. No wallet, no transaction."),
    h("div", { class: "verify-grid" },
      h("div", {}, drop,
        h("div", { class: "row" },
          V.bytes ? h("button", { testid: "btn-verify-choose-file", onclick: () => input.click() }, "Choose another file") : null,
          last ? h("button", { testid: "btn-verify-last", onclick: () => verifyBytes(last.bytes, last.type, last.name) }, "Verify my last photo") : null),
        V.name ? h("div", { class: "d", testid: "verify-file-name" }, `${V.name} · ${size(V.bytes.length)}`) : null,
        V.error ? h("div", { class: "err", testid: "verify-error" }, V.error) : null,
        V.warning ? h("div", { class: "hint", testid: "verify-warning" }, V.warning) : null),
      V.records ? h("div", { class: "stack" },
        verdictCard(main, { testid: "verify-status" }),
        main ? scopeLines(main) : null,
        V.records.length > 1 ? h("p", { class: "note", testid: "verify-attesters" }, `${V.records.length} keys attested this exact file. Each is a separate claim.`) : null,
        V.prevHash ? h("p", { class: "mono d", testid: "verify-hash-compare" }, `SHA-256 before ${V.prevHash.slice(0, 10)}… → after ${V.hash.slice(0, 10)}…`) : null,
        h("div", { class: "row" },
          main ? h("a", { class: "btn pri", href: `#/record/${V.hash}${V.records.length > 1 ? `?key=${main.keyId}` : ""}`, testid: "btn-open-record" }, "Open record →") : null,
          /^image\//.test(V.type) ? h("button", { class: "link", testid: "btn-change-pixel", onclick: async () => {
            const out = await changeOnePixel(V.bytes, V.type);
            await verifyBytes(out.bytes, out.type, `${V.name.replace(/ · one pixel changed.*$/, "")} · one pixel changed`, V.hash);
          } }, "Tamper test: change one pixel") : null),
        h("div", { class: "d mono", testid: "verify-hash" }, `SHA-256 ${V.hash}`)) : h("div", { class: "empty" }, "The verdict appears here.")),
    h("div", { class: "card" }, h("h2", {}, "Recent records ", h("a", { class: "link small", href: "#/explorer" }, "Explorer →")), recentTable()));
}

// The five newest records of the chain.
function recentTable() {
  const recs = [...S.records].reverse().slice(0, 5);
  if (!recs.length) return h("p", { class: "d", testid: "recent-empty" }, "No records yet on this network.");
  return h("table", { testid: "recent-records" },
    h("tr", {}, h("th", {}, "Photo"), h("th", {}, "Depositor"), h("th", {}, "State"), h("th", {}, "Recorded")),
    recs.map((r) => h("tr", { testid: "recent-row" }, h("td", {}, hashLink(r.photoHash, "record")), h("td", {}, addrLink(r.depositor, { copy: false })),
      h("td", {}, stateChip(r)), h("td", {}, rel(r.recordedAt)))));
}

export { V as verifyState };
