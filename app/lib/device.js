// Paprika device library: the "camera" side of the protocol.
//
// A device is a P-256 (secp256r1) key pair. This file creates and stores such keys, builds the exact byte
// messages that Paprika.sol hashes (register, capture, revoke) and signs them the way the contract expects.
// It uses only globalThis.crypto.subtle (WebCrypto) and plain JavaScript, so the same file runs unchanged in
// Node 26 and in a browser. It does not depend on ethers.
//
// Every value that goes on chain is a 0x-prefixed lowercase hex string (bytes32 / address) or a Uint8Array.

const subtle = globalThis.crypto.subtle;

// Order n of the P-256 curve, and n / 2. The contract rejects any signature whose s is above n / 2
// ("low-s only", see Paprika._p256), so we normalise s after signing.
const P256_N = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const P256_HALF_N = P256_N >> 1n;

// ------------------------------------------------------------------ hex and byte helpers

/** Bytes -> "0x..." lowercase hex. */
export function toHex(bytes) {
  let s = "0x";
  for (const b of bytes) s += b.toString(16).padStart(2, "0");
  return s;
}

/** "0x..." (or bare) hex -> Uint8Array. Throws on odd length or bad characters. */
export function fromHex(hex) {
  const h = hex.startsWith("0x") || hex.startsWith("0X") ? hex.slice(2) : hex;
  if (h.length % 2 !== 0 || /[^0-9a-fA-F]/.test(h)) throw new Error(`bad hex: ${hex}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(2 * i, 2 * i + 2), 16);
  return out;
}

/** Concatenates byte arrays. */
export function concatBytes(...parts) {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}

/** UTF-8 bytes of a string. */
export function utf8(text) {
  return new TextEncoder().encode(text);
}

/** SHA-256 of bytes (async, WebCrypto) -> "0x..." hex (32 bytes). */
export async function sha256(bytes) {
  return toHex(new Uint8Array(await subtle.digest("SHA-256", bytes)));
}

// Fixed-size encodings used by Solidity's abi.encodePacked.
function bigIntToBytes(value, size) {
  let v = BigInt(value);
  if (v < 0n) throw new Error("negative value");
  const out = new Uint8Array(size);
  for (let i = size - 1; i >= 0; i--) { out[i] = Number(v & 0xffn); v >>= 8n; }
  if (v !== 0n) throw new Error(`value does not fit in ${size} bytes`);
  return out;
}
function fixedHex(hex, size, what) {
  const b = fromHex(hex);
  if (b.length !== size) throw new Error(`${what} must be ${size} bytes, got ${b.length}`);
  return b;
}
const uint256 = (v) => bigIntToBytes(v, 32);          // uint256: 32 bytes big-endian
const address = (a) => fixedHex(a, 20, "address");    // address: 20 bytes (packed, not padded)
const bytes32 = (h) => fixedHex(h, 32, "bytes32");    // bytes32: 32 bytes

function base64UrlToBytes(s) {
  const b64 = s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4);
  const bin = atob(b64);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

// ------------------------------------------------------------------ the three signed messages
//
// The contract signs/verifies SHA-256 of these bytes. The builders return the bytes BEFORE hashing, because
// WebCrypto's ECDSA-with-SHA-256 hashes its input itself, and the P-256 precompile then checks the signature
// against exactly that SHA-256 digest. Layouts copied from Paprika.sol (abi.encodePacked, no padding for
// strings and addresses; uint256 is 32 bytes big-endian):
//
//   register: "PAPRIKA/REGISTER" ‖ uint256 chainId ‖ address paprika ‖ bytes32 keyId ‖ address owner(=msg.sender)
//   capture:  "PAPRIKA/CAPTURE"  ‖ uint256 chainId ‖ address paprika ‖ bytes32 keyId ‖ bytes32 photoHash ‖ bytes32 blockhash(anchorBlock)
//   revoke:   "PAPRIKA/REVOKE"   ‖ uint256 chainId ‖ address paprika ‖ bytes32 keyId ‖ address caller(=msg.sender)

/** Bytes the device signs to register (proof of possession naming the account that sends register()). */
export function registerMessage({ chainId, contract, keyId, owner }) {
  return concatBytes(utf8("PAPRIKA/REGISTER"), uint256(chainId), address(contract), bytes32(keyId), address(owner));
}

/** Bytes the device signs for one photo: photo hash bound to a recent block hash (taken before the shot). */
export function captureMessage({ chainId, contract, keyId, photoHash, blockHash }) {
  return concatBytes(utf8("PAPRIKA/CAPTURE"), uint256(chainId), address(contract), bytes32(keyId), bytes32(photoHash), bytes32(blockHash));
}

/** Bytes the device signs to revoke its own key (naming the account that sends revokeKey()). */
export function revokeMessage({ chainId, contract, keyId, caller }) {
  return concatBytes(utf8("PAPRIKA/REVOKE"), uint256(chainId), address(contract), bytes32(keyId), address(caller));
}

// ------------------------------------------------------------------ devices

// Builds the device object around a WebCrypto private key and the public coordinates.
async function wrap(privateKey, publicKey, xBytes, yBytes) {
  const keyId = await sha256(concatBytes(xBytes, yBytes));   // = sha256(abi.encodePacked(x, y)) in the contract
  return {
    keyId,
    x: toHex(xBytes),
    y: toHex(yBytes),
    publicKeyRaw: concatBytes(Uint8Array.of(4), xBytes, yBytes),   // uncompressed SEC1 point 0x04 ‖ x ‖ y
    privateKey,
    publicKey,
    /** Signs bytes with ECDSA P-256 / SHA-256; returns r ‖ s (64 bytes) with s normalised to the low half. */
    async sign(bytes) {
      // WebCrypto returns the IEEE P1363 form r ‖ s (32 + 32 bytes), not DER.
      const sig = new Uint8Array(await subtle.sign({ name: "ECDSA", hash: "SHA-256" }, privateKey, bytes));
      const r = sig.slice(0, 32);
      let s = BigInt(toHex(sig.slice(32, 64)));
      // Low-s: (r, s) and (r, n - s) are both valid ECDSA signatures; the contract accepts only s <= n/2.
      if (s > P256_HALF_N) s = P256_N - s;
      return concatBytes(r, bigIntToBytes(s, 32));
    },
  };
}

/** Creates a new P-256 device key at run time (extractable, so it can be exported). */
export async function createDevice() {
  const pair = await subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await subtle.exportKey("raw", pair.publicKey));   // 0x04 ‖ x ‖ y
  return wrap(pair.privateKey, pair.publicKey, raw.slice(1, 33), raw.slice(33, 65));
}

/** Exports a device as a plain JSON-able object: { kind, keyId, jwk } (jwk = private JWK, includes x and y). */
export async function exportDevice(device) {
  const jwk = await subtle.exportKey("jwk", device.privateKey);
  return { kind: "paprika-device", keyId: device.keyId, jwk };
}

/** Rebuilds a device from exportDevice() output (object or JSON string). */
export async function importDevice(json) {
  const data = typeof json === "string" ? JSON.parse(json) : json;
  const jwk = data.jwk || data;
  const privateKey = await subtle.importKey("jwk", jwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["sign"]);
  const pubJwk = { kty: "EC", crv: "P-256", x: jwk.x, y: jwk.y, ext: true };
  const publicKey = await subtle.importKey("jwk", pubJwk, { name: "ECDSA", namedCurve: "P-256" }, true, ["verify"]);
  return wrap(privateKey, publicKey, base64UrlToBytes(jwk.x), base64UrlToBytes(jwk.y));
}
