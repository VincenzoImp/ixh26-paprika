// p07: equivocation under a slot-bound nonce reveals a P-256 ECDSA key; the extracted key then
// produces the existing PAPRIKA-V2/EXTRACTED misuse proof. Also shows why the nonce rule must be
// ENFORCED (committed R per slot), not merely followed by honest firmware.
import { p256 } from '@noble/curves/p256';
import { sha256 } from '@noble/hashes/sha256';
import { hmac } from '@noble/hashes/hmac';
import { bytesToHex, concatBytes, utf8ToBytes } from '@noble/hashes/utils';
import { randomBytes } from 'node:crypto';

const n = p256.CURVE.n, G = p256.ProjectivePoint.BASE;
const mod = (a, m = n) => ((a % m) + m) % m;
const inv = (a) => { let [t, nt, r, nr] = [0n, 1n, n, mod(a)]; while (nr) { const q = r / nr; [t, nt] = [nt, t - q * nt]; [r, nr] = [nr, r - q * nr]; } return mod(t); };
const b2i = (b) => BigInt('0x' + bytesToHex(b));
const i2b = (x) => { const h = x.toString(16).padStart(64, '0'); return Uint8Array.from(Buffer.from(h, 'hex')); };
const u256 = (x) => i2b(BigInt(x));
const chainId = 1440000n, contract = new Uint8Array(20).fill(0xab), anchor = randomBytes(32);

// message hashed exactly like the contract would (label || chainId || contract || slot || H || blockhash)
const captureDigest = (slot, H) => sha256(concatBytes(utf8ToBytes('PAPRIKA-V2/CAPTURE-SLOT'), u256(chainId), contract, u256(slot), H, anchor));
const extractedDigest = (challenger) => sha256(concatBytes(utf8ToBytes('PAPRIKA-V2/EXTRACTED'), u256(chainId), contract, challenger));

function signWithK(d, digest, k) {            // textbook ECDSA with an explicit nonce
  const z = mod(b2i(digest)); const r = mod(G.multiply(k).toAffine().x);
  let s = mod(inv(k) * (z + r * d)); if (s > n / 2n) s = n - s;   // low-s normalisation (s -> -s means k -> -k)
  return { r, s };
}
const slotNonce = (d, slot) => mod(b2i(hmac(sha256, i2b(d), concatBytes(utf8ToBytes('PAPRIKA-NONCE'), u256(slot))))) || 1n;
const verify = (Q, digest, { r, s }) => p256.verify(new p256.Signature(r, s).toCompactRawBytes(), digest, Q, { lowS: false, prehash: false });

// Anyone: given two valid signatures with equal r on different digests, recover candidate keys, keep the one matching Q.
function extract(Q, z1b, sig1, z2b, sig2) {
  if (sig1.r !== sig2.r) return null;
  const z1 = mod(b2i(z1b)), z2 = mod(b2i(z2b)), r = sig1.r;
  for (const s2 of [sig2.s, n - sig2.s]) {     // s may have been negated by low-s normalisation
    if (mod(sig1.s - s2) === 0n) continue;
    const k = mod((z1 - z2) * inv(sig1.s - s2)); const d = mod((sig1.s * k - z1) * inv(r));
    if (G.multiply(d).equals(Q)) return d;
  }
  return null;
}

const d = mod(b2i(p256.utils.randomPrivateKey())); const Q = G.multiply(d); const Qb = Q.toRawBytes(false);
const H1 = sha256(utf8ToBytes('photo A')), H2 = sha256(utf8ToBytes('photo B'));

// 1. honest-rule device equivocates on slot 7
const sigA = signWithK(d, captureDigest(7, H1), slotNonce(d, 7));
const sigB = signWithK(d, captureDigest(7, H2), slotNonce(d, 7));
console.log('1. both capture signatures valid:', verify(Qb, captureDigest(7, H1), sigA), verify(Qb, captureDigest(7, H2), sigB));
const dx = extract(Q, captureDigest(7, H1), sigA, captureDigest(7, H2), sigB);
console.log('   key extracted from the two signatures:', dx === d);
const challenger = new Uint8Array(20).fill(0xcc);
const misuse = signWithK(dx, extractedDigest(challenger), mod(b2i(randomBytes(32))) || 1n);
console.log('   extracted key yields a valid EXTRACTED misuse proof naming the challenger:', verify(Qb, extractedDigest(challenger), misuse));

// 2. a cheating signer ignores the rule for the second photo: r differs, nothing is extracted
const sigC = signWithK(d, captureDigest(7, H2), mod(b2i(randomBytes(32))) || 1n);
console.log('2. rule not enforced: second signature valid:', verify(Qb, captureDigest(7, H2), sigC), '| extraction:', extract(Q, captureDigest(7, H1), sigA, captureDigest(7, H2), sigC));
console.log('   -> the verifier must check r == x(R_slot) against a nonce point committed at registration;');
console.log('      without it, only a direct two-signature equivocation proof (no key extraction) is sound.');
const Rslot = G.multiply(slotNonce(d, 7)).toAffine().x;
console.log('   committed-R check rejects the cheating signature:', mod(Rslot) !== sigC.r, '| accepts honest one:', mod(Rslot) === sigA.r);

// 3. malleability: (r, n-s) is also valid when the verifier does not enforce low-s
console.log('3. (r, n - s) also verifies (no low-s rule in the verifier):', verify(Qb, captureDigest(7, H1), { r: sigA.r, s: n - sigA.s }));
