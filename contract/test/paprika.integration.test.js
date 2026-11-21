// Paprika integration tests, on the in-process Hardhat chain (hardfork osaka), against the real contracts it depends
// on, all deployed from UMA's published artifacts (@uma/contracts-node, see lib/deploy-uma-dvm.js): Finder, Store,
// whitelists, Registry, OptimisticOracleV3, the DVM VotingV2 with its VotingToken (3 voters, accounts 10-12, stake
// and vote by commit/reveal; lib/vote.js), and WETH9 as the bond currency (accounts wrap ETH). Nothing is replaced.
// Each test prints `CASE <name>: <what happened> | <numbers>`: amounts are in WETH, written as a formula of BOND and
// fee = burnedBondPercentage x BOND, then the measured value. `BAL` lines show WETH balances at each step.
// After every test: Paprika's balance == BOND x Attested records + BOND x unrevealed commitments + credits, and the
// oracle holds 2 x BOND per open accusation.
const assert = require("assert");
const crypto = require("crypto");
const hre = require("hardhat");
const { ethers, network } = hre;
const { deployUmaWithVoting } = require("../lib/deploy-uma-dvm");
const { resolveByVote } = require("../lib/vote");

// PHASE_LENGTH: UMA vote phase (commit, reveal) in seconds; a vote moves the clock 2 to 4 phases. The windows are
// kept well above one vote so that a commitment made before a vote can still be revealed after it (case 5).
const PHASE = Number(process.env.PHASE_LENGTH || 60);
const P = { FINAL_FEE: ethers.parseEther("0.5"), WINDOW: Math.max(7 * 86400, 20 * PHASE), REVEAL: Math.max(3600, 5 * PHASE), LIVENESS: 7200 };
const N_P256 = 0xffffffff00000000ffffffffffffffffbce6faada7179e84f3b9cac2fc632551n;
const F = (x) => ethers.formatEther(x);
const h = (s) => ethers.sha256(ethers.toUtf8Bytes(s));
const ST = ["None", "Attested", "Accused", "Refunded", "Fake"];
const CASE = (name, what, nums) => console.log(`      CASE ${name}: ${what} | ${nums}`);
const gasLog = {};
const mine = () => network.provider.send("hardhat_mine", ["0x1"]);
const later = async (sec) => { await network.provider.send("evm_increaseTime", [sec]); await mine(); };
const warpTo = async (ts) => { await network.provider.send("evm_setNextBlockTimestamp", [Number(ts)]); await mine(); };
const send = async (p) => (await p).wait();
async function rv(p, reason) {
  try { await send(p); } catch (e) { assert(String(e.message).includes(reason), `expected "${reason}", got: ${String(e.message).slice(0, 200)}`); return reason; }
  throw new Error("expected revert: " + reason);
}

function newDevice() {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = "0x" + Buffer.from(jwk.x, "base64url").toString("hex"), y = "0x" + Buffer.from(jwk.y, "base64url").toString("hex");
  const sign = (pre) => {
    const g = "0x" + crypto.sign("sha256", ethers.getBytes(pre), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("hex");
    const sv = BigInt("0x" + g.slice(66));
    return sv > N_P256 / 2n ? g.slice(0, 66) + (N_P256 - sv).toString(16).padStart(64, "0") : g;   // low-s form
  };
  return { x, y, keyId: ethers.sha256(ethers.concat([x, y])), sign };
}
const highS = (sig) => sig.slice(0, 66) + (N_P256 - BigInt("0x" + sig.slice(66))).toString(16).padStart(64, "0");
const named = (label) => (c, keyId, who) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "address"], [label, c.chainId, c.addr, keyId, who]);
const msgReg = named("PAPRIKA/REGISTER"), msgRev = named("PAPRIKA/REVOKE");
const msgCap = (c, keyId, photo, bh) => ethers.solidityPacked(["string", "uint256", "address", "bytes32", "bytes32", "bytes32"], ["PAPRIKA/CAPTURE", c.chainId, c.addr, keyId, photo, bh]);
const commitmentOf = (who, photo, keyId, ev, salt) => ethers.keccak256(ethers.AbiCoder.defaultAbiCoder().encode(["address", "bytes32", "bytes32", "bytes32", "bytes32"], [who, photo, keyId, ev, salt]));

