# Paprika with MetaMask: setup for the demo

The demo uses one browser window and MetaMask. Alice (the photographer) and Bob (the accuser) are two MetaMask
accounts. The presenter switches between them in MetaMask.

## 1. Install MetaMask

1. Install the MetaMask extension in Chrome or Firefox (metamask.io).
2. Create a wallet, or open the one you have. Use a separate browser profile for the demo if you also use MetaMask
   for real money.

## 2. Open the app

1. Start Paprika on the demo machine: `cd app && npm start`.
2. From another computer, open an SSH tunnel and keep it open:
   `ssh -N -L 5173:127.0.0.1:5173 <user>@<demo-machine>`
3. Open `http://localhost:5173`. Use `localhost`: the browser allows the camera and the device key only on
   `localhost` or `https`.

## 3. Connect and add the network

1. Click **Connect MetaMask**.
2. MetaMask asks to add the network **Paprika local** (chain id 31337, RPC `http://localhost:5173/rpc`, currency ETH).
   Approve it, then approve the switch.
3. If MetaMask is on another network later, the app shows **Switch to Paprika local**. Click it.

## 4. Import the two demo accounts

These are Hardhat's well-known test keys. Everybody knows them. **Never use them on a real network.**

| Name | Hardhat account | Private key |
|---|---|---|
| Alice | #1 | `0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d` |
| Bob | #2 | `0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a` |

1. In MetaMask: account menu > **Add account or hardware wallet** > **Import account**. Paste Alice's key.
2. Rename the account to **Alice**. Do the same for Bob.
3. Each account holds 10,000 test ETH from the start of the chain. Test ETH has no value.

The app shows "Alice" or "Bob" next to these two addresses.

## 5. Prepare each account (once)

1. Select Alice in MetaMask. In the app, open the account menu and click **Prepare account**.
2. Read the amounts and confirm. MetaMask asks for two signatures: wrap ETH into WETH, and allow Paprika to take WETH.
3. Select Bob and do the same.

After this, each attest and each accusation needs one signature.

## 6. After a chain restart

A restarted local chain starts again at block 0. MetaMask still remembers the old transaction count, so the next
transaction fails with a "nonce" error. Fix it for each account:

MetaMask > **Settings** > **Advanced** > **Clear activity tab data**.

Then try again. The app says the same thing when this error happens.
