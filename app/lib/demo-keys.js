// Paprika demo keys: NODE ONLY (the CLI and app/server.js). Never served to the browser (server.js blocks it).
//
// The local Hardhat chain pre-funds the accounts of its public default mnemonic "test test ... junk". The demo uses
// three kinds of them, all third parties to the user, never the user's own wallet:
//   operator = index 0: deployed the contracts; gives test ETH (faucet); calls OOv3.settleAssertion after a vote;
//   voters   = the indices whose addresses the deployment lists (3, 4, 5): UMA token holders who vote in VotingV2.
// These wallets sign locally (eth_sendRawTransaction). No unlocked account is used.
import { ethers } from "ethers";

export const HARDHAT_MNEMONIC = "test test test test test test test test test test test junk";

/** Wallet of Hardhat's default mnemonic at index i (path m/44'/60'/0'/0/i), connected to provider if given. */
export function hardhatWallet(i, provider) {
  const w = ethers.HDNodeWallet.fromPhrase(HARDHAT_MNEMONIC, undefined, `m/44'/60'/0'/0/${i}`);
  return provider ? w.connect(provider) : w;
}

/**
 * The demo keys for a deployment: { operator: Wallet, voters: [Wallet] }, voters in the order of deployment.voters.
 * Pass the result to connect({ ..., demoKeys }) to run the demo controls directly (no server).
 */
export function demoKeys(deployment) {
  const byAddress = new Map();
  for (let i = 0; i < 20; i++) { const w = hardhatWallet(i); byAddress.set(w.address.toLowerCase(), w); }
  const operator = byAddress.get(String(deployment.accounts?.operator || hardhatWallet(0).address).toLowerCase());
  const voters = (deployment.voters || []).map((a) => {
    const w = byAddress.get(String(a).toLowerCase());
    if (!w) throw new Error(`voter ${a} is not one of Hardhat's default accounts`);
    return w;
  });
  if (!operator) throw new Error("the operator is not one of Hardhat's default accounts");
  return { operator, voters };
}