// The real vote: the 3 voters commit and reveal in VotingV2, then OOv3.settleAssertion. Returns the settle receipt.
async function vote(c, id, truthful) {
  const res = await resolveByVote(c.uma, hre, id, truthful, undefined, { log: () => {} });
  assert(res.settled, `vote did not settle: ${res.settleError}`);
  gasLog["VotingV2.commitVote (max of 3)"] = [...res.commits.map((x) => x.gasUsed), gasLog["VotingV2.commitVote (max of 3)"] || 0n].reduce((a, b) => (a > b ? a : b));
  gasLog["VotingV2.revealVote (max of 3)"] = [...res.reveals.map((x) => x.gasUsed), gasLog["VotingV2.revealVote (max of 3)"] || 0n].reduce((a, b) => (a > b ? a : b));
  console.log(`      VOTE ${truthful ? "TRUE (fake proven)" : "FALSE (rejected)"}: round ${res.roundId}, 3 commits + 3 reveals + settle, ${res.simulatedSeconds} s of chain time`);
  return { res, settleReceipt: await ethers.provider.getTransactionReceipt(res.settle.hash) };
}

describe("Paprika with real UMA (OOv3 + VotingV2) and WETH9", function () {
  let c, s;
  before(async () => {
    s = await ethers.getSigners();
    const uma = await deployUmaWithVoting(hre, {
      finalFee: P.FINAL_FEE, liveness: P.LIVENESS, phaseLength: PHASE, voters: s.slice(10, 13), currency: "WETH9",
    });
    const BOND = uma.minimumBond;   // the smallest bond UMA accepts for WETH
    const oo = await uma.oo.getAddress(), token = uma.currency;
    const pap = await (await ethers.getContractFactory("Paprika", s[0])).deploy(oo, await token.getAddress(), BOND, P.WINDOW, P.REVEAL, P.LIVENESS);
    const addr = await pap.getAddress();
    gasLog["deploy Paprika"] = (await pap.deploymentTransaction().wait()).gasUsed;
    // Every test account wraps ETH into WETH (WETH9.deposit) and approves Paprika.
    for (const a of s.slice(1, 10)) { await send(token.connect(a).deposit({ value: 20n * BOND })); await send(token.connect(a).approve(addr, ethers.MaxUint256)); }
    const fee = (BOND * (await uma.oo.burnedBondPercentage())) / 10n ** 18n;
    c = { uma, pap, addr, token, oo, store: await uma.store.getAddress(), BOND, fee, payout: 2n * BOND - fee, chainId: (await ethers.provider.getNetwork()).chainId, fromBlock: await ethers.provider.getBlockNumber() };
    console.log(`      real UMA stack: OOv3 ${oo}, VotingV2 ${await uma.voting.getAddress()} (phase ${PHASE} s, 3 voters x ${F(uma.params.stakePerVoter)} UMA staked, GAT ${F(uma.params.gat)}, SPAT ${F(uma.params.spat)}), Store ${c.store}, WETH9 ${await token.getAddress()}`);
    console.log(`      identifier ${ethers.decodeBytes32String(await pap.identifier())}, minimum bond ${F(BOND)} WETH = BOND, burnedBondPercentage ${F(await uma.oo.burnedBondPercentage())}, fee ${F(fee)}; PHOTO_WINDOW ${P.WINDOW} s, REVEAL_WINDOW ${P.REVEAL} s`);
  });
  afterEach(async () => {
    const logs = await c.pap.queryFilter("*", c.fromBlock);
    let deposits = 0n, bonds = 0n, credits = 0n, open = 0n; const who = new Set(), seen = new Set();
    for (const l of logs) {
      const a = l.args, key = l.eventName + (a.length > 0 ? a[0] : "") + (a.length > 1 ? a[1] : "");
      if (seen.has(key)) continue; seen.add(key);
      if (l.eventName === "Attested" && (await c.pap.records(a.photoHash, a.keyId)).state === 1n) deposits += c.BOND;
      if (l.eventName === "Committed" && (await c.pap.commits(a.commitment)).live) bonds += c.BOND;
      if (l.eventName === "AccusationOpened" && (await c.pap.accusations(a.assertionId)).open) open++;
      if (l.eventName === "Credited") who.add(a.account);
    }
    for (const a of who) credits += await c.pap.credits(a);
    const bal = await c.token.balanceOf(c.addr);
    assert.equal(bal, deposits + bonds + credits, "INVARIANT Paprika balance");
    assert.equal(await c.token.balanceOf(c.oo), 2n * c.BOND * open, "INVARIANT oracle holds 2 x BOND per open accusation");
    console.log(`      invariant ok: Paprika holds ${F(bal)} = deposits ${F(deposits)} + commit bonds ${F(bonds)} + credits ${F(credits)}; oracle ${F(2n * c.BOND * open)} for ${open} open`);
  });

  // Records the gas of the first transaction of each kind (the transaction is always sent).
const firstGas = (k, r) => { gasLog[k] ??= r.gasUsed; return r; };
const reg = async (who, dev = newDevice()) => { firstGas("register", await send(c.pap.connect(who).register(dev.x, dev.y, dev.sign(msgReg(c, dev.keyId, who.address))))); return dev; };
  async function attest(who, dev, photo) {
    const b = await ethers.provider.getBlock("latest");
    const sig = dev.sign(msgCap(c, dev.keyId, photo, b.hash));
    firstGas("attest (P-256 verify + WETH transferFrom)", await send(c.pap.connect(who).attest(photo, b.number, dev.keyId, sig)));
    return { sig, anchor: b.number, v: await c.pap.verify(photo, dev.keyId) };
  }
  async function commit(who, photo, keyId, ev = h("evidence")) {
    const salt = ethers.hexlify(ethers.randomBytes(32)), cm = commitmentOf(who.address, photo, keyId, ev, salt);
    firstGas("commitClaim", await send(c.pap.connect(who).commitClaim(cm)));
    return { who, photo, keyId, ev, salt, cm };
  }
  async function reveal(k) {
    const r = await send(c.pap.connect(k.who).revealClaim(k.photo, k.keyId, k.ev, k.salt));
    const e = r.logs.map((l) => { try { return c.pap.interface.parseLog(l); } catch { return null; } }).find((x) => x && x.name === "AccusationOpened");
    return { r, id: e ? e.args.assertionId : null };
  }
  const val = async (a) => (await c.token.balanceOf(a.address)) + (await c.pap.credits(a.address));
  async function bal(label, parties) {
    const parts = [];
    for (const [n, a] of Object.entries(parties)) parts.push(`${n} ${F(await c.token.balanceOf(a.address))}${(await c.pap.credits(a.address)) ? ` (+credit ${F(await c.pap.credits(a.address))})` : ""}`);
    parts.push(`Paprika ${F(await c.token.balanceOf(c.addr))}`, `oracle ${F(await c.token.balanceOf(c.oo))}`, `Store ${F(await c.token.balanceOf(c.store))}`);
    console.log(`      BAL ${label.padEnd(24)} ${parts.join(" | ")}`);
  }

  it("1 honest path with refund", async () => {
    const owner = s[1], relayer = s[2];
    const v0 = await val(relayer);
    const dev = await reg(owner);
    const a = await attest(relayer, dev, h("i1"));
    await rv(c.pap.refund(h("i1"), dev.keyId), "too early");
    await warpTo(a.v.refundableAt);
    gasLog["refund"] = (await send(c.pap.refund(h("i1"), dev.keyId))).gasUsed;
    gasLog["withdrawCredit"] = (await send(c.pap.connect(relayer).withdrawCredit())).gasUsed;
    const v = await c.pap.verify(h("i1"), dev.keyId);
    assert.equal(v.state, 3n); assert.equal(await val(relayer), v0);
    CASE("honest path (UMA vote)", `register free, relayer attests and locks BOND, refund after PHOTO_WINDOW + REVEAL_WINDOW; record stays (${ST[v.state]}, recordedBlock ${v.recordedBlock})`, `relayer locked BOND = ${F(c.BOND)} and got it back, net 0`);
  });

  it("2 one pixel changed", async () => {
    const dev = await reg(s[1]); await attest(s[1], dev, h("i2"));
    const v = await c.pap.verify(h("i2 one pixel changed"), dev.keyId);
    assert.equal(v.state, 0n); assert.equal((await c.pap.attestersOf(h("i2 one pixel changed"))).length, 0);
    assert.deepEqual([...(await c.pap.attestersOf(h("i2")))], [dev.keyId]);
    CASE("one pixel changed (UMA vote)", "attestersOf(modified hash) = [], verify finds no record", `state ${ST[v.state]}, recordedBlock ${v.recordedBlock}`);
  });

  it("3 true accusation: commit, reveal (assert + dispute at the real oracle), vote TRUE, settle", async () => {
    const forger = s[3], hunter = s[4], P2 = { depositor: forger, accuser: hunter };
    const f0 = await val(forger), h0 = await val(hunter), st0 = await c.token.balanceOf(c.store);
    await bal("start", P2);
    const dev = await reg(forger); await attest(forger, dev, h("i3 fake"));
    await bal("after attest", P2);
    const k = await commit(hunter, h("i3 fake"), dev.keyId);
    const x = await reveal(k); gasLog["revealClaim (OOv3 assertTruth + disputeAssertion + VotingV2.requestPrice)"] = x.r.gasUsed;
    await bal("after reveal (accused)", P2);
    assert.equal((await c.pap.verify(h("i3 fake"), dev.keyId)).state, 2n);
    const res = await vote(c, x.id, true);   // UMA's DVM votes TRUE, then oo.settleAssertion
    gasLog["oo.settleAssertion -> Paprika callback (TRUE)"] = res.settleReceipt.gasUsed;
    await bal("after settle (TRUE)", P2);
    const v = await c.pap.verify(h("i3 fake"), dev.keyId);
    assert.equal(v.state, 4n); assert.equal(v.deviceStatus, 2n); assert.equal(v.reason, 1n);
    assert.equal(await val(hunter) - h0, c.payout - c.BOND); assert.equal(await val(forger) - f0, -c.BOND);
    assert.equal((await c.token.balanceOf(c.store)) - st0, c.fee);
    CASE("true accusation (UMA vote)", `photo ${ST[v.state]}, device Flagged (FakeProven) at block ${v.flaggedAtBlock}`, `accuser credited 2 x BOND - fee = ${F(c.payout)} (net +BOND - fee = ${F(c.payout - c.BOND)}); depositor -BOND = ${F(-c.BOND)}; Store +fee = ${F(c.fee)}`);
  });

  it("4 false accusation: vote FALSE, deposit restored, window extended", async () => {
    const owner = s[5], griefer = s[6], P2 = { depositor: owner, accuser: griefer };
    const o0 = await val(owner), g0 = await val(griefer), st0 = await c.token.balanceOf(c.store);
    const dev = await reg(owner); const a = await attest(owner, dev, h("i4"));
    const k = await commit(griefer, h("i4"), dev.keyId); const x = await reveal(k);
    await bal("after reveal (accused)", P2);
    const opened = Number((await c.pap.accusations(x.id)).openedAt);
    const res = await vote(c, x.id, false);
    gasLog["oo.settleAssertion -> Paprika callback (FALSE)"] = res.settleReceipt.gasUsed;
    await bal("after settle (FALSE)", P2);
    const tRes = (await ethers.provider.getBlock(res.settleReceipt.blockNumber)).timestamp;
    const v = await c.pap.verify(h("i4"), dev.keyId);
    assert.equal(v.state, 1n); assert.equal(v.deviceStatus, 1n); assert.equal(Number(v.accusableUntil), Number(a.v.accusableUntil) + (tRes - opened));
    await warpTo(v.refundableAt); await send(c.pap.refund(h("i4"), dev.keyId));
    assert.equal(await val(owner) - o0, c.payout - c.BOND); assert.equal(await val(griefer) - g0, -c.BOND);
    assert.equal((await c.token.balanceOf(c.store)) - st0, c.fee);
    CASE("false accusation (UMA vote)", `record back to ${ST[v.state]}, device untouched, window extended by the ${tRes - opened} s under accusation; refund afterwards`, `accuser -BOND = ${F(-c.BOND)}; depositor +BOND - fee = ${F(c.payout - c.BOND)} (deposit returned); Store +fee = ${F(c.fee)}`);
  });

  it("5 second accusation while one is open", async () => {
    const owner = s[1], A = s[7], B = s[8];
    const dev = await reg(owner); await attest(owner, dev, h("i5"));
    const xA = await reveal(await commit(A, h("i5"), dev.keyId));
    const kB = await commit(B, h("i5"), dev.keyId);
    const r1 = await rv(c.pap.connect(B).revealClaim(kB.photo, kB.keyId, kB.ev, kB.salt), "accusation open");
    await vote(c, xA.id, false);
    const xB = await reveal(kB);
    assert(xB.id);
    await vote(c, xB.id, true);
    CASE("second accusation while one is open (UMA vote)", `B's reveal: "${r1}"; after A is voted false (the vote moved the clock, B's commitment is still inside REVEAL_WINDOW), B reveals the same commitment and is voted true`, `photo ${ST[(await c.pap.verify(h("i5"), dev.keyId)).state]}`);
  });

  it("6 self-accusation loses the oracle fee", async () => {
    const forger = s[3], sybil = s[9];
    const t0 = (await val(forger)) + (await val(sybil));
    const dev = await reg(forger); await attest(forger, dev, h("i6"));
    const x = await reveal(await commit(sybil, h("i6"), dev.keyId));
    await vote(c, x.id, true);
    const net = (await val(forger)) + (await val(sybil)) - t0;
    assert.equal(net, -c.fee);
    CASE("self-accusation (UMA vote)", "the forger's second account accuses and wins", `net -fee = ${F(net)}`);
  });

  it("7 key revocation", async () => {
    const owner = s[1], holder = s[2], other = s[8];
    const dev = await reg(owner); const a = await attest(owner, dev, h("i7"));
    const sig = dev.sign(msgRev(c, dev.keyId, holder.address));
    const r1 = await rv(c.pap.connect(other).revokeKey(dev.keyId, sig), "bad sig");
    gasLog["revokeKey"] = (await send(c.pap.connect(holder).revokeKey(dev.keyId, sig))).gasUsed;
    const b = await ethers.provider.getBlock("latest");
    const r2 = await rv(c.pap.connect(owner).attest(h("i7b"), b.number, dev.keyId, dev.sign(msgCap(c, dev.keyId, h("i7b"), b.hash))), "not active");
    const v = await c.pap.verify(h("i7"), dev.keyId);
    assert.equal(v.reason, 2n); assert.equal(v.state, 1n);
    await warpTo(a.v.refundableAt); await send(c.pap.refund(h("i7"), dev.keyId));
    CASE("key revocation (UMA vote)", `revocation copied by another address: "${r1}"; holder revokes; revoked device attests: "${r2}"; its record stays Attested and is refunded`, "no tokens move at revocation");
  });

  it("8 signature and replay checks", async () => {
    const o = s[1];
    const A = await reg(o), B = await reg(o);
    const a = await attest(o, A, h("i8"));
    const b = await ethers.provider.getBlock("latest");
    const R = {
      replay: await rv(c.pap.connect(o).attest(h("i8"), a.anchor, A.keyId, a.sig), "exists"),
      otherKey: await rv(c.pap.connect(o).attest(h("q"), b.number, A.keyId, B.sign(msgCap(c, B.keyId, h("q"), b.hash))), "bad sig"),
      otherChain: await rv(c.pap.connect(o).attest(h("q"), b.number, A.keyId, A.sign(msgCap({ ...c, chainId: 1n }, A.keyId, h("q"), b.hash))), "bad sig"),
      highS: await rv(c.pap.connect(o).attest(h("q"), b.number, A.keyId, highS(A.sign(msgCap(c, A.keyId, h("q"), b.hash)))), "bad sig"),
      futureAnchor: await rv(c.pap.connect(o).attest(h("q"), b.number + 5, A.keyId, A.sign(msgCap(c, A.keyId, h("q"), ethers.ZeroHash))), "anchor"),
      popAsCapture: await rv(c.pap.connect(o).attest(h("q"), b.number, A.keyId, A.sign(msgReg(c, A.keyId, o.address))), "bad sig"),
      keyUsed: await rv(c.pap.connect(o).register(A.x, A.y, A.sign(msgReg(c, A.keyId, o.address))), "key used"),
      callbackNotOracle: await rv(c.pap.connect(o).assertionResolvedCallback(h("x"), true), "only oracle"),
    };
    // Proof of possession names the sender: someone copying a pending register() from the mempool gets "bad sig".
    const C = newDevice();
    R.popFrontRun = await rv(c.pap.connect(s[2]).register(C.x, C.y, C.sign(msgReg(c, C.keyId, o.address))), "bad sig");
    // A commitment binds the claimant: another account cannot reveal it, nor reuse it.
    const k = await commit(s[2], h("i8"), A.keyId);
    R.revealByOther = await rv(c.pap.connect(s[3]).revealClaim(k.photo, k.keyId, k.ev, k.salt), "no commit");
    R.commitReused = await rv(c.pap.connect(s[2]).commitClaim(k.cm), "commitment used");
    // Not revealed in time: the reveal fails, anyone forfeits the bond to the burn address.
    await later(P.REVEAL + 1);
    R.tooLate = await rv(c.pap.connect(s[2]).revealClaim(k.photo, k.keyId, k.ev, k.salt), "too late");
    const burn0 = await c.token.balanceOf(await c.pap.BURN());
    await send(c.pap.forfeitCommit(k.cm));
    assert.equal((await c.token.balanceOf(await c.pap.BURN())) - burn0, c.BOND);
    CASE("signatures and replay (UMA vote)", Object.entries(R).map(([k, x]) => `${k}: "${x}"`).join("; "), "no tokens move, except the forfeited commit bond (BOND to the burn address)");
  });

  after(() => {
    console.log("\n      GAS with the real contracts (gasUsed; first occurrence)");
    for (const [k, g] of Object.entries(gasLog)) console.log(`        ${k.padEnd(58)} ${g}`);
  });
});
