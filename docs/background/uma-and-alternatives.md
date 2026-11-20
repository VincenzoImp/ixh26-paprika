# Adjudication for the Paprika "device ban": UMA and alternatives

Research note for IXH26, Track 1. Written 2026-11-20 (about 21:25-21:55 CET). All `[SOURCE]` items were opened on 2026-11-20.
Tags: `[SOURCE]` = primary source opened today, with a verbatim quote. `[SECONDARY]` = news report, search snippet or third-party blog. `[MEMORY]` = recalled, not verified today. `[ANALYSIS]` = this note's own reasoning.

Proposal reviewed: `/home/tux/crypto2/proposal/PAPRIKA.md`. The ban flow is: an account claims "photo A of device B is fake" and pays a UMA fee. If UMA answers yes, device B is banned and the claimant gets an ETH reward.

---

## TL;DR

- **UMA can technically do the plumbing.** OOv3 has `assertTruth` with a bond and liveness, `disputeAssertion`, escalation to the DVM, and callbacks (`assertionResolvedCallback`, `assertionDisputedCallback`) that a `PaprikaRegistry` contract can use to ban a device. Sepolia has OOv3. There is **no deployment on the XRPL EVM sidechain**.
- **UMA is a poor fit for the question "is photo A fake/AI-generated".** UMA's own identifier spec says voters return true only if the claim is "true and publicly verifiable" and false if it "cannot be unambiguously resolved". Whether a single image is AI-generated is not publicly verifiable. Humans score about 62% on this task (Microsoft, 287k evaluations). A genuine camera can also photograph a screen showing an AI image, so the honest answer is usually "cannot be determined".
- **The optimistic default is dangerous here.** In OOv3 an assertion that nobody disputes settles as **true** after liveness (default 2 h). An undisputed false "photo A is fake" claim would ban an honest device unless the owner watches the chain and posts a bond of at least 2x the final fee (500 USDC on mainnets).
- **There is a real incident record of contested, whale-influenced resolutions.** Polymarket's Ukraine minerals market (March 2025) and Zelensky-suit market (July 2025) are the main examples. UMA's response, `ManagedOptimisticOracleV2` (UMIP-189, Aug 2025), whitelists *proposers*. It does not change how DVM votes are counted.
- **Recommendation:** in the hardened design, ban only on **objectively checkable fraud proofs** decided by the contract: equivocation, proof that the device key is compromised, or a revoked or unattested key. Keep subjective "this content is fake" flags as *labels*, not bans, optionally routed to Kleros or UMA. For tonight's demo, use the fraud-proof path, plus optionally the UMA flow on a local Hardhat chain using UMA's published npm artifacts and `MockOracleAncillary`. Foundry is not needed. Say on stage that the mock oracle is a single key anyone can push to.

---

## 1. How UMA works today (OOv3 + DVM)

**Optimistic layer.**
- A request or assertion carries a bond and "a minimum challenge period duration during which pending proposals can be disputed". "If no dispute is sent during the challenge period, the proposal is settled as correct". "Disputes are forwarded to the DVM for dispute resolution." `[SOURCE]` https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work
- OOv3 entry point (source, `OptimisticOracleV3.sol`, solidity 0.8.16): `assertTruth(bytes claim, address asserter, address callbackRecipient, address escalationManager, uint64 liveness, IERC20 currency, uint256 bond, bytes32 identifier, bytes32 domainId)`. Also `disputeAssertion(bytes32,address)`, `settleAssertion(bytes32)`, `settleAndGetAssertionResult(bytes32)` and `getMinimumBond(address)`. `[SOURCE]` https://github.com/UMAprotocol/protocol/blob/master/packages/core/contracts/optimistic-oracle-v3/implementation/OptimisticOracleV3.sol
- Callbacks. The interface defines `function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;` and `function assertionDisputedCallback(bytes32 assertionId) external;`. The source warns: "The recipient _must_ implement these callbacks and not revert or the assertion resolution will be blocked." `[SOURCE]` (same repo, `OptimisticOracleV3CallbackRecipientInterface.sol` and `OptimisticOracleV3.sol`)
- Truth encoding: `int256 public constant numericalTrue = 1e18;`. The sandbox doc adds: "Optimistic Oracle V3 can only interpret value of `1e18` to represent truthful assertion. Any other value would settle assertion as being false." `[SOURCE]` https://docs.uma.xyz/developers/optimistic-oracle-v3/sandboxed-oracle-environment
- **Bond and fees.** "The minimum bond is the same as final fee for Optimistic Oracle V2 (OOV2) or can be queried by calling getMinimumBond(token) for Optimistic Oracle V3 (OOV3). The default liveness window is two hours." `[SOURCE]` https://docs.uma.xyz/developers/setting-custom-bond-and-liveness-parameters
  - In code: `getMinimumBond = finalFee * 1e18 / burnedBondPercentage`, and `burnedBondPercentage` is set to `0.5e18` in the constructor. So the minimum bond is 2x the final fee ("with burnedBondPercentage set to 50%, the bond is 2x final fee"). `[SOURCE]` OOv3 source
  - Final fees: USDC 250, WETH 0.055 (also USDB 250, ABT 0.055, WIP 50). `[SOURCE]` https://docs.uma.xyz/resources/approved-collateral-types
  - Minimum bond is therefore **500 USDC** or **0.11 WETH** `[ANALYSIS]`.
  - Payout in OOv3: "Disputers receive half of the proposer bond in the case of a successful dispute in the OOV3". The other half goes to the UMA `Store`. `[SOURCE]` custom-bond page
  - Shortest recommended liveness: "it is generally not recommended to set a challenge window shorter than two hours." `[SOURCE]` same page
