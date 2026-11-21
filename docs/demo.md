# Paprika: the demo

The demo runs Paprika on a local Ethereum chain, with UMA's oracle and UMA's vote deployed from UMA's published
contracts. Money is WETH (wrapped ETH, an ERC-20 token). Terms are defined in [protocol.md](protocol.md).

## Setup

1. Start the system on the demo machine (Node.js 26 or later):

   ```bash
   cd app && npm install && npm start
   ```

2. From the presenting computer, open an SSH tunnel and keep it open:

   ```bash
   ssh -N -L 5173:127.0.0.1:5173 <user>@<demo-machine>
   ```

3. Open `http://localhost:5173`. The browser allows the camera and the device key only on `localhost` or `https`.
4. Set the browser zoom to 125%.
5. Set up MetaMask as in [`app/web/METAMASK.md`](../app/web/METAMASK.md):
   - add the network **Paprika local** (chain id 31337, RPC `http://localhost:5173/rpc`);
   - import the two demo accounts, Alice (Hardhat account #1) and Bob (#2);
   - prepare Alice's account once (wrap ETH into WETH and allow Paprika to take WETH).

## Live demo

| Step | Action | What the audience sees |
|---|---|---|
| 1 | Connect MetaMask (Alice) | The account, its ETH and WETH |
| 2 | Take a selfie | The camera still that the device key will sign |
| 3 | Sign & attest | One MetaMask confirmation. The device signs the photo hash with a recent block hash. The record is on the chain with deposit `B` |
| 4 | Verify | The photo is attested: signed between block `a` and block `r`, with the deposit at stake |
| 5 (optional) | Change one pixel and verify again | No record: the photo hash differs |

## Local setup

- Three local accounts stake UMA's voting tokens and cast the votes.
- The local chain's clock moves forward to reach each vote phase and the end of the challenge period.
- The device key is made in the browser at run time.

## Tests

| Command | What it runs |
|---|---|
| `cd contract && npx hardhat test` | The contract integration tests, with UMA's oracle, UMA's vote and WETH |
| `cd app && npm run e2e` | The end-to-end browser test of the whole story |
| `cd app && npm run e2e:edge` | The edge-case browser test |
| `cd app && npm run demo:cli` | The demo story in the terminal, with checks (needs a running, deployed chain) |

The browser tests use Playwright. A new machine needs `npx playwright install chromium` once, in `app/`.
The command-line tools and parameters are described in [`app/README.md`](../app/README.md).
