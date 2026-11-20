// PaprikaCore: the applicable attacks from the full list, run against the contract without the vote path.
// Prints "ATTACK <name>: ... | numbers". Invariant after every test: balance == sum of stakes + sum of issuer bonds.
const assert = require("assert");
const crypto = require("crypto");
const { ethers, network } = require("hardhat");

const E = (x) => ethers.parseEther(String(x));
const F = (x) => ethers.formatEther(x);
const h = (s) => ethers.sha256(ethers.toUtf8Bytes(s));
const N_P256 = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const ST = { None: 0n, Active: 1n, Flagged: 2n, Retired: 3n };
const L0 = [ethers.ZeroAddress, 0, ethers.ZeroHash, ethers.ZeroHash];
const MN = "test test test test test test test test test test test junk";
const hdKey = (i) => ethers.HDNodeWallet.fromPhrase(MN, undefined, `m/44'/60'/0'/0/${i}`);
const gasLog = {};
const G = (k, g) => { gasLog[k] ??= g; };
const line = (name, verdict, nums) => console.log(`      ATTACK ${name}: ${verdict} | ${nums}`);

async function reverts(pr, reason) {
  try { await (await pr).wait(); } catch (e) { assert(String(e.message).includes(reason), `expected "${reason}", got: ${String(e.message).slice(0, 200)}`); return reason; }
  throw new Error("expected revert: " + reason);
}
async function rc(txp) { const r = await (await txp).wait(); return { r, gas: r.gasUsed, cost: r.gasUsed * r.gasPrice }; }
const balOf = (a) => ethers.provider.getBalance(typeof a === "string" ? a : a.address);
const mine = (n) => network.provider.send("hardhat_mine", ["0x" + n.toString(16)]);
const warp = async (sec) => { await network.provider.send("evm_increaseTime", [sec]); await mine(1); };
const automine = (on) => network.provider.send("evm_setAutomine", [on]);
const flipS = (sig) => sig.slice(0, 66) + (N_P256 - BigInt("0x" + sig.slice(66))).toString(16).padStart(64, "0");
const lowS = (sig) => (BigInt("0x" + sig.slice(66)) > N_P256 / 2n ? flipS(sig) : sig);
const highS = (sig) => (BigInt("0x" + sig.slice(66)) > N_P256 / 2n ? sig : flipS(sig));
function newDevice() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = "0x" + Buffer.from(jwk.x, "base64url").toString("hex"), y = "0x" + Buffer.from(jwk.y, "base64url").toString("hex");
  return { x, y, keyId: ethers.sha256(ethers.concat([x, y])), sign: (pre) => lowS("0x" + crypto.sign("sha256", ethers.getBytes(pre), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("hex")) };
}
const mReg = (c, k, o) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "address"], ["PAPRIKA/REGISTER", c.chainId, c.addr, k, o]);
const mCap = (c, k, p, bh) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "bytes32", "bytes32"], ["PAPRIKA/CAPTURE", c.chainId, c.addr, k, p, bh]);
const mExt = (c, k, o) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "address"], ["PAPRIKA/EXTRACTED", c.chainId, c.addr, k, o]);
const endorse = (c, i, keyId) => { const sg = hdKey(i).signingKey.sign(ethers.keccak256(ethers.solidityPacked(["string", "uint256", "address", "bytes32"], ["PAPRIKA/ENDORSE", c.chainId, c.addr, keyId]))); return [sg.v, sg.r, sg.s]; };