- **Identifiers (what "truth" is defined against).** OOv3 uses UMIP-170 `ASSERT_TRUTH`:
  > "Return the `1` value if the claim is true and publicly verifiable." / "Return the `0` value if the claim is false or cannot be resolved." / "If the claim cannot be unambiguously resolved, voters should return the `0` value."

  `[SOURCE]` https://github.com/UMAprotocol/UMIPs/blob/master/UMIPs/umip-170.md
- **Change (Dec 2025):** "As of December 8th, 2025. ASSERT_TRUTH2 is the intended identifier to be used with OOV3. The original ASSERT_TRUTH identifier will be deprecated as of December 15, 2025. These identifiers have the same specifications". It also says "the `assertTruthWithDefaults` function will always revert as it hardcodes in the ASSERT_TRUTH identifier". `[SOURCE]` https://docs.uma.xyz/developers/optimistic-oracle-v3/assert_truth-deprecation
  - The approved-identifiers page lists ASSERT_TRUTH2 as UMIP-191. `[SOURCE]` https://docs.uma.xyz/resources/approved-price-identifiers
  - Practical consequence: production integrations must call `assertTruth` with `ASSERT_TRUTH2` explicitly. Old tutorials that use `assertTruthWithDefaults` break on live networks `[ANALYSIS]`.
- **YES_OR_NO_QUERY (UMIP-107, OOv2-style requests).** It has a p3 value for "cannot be determined" (default 0.5) and a p4 value for "too early". From UMIP-107: "If a voter cannot make a determination about what the correct answer to the question is ... UMA voters should return the p3 value". `[SOURCE]` https://github.com/UMAprotocol/UMIPs/blob/master/UMIPs/umip-107.md. The FAQ says: "P4 is the voting option for when a proposal is submitted too early." `[SOURCE]` https://docs.uma.xyz/faqs
- **Escalation managers.** An OOv3 assertion can name an escalation manager that can whitelist asserters or disputers. It can also take arbitration away from the DVM: "By default, disputes are arbitrated via the UMA DVM. However, in some cases, the project may want to use the escalation manager to arbitrate disputes instead." It also supports `discardOracle`. `[SOURCE]` https://docs.uma.xyz/developers/optimistic-oracle-v3/escalation-managers

**DVM (dispute layer).**
- Voting schedule and threshold: "stakers commit secret votes during a 24-hour commit period and subsequently reveal them in a 24-hour reveal period. Voting rounds follow a fixed schedule with transitions at 24:00 UTC. Disputes must be at least 4 hours old to enter a new voting round." "Disputes resolve when a minimum 65% majority of staked UMA is cast in favor of a single outcome. Stakers who did not vote, or who voted against the majority, are slashed". `[SOURCE]` how-does-umas-oracle-work
- Latency: "resolved by the DVM on Ethereum, and the results returned within 48-72 hours". `[SOURCE]` https://docs.uma.xyz/developers/resolving-disputes
- **Who votes and how they are paid (DVM 2.0, Q1 2023).**
  - "Voters now must stake UMA in the DVM". They "earn a pro-rata share of a fixed emission rate". Slashing "amounts to losing 0.1% of your staked amount per vote that is incorrect or missed".
  - Quorum: "the required GAT per vote is a constant 5 million UMA" and "The required SPAT is 65% currently of staked tokens". Votes roll if these are not met and become deletable after 4 rolls.
  - DVM 2.0 also added an "emergency recovery mechanism where bonded emergency proposals can be executed to short-circuiting and bypass the normal voting mechanism".

  `[SOURCE]` https://docs.uma.xyz/using-uma/voting-walkthrough/dvm-2.0
- Voter guidance: "Always independently verify any claims before relying on them." For prediction markets: "it is helpful to review the market odds over time to sanity check your vote". `[SOURCE]` https://docs.uma.xyz/using-uma/voting-walkthrough/voter-guide

**Newer variant: ManagedOptimisticOracleV2 (MOOV2).**
- UMIP-189 (created 29 Jul 2025): "a modified version of the OptimisticOracleV2 intended to be deployed for a single integration". The integrator gets an owner and requestManager who can set "the default proposer whitelist" and "the requester whitelist". It is "upgradable via a 2/2 multisig consisting of Polymarket and Risk Labs". `[SOURCE]` https://github.com/UMAprotocol/UMIPs/blob/master/UMIPs/umip-189.md
- Why: UMA's blog (12 Aug 2025) cites low-quality proposals and "Constant disputes consume time and attention". It says "Disputes remain 100% permissionless". The whitelist requires "20+ proposals within the past 3 months with an accuracy rate above 95%"; "37 unique addresses" qualified. `[SOURCE]` https://blog.uma.xyz/articles/managed-proposers
  - Update (8 Nov 2025): 177 whitelisted addresses, and "Disputes remain permissionless, anyone can challenge a bad proposal". `[SOURCE]` https://blog.uma.xyz/articles/managed-proposers-update
- The Block: UMA passed "the UMIP-189 governance proposal on Aug. 6". `[SECONDARY]` https://www.theblock.co/post/366507/polymarket-uma-oracle-update
- Note: MOOV2 is an OOv2-family contract (request/propose), not OOv3. It narrows who may *propose*. It does not change DVM voting `[ANALYSIS]`.

## 2. Where it is deployed

**OOv3 addresses.** From `packages/core/networks/<chainId>.json` in UMAprotocol/protocol, master branch (last change to the folder: 2025-06-11, "oracle bridge upgrade on admin networks"). `[SOURCE]` https://github.com/UMAprotocol/protocol/tree/master/packages/core/networks

