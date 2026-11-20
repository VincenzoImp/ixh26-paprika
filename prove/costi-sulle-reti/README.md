# Su quali reti può girare, e quanto costa

**In breve (italiano).** Una verifica in sola lettura su 12 reti pubbliche: tutte hanno la
funzione che serve al contratto per controllare le firme dei dispositivi. Nessuna transazione è
stata inviata. La demo gira su una blockchain Ethereum locale; questi numeri servono solo a
stimare i costi su una rete vera.

Un'attestazione costa circa 0,00006 dollari sulla sidechain EVM di XRPL e circa 0,23 dollari su
Ethereum, ai prezzi del 20 novembre 2026. Il resto di questo file è in inglese.

---

# p05: On which real networks can Paprika v2 run today, and what does one attestation cost?

- **Question:** the Paprika v2 contract (`spec/PROTOCOL.md`) needs the P-256 precompile at `0x100`
  (EIP-7951 / RIP-7212), `blockhash` within 256 blocks, native-currency stakes, and optionally UMA
  Optimistic Oracle V3. Which networks support this today, and at what cost per photo?
- **Method:** read-only JSON-RPC against keyless public endpoints (`eth_chainId`,
  `eth_getBlockByNumber`, `eth_gasPrice`, `eth_feeHistory`, `eth_call`, `eth_estimateGas`,
  `eth_getCode`). For each network: a fresh P-256 key and ECDSA-SHA256 signature made with Node's
  `crypto` (input `hash ‖ r ‖ s ‖ x ‖ y`, 160 bytes, as in `p00`); `eth_call` to `0x100` with the
  valid input, with one bit of the hash flipped, and with the valid input to `0x…0123` (control).
  Block time = (timestamp(latest) − timestamp(latest−100)) / 100. UMA: `eth_getCode` at the OOv3
  addresses listed in `docs/research/adjudication-uma-and-alternatives.md`. Rollup L1 data fee:
  OP Stack `GasPriceOracle.getL1Fee(bytes)` at `0x42…0F`; Arbitrum
  `NodeInterface.gasEstimateL1Component` at `0x…C8` (random, incompressible calldata of ~330 B for
  attest, ~300 B for register, ~1,100 B for the ZK design: an approximation). Price: CoinGecko
  public API. **No transaction was sent on any network; no key was kept.**
- **Gas used for the cost table:** measured locally in `p03-paprika-v2-hardened/output/2026-11-20-run.txt`
  (Hardhat, hardfork osaka, optimizer 200): **attest 86,026**, **register 127,018** `[TEST, p03]`.
  Competing ZK design: 4.1M gas per attestation (figure given by the team, not measured here).
- **Command:** `node probe.mjs` (Node 26, standard library + global `fetch`, no dependencies).
- **Raw output:** `output/probe-2026-11-20T20-38-41-631Z.json` (everything), `output/console-20261120T203841Z.txt` (summary).
- **Run time:** 2026-11-20 20:38 UTC.

## 1. P-256 precompile support `[TEST]`

All 12 networks returned `0x…01` for the valid signature, `0x` for the tampered one and `0x` at the
control address. `eth_estimateGas` includes the 21,000 base cost and calldata.

| Network | chainId | RPC used | Block | valid → | tampered → | estimateGas |
|---|---|---|---|---|---|---|
| Ethereum | 1 | ethereum-rpc.publicnode.com | 26,458,745 | 1 | empty | 30,811 |
| Sepolia | 11155111 | ethereum-sepolia-rpc.publicnode.com | 12,177,462 | 1 | empty | 25,581 |
| XRPL EVM | 1440000 | rpc.xrplevm.org | 8,698,586 | 1 | empty | 27,310 |
| XRPL EVM testnet | 1449000 | rpc.testnet.xrplevm.org | 9,623,286 | 1 | empty | 27,370 |
| Base | 8453 | mainnet.base.org | 60,083,731 | 1 | empty | 30,811 |
| Optimism | 10 | mainnet.optimism.io | 159,804,172 | 1 | empty | 30,787 |
| Arbitrum One | 42161 | arb1.arbitrum.io/rpc | 526,038,500 | 1 | empty | 35,152 |
| Polygon PoS | 137 | polygon-bor-rpc.publicnode.com (polygon-rpc.com not reached first) | 97,667,769 | 1 | empty | 30,811 |
| Base Sepolia | 84532 | sepolia.base.org | 61,426,266 | 1 | empty | 30,811 |
| Arbitrum Sepolia | 421614 | sepolia-rollup.arbitrum.io/rpc | 331,157,902 | 1 | empty | 30,799 |
| Polygon Amoy | 80002 | polygon-amoy-bor-rpc.publicnode.com | 53,384,386 | 1 | empty | 30,787 |
| Avalanche C | 43114 | api.avax.network/ext/bc/C/rpc | 100,912,263 | 1 | empty | 30,811 |

