const { network } = require("hardhat"); const P = "0x0000000000000000000000000000000000000100"; const call = (data) => network.provider.request({ method: "eth_call", params: [{ to: P, data }, "latest"] });
const crypto = require("crypto");
(async () => {
  const { privateKey, publicKey } = crypto.generateKeyPairSync("ec", { namedCurve: "P-256" });
  const msg = crypto.randomBytes(32);
  const h = crypto.createHash("sha256").update(msg).digest();
  const sig = crypto.sign("sha256", msg, { key: privateKey, dsaEncoding: "ieee-p1363" });
  const jwk = publicKey.export({ format: "jwk" });
  const x = Buffer.from(jwk.x, "base64url"), y = Buffer.from(jwk.y, "base64url");
  const input = "0x" + Buffer.concat([h, sig, x, y]).toString("hex");
  const out = await call(input);
  const bad = await call(input.slice(0, -2) + "00");
  const gas = BigInt(await network.provider.request({ method: "eth_estimateGas", params: [{ to: P, data: input }] }));
  console.log("hardfork", network.config.hardfork, "valid ->", out, "| tampered ->", bad, "| gas(estimate incl. 21000 base)", gas.toString());
})().catch(e => { console.error("ERR", e.message.split("\n")[0]); process.exit(1); });