| Network | chainId | OptimisticOracleV3 | DVM support (docs) |
|---|---|---|---|
| Ethereum | 1 | 0xfb55F43fB9F48F63f9269DB7Dde3BbBe1ebDC0dE | Yes |
| Polygon | 137 | 0x5953f2538F613E05bAED8A5AeFa8e6622467AD3D | Yes |
| Optimism | 10 | 0x072819Bb43B50E7A251c64411e7aA362ce82803B | Yes |
| Arbitrum | 42161 | 0xa6147867264374F324524E30C02C331cF28aa879 | Yes |
| Base | 8453 | 0x2aBf1Bd76655de80eDB3086114315Eec75AF500c | Yes |
| Blast | 81457 | 0xE8FF2a3d5Cc19DDcBd93328371E1Dd8995e7AfAA | Yes |
| Story | 1514 | 0x8EF424F90C6BC1b98153A09c0Cac5072545793e8 | Yes (multi-sig relay) |
| Avalanche C | 43114 | 0xa4199d73ae206d49c966cF16c58436851f87d47F | Yes (multi-sig relay) |
| **Sepolia** | 11155111 | **0xFd9e2642a170aDD10F53Ee14a93FcF2F31924944** | **No** (testnet) |
| Polygon Amoy | 80002 | 0xd8866E76441df243fc98B892362Fc6264dC3ca80 | No |
| Base Sepolia | 84532 | 0x0F7fC5E6482f096380db6158f978167b57388deE | No |
| Arbitrum Sepolia | 421614 | 0x1037A21a30aEfF90c269b01c3933eB9a5285d9b8 | not listed on docs page |
| Blast Sepolia | 168587773 | 0xad5503B3C7e35EAF0E88df80b4B626eD0C0404A0 | No |

- Sepolia also has `MockOracleAncillary` 0x5FE28AEa36420414692b1C907F7d0114d304eb0C, `VotingV2` 0xd6Fc66498aE366892BDa974Fd4eF903Ca7202F76 and `Finder` 0xf4C48eDAd256326086AEfbd1A53e1896815F8f13 `[SOURCE]` (11155111.json).
- The docs network table lists "Ethereum Sepolia (testnet) | 11155111 | Yes | No | testnet.oracle.uma.xyz", where the columns are Fully Permissionless Settlement / DVM Support / UI. `[SOURCE]` https://docs.uma.xyz/resources/network-addresses
- Which Oracle the Sepolia Finder points to (mock or VotingV2) was **not verified on-chain today**. The docs say DVM support is "No".
- Monitored networks: Risk Labs monitors only "Ethereum Mainnet (Across only)" and "Polygon Mainnet (Polymarket & predict.fun only)". `[SOURCE]` network-addresses
- Cross-chain disputes: "On chains where no such native messaging bridge exists, UMA uses a multi-sig controlled by UMA core engineers at Risk Labs to relay disputes to the DVM". `[SOURCE]` network-addresses

**XRPL EVM sidechain (chainId 1440000 mainnet / 1449000 testnet).** There is no `1440000.json` or `1449000.json` in the UMA networks folder. The folder lists 1, 10, 100, 1115, 11155111, 1116, 137, 1513, 1514, 1516, 168587773, 288, 4, 416, 42, 42161, 421611, 421614, 43114, 5, 80001, 80002, 81457, 82, 8453, 84531, 84532, 9001. `[SOURCE]` GitHub API listing of the folder.
- UMA's bar for new networks includes "a canonical token and message bridge to mainnet" and "30-Day Moving Average TVL on the network > $75M". `[SOURCE]` https://docs.uma.xyz/resources/network-addresses/new-network-requests
- Chain IDs for XRPL EVM: `[SECONDARY]` (search results; docs.xrplevm.org).
- reality.eth's deployment folder also has no 1440000 or 1449000 entry `[SOURCE]` (GitHub API listing; see section 6). No Kleros deployment on XRPL EVM was found.
- **Conclusion:** using UMA from XRPL EVM would need a custom relay. That would effectively be a trusted bridge.

**Who resolves disputes on testnets.** No DVM: a mock oracle stands in.
- The docs (still written for Görli): "you will need to manually resolve the dispute through the Mock Oracle ... This contract stands in for the DVM ... and allows you to manually return your own values for testing purposes." `[SOURCE]` https://docs.uma.xyz/developers/resolving-disputes
- The sandbox doc says that in `MockOracleAncillary` "anyone can push desired test price". It "will only accept the first pushed price". `[SOURCE]` sandboxed-oracle-environment
- The `pushPrice` / `pushPriceByRequestId` functions have no access control. The only requirements are that the request exists and the identifier is whitelisted. `[SOURCE]` https://github.com/UMAprotocol/protocol/blob/master/packages/core/contracts/data-verification-mechanism/test/MockOracleAncillary.sol

## 3. Running it locally for a demo

- **Official path: Foundry.** The OOv3 dev quick-start repo says "This project uses Foundry". The sandbox is deployed with `forge script ... script/OracleSandbox.s.sol` against `ETH_RPC_URL`. `[SOURCE]` https://github.com/UMAprotocol/dev-quickstart-oov3 and the sandboxed-oracle-environment page.
  - Script defaults: identifier `ASSERT_TRUTH`, liveness `7200` s, `MINIMUM_BOND` `100e18`. It deploys a mintable `TestnetERC20` ("Anyone can mint new tokens by calling its `allocateTo(...)`"). `[SOURCE]`