The XRPL EVM result matches the earlier probe `crypto/experiments/e01-…` (27,370 gas, same day,
15:10 UTC). A read call proves the precompile answers; it does not prove a deployed contract works
there (needs a funded account).

## 2. UMA OptimisticOracleV3 presence `[TEST]`

| Network | OOv3 address | Code at address |
|---|---|---|
| Ethereum | 0xfb55F43f…C0dE | yes (18,038 B) |
| Sepolia | 0xFd9e2642…4944 | yes (17,837 B) |
| Base | 0x2aBf1Bd7…500c | yes (17,837 B) |
| Optimism | 0x072819Bb…803B | yes (18,038 B) |
| Arbitrum One | 0xa6147867…a879 | yes (18,038 B) |
| Polygon PoS | 0x5953f253…AD3D | yes (18,038 B) |
| Base Sepolia | 0x0F7fC5E6…8deE | yes (17,837 B) |
| Arbitrum Sepolia | 0x1037A21a…9b8 | yes (13,617 B) |
| Polygon Amoy | 0xd8866E76…ca80 | yes (17,837 B) |
| Avalanche C | 0xa4199d73…d47F | yes (18,038 B) |
| XRPL EVM / testnet | none listed | **no UMA deployment** (no `1440000`/`1449000` file in UMA's networks folder, per the earlier research doc `[SOURCE]` there) |

Code present means a contract is there; it was not checked that it is the current OOv3
implementation nor which oracle backs it on testnets (mock vs DVM).

## 3. Cost per operation `[TEST]` (gas price × measured gas + L1 data fee on rollups)

Price source: `https://api.coingecko.com/api/v3/simple/price?ids=ethereum,ripple,polygon-ecosystem-token,avalanche-2&vs_currencies=usd,eur`,
fetched 2026-11-20T20:38:43Z: ETH 1591.02 USD / 1451.10 EUR; XRP 0.8873 USD / 0.8093 EUR;
POL 0.0738 USD / 0.0674 EUR; AVAX 6.43 USD / 5.86 EUR. Testnet tokens have no price (fiat left blank).
Cost uses `eth_gasPrice` at that moment (a single sample; fees move).

| Network | gas price (gwei) | attest (native) | attest USD / EUR | register (native) | register USD / EUR | 4.1M-gas ZK attest (native) | ZK USD / EUR | block gas limit | attests/block | ZK attests/block |
|---|---|---|---|---|---|---|---|---|---|---|
| Ethereum | 1.64 | 1.41e-4 ETH | 0.225 / 0.205 | 2.09e-4 ETH | 0.332 / 0.303 | 0.00673 ETH | 10.7 / 9.77 | 60,000,000 | 697 | 14 |
| Sepolia | 1.4e-8 | 1.2e-12 ETH | – | 1.8e-12 ETH | – | 5.7e-11 ETH | – | 199,804,118 | 2,322 | 48 |
| XRPL EVM | 0.785 | 6.75e-5 XRP | 0.00006 / 0.000055 | 9.97e-5 XRP | 0.00009 / 0.00008 | 0.00322 XRP | 0.0029 / 0.0026 | 21,000,000 | 244 | 5 |
| XRPL EVM testnet | 0.785 | 6.75e-5 XRP | – | 9.97e-5 XRP | – | 0.00322 XRP | – | 21,000,000 | 244 | 5 |
| Base | 0.0060 | 5.7e-7 ETH | 0.00091 / 0.00083 | 8.1e-7 ETH | 0.0013 / 0.0012 | 2.5e-5 ETH | 0.040 / 0.036 | 40,000,000 | 464 | 9 |
| Optimism | 0.0012 | 1.8e-7 ETH | 0.00029 / 0.00026 | 2.2e-7 ETH | 0.00036 / 0.00033 | 5.1e-6 ETH | 0.0081 / 0.0074 | 40,000,000 | 464 | 9 |
| Arbitrum One | 0.0203 | 1.85e-6 ETH | 0.0029 / 0.0027 | 2.7e-6 ETH | 0.0043 / 0.0039 | 8.3e-5 ETH | 0.13 / 0.12 | 2^50 (nominal) | n/a | n/a |
| Polygon PoS | 275.7 | 0.0237 POL | 0.0018 / 0.0016 | 0.035 POL | 0.0026 / 0.0024 | 1.13 POL | 0.084 / 0.076 | 160,000,000 | 1,859 | 39 |
| Base Sepolia | 0.006 | 5.2e-7 ETH | – | 7.6e-7 ETH | – | 2.5e-5 ETH | – | 120,000,000 | 1,394 | 29 |
| Arbitrum Sepolia | 0.0201 | 1.7e-6 ETH | – | 2.6e-6 ETH | – | 8.2e-5 ETH | – | 2^50 (nominal) | n/a | n/a |
| Polygon Amoy | 60.2 | 0.0052 POL | – | 0.0077 POL | – | 0.247 POL | – | 140,000,000 | 1,627 | 34 |
| Avalanche C | 7.57 | 6.5e-4 AVAX | 0.0042 / 0.0038 | 9.6e-4 AVAX | 0.0062 / 0.0056 | 0.031 AVAX | 0.20 / 0.18 | 80,000,000 | 929 | 19 |

Notes: the stake itself (`MIN_STAKE`) is locked capital, not a fee, and is not in the table.
Arbitrum reports a nominal block gas limit of 2^50; its real throughput cap is a per-second "speed
limit", not measured here, so per-block figures are meaningless there. The ZK figure assumes the
same calldata cost as a ~1.1 kB transaction; a real proof may be larger. Ratio is fixed by gas:
one ZK attestation ≈ 48 Paprika attestations in execution gas everywhere.

## 4. `blockhash` window in wall-clock time `[TEST]` (256 × measured block time)

| Network | avg block time (last 100 blocks) | 256-block window |
|---|---|---|
| Ethereum | 12.12 s | 51.7 min |
| Sepolia | 14.04 s | 59.9 min |
| XRPL EVM | 5.74 s | 24.5 min |
| XRPL EVM testnet | 5.81 s | 24.8 min |
| Base | 0.20 s | **0.9 min (~51 s)** |
| Optimism | 2.00 s | 8.5 min |
| Arbitrum One | 0.25 s (L2 blocks) | 1.1 min by L2 timestamps; see caveat |
| Polygon PoS | 1.50 s | 6.4 min |
| Base Sepolia | 0.20 s | 0.9 min |
| Arbitrum Sepolia | 0.27 s | 1.2 min; see caveat |
| Polygon Amoy | 1.00 s | 4.3 min |
| Avalanche C | 0.79 s | 3.4 min |

Consequence: on Base (and Base Sepolia) a capture must be signed and landed within ~51 s of its
anchor block, which excludes offline capture and slow relayers. Caveat `[MEMORY]`, not checked today:
on Arbitrum, `block.number` inside the EVM returns an approximate L1 block number and
`blockhash` is documented as a pseudo-random value not meant for security; the anchor semantics
would need re-checking there before relying on it.

## 5. XRPL notes

Research done today (2026-11-20) by a helper agent with web fetch; quotes as returned. Items it
saw only in search snippets or secondary sources are marked `[MEMORY]` (unverified).

**XRPL EVM sidechain, what it is today**
- Chain IDs / RPC / explorers: mainnet 1440000, `https://rpc.xrplevm.org`, `https://explorer.xrplevm.org`;
  testnet 1449000, `https://rpc.testnet.xrplevm.org`, `https://explorer.testnet.xrplevm.org`
  `[SOURCE]` https://docs.xrplevm.org/pages/developers/interacting-with-evm/verify-the-smart-contract (table). Chain IDs also confirmed by `eth_chainId` `[TEST]`.
- Consensus: "Consensus and networking are powered by CometBFT (Tendermint BFT)"; it "has since
  migrated to Cosmos EVM" `[SOURCE]` https://docs.xrplevm.org/pages/users/introduction/what-is-the-xrplevm
- EVM level: "EVM Version: Prague"; "`solc` up to 0.8.30 out of the box" `[SOURCE]` same page.
  (Our p03 Hardhat run used hardfork osaka: compile with `evmVersion: prague` for this chain.)
- Validators: "A restricted set of entities authorized to produce blocks and participate in
  governance" `[SOURCE]` same page; "Proof of Authority governance with 15 active validators"
  `[SOURCE]` https://www.xrplevm.org/xrpl-evm-governance. Other sources say 25+ or 32 `[MEMORY]`: the count is uncertain.
  v11 (2026-07-01) blocks the standard validator-creation path after launch `[SOURCE]`
  https://www.xrplevm.org/blog/xrpl-evm-v11-stronger-security-safer-cross-chain-connectivity. **Block production is permissioned (PoA).**
- Contract deployment is permissionless: live chain params return
  `"create":{"access_type":"ACCESS_TYPE_PERMISSIONLESS"}` and the same for `call`
  (`https://cosmos-api.xrplevm.org/cosmos/evm/vm/v1/params`, read by the helper agent today; the docs do not say this).
- Gas token: "The XRPL EVM introduces XRP as native gas" `[SOURCE]` what-is page; 18 decimals on the
  EVM side (denom `axrp`), against 6 (drops) on the XRP Ledger (live denom metadata).
- Bridge: "XRP is bridged from the XRPL via Axelar, minted on the EVM sidechain" `[SOURCE]` what-is page.
  Trust therefore = PoA validator set + Axelar bridge.
- P-256: `active_static_precompiles` includes `0x…0100` (live params), and our probe got valid → 1,
  tampered → empty on both networks `[TEST]`. Cosmos EVM documents 0x100 as the P256 precompile
  `[SOURCE]` https://docs.cosmos.network/evm/latest/documentation/smart-contracts/precompiles/p256
- No UMA OOv3 deployment (section 2). The EVM staking precompile is reported as not enabled `[MEMORY]`:
  irrelevant to Paprika, which keeps stakes in its own contract.

**XRP Ledger mainnet (non-EVM): could it host the registry natively?**
Statuses from `[SOURCE]` https://xrpl.org/resources/known-amendments (page snapshot dated 2026-09-16):
- Escrow: "Enabled: 2017-03-31". TokenEscrow (XLS-85): "Enabled: 2026-02-12".
- Credentials (XLS-70): "Enabled: 2025-09-04". PermissionedDomains: "Enabled: 2026-02-04".
- Batch: original "Obsolete: Removed in 3.1.1"; BatchV1_1 "Expected: 2026-09-29" (activation not confirmed `[MEMORY]`).
- SmartEscrow (XLS-100, WASM): "In Development: TBD".
- Smart Contracts (XLS-101): spec status Draft, not on the amendments page `[SOURCE]` https://xls.xrpl.org/xls/XLS-0101-smart-contracts.html
- Hooks: not on the amendments page; they run on Xahau, a separate network ("Hooks (L1 smart
  contracts) enabled Xahau testnet", xrpl.org faucet page, snippet `[MEMORY]`).
- Signature algorithms: "The XRP Ledger supports the following cryptographic signing algorithms:"
  secp256k1 and ed25519 only, no secp256r1 `[SOURCE]` https://xrpl.org/docs/concepts/accounts/cryptographic-keys

What is missing on XRPL L1 (inference): stakes can be locked (Escrow) and devices can be labelled
(Credentials / PermissionedDomains), but there is no on-ledger code that can (a) verify a P-256 device
signature, (b) check a `blockhash`-style anchor, or (c) release an escrow to a challenger on
presentation of a proof. Slashing would need a trusted issuer/operator: exactly the trusted party
the protocol removes. It becomes possible only if a WASM smart-contract amendment (XLS-100/101)
ships with P-256 verification available.

## 6. Testnet path for a live demo (documented, not used)

| | Sepolia | XRPL EVM testnet |
|---|---|---|
| Faucet | Alchemy https://www.alchemy.com/faucets/ethereum-sepolia: "You can request 0.1 ETH every 24 hours", "No Alchemy account required", but "You need at least 0.001 ETH on Ethereum Mainnet" `[SOURCE]`. Google Cloud Web3 https://cloud.google.com/application/web3/faucet/ethereum/sepolia: Google account, ~0.05 ETH/request `[MEMORY]`. PoW faucet https://sepolia-faucet.pk910.de/: "requires some mining work to be done" `[SOURCE]`; no login or mainnet balance `[MEMORY]`. List of faucets: https://ethereum.org/en/developers/docs/networks/ `[SOURCE]` | https://faucet.xrplevm.org: "You can claim up to 90 XRP per request"; paste a 0x address or connect MetaMask `[SOURCE]` https://docs.xrplevm.org/pages/users/faucet. Cooldown, captcha and login not stated in the docs. Alternatives: Discord `!faucet` (50 XRP), Telegram @XrplEvmFaucetBot (up to 89 XRP) `[SOURCE]` same page |
| Explorer | https://sepolia.etherscan.io, https://eth-sepolia.blockscout.com/ | https://explorer.testnet.xrplevm.org |
| Cost of a full demo (register + 10 attests) | ~2e-11 ETH at today's 14 wei gas price | ~0.0008 XRP: a single faucet claim covers thousands of attests |
| P-256 / UMA | yes / yes (OOv3 present) | yes / no |
| blockhash window | ~60 min | ~25 min |

Plan B for both: Base Sepolia (P-256 yes, UMA yes), but its ~51 s blockhash window is tight.

## Recommendation

1. **Live demo tomorrow: XRPL EVM testnet** (P-256 at 0x100 works `[TEST]`, keyless faucet with 90 XRP per claim, 25-min blockhash window, fits the XRPL hackathon). Run the UMA path on local Hardhat with the mock oracle, because UMA is not deployed there. Keep Sepolia as the backup if the faucet or RPC fails; it has P-256 and OOv3, but the main faucets want a mainnet balance, a login, or PoW mining.
2. **Path-to-deployment slide:** XRPL EVM mainnet. An attest costs about 0.00007 XRP (< 0.0001 USD), against about 0.003 USD for the 4.1M-gas ZK design (48x more gas) and 0.23 USD on Ethereum L1. Say that the same contract runs unchanged on Ethereum, OP, Base, Arbitrum, Polygon and Avalanche, all of which answered at 0x100 today.
3. **XRPL fit, say plainly:** the contract runs on the XRPL EVM sidechain, a permissioned PoA chain (CometBFT, a restricted validator set) whose XRP comes over the Axelar bridge. It does not run on the XRP Ledger itself. XRPL L1 has escrow and credentials but no programmable slashing and no P-256 verification, so a native version waits for the WASM smart-contract amendments (still Draft or in development).
4. Caveat for the slide: the sidechain's trust model (PoA plus bridge) is weaker than Ethereum's. The record's guarantees are only as strong as the chain they sit on.
5. Avoid Base (and Base Sepolia) for this protocol unless the anchor rule changes: 256 blocks is only about 51 s there.

## Limits

- One sample per network, one public endpoint per network, at one moment (20:38 UTC). Gas prices,
  especially on Ethereum and Polygon, move by multiples within hours.
- Gas figures come from a local Hardhat run (`p03`); real networks may differ slightly (calldata
  pricing, cold storage). Rollup L1 fees use random calldata of estimated size, not the real tx.
- The precompile was tested with `eth_call`; no contract was deployed. Read success ≠ deploy success.
- UMA: code presence only; DVM support, bond currency and identifier whitelists were not checked.
- `[MEMORY]` items above are unverified.