async function deploy() {
  const s = await ethers.getSigners();
  const pap = await (await ethers.getContractFactory("PaprikaCore", s[0])).deploy();
  const c = { s, pap, addr: await pap.getAddress(), chainId: (await ethers.provider.getNetwork()).chainId, keys: [], issuers: [] };
  c.STAKE = await pap.MIN_STAKE(); c.UNBOND = Number(await pap.UNBONDING_PERIOD()); c.IBOND = await pap.ISSUER_MIN_BOND(); c.BOUNTY = await pap.ISSUER_BOUNTY();
  return c;
}
async function register(c, owner, dev = newDevice(), stake = c.STAKE, iss = null) {
  const end = iss === null ? L0 : [c.s[iss].address, ...endorse(c, iss, dev.keyId)];
  const x = await rc(c.pap.connect(owner).register(dev.x, dev.y, dev.sign(mReg(c, dev.keyId, owner.address)), ...end, { value: stake }));
  c.keys.push(dev.keyId); return { dev, ...x };
}
async function anchorNow() { const b = await ethers.provider.getBlock("latest"); return { n: b.number, hash: b.hash }; }
async function attest(c, who, dev, photo, value = 0n) { const a = await anchorNow(); const sig = dev.sign(mCap(c, dev.keyId, photo, a.hash)); return { ...(await rc(c.pap.connect(who).attest(photo, a.n, dev.keyId, sig, { value }))), anchor: a, sig }; }
const misuse = (c, who, dev) => rc(c.pap.connect(who).proveKeyMisuse(dev.keyId, dev.sign(mExt(c, dev.keyId, who.address))));
async function newIssuer(c, i, bond) { const g = await rc(c.pap.connect(c.s[i]).registerIssuer({ value: bond || c.IBOND })); c.issuers.push(c.s[i].address); G("registerIssuer", g.gas); return c.s[i]; }
async function invariant(c) {
  let st = 0n; for (const k of c.keys) st += (await c.pap.device(k)).stake;
  let ib = 0n; for (const a of c.issuers) ib += (await c.pap.issuer(a)).bond;
  const bal = await balOf(c.addr);
  assert.equal(bal, st + ib, `INVARIANT balance ${bal} != stakes ${st} + issuer bonds ${ib}`);
  return { bal, st, ib };
}