- **What the script actually does** (OracleSandbox.s.sol, read today) `[SOURCE]`:
  1. `new Finder()`, `new Store(0,0,0)`, `new AddressWhitelist()`, `new IdentifierWhitelist()`, `new MockOracleAncillary(finder, address(0))`, `new TestnetERC20(...)`
  2. `finder.changeImplementationAddress` for Store, CollateralWhitelist, IdentifierWhitelist and Oracle (the mock)
  3. `addressWhitelist.addToWhitelist(currency)` and `identifierWhitelist.addSupportedIdentifier(id)`
  4. `store.setFinalFee(currency, minimumBond/2)`
  5. `new OptimisticOracleV3(finder, currency, liveness)`, then `finder.changeImplementationAddress(OptimisticOracleV3, oo)`
- **Foundry is not a blocker.** The npm package `@uma/contracts-node@0.4.28` ships Hardhat artifacts *with bytecode*. Checked today: OptimisticOracleV3 39,490 hex chars, MockOracleAncillary 10,946, Finder, Store, IdentifierWhitelist, AddressWhitelist and TestnetERC20 all non-empty. It also ships ethers typechain factories. `[SOURCE]` (`npm pack` + inspection, /tmp, 2026-11-20)
  - The ~9 steps above can be replayed in a Hardhat script with `ethers.ContractFactory(abi, bytecode)`. Use `evm_increaseTime` to skip liveness.
  - Alternative: copy the needed `.sol` files and compile with solc 0.8.16 (`pragma solidity 0.8.16;` in OOv3) `[ANALYSIS]`.
  - For a demo, set a short liveness (e.g. 120 s, as in the quick-start: "The default liveness for an assertion is 120 seconds (2 minutes)" `[SOURCE]` quick-start page) and a small bond.
  - Call `assertTruth` with an explicitly whitelisted identifier rather than `assertTruthWithDefaults` `[ANALYSIS]`.
- **Node 26 + Hardhat 2.x:** Hardhat 2 prints a warning on Node versions it has not been tested with, but generally runs `[MEMORY]`. Not tested here. Fallback: `npx hardhat node` under an LTS Node via `nvm`, if available.
- **Sepolia instead of local?** Possible: OOv3 and the mock oracle are deployed there. But you need test ETH, whitelisted bond tokens and the right identifier, and it is unclear whether the Finder points to the mock or to VotingV2. Local is faster and fully under your control tonight `[ANALYSIS]`.

## 4. Fitness for "is photo A fake?"

**What UMA says is suitable.**
- UMIP-170: settle 1 only if "true and publicly verifiable". "If the claim cannot be unambiguously resolved, voters should return the `0` value." The rationale admits it "sacrifices assurances of determinism ... This places the burden of correct construction on claims being asserted". `[SOURCE]` umip-170.md
- FAQ: "Intersubjective data is information that may not be purely objective, but is still publicly verifiable and widely agreed upon by informed observers." Its examples are "election outcomes, sports results, or whether a protocol got hacked". `[SOURCE]` https://docs.uma.xyz/faqs
- "Photo A (a hash plus an off-chain file) was AI-generated / not captured by a real camera" is not something informed observers can widely agree on from public sources. There is usually no public record, and the image itself is the only evidence `[ANALYSIS]`.

**Consequences for the Paprika flow** `[ANALYSIS]`:
1. If the claimant *asserts* "photo A of device B is fake" and someone disputes, honest voters following UMIP-170 should return **0** (cannot be unambiguously resolved). So disputed claims mostly fail and the claimant loses the bond. That partly protects devices.
2. If **nobody disputes** within liveness, OOv3 settles the assertion as **true** and the callback bans device B. Optimistic oracles assume a vigilant disputer. Here, defending means locking at least 2x final fee (e.g. 500 USDC) per accusation, for every device, around the clock. That opens a cheap griefing and censorship path, which is exactly the "retroactive censorship" property the slides ask to avoid.
3. If the contract framed it the other way ("photo A is authentic", ban on false), ambiguity would resolve to 0 and **ban honest devices**. The framing must be chosen so that "unresolvable" means "no ban".
4. On a testnet or local chain the "answer" is whatever the first `pushPrice` caller says. It demonstrates plumbing, not adjudication.

