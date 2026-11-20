// Builds a real witness for the ORIGO circuit and produces an EVM-verifiable proof.
// 16 simulated device keys (TEST ONLY, generated at run time, never stored), SHA-256 Merkle tree of
// depth 10, one ECDSA P-256 signature, zero-knowledge proof for the EVM target.
// Usage: node prove.mjs      (needs `nargo` and `bb` on PATH; Node standard library only)
import crypto from 'node:crypto';
import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const DEPTH = 10;
const N_ORDER = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const HERE = new URL('./', import.meta.url).pathname;
const CIRCUIT = HERE + 'circuit/';
const sha = (...parts) => crypto.createHash('sha256').update(Buffer.concat(parts)).digest();
const leafHash = (pk) => sha(Buffer.from([0]), pk.x, pk.y);
const nodeHash = (l, r) => sha(Buffer.from([1]), l, r);
const tagHash = (pk, m) => sha(Buffer.from([2]), pk.x, pk.y, m);
const halves = (name, buf) => `${name}_hi = "0x${buf.subarray(0, 16).toString('hex')}"\n${name}_lo = "0x${buf.subarray(16).toString('hex')}"`;
const bytes = (name, buf) => `${name} = [${[...buf].join(', ')}]`;
const run = (cmd, args, cwd = CIRCUIT) => {
  const t0 = process.hrtime.bigint();
  execFileSync(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
  return (Number(process.hrtime.bigint() - t0) / 1e6).toFixed(0);
};

function newDevice() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ec', { namedCurve: 'P-256' });
  const jwk = publicKey.export({ format: 'jwk' });
  return { privateKey, x: Buffer.from(jwk.x, 'base64url'), y: Buffer.from(jwk.y, 'base64url') };
}
function signLowS(device, payload) {
  const sig = crypto.sign('sha256', payload, { key: device.privateKey, dsaEncoding: 'ieee-p1363' });
  let s = BigInt('0x' + sig.subarray(32).toString('hex'));
  if (s > N_ORDER / 2n) s = N_ORDER - s; // the circuit accepts only the low-s form
  return Buffer.concat([sig.subarray(0, 32), Buffer.from(s.toString(16).padStart(64, '0'), 'hex')]);
}

const devices = Array.from({ length: 16 }, newDevice);
const leaves = Array.from({ length: 1 << DEPTH }, (_, i) => (i < devices.length ? leafHash(devices[i]) : crypto.randomBytes(32)));
const levels = [leaves];
for (let d = 0; d < DEPTH; d++) {
  const prev = levels[d], next = [];
  for (let i = 0; i < prev.length; i += 2) next.push(nodeHash(prev[i], prev[i + 1]));
  levels.push(next);
}
const root = levels[DEPTH][0];
const idx = 5, device = devices[idx];
const path = [], isRight = [];
for (let d = 0, i = idx; d < DEPTH; d++, i >>= 1) { path.push(levels[d][i ^ 1]); isRight.push((i & 1) === 1); }

const payload = Buffer.from('ORIGO spike | image digest | block number | block hash');
const m = crypto.createHash('sha256').update(payload).digest();
const sig = signLowS(device, payload);
const tag = tagHash(device, m);

fs.writeFileSync(CIRCUIT + 'Prover.toml', [
  halves('m', m), halves('root', root), halves('tag', tag),
  bytes('pk_x', device.x), bytes('pk_y', device.y), bytes('signature', sig),
  `path = [${path.map((p) => `[${[...p].join(', ')}]`).join(', ')}]`,
  `path_is_right = [${isRight.join(', ')}]`,
].join('\n') + '\n');

fs.mkdirSync(HERE + 'zk', { recursive: true });
console.log(`time_utc=${new Date().toISOString()} node=${process.version}`);
console.log('compile ms:', run('nargo', ['compile']));
console.log('witness ms:', run('nargo', ['execute']));
console.log('write_vk ms:', run('bb', ['write_vk', '-b', 'target/origo.json', '-o', '../zk', '-t', 'evm']));
const t = [];
for (let i = 0; i < 3; i++) t.push(run('bb', ['prove', '-b', 'target/origo.json', '-w', 'target/origo.gz', '-k', '../zk/vk', '-o', '../zk', '-t', 'evm']));
console.log('prove ms (x3, zero-knowledge, EVM target):', t.join(', '));
console.log('native verify ms:', run('bb', ['verify', '-k', '../zk/vk', '-p', '../zk/proof', '-i', '../zk/public_inputs', '-t', 'evm']));
console.log('write_solidity_verifier ms:', run('bb', ['write_solidity_verifier', '-k', '../zk/vk', '-o', '../contracts/HonkVerifier.sol', '-t', 'evm']));
for (const f of ['proof', 'public_inputs', 'vk']) console.log(`size ${f}: ${fs.statSync(HERE + 'zk/' + f).size} bytes`);
// What a contract needs to recompute the tag of a revoked key: the key and the message.
fs.writeFileSync(HERE + 'zk/revocation-check.json', JSON.stringify({
  note: 'TEST ONLY - simulated device key, generated at run time',
  pk_x: '0x' + device.x.toString('hex'), pk_y: '0x' + device.y.toString('hex'),
  m: '0x' + m.toString('hex'), tag: '0x' + tag.toString('hex'), root: '0x' + root.toString('hex'),
}, null, 2) + '\n');
