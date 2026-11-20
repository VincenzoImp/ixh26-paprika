// Simulated devices, SHA-256 Merkle tree, payload signing and proving (adapted from e05 prove.mjs).
// TEST ONLY: device keys are generated at run time and never stored.
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const DEPTH = 10;
const N_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const ROOT = path.join(__dirname, "..");
const CIRCUIT = path.join(ROOT, "circuit");
const ZK_TMP = path.join(ROOT, "zk", "tmp");
const ENV = { ...process.env, PATH: `${process.env.HOME}/.nargo/bin:${process.env.HOME}/.bb:${process.env.PATH}` };

const sha = (...parts) => crypto.createHash("sha256").update(Buffer.concat(parts)).digest();
const leafHash = (pk) => sha(Buffer.from([0]), pk.x, pk.y);
const nodeHash = (l, r) => sha(Buffer.from([1]), l, r);
const tagHash = (pk, m) => sha(Buffer.from([2]), pk.x, pk.y, m);
const hex = (b) => "0x" + Buffer.from(b).toString("hex");
const buf = (h) => Buffer.from(h.replace(/^0x/, ""), "hex");
const u256 = (n) => Buffer.from(BigInt(n).toString(16).padStart(64, "0"), "hex");

// Exactly what OpenRegistry.captureMessage / misuseMessage hash (see README "What is signed").
const capturePayload = (chainId, contract, imageDigest, anchorHash) =>
  Buffer.concat([Buffer.from("ORIGO-P/CAPTURE/v1"), u256(chainId), buf(contract), buf(imageDigest), buf(anchorHash)]);
const misusePayload = (chainId, contract, challenger) =>
  Buffer.concat([Buffer.from("ORIGO-P/MISUSE/v1"), u256(chainId), buf(contract), buf(challenger)]);

function newDevice() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  return { privateKey, x: Buffer.from(jwk.x, "base64url"), y: Buffer.from(jwk.y, "base64url") };
}

// The single signing interface of a simulated device: ECDSA P-256 / SHA-256 over a payload, low-s.
function deviceSign(device, payload) {
  const sig = crypto.sign("sha256", payload, { key: device.privateKey, dsaEncoding: "ieee-p1363" });
  let s = BigInt("0x" + sig.subarray(32).toString("hex"));
  if (s > N_ORDER / 2n) s = N_ORDER - s; // the circuit accepts only low-s
  return { r: sig.subarray(0, 32), s: u256(s), sig: Buffer.concat([sig.subarray(0, 32), u256(s)]) };
}

// Batch of `n` real device keys padded with random leaves to 2^DEPTH.
function newBatch(n) {
  const devices = Array.from({ length: n }, newDevice);
  const leaves = Array.from({ length: 1 << DEPTH }, (_, i) => (i < n ? leafHash(devices[i]) : crypto.randomBytes(32)));
  const levels = [leaves];
  for (let d = 0; d < DEPTH; d++) {
    const prev = levels[d], next = [];
    for (let i = 0; i < prev.length; i += 2) next.push(nodeHash(prev[i], prev[i + 1]));
    levels.push(next);
  }
  const pathOf = (idx) => {
    const p = [], isRight = [];
    for (let d = 0, i = idx; d < DEPTH; d++, i >>= 1) { p.push(levels[d][i ^ 1]); isRight.push((i & 1) === 1); }
    return { path: p, isRight, bits: isRight.reduce((acc, b, i) => acc | ((b ? 1 : 0) << i), 0) };
  };
  return { devices, root: levels[DEPTH][0], pathOf };
}

const halves = (name, b) => `${name}_hi = "0x${b.subarray(0, 16).toString("hex")}"\n${name}_lo = "0x${b.subarray(16).toString("hex")}"`;
const bytesArr = (name, b) => `${name} = [${[...b].join(", ")}]`;

// Signs the capture payload with the device and proves the ORIGO statement. Returns hex values for attest().
function proveCapture({ batch, index, chainId, contract, imageDigest, anchorHash }) {
  const device = batch.devices[index];
  const payload = capturePayload(chainId, contract, imageDigest, anchorHash);
  const m = sha(payload);
  const { sig, r, s } = deviceSign(device, payload);
  const tag = tagHash(device, m);
  const { path: p, isRight } = batch.pathOf(index);
  fs.writeFileSync(path.join(CIRCUIT, "Prover.toml"), [
    halves("m", m), halves("root", batch.root), halves("tag", tag),
    bytesArr("pk_x", device.x), bytesArr("pk_y", device.y), bytesArr("signature", sig),
    `path = [${p.map((x) => `[${[...x].join(", ")}]`).join(", ")}]`,
    `path_is_right = [${isRight.join(", ")}]`,
  ].join("\n") + "\n");
  fs.mkdirSync(ZK_TMP, { recursive: true });
  const t0 = Date.now();
  execFileSync("nargo", ["execute"], { cwd: CIRCUIT, env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  execFileSync("bb", ["prove", "-b", "target/origo.json", "-w", "target/origo.gz", "-k", "../zk/vk", "-o", ZK_TMP, "-t", "evm"],
    { cwd: CIRCUIT, env: ENV, stdio: ["ignore", "pipe", "pipe"] });
  const ms = Date.now() - t0;
  const proof = fs.readFileSync(path.join(ZK_TMP, "proof"));
  return { proof: hex(proof), tag: hex(tag), m: hex(m), root: hex(batch.root), r: hex(r), s: hex(s), ms, proofBytes: proof.length };
}

module.exports = { DEPTH, sha, leafHash, nodeHash, tagHash, hex, buf, capturePayload, misusePayload, newDevice, deviceSign, newBatch, proveCapture };
