// End-to-end tests of OpenRegistry with real UltraHonk proofs generated at test time.
// Run: npx hardhat test   (after `npm install` and `node lib/setup-zk.js`)
const hre = require("hardhat");
const { ethers } = require("ethers");
const assert = require("assert");
const crypto = require("crypto");
const Z = require("../lib/zk");

const E = (x) => ethers.formatEther(x);
const rnd32 = () => Z.hex(crypto.randomBytes(32));
const gas = {};
let provider, chainId, A, B, verifierAddr, verifierIface;
let deployer, issuerA, issuerB, relayer, challenger, frontrunner, stranger;
let batchA, batchB, batchX;
const issuerList = [];
const proofTimes = [];

async function deployVerifier(signer) {
  const art = await hre.artifacts.readArtifact("HonkVerifier");
  let bytecode = art.bytecode;
  for (const [file, libs] of Object.entries(art.linkReferences)) {
    for (const lib of Object.keys(libs)) {
      const la = await hre.artifacts.readArtifact(`${file}:${lib}`);
      const c = await new ethers.ContractFactory(la.abi, la.bytecode, signer).deploy();
      await c.waitForDeployment();
      const addr = (await c.getAddress()).slice(2).toLowerCase();
      for (const ref of libs[lib]) bytecode = bytecode.slice(0, 2 + ref.start * 2) + addr + bytecode.slice(2 + (ref.start + ref.length) * 2);
    }
  }
  verifierIface = new ethers.Interface(art.abi);
  const v = await new ethers.ContractFactory(art.abi, bytecode, signer).deploy();
  await v.waitForDeployment();
  return v.getAddress();
}
async function deployRegistry(signer) {
  const art = await hre.artifacts.readArtifact("OpenRegistry");
  const c = await new ethers.ContractFactory(art.abi, art.bytecode, signer).deploy(verifierAddr);
  await c.waitForDeployment();
  return c;
}
async function send(txPromise, gasKey) {
  const r = await (await txPromise).wait();
  if (gasKey) gas[gasKey] = r.gasUsed;
  return r;
}
async function reverts(fn) {
  try { await (await fn()).wait(); } catch (e) {
    let msg = String(e.reason || e.shortMessage || e.message).split("\n")[0];
    const data = e.data || (e.info && e.info.error && e.info.error.data);
    if (!e.reason && typeof data === "string" && data.length >= 10) {
      try { msg = `verifier error ${verifierIface.parseError(data).name}()`; } catch (_) { msg += ` data=${data.slice(0, 10)}`; }
    }
    return msg.length > 90 ? msg.slice(0, 90) + "..." : msg;
  }
  throw new Error("expected a revert, but the transaction succeeded");
}
async function anchor() {
  const n = await provider.getBlockNumber();
  return { anchorBlock: n, anchorHash: (await provider.getBlock(n)).hash };
}
async function prove(batch, index, registry, imageDigest, anchorOverride) {
  const a = anchorOverride || (await anchor());
  const p = Z.proveCapture({ batch, index, chainId, contract: await registry.getAddress(), imageDigest, anchorHash: a.anchorHash });
  proofTimes.push(p.ms);
  return { ...p, ...a, imageDigest };
}
const attestArgs = (p, over = {}) => [over.imageDigest ?? p.imageDigest, over.anchorBlock ?? p.anchorBlock, over.root ?? p.root, over.tag ?? p.tag, p.proof];
const misuseSig = (device, registryAddr, who) => Z.deviceSign(device, Z.misusePayload(chainId, registryAddr, who));
const misuseArgs = (batch, idx, device, r, s) => {
  const { path, bits } = batch.pathOf(idx);
  return [Z.hex(batch.root), Z.hex(device.x), Z.hex(device.y), path.map(Z.hex), bits, Z.hex(r), Z.hex(s)];
};
async function bondSum(reg) {
  let s = 0n;
  for (const i of issuerList) s += (await reg.issuers(i)).bond;
  return s;
}