**Can humans or detectors tell?**
- Microsoft AI for Good Lab, "How good are humans at detecting AI-generated images? Learnings from an experiment" (arXiv 2507.18640, 2025): about 287,000 image evaluations by more than 12,500 participants, 62% overall success, "only slightly higher than flipping a coin". The authors say "our results likely overestimate nowadays people's ability to distinguish AI-generated images from real ones". `[SECONDARY]` for the exact quotes (search-result summaries of the paper and the Microsoft Research page https://www.microsoft.com/en-us/research/publication/how-good-are-humans-at-detecting-ai-generated-images-learnings-from-an-experiment/); the arXiv PDF was not opened.
- Frank et al., "A Representative Study on Human Detection of Artificially Generated Media Across Countries", IEEE S&P 2024 (arXiv 2312.05976): "state-of-the-art forgeries are almost indistinguishable from "real" media, with the majority of participants simply guessing when asked to rate them as human- or machine-generated." `[SOURCE]` https://arxiv.org/abs/2312.05976
- Kim et al., arXiv 2608.30210 (31 Aug 2026), *portraits only*: humans 85% overall, declining with age. The best models reached about 92% balanced accuracy, but "Model criteria spread from c = -1.10 to +1.45" (strong, model-specific biases). `[SOURCE]` https://arxiv.org/abs/2608.30210. This is a single preprint on a narrow task and should not be generalised.
- Content provenance standards explicitly decline the question. C2PA Content Credentials "do not provide value judgments about whether a given set of provenance data is 'true'". They attest that provenance is free from tampering and tied to a trusted signer. `[SOURCE]` https://spec.c2pa.org/specifications/specifications/2.2/explainer/Explainer.html (quote via fetch summary)
- The analog hole: a genuine, attested camera can photograph a screen showing an AI image. The device signature is then valid, the content is fake, and no inspection of the device or its key detects it `[ANALYSIS]`.

## 5. Economic security and incidents

**What bounds the cost of corruption.**
- UMA's own argument: "If the DVM were successfully corrupted by 65% of stake voting against reality, the UMA token would depreciate significantly in the following week, resulting in a loss for the attackers. This creates a cost of corruption". Unstaking takes "a one-week period". `[SOURCE]` how-does-umas-oracle-work
- The bound is therefore about 65% of the UMA that is *staked and voting* in a round, not total supply. Quorum is GAT 5M UMA plus SPAT 65% of staked `[SOURCE]` dvm-2.0. The value at risk in disputes can exceed this bound (see the July 2025 case below).
- Current UMA market cap, staked supply and participation were **not verified today**. Use https://vote.uma.xyz or Dune for live numbers.

**Incidents.**
- **Ukraine-US minerals deal market, March 2025.**
  - Yahoo Finance (27 Mar 2025): the market jumped from 9% to 100% on 24-25 March and resolved Yes without a deal. Users alleged a UMA holder was "casting 5 million tokens across three accounts, controlling 25% of the total vote". Polymarket called it "unprecedented", said it was "working with UMA to prevent similar issues", and "would not issue refunds". `[SECONDARY]` https://finance.yahoo.com/news/polymarket-faces-backlash-7m-ukraine-010306627.html
  - The Defiant headline: "Polymarket's $7M Ukraine Mineral Deal Debacle Traced to Oracle Whale" (body not loadable). `[SECONDARY]`
  - Some commentators attributed it to ambiguity and negligence rather than an attack `[SECONDARY]`.
- **"Will Zelenskyy wear a suit before July?", July 2025.**
  - CoinDesk (7 Jul 2025): "In theory, a large-enough swathe of token-holders could manipulate a result to their own choosing." `[SECONDARY]` https://www.coindesk.com/markets/2025/07/07/polymarket-embroiled-in-usd160m-controversy-over-whether-zelensky-wore-a-suit-at-nato
  - Decrypt (9 Jul 2025): the oracle "finalized the outcome as "No"". Critics argued "token-weighted voting enabled outcome manipulation". `[SECONDARY]` https://decrypt.co/329210/polymarket-rules-no-237m-bet-zelenskyys
  - The Defiant subtitle: "UMA goes on record to say there is "no evidence" of foulplay." `[SECONDARY]`
  - Further numbers from search snippets only: UMA market cap about $95M vs about $242M market volume, top ten voters about 6.5M UMA (about 30% of average participation, citing Dune), and a statement attributed to Hart Lambur about adjusting the dispute process. All `[SECONDARY]` (snippet level, not opened).
- **What UMA changed afterwards:** MOOV2 / UMIP-189 (Aug 2025), adopted for Polymarket with proposer whitelists. Disputes stayed permissionless, and UMA reported fewer incorrect proposals and disputes. `[SOURCE]` blog posts above. The Block frames the motivation as also limiting "whale influence" `[SECONDARY]`. No change to DVM vote weighting was found in today's sources.
- Lesson for Paprika `[ANALYSIS]`: both incidents involved *interpretive* questions ("deal agreed?", "is this a suit?"). "Is this photo fake?" is more interpretive, with less public evidence. Token-weighted voting is weakest exactly there.

## 6. Alternatives for the adjudication role

| Option | Mechanism (2 lines) | Deployments / testnets | Cost & latency | Fit for "is photo fake" | Demo tonight on local Hardhat |
|---|---|---|---|---|---|
| **UMA OOv3** | Bonded assertion, liveness, permissionless dispute. Disputes go to a token-weighted commit-reveal DVM vote. | Mainnets and Sepolia/Amoy/Base Sepolia (mock oracle); no XRPL EVM. | Bond ≥2x final fee (500 USDC); 2 h liveness default; dispute 48-72 h. | Poor: UMIP-170 "cannot be resolved" gives 0; undisputed false accusations pass. | Yes: npm artifacts + MockOracleAncillary, ~9 deploy/config txs. |
| **Kleros Court** | Random PNK-staked jurors, evidence, commit/reveal, plurality ruling. Appeals double the jurors; incoherent jurors lose stake. | V1 Ethereum + Gnosis; V2 Arbitrum; testnet Arbitrum Sepolia. | General Court 0.005 ETH per juror per round; mainnet periods "~3 days each"; appeals add rounds. | Better than UMA for human judgement (jurors read evidence, policy documents), but jurors still cannot reliably detect AI images. | Yes with a mock: Kleros docs provide MockArbitrator / Centralized Arbitrator. Real Kleros only on Arbitrum Sepolia. |
| **reality.eth (alone)** | Bonded answers; anyone can overturn by doubling the bond; finalises after timeout. Optional arbitrator. | Many chains incl. Sepolia (11155111); not on XRPL EVM. | Bond chosen by asker; timeout "typically about 1 day". | Poor alone: a bond war decides it, so whoever has more money wins. | Feasible (deploy RealityETH contract locally) but more code than UMA npm artifacts. |
| **reality.eth + Kleros** | Bond escalation; arbitration requested when bonds exceed the fee; Kleros ruling is final. | Ethereum/Gnosis with Kleros proxies. | Arbitration fee plus days. | Same as Kleros. | Only with a centralized/mock arbitrator. |
| **Bonded M-of-N committee / multisig** | Named reviewers (e.g. forensics labs, manufacturers) sign ban decisions; slashable bond, time-lock, appeal. | Anything (Safe or a custom contract). | Cheap, hours. | Honest about being trusted; experts can request RAW files and sensor noise (PRNU) etc. Still not proof. | Trivial (custom 2-of-3 contract). |
| **TCR (Kleros Curate / Light Curate)** | Registry of "banned devices" or "flagged photos"; deposits; challenges go to Kleros. | Curate V1 on Ethereum/Gnosis, V2. | Deposits + Kleros time. | Same as Kleros; good fit for a *label* registry rather than an instant ban. | Mock only. |
| **Objective fraud proofs** | Contract checks a cryptographic proof and bans automatically; no vote. | Any EVM (ecrecover; P-256 depends on chain precompile). | Gas only; instant. | Does not answer "is content fake". It answers "is this device key compromised/misbehaving", which is what a ban should be based on. | Yes, easiest of all. |

**Sources for the table.**
- Kleros V1: "In Court V1, the entire dispute process is handled by a single contract, **KlerosLiquid**, on Ethereum Mainnet (also deployed on Gnosis Chain)". V2 "runs on Arbitrum". Jurors "are drawn at random from those who have staked PNK in the subcourt, weighted by stake". "Coherent jurors are rewarded; incoherent jurors lose part of their stake." `[SOURCE]` https://docs.kleros.io/court/how-it-works
- Kleros parameters: General Court "minStake 2,300 PNK", "feeForJuror 0.005 ETH", "timesPerPeriod ~3 days each" (testnet "12 hours each"). Also: "Court parameters are adjusted through governance and may differ from any static source." `[SOURCE]` https://docs.kleros.io/court/court-hierarchy
- Kleros testing: "Testing strategy for arbitrable contracts using mock arbitrators, integration tests, Arbitrum Sepolia testnet". The Centralized Arbitrator "serves as a testing and debugging tool". `[SOURCE]` https://docs.kleros.io/developers/arbitrable-apps/arbitrable-testing and https://docs.kleros.io/developers/arbitrable-apps/centralized-arbitrator
- reality.eth arbitrators: "An arbitrator is responsible for providing a final answer to a question when there is a dispute, in exchange for a fee." "If the arbitrator is untrustworthy, the system cannot be relied on to provide accurate answers." "Any contract address can be set as the arbitrator." `[SOURCE]` https://realityeth.github.io/docs/html/arbitrators.html
- reality.eth deployments include 11155111 (BOND/ETH/SAFE token variants) and no 1440000 or 1449000. `[SOURCE]` https://github.com/RealityETH/reality-eth-monorepo/tree/main/packages/contracts/chains/deployments
- Timeout "typically about 1 day": `[SECONDARY]` (search summary of https://realityeth.github.io/docs/html/contracts.html).

**Objective fraud-proof reformulations for Paprika** `[ANALYSIS]` unless marked:
1. **Equivocation.** The device signs `(deviceId, counter, photoHash)` with a strictly increasing counter, kept in secure hardware. Two valid signatures with the same counter and different hashes, or a hash attested before the device's registration time, prove misbehaviour or a cloned key. The contract checks this with `ecrecover` (secp256k1) or a P-256 verifier. Ban plus reward, no vote.
2. **Key compromise.** Instead of publishing the private key (which can be front-run in the mempool), the claimant submits a signature by the device key over `("PAPRIKA-COMPROMISED", deviceId, claimantAddress)`. Honest firmware never signs that message, so a valid signature proves someone outside the enclave controls the key. Ban, and pay the claimant.
3. **Attestation and revocation.** Register only keys whose attestation chains to a manufacturer root. Ban when the attestation certificate is revoked. Android documents a revocation list and says "Attestation keys that have been leaked are always eligible to have their certificates revoked", with leaks found via "Discovery of attestation keys on social media or other public sites". `[SOURCE]` https://developer.android.com/privacy-and-security/security-key-attestation. On-chain, the revocation feed is an oracle too (a signed CRL relayed on-chain), but an objective, signed one.
4. **What stays subjective.** "This attested photo shows a staged or AI scene" (analog hole). Handle it with *labels* or flags (Kleros/UMA/committee), not device bans, or with a high bar plus appeal.

Also relevant `[MEMORY]`: Optimism-style "fault proofs" and Kleros "Proof of Humanity" use the same pattern: objective challenges where possible, juries only for residual subjective cases.

## 7. Recommendation

**Hardened protocol.**
- **Ban only on objective, contract-verifiable evidence** (equivocation, key-compromise signature, revoked attestation). This removes the oracle from the ban path, so there is no token-holder vote to corrupt, no 48-72 h DVM delay and no cross-chain relay to XRPL EVM. It directly supports the "no single point of failure" and "no retroactive censorship" requirements.
- **Content disputes ("photo looks AI-generated") produce a flag or label on the photo, not a device ban.** If a decentralised human judgement is wanted, Kleros (jurors, evidence, appeals, policy document) is a better match than UMA's ASSERT_TRUTH.
  - If UMA is used, frame the assertion so that "unresolvable" means "no action": the accuser asserts "fake", and resolution false means no flag.
  - Set long liveness (days) and high, symmetric bonds.
  - Reward the claimant only from the accuser bond pool, never from the treasury, to avoid farming.
- Make bans non-retroactive by default: photos attested before the proven compromise time stay valid, with a flag.

**Tonight's demo** (local Hardhat, no Foundry):
1. `PaprikaRegistry` with register, attest and fee. **Fraud-proof ban** via the key-compromise signature and/or equivocation, which is deterministic and needs no external deps. This is the core.
2. *Optional:* a "content dispute" path using **UMA OOv3 + MockOracleAncillary** deployed from `@uma/contracts-node` artifacts.
   - Show assert, dispute (`assertionDisputedCallback` freezes), `pushPriceByRequestId(requestId, 0 or 1e18)`, settle, and `assertionResolvedCallback` setting a flag.
   - Short liveness, then `evm_increaseTime`. Use an explicitly whitelisted identifier, not `assertTruthWithDefaults`.

**What to say honestly about the gap:**
- The demo's "oracle" is a mock where any account can push the answer. It shows the integration, not decentralised adjudication.
- On mainnet the same call would wait 2 h liveness, then 48-72 h of a token-weighted UMA vote on Ethereum.
- UMA is not on XRPL EVM. Using it there would need a relay that is itself a trust assumption.
- By UMA's own rules, "is this image AI-generated" is not "publicly verifiable", so voters should answer false (unresolvable). Humans are near chance at this task (about 62%).
- Hence the design choice: device bans rest on cryptographic proofs, and content judgements are labels.

---

## Not verified / open

- Which `Oracle` the Sepolia `Finder` currently points to (MockOracleAncillary vs VotingV2). Not checked on-chain.
- Current UMA market cap, staked supply, average participation; top-voter concentration (only `[SECONDARY]` snippets).
- Exact Microsoft 2025 paper quotes (arXiv PDF not opened; numbers via search summaries).
- Whether Hardhat 2.x runs cleanly on Node 26 (not tested).
- Any official UMA statement directly addressing the March 2025 minerals case (not found).
- No Kleros, UMA or reality.eth deployment on XRPL EVM found. Absence in official deployment lists only.

## Claims table

| # | Claim | Tag | URL (accessed 2026-11-20) | Quote / evidence |
|---|---|---|---|---|
| 1 | Undisputed proposals settle as correct | SOURCE | https://docs.uma.xyz/protocol-overview/how-does-umas-oracle-work | "If no dispute is sent during the challenge period, the proposal is settled as correct" |
| 2 | DVM: 24 h commit + 24 h reveal, 65% of stake | SOURCE | same | "Disputes resolve when a minimum 65% majority of staked UMA is cast in favor of a single outcome." |
| 3 | Non-voters and wrong voters slashed | SOURCE | same | "Stakers who did not vote, or who voted against the majority, are slashed" |
| 4 | Cost-of-corruption argument | SOURCE | same | "the UMA token would depreciate significantly in the following week, resulting in a loss for the attackers" |
| 5 | Slash 0.1% per wrong or missed vote; GAT 5M; SPAT 65% | SOURCE | https://docs.uma.xyz/using-uma/voting-walkthrough/dvm-2.0 | "the required GAT per vote is a constant 5 million UMA" |
| 6 | DVM result in 48-72 h | SOURCE | https://docs.uma.xyz/developers/resolving-disputes | "results returned within 48-72 hours" |
| 7 | Default liveness 2 h; min bond via getMinimumBond | SOURCE | https://docs.uma.xyz/developers/setting-custom-bond-and-liveness-parameters | "The default liveness window is two hours." |
| 8 | Disputer gets half the proposer bond | SOURCE | same | "Disputers receive half of the proposer bond in the case of a successful dispute in the OOV3." |
| 9 | Min bond = 2x final fee | SOURCE | OptimisticOracleV3.sol (GitHub) | "with burnedBondPercentage set to 50%, the bond is 2x final fee" |
| 10 | Final fee USDC 250, WETH 0.055 | SOURCE | https://docs.uma.xyz/resources/approved-collateral-types | table rows "USDC 250", "WETH 0.055" |
| 11 | Callback signatures | SOURCE | OptimisticOracleV3CallbackRecipientInterface.sol | "function assertionResolvedCallback(bytes32 assertionId, bool assertedTruthfully) external;" |
| 12 | Callback recipient must not revert | SOURCE | OptimisticOracleV3.sol | "must implement these callbacks and not revert or the assertion resolution will be blocked" |
| 13 | ASSERT_TRUTH: true only if publicly verifiable | SOURCE | https://github.com/UMAprotocol/UMIPs/blob/master/UMIPs/umip-170.md | "Return the `1` value if the claim is true and publicly verifiable." |
| 14 | Ambiguous claim resolves 0 | SOURCE | same | "If the claim cannot be unambiguously resolved, voters should return the `0` value." |
| 15 | ASSERT_TRUTH2 replaces ASSERT_TRUTH; WithDefaults reverts | SOURCE | https://docs.uma.xyz/developers/optimistic-oracle-v3/assert_truth-deprecation | "the `assertTruthWithDefaults` function will always revert" |
| 16 | P3 = cannot be determined; P4 = too early | SOURCE | umip-107.md; https://docs.uma.xyz/faqs | "P4 is the voting option for when a proposal is submitted too early." |
| 17 | Intersubjective = publicly verifiable, widely agreed | SOURCE | https://docs.uma.xyz/faqs | "still publicly verifiable and widely agreed upon by informed observers" |
| 18 | Escalation manager can arbitrate instead of DVM | SOURCE | https://docs.uma.xyz/developers/optimistic-oracle-v3/escalation-managers | "the project may want to use the escalation manager to arbitrate disputes instead" |
| 19 | Sepolia OOv3 0xFd9e2642...4944; DVM support No | SOURCE | networks/11155111.json; https://docs.uma.xyz/resources/network-addresses | JSON entry; table row "Ethereum Sepolia ... Yes / No" |
| 20 | No XRPL EVM network file | SOURCE | https://github.com/UMAprotocol/protocol/tree/master/packages/core/networks | folder listing lacks 1440000/1449000 |
| 21 | Multi-sig relay where no native bridge | SOURCE | https://docs.uma.xyz/resources/network-addresses | "UMA uses a multi-sig controlled by UMA core engineers at Risk Labs to relay disputes" |
| 22 | New network needs >$75M TVL + canonical bridge | SOURCE | https://docs.uma.xyz/resources/network-addresses/new-network-requests | "30-Day Moving Average TVL on the network > $75M" |
| 23 | Mock oracle: anyone can push price | SOURCE | https://docs.uma.xyz/developers/optimistic-oracle-v3/sandboxed-oracle-environment | "Once requested, anyone can push desired test price through this mock oracle contract." |
| 24 | Quick-start uses Foundry | SOURCE | https://github.com/UMAprotocol/dev-quickstart-oov3 | "This project uses Foundry" |
| 25 | npm artifacts with bytecode exist (no forge needed) | SOURCE | npm `@uma/contracts-node@0.4.28` | inspected: OptimisticOracleV3.json, MockOracleAncillary.json etc. with non-empty bytecode |
| 26 | MOOV2: single integration, proposer whitelist, 2/2 multisig upgrade | SOURCE | https://github.com/UMAprotocol/UMIPs/blob/master/UMIPs/umip-189.md | "upgradable via a 2/2 multisig consisting of Polymarket and Risk Labs" |
| 27 | Disputes stay permissionless under MOOV2 | SOURCE | https://blog.uma.xyz/articles/managed-proposers | "Disputes remain 100% permissionless" |
| 28 | Whitelist grew to 177 (Nov 2025) | SOURCE | https://blog.uma.xyz/articles/managed-proposers-update | "Disputes remain permissionless, anyone can challenge a bad proposal" |
| 29 | UMIP-189 passed 6 Aug 2025 | SECONDARY | https://www.theblock.co/post/366507/polymarket-uma-oracle-update | "the UMIP-189 governance proposal on Aug. 6" |
| 30 | Minerals market: whale with 5M UMA, 25% of vote (alleged) | SECONDARY | https://finance.yahoo.com/news/polymarket-faces-backlash-7m-ukraine-010306627.html | "casting 5 million tokens across three accounts, controlling 25% of the total vote" |
| 31 | Polymarket: no refunds | SECONDARY | same | "would not issue refunds" |
| 32 | Zelensky-suit market resolved No; token-weighting criticism | SECONDARY | https://decrypt.co/329210/polymarket-rules-no-237m-bet-zelenskyys | "token-weighted voting enabled outcome manipulation" |
| 33 | UMA: "no evidence" of foul play | SECONDARY | https://thedefiant.io/news/nfts-and-web3/polymarket-controversy-heats-up-after-the-zelenskyy-suit-market-resolves | "UMA goes on record to say there is "no evidence" of foulplay." |
| 34 | UMA mcap ~$95M vs ~$242M volume; top-10 voters ~6.5M UMA | SECONDARY | search snippets (Defiant/CoinDesk coverage) | not opened; treat as unverified |
| 35 | Humans ~62% on AI vs real images (Microsoft) | SECONDARY | https://www.microsoft.com/en-us/research/publication/how-good-are-humans-at-detecting-ai-generated-images-learnings-from-an-experiment/ | "only slightly higher than flipping a coin" (via summaries) |
| 36 | Forgeries almost indistinguishable; most guess | SOURCE | https://arxiv.org/abs/2312.05976 | "with the majority of participants simply guessing" |
| 37 | Models ~92% on portraits but miscalibrated | SOURCE | https://arxiv.org/abs/2608.30210 | "Model criteria spread from c = -1.10 to +1.45" |
| 38 | C2PA makes no truth judgement | SOURCE | https://spec.c2pa.org/specifications/specifications/2.2/explainer/Explainer.html | "do not provide value judgments about whether a given set of provenance data is 'true'" |
| 39 | Kleros V1 Ethereum/Gnosis, V2 Arbitrum; stake-weighted draw | SOURCE | https://docs.kleros.io/court/how-it-works | "Jurors are drawn at random from those who have staked PNK in the subcourt, weighted by stake." |
| 40 | Kleros General Court fee 0.005 ETH/juror; ~3 days per period | SOURCE | https://docs.kleros.io/court/court-hierarchy | "feeForJuror 0.005 ETH", "timesPerPeriod ~3 days each" |
| 41 | Kleros mock/centralized arbitrator for testing | SOURCE | https://docs.kleros.io/developers/arbitrable-apps/centralized-arbitrator | "serves as a testing and debugging tool" |
| 42 | reality.eth trusts its arbitrator | SOURCE | https://realityeth.github.io/docs/html/arbitrators.html | "If the arbitrator is untrustworthy, the system cannot be relied on to provide accurate answers." |
| 43 | reality.eth on Sepolia; not XRPL EVM | SOURCE | https://github.com/RealityETH/reality-eth-monorepo/tree/main/packages/contracts/chains/deployments | folder listing includes 11155111, lacks 1440000/1449000 |
| 44 | Leaked attestation keys get revoked (CRL) | SOURCE | https://developer.android.com/privacy-and-security/security-key-attestation | "Attestation keys that have been leaked are always eligible to have their certificates revoked." |
| 45 | Hardhat 2 runs on Node 26 with a warning | MEMORY | - | not tested |
| 46 | XRPL EVM chain IDs 1440000 / 1449000 | SECONDARY | https://docs.xrplevm.org (via search) | - |
