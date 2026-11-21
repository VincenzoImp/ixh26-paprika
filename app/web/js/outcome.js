// Paprika web app: the money an accusation moved, measured on chain, next to the rule (for the Protocol view).
// A snapshot of the accuser, the depositor and UMA's Store is taken just before the commit (wallet WETH + credit in
// Paprika, + the locked deposit for the depositor); after the vote the same reads give the measured change.

import { S } from "./state.js";
import { big, same } from "../util.js";

// Wallet WETH + credit of an address.
async function holding(address) {
  if (!address) return 0n;
  const [w, c] = await Promise.all([S.ctx.contracts.token.balanceOf(address), S.lib.credits(S.ctx, address)]);
  return big(w) + big(c);
}

// Snapshot before a commit: accuser (this account), the record's depositor, UMA's Store.
export async function snapshot(photoHash, keyId) {
  const rec = (await S.lib.verifyPhoto(S.ctx, photoHash)).find((r) => same(r.keyId, keyId));
  const depositor = rec?.depositor || "";
  return { accuserAddr: S.account.address, depositorAddr: depositor,
    accuser: await holding(S.account.address), depositor: (await holding(depositor)) + big(rec?.depositLocked ?? 0),
    store: big(await S.ctx.contracts.token.balanceOf(S.ctx.addresses.store)) };
}

// The rule check for an accusation of this browser that was just decided, or null if no snapshot exists.
export async function measuredOutcome(assertionId, fake) {
  const acc = S.accusations.find((a) => same(a.assertionId, assertionId));
  const B = big(S.ctx.params.bond);
  const fB = (B * BigInt(Math.round(Number(S.ctx.params.feeShare) * 1e9))) / 1000000000n;
  const expected = { accuser: fake ? B - fB : -B, depositor: fake ? -B : B - fB, store: fB };
  const mine = acc && Object.values(S.mine).find((m) => same(m.photoHash, acc.photoHash) && same(m.keyId, acc.keyId) && m.before);
  if (!mine) return { fake, expected, measured: null };
  const b = mine.before;
  const rec = (await S.lib.verifyPhoto(S.ctx, acc.photoHash)).find((r) => same(r.keyId, acc.keyId));
  const after = { accuser: await holding(b.accuserAddr), depositor: (await holding(b.depositorAddr)) + big(rec?.depositLocked ?? 0),
    store: big(await S.ctx.contracts.token.balanceOf(S.ctx.addresses.store)) };
  const wrapped = big(mine.wrapped ?? 0);
  return { fake, expected, measured: { accuser: after.accuser - b.accuser - wrapped, depositor: after.depositor - b.depositor, store: after.store - b.store } };
}