describe("OpenRegistry (ORIGO proof + open bonded issuers + objective misuse revocation)", function () {
  let P1, P8;

  before(async () => {
    provider = new ethers.BrowserProvider(hre.network.provider, undefined, { cacheTimeout: -1 }); // no read cache: balances must be fresh
    chainId = (await provider.getNetwork()).chainId;
    [deployer, issuerA, issuerB, relayer, challenger, frontrunner, stranger] = await Promise.all([0, 1, 2, 3, 4, 5, 6].map((i) => provider.getSigner(i)));
    verifierAddr = await deployVerifier(deployer);
    A = await deployRegistry(deployer);
    B = await deployRegistry(deployer); // a second deployment, for the domain-separation test
    batchA = Z.newBatch(16); batchB = Z.newBatch(16); batchX = Z.newBatch(16);
    for (const a of [issuerA, issuerB]) issuerList.push(await a.getAddress());
    await send(A.connect(issuerA).registerIssuer({ value: ethers.parseEther("1") }), "registerIssuer");
    await send(A.connect(issuerA).publishRoot(Z.hex(batchA.root)), "publishRoot");
    await send(A.connect(issuerB).registerIssuer({ value: ethers.parseEther("1") }));
    await send(A.connect(issuerB).publishRoot(Z.hex(batchB.root)));
    await send(B.connect(issuerA).registerIssuer({ value: ethers.parseEther("1") }));
    await send(B.connect(issuerA).publishRoot(Z.hex(batchA.root)));
    console.log(`    setup: hardhat=${hre.version} hardfork=${hre.network.config.hardfork} chainId=${chainId} registryA=${await A.getAddress()} registryB=${await B.getAddress()}`);
  });

  afterEach(async () => {
    for (const [name, reg] of [["A", A], ["B", B]]) {
      const bal = await provider.getBalance(await reg.getAddress());
      const sum = await bondSum(reg);
      assert.strictEqual(bal, sum, `invariant broken on registry ${name}`);
    }
    console.log(`      invariant: balance(A)=${E(await provider.getBalance(await A.getAddress()))} = sum of bonds(A); balance(B)=${E(await provider.getBalance(await B.getAddress()))} = sum of bonds(B)`);
  });

  it("negatives on a valid proof (tampered digest, wrong root), then positive attestation, then replay", async () => {
    P1 = await prove(batchA, 5, A, rnd32());
    const r1 = await reverts(() => A.connect(relayer).attest(...attestArgs(P1, { imageDigest: rnd32() })));
    const r2 = await reverts(() => A.connect(relayer).attest(...attestArgs(P1, { root: Z.hex(batchB.root) })));
    const rc = await send(A.connect(relayer).attest(...attestArgs(P1)), "attest (0 revoked keys under root)");
    gas["statusOf (eth_estimateGas, 0 revoked keys under root)"] = await provider.estimateGas({ to: await A.getAddress(), data: A.interface.encodeFunctionData("statusOf", [P1.tag]) });
    const st = await A.statusOf(P1.tag);
    assert.strictEqual(st.record.imageDigest, P1.imageDigest);
    assert.strictEqual(Number(st.record.anchorBlock), P1.anchorBlock);
    assert.strictEqual(Number(st.record.recordedAt), rc.blockNumber);
    assert.strictEqual(st.keyRevoked, false);
    const r3 = await reverts(() => A.connect(stranger).attest(...attestArgs(P1)));
    console.log(`      POSITIVE attest: tag=${P1.tag.slice(0, 12)}.. notBefore(anchor)=${st.record.anchorBlock} notAfter(recorded)=${st.record.recordedAt} rootActive=${st.rootInactiveSince == 0n} keyRevoked=${st.keyRevoked} proof=${P1.proofBytes}B prove=${P1.ms}ms gas=${gas["attest (0 revoked keys under root)"]}`);
    console.log(`      NEGATIVE tampered digest -> ${r1} | wrong root -> ${r2} | replay -> ${r3}`);
    const tags = await A.tagsOf(P1.imageDigest);
    assert.deepStrictEqual([...tags], [P1.tag]);
  });

  it("root from an unregistered party is rejected", async () => {
    const r1 = await reverts(() => A.connect(stranger).publishRoot(Z.hex(batchX.root)));
    const r2 = await reverts(() => A.connect(issuerB).publishRoot(Z.hex(batchA.root))); // global uniqueness
    const p = await prove(batchX, 0, A, rnd32());
    const r3 = await reverts(() => A.connect(relayer).attest(...attestArgs(p)));
    console.log(`      NEGATIVE unregistered publishRoot -> ${r1} | other issuer claims existing root -> ${r2} | valid proof under unpublished root -> ${r3}`);
  });

  it("zero-hash trap: proof over blockhash = 0 with anchor = current or future block is rejected", async () => {
    const zero = { anchorBlock: 0, anchorHash: "0x" + "00".repeat(32) };
    const p = await prove(batchA, 6, A, rnd32(), zero); // genuine device, signed over h = 0 "in advance"
    const cur = (await provider.getBlockNumber()) + 1; // the block the transaction will be mined in
    const r1 = await reverts(() => A.connect(relayer).attest(...attestArgs(p, { anchorBlock: cur })));
    const r2 = await reverts(() => A.connect(relayer).attest(...attestArgs(p, { anchorBlock: cur + 1000 })));
    console.log(`      NEGATIVE anchor=current block ${cur} -> ${r1} | anchor=future block ${cur + 1000} -> ${r2}`);
  });

  it("stale anchor (> 256 blocks) is rejected", async () => {
    const p = await prove(batchA, 7, A, rnd32());
    await provider.send("hardhat_mine", ["0x101"]); // 257 blocks
    const age = (await provider.getBlockNumber()) + 1 - p.anchorBlock;
    const r = await reverts(() => A.connect(relayer).attest(...attestArgs(p)));
    console.log(`      NEGATIVE stale anchor (age ${age} blocks at inclusion) -> ${r}`);
  });

  it("domain separation: a proof made for registry B is rejected by registry A", async () => {
    const p = await prove(batchA, 8, B, rnd32());
    const r = await reverts(() => A.connect(relayer).attest(...attestArgs(p)));
    const rc = await send(B.connect(relayer).attest(...attestArgs(p)));
    console.log(`      NEGATIVE proof for B submitted to A -> ${r} | same proof on B -> accepted in block ${rc.blockNumber}`);
  });

  it("deactivated root: new attestation rejected, earlier record intact", async () => {
    const p3 = await prove(batchB, 1, A, rnd32());
    const rc3 = await send(A.connect(relayer).attest(...attestArgs(p3)));
    const p4 = await prove(batchB, 2, A, rnd32());
    const rcD = await send(A.connect(issuerB).deactivateRoot(Z.hex(batchB.root)));
    const r = await reverts(() => A.connect(relayer).attest(...attestArgs(p4)));
    const rStranger = await reverts(() => A.connect(stranger).deactivateRoot(Z.hex(batchA.root)));
    const st = await A.statusOf(p3.tag);
    assert.strictEqual(Number(st.record.recordedAt), rc3.blockNumber);
    assert.strictEqual(Number(st.rootInactiveSince), rcD.blockNumber);
    console.log(`      DEACTIVATE root B at block ${rcD.blockNumber}: new attestation -> ${r} | old record still returned (recorded block ${st.record.recordedAt} < inactiveSince ${st.rootInactiveSince}) | stranger deactivates A's root -> ${rStranger}`);
  });

  it("unlinkability sanity: two attestations by the same device share only the root", async () => {
    P8 = await prove(batchA, 5, A, rnd32());
    await send(A.connect(relayer).attest(...attestArgs(P8)));
    const s1 = (await A.statusOf(P1.tag)).record, s8 = (await A.statusOf(P8.tag)).record;
    const fields = ["imageDigest", "root", "m", "anchorBlock", "recordedAt"];
    const equal = fields.filter((f) => s1[f] === s8[f]);
    assert.notStrictEqual(P1.tag, P8.tag);
    assert.deepStrictEqual(equal, ["root"]);
    console.log(`      UNLINKABILITY device #5: tag1=${P1.tag.slice(0, 12)}.. tag2=${P8.tag.slice(0, 12)}.. equal record fields: [${equal.join(", ")}] of [tag, ${fields.join(", ")}]`);
  });

  it("misuse proof: forgeries, wrong key, capture signature and front-running fail; valid proof revokes and pays; time-scoped status", async () => {
    const reg = await A.getAddress();
    const chal = await challenger.getAddress(), front = await frontrunner.getAddress();
    const dev5 = batchA.devices[5], dev6 = batchA.devices[6];
    // (a) an honest device cannot be revoked without its key: random signature, attacker-key signature
    const ra = await reverts(() => A.connect(challenger).proveKeyMisuse(...misuseArgs(batchA, 6, dev6, crypto.randomBytes(32), crypto.randomBytes(32))));
    const attacker = Z.newDevice();
    const forged = misuseSig(attacker, reg, chal);
    const rb = await reverts(() => A.connect(challenger).proveKeyMisuse(...misuseArgs(batchA, 6, dev6, forged.r, forged.s)));
    // (b) a key that is not in the tree, with a valid signature by that key
    const rc = await reverts(() => A.connect(challenger).proveKeyMisuse(...misuseArgs(batchA, 5, attacker, forged.r, forged.s)));
    // (c) a genuine capture signature by device #5 (domain CAPTURE) submitted as a misuse proof
    const rd = await reverts(() => A.connect(challenger).proveKeyMisuse(...misuseArgs(batchA, 5, dev5, Z.buf(P1.r), Z.buf(P1.s))));
    // (d) the device key can be made to sign the misuse payload (same signing interface as captures)
    const good = misuseSig(dev5, reg, chal);
    const args = misuseArgs(batchA, 5, dev5, good.r, good.s);
    // (e) a front-runner copies the exact calldata from the mempool
    const re = await reverts(() => A.connect(frontrunner).proveKeyMisuse(...args));
    const balBefore = await provider.getBalance(chal), bondBefore = (await A.issuers(issuerList[0])).bond;
    const rcpt = await send(A.connect(challenger).proveKeyMisuse(...args), "proveKeyMisuse (bounty paid)");
    const balAfter = await provider.getBalance(chal), bondAfter = (await A.issuers(issuerList[0])).bond;
    const net = balAfter - balBefore + rcpt.gasUsed * rcpt.gasPrice;
    assert.strictEqual(net, ethers.parseEther("0.25"));
    const N = rcpt.blockNumber;
    // (f) a second bounty for the same key, with a fresh valid signature naming another address
    const rf1 = await reverts(() => A.connect(challenger).proveKeyMisuse(...args));
    const g2 = misuseSig(dev5, reg, front);
    const rf2 = await reverts(() => A.connect(frontrunner).proveKeyMisuse(...misuseArgs(batchA, 5, dev5, g2.r, g2.s)));
    console.log(`      NEGATIVE random sig vs honest device #6 -> ${ra} | attacker-key sig vs #6 -> ${rb} | key not in tree -> ${rc} | capture sig as misuse proof -> ${rd} | front-runner replays calldata -> ${re}`);
    console.log(`      MISUSE valid: key #5 revoked at block ${N}; challenger +${E(net)} ETH net of gas (${E(balBefore)} -> ${E(balAfter)}); issuer A bond ${E(bondBefore)} -> ${E(bondAfter)}; gas=${rcpt.gasUsed}`);
    console.log(`      NEGATIVE second bounty same key/same sender -> ${rf1} | same key, new signature naming another sender -> ${rf2}`);
    // (g) time-scoped status of the earlier records
    for (const [name, p] of [["P1", P1], ["P8", P8]]) {
      const st = await A.statusOf(p.tag);
      assert.strictEqual(st.keyRevoked, true);
      assert.strictEqual(Number(st.keyRevokedAt), N);
      assert.ok(st.record.recordedAt < st.keyRevokedAt);
      console.log(`      STATUS ${name}: still returned; attested between blocks ${st.record.anchorBlock}..${st.record.recordedAt}; key proven misusable at block ${st.keyRevokedAt} (after the record); root active=${st.rootInactiveSince == 0n}`);
    }
    const st6 = await A.statusOf((await A.tagsOf(P1.imageDigest))[0]);
    assert.ok(st6.keyRevoked);
    // (h) a new attestation by the revoked key
    const p9 = await prove(batchA, 5, A, rnd32());
    const rh = await reverts(() => A.connect(relayer).attest(...attestArgs(p9)));
    const offchain = Z.hex(Z.tagHash(dev5, Z.buf(p9.m))) === p9.tag;
    console.log(`      NEW attestation by revoked key #5 -> ${rh} | off-chain check SHA-256(0x02||pk||m) == tag: ${offchain}`);
    // a different device of the same root still attests (revocation is per key, not per root)
    const p10 = await prove(batchA, 9, A, rnd32());
    const r10 = await send(A.connect(relayer).attest(...attestArgs(p10)), "attest (1 revoked key under root)");
    console.log(`      OTHER device #9 of the same root attests after the revocation: ok, gas=${r10.gasUsed}`);
  });

  it("issuer exit: withdrawal blocked while unbonding; misuse proof still pays; then withdrawal", async () => {
    const reg = await A.getAddress(), chal = await challenger.getAddress();
    const rx = await send(A.connect(issuerB).requestExit());
    const r1 = await reverts(() => A.connect(issuerB).withdrawBond());
    const r2 = await reverts(() => A.connect(issuerB).publishRoot(rnd32()));
    const d3 = batchB.devices[3], sig = misuseSig(d3, reg, chal);
    const bondBefore = (await A.issuers(issuerList[1])).bond;
    const rc = await send(A.connect(challenger).proveKeyMisuse(...misuseArgs(batchB, 3, d3, sig.r, sig.s)));
    const paid = bondBefore - (await A.issuers(issuerList[1])).bond;
    assert.strictEqual(paid, ethers.parseEther("0.25"));
    await provider.send("hardhat_mine", ["0x64"]);
    const bal0 = await provider.getBalance(issuerList[1]);
    const rw = await send(A.connect(issuerB).withdrawBond());
    const got = (await provider.getBalance(issuerList[1])) - bal0 + rw.gasUsed * rw.gasPrice;
    const d4 = batchB.devices[4], sig4 = misuseSig(d4, reg, chal);
    const rc4 = await send(A.connect(challenger).proveKeyMisuse(...misuseArgs(batchB, 4, d4, sig4.r, sig4.s)));
    const ev = rc4.logs.map((l) => A.interface.parseLog(l)).find((l) => l && l.name === "KeyMisuseProven");
    console.log(`      EXIT requested block ${rx.blockNumber}: withdraw during unbonding -> ${r1} | publishRoot while exiting -> ${r2} | misuse proof in block ${rc.blockNumber} paid ${E(paid)} ETH | withdraw at block ${rw.blockNumber} returned ${E(got)} ETH | misuse after withdrawal: revoked, paid ${E(ev.args.paid)} ETH`);
  });

  after(async () => {
    const view = async (tag) => provider.estimateGas({ to: await A.getAddress(), data: A.interface.encodeFunctionData("statusOf", [tag]) });
    gas["statusOf (eth_estimateGas, 1 revoked key under root)"] = await view(P1.tag);
    console.log("    GAS TABLE (gasUsed of mined transactions; statusOf is a view, estimate includes 21000 base):");
    for (const [k, v] of Object.entries(gas)) console.log(`      ${k.padEnd(55)} ${v}`);
    console.log(`    proofs generated: ${proofTimes.length}, witness+prove ms each: ${proofTimes.join(", ")}`);
  });
});