describe("PaprikaCore", function () {
  let c, s;
  beforeEach(async () => { c = await deploy(); s = c.s; });
  afterEach(async () => { const i = await invariant(c); console.log(`      invariant ok: contract ${F(i.bal)} = stakes ${F(i.st)} + issuer bonds ${F(i.ib)}`); });

  it("0 positive path: register (L0, L1), relayed attest, verify, misuse proof pays at once, unbond + withdraw, issuer exit", async () => {
    const owner = s[1], relayer = s[2], ch = s[3];
    const d = await register(c, owner); G("register (level 0)", d.gas);
    const a = await attest(c, relayer, d.dev, h("p")); G("attest", a.gas);
    G("attest + deposit", (await attest(c, relayer, d.dev, h("p2"), E("0.05"))).gas);
    const v = await c.pap.verify(h("p"), d.dev.keyId);
    assert.equal(v.status, ST.Active); assert.equal(v.stakeAtRisk, c.STAKE + E("0.05"));
    const iss = await newIssuer(c, 10);
    const d1 = await register(c, owner, newDevice(), c.STAKE, 10); G("register (level 1)", d1.gas);
    const b0 = await balOf(ch);
    const m = await misuse(c, ch, d1.dev); G("proveKeyMisuse (level 1, pays at once)", m.gas);
    const got = (await balOf(ch)) - b0 + m.cost;
    assert.equal(got, c.STAKE / 2n + c.BOUNTY);
    G("proveKeyMisuse (level 0)", (await misuse(c, ch, d.dev)).gas);
    const d2 = await register(c, owner); await attest(c, owner, d2.dev, h("q"));
    G("requestUnbond", (await rc(c.pap.connect(owner).requestUnbond(d2.dev.keyId))).gas);
    await reverts(c.pap.connect(owner).withdraw(d2.dev.keyId), "unbonding");
    await warp(c.UNBOND);
    G("withdraw", (await rc(c.pap.connect(owner).withdraw(d2.dev.keyId))).gas);
    G("topUpIssuer", (await rc(c.pap.connect(iss).topUpIssuer({ value: E("0.1") }))).gas);
    G("requestIssuerExit", (await rc(c.pap.connect(iss).requestIssuerExit())).gas);
    await warp(c.UNBOND);
    G("withdrawIssuerBond", (await rc(c.pap.connect(iss).withdrawIssuerBond())).gas);
    console.log(`      POSITIVE PATH OK | level-1 misuse proof paid the challenger ${F(got)} ETH in the same tx (stake share + bounty); unbond/withdraw and issuer exit work`);
  });

  it("1 ban evasion / 2 synthetic content", async () => {
    const k = await register(c, s[1]); await misuse(c, s[2], k.dev);
    const r = await reverts(c.pap.connect(s[1]).register(k.dev.x, k.dev.y, k.dev.sign(mReg(c, k.dev.keyId, s[1].address)), ...L0, { value: c.STAKE }), "key used");
    const k2 = await register(c, s[1]);
    const ai = ethers.sha256(ethers.randomBytes(4096)); await attest(c, s[1], k2.dev, ai);
    line("ban-evasion", "PRICED", `old key "${r}"; new key ${F(c.STAKE)} + ${k2.gas} gas`);
    line("synthetic-content", "SUCCEEDS", "a software key attests random bytes; in Core the ONLY punishment is a misuse proof, i.e. someone must obtain the key");
  });

  it("3 front-running: attest copy, register copy, misuse-proof copy", async () => {
    const honest = s[1], rel = s[2], thief = s[3], ch = s[4];
    const dH = await register(c, honest);
    await automine(false);
    const a = await anchorNow();
    const t1 = await c.pap.connect(rel).attest(h("scoop"), a.n, dH.dev.keyId, dH.dev.sign(mCap(c, dH.dev.keyId, h("scoop"), a.hash)), { gasPrice: 2e9, gasLimit: 400000 });
    const t2 = await thief.sendTransaction({ to: c.addr, data: (await ethers.provider.getTransaction(t1.hash)).data, gasPrice: 3e9, gasLimit: 400000 });
    const dN = newDevice();
    const t3 = await c.pap.connect(honest).register(dN.x, dN.y, dN.sign(mReg(c, dN.keyId, honest.address)), ...L0, { value: c.STAKE, gasPrice: 2e9, gasLimit: 400000 });
    const t4 = await thief.sendTransaction({ to: c.addr, data: (await ethers.provider.getTransaction(t3.hash)).data, value: c.STAKE, gasPrice: 3e9, gasLimit: 400000 });
    await mine(1);
    const dM = newDevice();
    await automine(true); await register(c, s[5], dM); await automine(false);
    const t5 = await c.pap.connect(ch).proveKeyMisuse(dM.keyId, dM.sign(mExt(c, dM.keyId, ch.address)), { gasPrice: 2e9, gasLimit: 400000 });
    const t6 = await thief.sendTransaction({ to: c.addr, data: (await ethers.provider.getTransaction(t5.hash)).data, gasPrice: 3e9, gasLimit: 400000 });
    await mine(1); await automine(true); c.keys.push(dN.keyId);
    const st = []; for (const t of [t1, t2, t3, t4, t5, t6]) st.push((await ethers.provider.getTransactionReceipt(t.hash)).status);
    assert.deepEqual(st, [0, 1, 1, 0, 1, 0]);
    line("front-running (attest / register / misuse proof)", "FAILS", `statuses honest/thief: attest ${st[0]}/${st[1]} (thief's copy records the HONEST key), register ${st[2]}/${st[3]}, misuse ${st[4]}/${st[5]}`);
  });

  it("4 self-report loop; 4b double reward", async () => {
    const a = s[6], sy = s[7];
    await register(c, s[1], newDevice(), E("1"));
    const t0 = await balOf(c.addr), a0 = (await balOf(a)) + (await balOf(sy));
    for (let i = 0; i < 5; i++) { const k = await register(c, a); await misuse(c, sy, k.dev); }
    const net = (await balOf(a)) + (await balOf(sy)) - a0;
    const k = await register(c, a); await misuse(c, sy, k.dev);
    const r = await reverts(c.pap.connect(s[8]).proveKeyMisuse(k.dev.keyId, k.dev.sign(mExt(c, k.dev.keyId, s[8].address))), "already misuse");
    assert.equal(await balOf(c.addr), t0);
    line("self-report-profit", "FAILS", `5 self-reports: ${F(net)} ETH (= 5 x -(1-alpha) x S - gas); contract balance ${F(t0)} -> ${F(await balOf(c.addr))}; no treasury`);
    line("double-dip", "FAILS", `second misuse proof on the same key: "${r}"`);
  });

  it("5 griefing an honest device; 6 retroactive effect; 11 malleability", async () => {
    const k = await register(c, s[1]); for (let i = 0; i < 100; i++) await attest(c, s[1], k.dev, h("old" + i));
    const attacker = newDevice();
    const r = await reverts(c.pap.connect(s[2]).proveKeyMisuse(k.dev.keyId, attacker.sign(mExt(c, k.dev.keyId, s[2].address))), "bad sig");
    line("griefing an honest device", "FAILS (mechanism gone)", `without the key nobody can flag it ("${r}"); there are no claims to grief with`);
    await misuse(c, s[3], k.dev);
    let n = 0; for (let i = 0; i < 100; i++) if ((await c.pap.verify(h("old" + i), k.dev.keyId)).recordedBeforeFlag) n++;
    assert.equal(n, 100);
    line("retroactive-censorship", "FAILS", `${n}/100 records kept with recordedBeforeFlag=true (a KeyMisuse flag discredits them under the time-scoped policy anyway)`);
    const k2 = await register(c, s[4]); const a = await anchorNow();
    const sig = k2.dev.sign(mCap(c, k2.dev.keyId, h("m"), a.hash));
    const r2 = await reverts(c.pap.attest(h("m"), a.n, k2.dev.keyId, highS(sig)), "bad sig");
    line("signature-malleability", "FAILS", `high-s twin "${r2}"`);
  });

  it("7 replay / domain / anchors; 8 no admin; 9 key squatting", async () => {
    const k = await register(c, s[1]), k2 = await register(c, s[1]);
    const a = await attest(c, s[2], k.dev, h("p"));
    const R = [await reverts(c.pap.attest(h("p"), a.anchor.n, k.dev.keyId, a.sig), "exists")];
    const an = await anchorNow();
    R.push(await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k2.dev.sign(mCap(c, k2.dev.keyId, h("q"), an.hash))), "bad sig"));
    R.push(await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k.dev.sign(mCap({ ...c, chainId: 1n }, k.dev.keyId, h("q"), an.hash))), "bad sig"));
    R.push(await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k.dev.sign(mReg(c, k.dev.keyId, s[1].address))), "bad sig"));
    await mine(300);
    R.push(await reverts(c.pap.attest(h("q"), an.n, k.dev.keyId, k.dev.sign(mCap(c, k.dev.keyId, h("q"), an.hash))), "anchor"));
    const now = await anchorNow();
    R.push(await reverts(c.pap.attest(h("q"), now.n + 3, k.dev.keyId, k.dev.sign(mCap(c, k.dev.keyId, h("q"), ethers.ZeroHash))), "anchor"));
    line("replay/domain/anchor", "FAILS", R.map((x) => `"${x}"`).join(", ") + " (replay, other key, other chain, PoP as capture, stale, future)");
    const fns = c.pap.interface.fragments.filter((f) => f.type === "function" && !["view", "pure"].includes(f.stateMutability)).map((f) => f.name).sort();
    let stray = "accepted"; try { await (await s[3].sendTransaction({ to: c.addr, value: 1n })).wait(); } catch { stray = "reverts"; }
    line("admin / treasury drain", "FAILS", `functions: ${fns.join(", ")}; plain ETH ${stray}`);
    const vd = newDevice(), sq = newDevice();
    const r9 = await reverts(c.pap.connect(s[4]).register(vd.x, vd.y, sq.sign(mReg(c, vd.keyId, s[4].address)), ...L0, { value: c.STAKE }), "bad pop");
    line("key-squatting", "FAILS", `"${r9}"`);
  });

  it("10 withdrawal races; exit after the window", async () => {
    const owner = s[1], ch = s[2];
    const k = await register(c, owner); await attest(c, owner, k.dev, h("w"));
    await c.pap.connect(owner).requestUnbond(k.dev.keyId);
    const b0 = await balOf(ch); const m = await misuse(c, ch, k.dev);
    await warp(c.UNBOND);
    const r = await reverts(c.pap.connect(owner).withdraw(k.dev.keyId), "not retired");
    const k2 = await register(c, owner); await attest(c, owner, k2.dev, h("w2"));
    await c.pap.connect(owner).requestUnbond(k2.dev.keyId); await warp(c.UNBOND); await c.pap.connect(owner).withdraw(k2.dev.keyId);
    const b1 = await balOf(ch); const m2 = await misuse(c, ch, k2.dev);
    const v = await c.pap.verify(h("w2"), k2.dev.keyId);
    line("misuse proof during unbonding", "PAID", `challenger ${F((await balOf(ch)) - b0 - (await balOf(ch)) + b1 + m.cost)} ETH; owner withdraw "${r}"`);
    line("exit after the window, then misuse proof", "BY DESIGN", `flags the key (status ${v.status}, withdrawnAtBlock ${v.withdrawnAtBlock}) but pays ${F((await balOf(ch)) - b1 + m2.cost)}: the stake is gone`);
  });

  it("13 stolen honest key; level 1: endorsements, self-revocation, exhaustion, self-made issuer", async () => {
    const victim = s[1], thief = s[2];
    const k = await register(c, victim); const t0 = await balOf(thief); const m = await misuse(c, thief, k.dev);
    line("stolen honest key", "SUCCEEDS (accepted, custody risk)", `thief +${F((await balOf(thief)) - t0 + m.cost)} ETH`);
    const iss = await newIssuer(c, 10, E("1.05"));
    const d2 = newDevice();
    const reg = async (iAddr, e) => { try { await (await c.pap.connect(s[3]).register(d2.x, d2.y, d2.sign(mReg(c, d2.keyId, s[3].address)), iAddr, ...e, { value: c.STAKE })).wait(); return "ACCEPTED"; } catch (er) { return (/reason string '([^']*)'/.exec(er.message) || [0, "?"])[1]; } };
    const R = [await reg(iss.address, [27, ethers.hexlify(ethers.randomBytes(32)), ethers.hexlify(ethers.randomBytes(32))]), await reg(s[11].address, endorse(c, 11, d2.keyId)), await reg(iss.address, endorse(c, 12, d2.keyId)), await reg(iss.address, endorse(c, 10, ethers.ZeroHash))];
    line("endorsement checks", "FAILS (all rejected)", R.join(", "));
    // self-revocation loses, also after withdrawal (bounty cap)
    const o = s[4], sy = s[5];
    const o0 = (await balOf(o)) + (await balOf(sy));
    const kk = await register(c, o, newDevice(), c.STAKE, 10); await misuse(c, sy, kk.dev);
    const n1 = (await balOf(o)) + (await balOf(sy)) - o0;
    const o1 = (await balOf(o)) + (await balOf(sy));
    const kw = await register(c, o, newDevice(), c.STAKE, 10);
    await c.pap.connect(o).requestUnbond(kw.dev.keyId); await warp(c.UNBOND); await c.pap.connect(o).withdraw(kw.dev.keyId); await misuse(c, sy, kw.dev);
    const n2 = (await balOf(o)) + (await balOf(sy)) - o1;
    assert(n1 < 0n && n2 < 0n);
    line("level-1 self-revocation", "LOSES", `plain ${F(n1)} ETH; after withdrawing first ${F(n2)} (bounty capped at the burned part = 0)`);
    // exhaustion
    const paid = [];
    for (let i = 0; i < 9; i++) { const x = await register(c, o, newDevice(), c.STAKE, 10); const b = (await c.pap.issuer(iss.address)).bond; await misuse(c, s[6], x.dev); paid.push(F(b - (await c.pap.issuer(iss.address)).bond)); }
    line("issuer bond exhausted", "AS DESIGNED", `bounties ${paid.join(", ")}; active ${await c.pap.issuerActive(iss.address)}`);
    // self-made issuer
    await newIssuer(c, 13); const sk = await register(c, s[13], newDevice(), c.STAKE, 13); await attest(c, s[13], sk.dev, h("self"));
    const v = await c.pap.verify(h("self"), sk.dev.keyId);
    line("anyone can be an issuer for 1 ETH", "SUCCEEDS on-chain (stated limit)", `level ${v.level}; a verifier must bring its own list of trusted issuers`);
  });
});

after(async () => {
  console.log("\n      GAS Core (gasUsed, optimizer 200 runs, hardfork osaka)");
  for (const [k, g] of Object.entries(gasLog)) console.log(`        ${k.padEnd(42)} ${g}`);
});
