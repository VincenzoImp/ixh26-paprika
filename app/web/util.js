// Paprika demo web UI: small helpers shared by app.js.
// DOM lookup by data-testid, text formatting (hashes, times, durations, signed amounts) and image helpers
// (sample image, camera frame, one-pixel change). No chain access here.

// Returns the element with this data-testid (the page uses test ids as its only element names).
export function q(testid, root = document) {
  return root.querySelector(`[data-testid="${testid}"]`);
}

// Sets the text of the element with this test id; silently skips missing elements.
export function setText(testid, text) {
  const el = q(testid);
  if (el) el.textContent = text ?? "";
}

// Converts bytes, bigint or a hex string to a 0x-prefixed lower-case hex string.
export function toHex(v) {
  if (v == null) return "";
  if (typeof v === "string") return v.startsWith("0x") ? v.toLowerCase() : "0x" + v.toLowerCase();
  if (typeof v === "bigint") return "0x" + v.toString(16);
  if (v instanceof ArrayBuffer) v = new Uint8Array(v);
  if (ArrayBuffer.isView(v)) return "0x" + [...new Uint8Array(v.buffer, v.byteOffset, v.byteLength)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return String(v);
}

// Shortens a hash or address to 0x1234…abcd, as in the mock.
export function short(v, keep = 4) {
  const h = toHex(v);
  if (h.length <= 2 + keep * 2 + 1) return h;
  return h.slice(0, 2 + keep) + "…" + h.slice(-keep);
}

// Same as short() but without the 0x prefix (used for photo hashes, as in the mock: 9f2c…a41b).
export function shortHash(v) {
  const h = toHex(v).slice(2);
  return h.slice(0, 4) + "…" + h.slice(-4);
}

// Compares two addresses or hashes without caring about letter case.
export function same(a, b) {
  return !!a && !!b && toHex(a) === toHex(b);
}

// Formats a Unix time in seconds as local "YYYY-MM-DD HH:MM:SS".
export function fmtTime(sec) {
  if (sec == null || sec === "") return "—";
  const d = new Date(Number(sec) * 1000);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

// Formats a duration in seconds in plain words ("7 days", "1 hour", "90 seconds").
export function fmtDuration(sec) {
  const s = Number(sec);
  const units = [["day", 86400], ["hour", 3600], ["minute", 60]];
  for (const [name, size] of units) {
    if (s >= size && s % size === 0) {
      const n = s / size;
      return `${n} ${name}${n === 1 ? "" : "s"}`;
    }
  }
  if (s >= 3600) return `${(s / 3600).toFixed(1)} hours`;
  return `${s} second${s === 1 ? "" : "s"}`;
}

// Turns any thrown value into a readable message (the library throws Error(revert reason)).
export function errText(e) {
  if (!e) return "Unknown error";
  return e.shortMessage || e.reason || e.message || String(e);
}

// Converts a value that may be a number, bigint, numeric string or boolean to bigint (booleans: 1n/0n).
export function big(v) {
  if (typeof v === "bigint") return v;
  if (typeof v === "boolean") return v ? 1n : 0n;
  if (v == null || v === "") return 0n;
  return BigInt(v);
}

// Reads a File or Blob into a Uint8Array.
export async function blobBytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

// Wraps canvas.toBlob in a promise.
function canvasBlob(canvas, type, quality) {
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode the image"))), type, quality));
}

// Draws a small, distinct sample image (random colours, shapes and a time stamp) and returns it as JPEG bytes.
// Lets the demo and automated tests run without a camera; two calls never give the same file.
export async function sampleImage() {
  const c = document.createElement("canvas");
  c.width = 640; c.height = 480;
  const g = c.getContext("2d");
  const hue = Math.floor(Math.random() * 360);
  const grad = g.createLinearGradient(0, 0, 640, 480);
  grad.addColorStop(0, `hsl(${hue},70%,85%)`);
  grad.addColorStop(1, `hsl(${(hue + 120) % 360},60%,70%)`);
  g.fillStyle = grad; g.fillRect(0, 0, 640, 480);
  g.fillStyle = `hsl(${(hue + 200) % 360},50%,45%)`; g.fillRect(0, 330, 640, 150);            // "ground"
  g.fillStyle = "#fff8b8"; g.strokeStyle = "#14123a"; g.lineWidth = 4;                          // "sun"
  g.beginPath(); g.arc(470 + Math.random() * 100, 90 + Math.random() * 60, 42, 0, Math.PI * 2); g.fill(); g.stroke();
  for (let i = 0; i < 6; i++) {                                                                 // random shapes
    g.fillStyle = `hsla(${Math.floor(Math.random() * 360)},65%,55%,.85)`;
    g.fillRect(Math.random() * 560, 200 + Math.random() * 220, 30 + Math.random() * 80, 30 + Math.random() * 80);
  }
  g.fillStyle = "#14123a"; g.font = "bold 22px Helvetica, Arial, sans-serif";
  g.fillText("PAPRIKA sample image", 24, 44);
  g.font = "16px ui-monospace, monospace";
  g.fillText(new Date().toISOString() + " #" + Math.random().toString(16).slice(2, 10), 24, 72);
  return blobBytes(await canvasBlob(c, "image/jpeg", 0.92));
}

// Grabs the current frame of a playing <video> and returns it as JPEG bytes.
export async function videoFrame(video) {
  const c = document.createElement("canvas");
  c.width = video.videoWidth || 640; c.height = video.videoHeight || 480;
  c.getContext("2d").drawImage(video, 0, 0, c.width, c.height);
  return blobBytes(await canvasBlob(c, "image/jpeg", 0.92));
}

// Returns new image bytes that differ from the input by exactly one pixel of the picture.
// The image is decoded, one pixel is set to red, and the result is saved as PNG (lossless, so only that pixel
// differs in the picture). If the bytes are not a decodable image, the last byte of the file is flipped instead.
export async function changeOnePixel(bytes, type) {
  try {
    const bmp = await createImageBitmap(new Blob([bytes], { type: type || "image/jpeg" }));
    const c = document.createElement("canvas");
    c.width = bmp.width; c.height = bmp.height;
    const g = c.getContext("2d");
    g.drawImage(bmp, 0, 0);
    const x = Math.floor(bmp.width * 0.31), y = Math.floor(bmp.height * 0.58);
    const px = g.getImageData(x, y, 1, 1);
    px.data[0] = px.data[0] > 127 ? 0 : 255; px.data[1] = 0; px.data[2] = 0; px.data[3] = 255;
    g.putImageData(px, x, y);
    return { bytes: await blobBytes(await canvasBlob(c, "image/png")), type: "image/png", how: `pixel (${x}, ${y}) changed` };
  } catch {
    const out = new Uint8Array(bytes);
    out[out.length - 1] ^= 0x01;
    return { bytes: out, type, how: "last byte of the file changed" };
  }
}

// Shows image bytes inside a preview box (replacing any earlier image or video in it).
export function showImage(box, bytes, type) {
  for (const el of box.querySelectorAll("img,video")) el.remove();
  const img = document.createElement("img");
  img.src = URL.createObjectURL(new Blob([bytes], { type: type || "image/jpeg" }));
  img.alt = "photo";
  box.appendChild(img);
}

// Starts a file download of these exact bytes.
export function download(bytes, name, type) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(new Blob([bytes], { type: type || "application/octet-stream" }));
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
