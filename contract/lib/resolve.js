/**
 * Play UMA's DVM vote on MockOracleAncillary for a disputed OOv3 assertion, then settle it.
 *
 * On dispute, OOv3 calls oracle.requestPrice(assertion.identifier, assertion.assertionTime,
 * stampAssertion(assertionId)). The mock keys the request on exactly that triple, so we rebuild it from OOv3's
 * own view functions (no event scraping) and cross-check it against the mock's pending queries.
 * OOv3 treats price == 1e18 (numericalTrue) as "assertion true"; anything else is false (0 is used here).
 */
const NUMERICAL_TRUE = 10n ** 18n;

async function resolveDispute(uma, assertionId, truthful) {
  const { oo, mockOracle } = uma;
  const a = await oo.getAssertion(assertionId);
  if (a.disputer === "0x0000000000000000000000000000000000000000") throw new Error("assertion is not disputed");
  const identifier = a.identifier;
  const time = a.assertionTime;
  const ancillaryData = await oo.stampAssertion(assertionId);

  const pending = await mockOracle.getPendingQueries();
  const match = pending.find((q) => q.identifier === identifier && q.time === time && q.ancillaryData === ancillaryData);
  if (!match) throw new Error("no matching pending request on MockOracleAncillary");

  const price = truthful ? NUMERICAL_TRUE : 0n;
  const pushReceipt = await (await mockOracle.pushPrice(identifier, time, ancillaryData, price)).wait();
  const settleReceipt = await (await oo.settleAssertion(assertionId)).wait();
  return { identifier, time, ancillaryData, price, pushReceipt, settleReceipt };
}

module.exports = { resolveDispute, NUMERICAL_TRUE };
