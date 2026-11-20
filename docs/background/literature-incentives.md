# Paprika v2: mechanism-design and crypto-economic foundations (literature seed)

Research note for IXH26, Track 1. Written 2026-11-20, 21:37-22:10 CET.
Scope: the academic and original-whitepaper literature behind Paprika v2's stake-and-challenge design
(`/home/tux/crypto2/spec/PROTOCOL.md`). It does not repeat the two earlier notes:
`/home/tux/crypto2/docs/research/adjudication-uma-and-alternatives.md` (how UMA, Kleros and reality.eth work
today, and the 2025 incidents) and `/home/tux/crypto2/docs/research/device-identity-prior-art.md`
(hardware attestation, DePIN, TCRs in brief). It cites them as [ADJ] and [DEV].

**Tags.**
- `[SOURCE]`: primary source opened today (2026-11-20), with a short verbatim quote.
- `[SOURCE] (abstract)`: only the abstract or landing page was read. Good enough to say the work exists and what it claims. Not good enough for its numbers.
- `[SECONDARY]`: search snippet, blog summary or bibliographic database only.
- `[MEMORY]`: recollection, unverified. These are kept in a separate list at the end.
- `[ANALYSIS]`: this note's own reasoning applied to Paprika.

**How the items were checked.**
- Three sub-agents fetched about 40 references in parallel. The author fetched the others directly.
- The author re-opened a sample of the sub-agents' items and confirmed each quote: EIGEN whitepaper (PDF), UMA DVM whitepaper (PDF), P+ε post, Ethereum consensus-specs constants, Hydra landing page and the griefing-factor post.
- Items marked "(via sub-agent)" were opened by a sub-agent and not re-opened by the author.

---

## 0. Findings that change or confirm the design (summary)

1. **The deterrence condition in §8.5 is optimistic by a factor of (1-α). Change it.**
   - A forger holds the key, so it can always self-report first (message 3, or a self-claim through message 4) and collect αS.
   - This is the self-reporting discount of Kaplow and Shavell (1994).
   - The real expected sanction is therefore `p·(1-α)·S`, not `p·S`.
   - Errors also cut into it (Polinsky and Shavell). With honest devices slashed by mistake, deterrence is `(1-ε₁-ε₂)·p·(1-α)·S > G`.
2. **The split between objective proof and subjective claim is the right call, and the literature names it.**
   - EigenLayer's EIGEN whitepaper defines objectively attributable, intersubjectively attributable and non-attributable faults. It then excludes "subjective faults" outright: "we cannot build strong cryptoeconomic guarantees on these".
   - `proveKeyMisuse` is an objectively attributable, retroactively observable fault, exactly like double-signing.
   - "This photo is AI-generated" is a subjective fault in EIGEN's sense. "Published before anchorBlock" is intersubjective. The spec's §5 restriction matches this taxonomy.
3. **The optimistic path rests on the "1-of-N honest watcher" assumption.**
   - That assumption has known failure modes: the verifier's dilemma (Luu et al. 2015; Landis 2023), and censorship during the window (BoLD sets the challenge period to at least `Cmax + D`).
   - The v2.1 contract's `AUTO_DISPUTE` mode removes the vigilance assumption by having the device's stake dispute every claim. The spec text (§9.2) still describes the vigilant variant.
4. **`claimFake` can be front-run.** `evidenceHash` is not bound to the claimant, and the first open claim blocks the others. A mempool copier takes the reward (Flash Boys 2.0; submarine sends). Bind the evidence commitment to `msg.sender`, or use commit-reveal. `proveKeyMisuse` already does this correctly.
5. **"Cost of corruption > profit from corruption" cannot be enforced here.**
   - UMA's own DVM framework needs the PfC to be measured from registered contracts.
   - Paprika's G (the gain from a believed forgery) is off-chain and unbounded. This is Shavell's judgment-proof problem.
   - So the spec's §8.5 honesty ("the protocol cannot make this hold for arbitrary G") is the defensible position. Say it on stage.
6. **A small α is supported, with a nuance about the burn.**
   - Ethereum pays the whistleblower `effective_balance / 4096` (Electra). That reward is a *separate credit*, not a share of the penalty. The penalty and the correlation penalty are simply taken off the slashed validator's balance.
   - So Ethereum decouples the reward from the confiscated amount. Paprika's "reward = α·slashed stake, rest burned" is a simpler variant with the same intent: no profitable self-slashing.
   - α should be the smallest value that still covers a challenger's costs: `c_challenge / S ≤ α`.

---

## 1. Schelling-point oracles and their attacks

**1.1 SchellingCoin.** Vitalik Buterin, "SchellingCoin: A Minimal-Trust Universal Data Feed", Ethereum Foundation Blog, 28 Mar 2014. https://blog.ethereum.org/2014/03/28/schellingcoin-a-minimal-trust-universal-data-feed `[SOURCE]` (via sub-agent).
- Establishes: token holders report a value and are rewarded for matching the majority. "Everyone wants to provide the correct answer because everyone expects that everyone else will provide the correct answer".
- Paprika `[ANALYSIS]`: this is the base mechanism under UMA's DVM and Kleros. It presupposes that the truth is a *focal point*, i.e. salient to everyone. For "is this image synthetic?" no such focal point exists (see 1.8).

**1.2 The P+ε attack.** Vitalik Buterin, "The P + epsilon Attack", Ethereum Foundation Blog, 28 Jan 2015. https://blog.ethereum.org/2015/01/28/p-epsilon-attack `[SOURCE]`.
- Establishes: the attacker commits by contract to pay P+ε to voters on its side *only if that side loses*. Voting with the attacker becomes dominant, so the attacker pays nothing: "The attack has successfully managed to take over the mechanism at zero cost."
- Defences discussed: large deposits, counter-coordination, and settling round N with round N+1. The author calls the last one fragile.
- Paprika `[ANALYSIS]`: any subjective claim escalated to a token vote inherits this attack. The objective path (§5, message 3) does not.

**1.3 p+ε on redistributive games with appeals.** William George, Clément Lesaege (both Kleros Cooperative), "An Analysis of p + ε Attacks on Various Models of Schelling Game Based Systems", presented at MIT Cryptoeconomic Systems (CES'20). The peer-review status was not determined. https://assets.pubpub.org/33am50c6/51581340370715.pdf `[SOURCE]`.
- Establishes: redistributive games with appeals resist the attack better. "a "pure" p + ε attack on a redistributive Schelling game with an appeal system can have budget requirements which grow quadratically in the number of participants". The authors also say appeals are "a double-edged sword as we then also allow our attacker the ability to make malicious appeals."
- Paprika `[ANALYSIS]`: if a subjective path is kept, an appeal-based court (Kleros-style) is better grounded than a single-round coin vote. Note the authors' affiliation: this is not independent work.

**1.4 Truthcoin.** Paul Sztorc, "Truthcoin: Peer-to-Peer Oracle System and Prediction Marketplace", whitepaper v1.5, dated 14 Dec 2015 (earlier versions exist). https://www.truthcoin.info/papers/truthcoin-whitepaper.pdf `[SOURCE]` (via sub-agent).
- Establishes: "Ownership of the VoteCoins is redistributed according to a Schelling Coordination Game, which destabilizes malicious cartels only." Votes on many questions are resolved jointly (SVD over a vote matrix, per George and Lesaege, 1.3).

**1.5 Augur.** Jack Peterson, Joseph Krug, Micah Zoltu, Austin K. Williams, Stephanie Alexander, "Augur: a decentralized oracle and prediction market platform", arXiv:1501.01042 (v2 2018, v3 2020). Version 1 (2015) is a different paper by Peterson and Krug only. `[SOURCE] (abstract)` (via sub-agent).
- Establishes: a reporting token (REP) that can *fork*. The EIGEN whitepaper (3.6) names Augur as the precursor of fork-based intersubjective slashing.

**1.6 Kleros.**
- Clément Lesaege, Federico Ast, William George, "Kleros", Short Paper v1.0.7, Sept 2019. https://kleros.io/assets/whitepaper.pdf `[SOURCE]` (via sub-agent).
- "Kleros, Long Paper v2.0.2" (Lesaege, George, Ast), July 2021. Official URL https://kleros.io/yellowpaper.pdf did not load; a mirror was read `[SOURCE]` (via sub-agent).
- Establishes: random stake-weighted juries, coherence rewards and appeals. "In Kleros, the Schelling Point is honesty and fairness."
- Paprika `[ANALYSIS]`: that sentence is an *assumption*. It holds when jurors can see the truth in the evidence, and fails when the evidence is a single image (see [ADJ] §4 on human detection rates).

**1.7 UMA's economic-guarantee argument.** UMA (Risk Labs), "UMA Data Verification Mechanism: Adding Economic Guarantees to Blockchain Oracles", DRAFT Version 0.2, 24 Apr 2020. The PDF lists no authors. https://github.com/UMAprotocol/whitepaper/blob/master/UMA-DVM-oracle-whitepaper.pdf `[SOURCE]`.
- Establishes: "in order for oracle agent to remain honest, the cost of corruption must always remain greater than the profit from corruption, i.e.: CoC > PfC."
- CoC is "the market value of this number of tokens". PfC is measured because "All contracts using the system must be registered with the DVM. Each registered contract must be able to report the value that could be won or lost". A variable fee policy then keeps CoC above PfC.
- Paprika `[ANALYSIS]`: the argument *requires* the PfC to be on-chain and summable. A Paprika claim's PfC is off-chain: who believes the photo, and what it is worth to them. The precondition fails, so UMA's guarantee does not transfer to Paprika's subjective path. It only transfers to the bond amounts that sit on-chain. This is the published basis for the objection "UMA's security argument does not cover you".
- Published critiques of token-weighted resolution after the 2025 Polymarket cases are covered in [ADJ] §5 (all `[SECONDARY]`).

**1.8 "Keynesian beauty contest": coordination on expected opinion, not truth.** J. M. Keynes, *The General Theory of Employment, Interest and Money*, 1936, ch. 12. https://www.marxists.org/reference/subject/economics/keynes/general-theory/ch12.htm `[SOURCE]`.
- "We have reached the third degree where we devote our intelligences to anticipating what average opinion expects".
- Paprika `[ANALYSIS]`: when ground truth cannot be observed, a Schelling vote converges on what voters expect others to say ("looks AI"). This is the adChain failure in [DEV] §3.2.

**1.9 Peer prediction: eliciting truth when the truth cannot be checked.**
- Drazen Prelec, "A Bayesian Truth Serum for Subjective Data", *Science* 306(5695):462-466, 2004. DOI 10.1126/science.1102081. `[SOURCE] (abstract)` (via sub-agent). The mechanism "assigns high scores not to the most common answers but to the answers that are more common than collectively predicted".
- Nolan Miller, Paul Resnick, Richard Zeckhauser, "Eliciting Informative Feedback: The Peer-Prediction Method", *Management Science* 51(9):1359-1373, 2005. DOI 10.1287/mnsc.1050.0379. `[SOURCE] (abstract)` (via sub-agent). "Honest reporting proves to be a Nash equilibrium."
- Anirban Dasgupta, Arpita Ghosh, "Crowdsourced Judgement Elicitation with Endogenous Proficiency", WWW 2013, arXiv:1303.0799. `[SOURCE]` (via sub-agent). They report, citing earlier work, that in existing peer-prediction mechanisms "the strategies of always reporting 'good' or always reporting 'bad' both constitute Nash equilibria". Truthfulness is an equilibrium, not the unique or the best-paying one.
- Jens Witkowski, David C. Parkes, "Peer Prediction without a Common Prior", ACM EC 2012, pp. 964-981, DOI 10.1145/2229012.2229085. `[SOURCE]` (via sub-agent). The classic method "critically depends on the assumption of a common prior amongst both the agents and the mechanism".
- Siddarth Srinivasan, Ezra Karger, Yiling Chen, "Self-Resolving Prediction Markets for Unverifiable Outcomes", arXiv:2306.04305 (2023, rev. 2025). `[SOURCE] (abstract)`. "outcomes of many important questions are difficult to verify or unverifiable".
- Paprika `[ANALYSIS]`: this is the formal field for "is photo A fake?". Its results are equilibrium results under common-prior, many-agent or multi-task assumptions, with uninformative equilibria alongside the truthful one. No deployed oracle uses them. They are not a fix to deploy tomorrow. They are the citation that shows why the spec confines the subjective path to *publicly verifiable* claims.

**1.10 Survey.** Shayan Eskandari, Mehdi Salehi, Wanyun Catherine Gu, Jeremy Clark, "SoK: Oracles from the Ground Truth to Market Manipulation", ACM AFT 2021, arXiv:2106.00667. `[SOURCE]` (via sub-agent).
- "Voting ... introduces the threat that an actor can accumulate voting rights to sway the vote"
- "an attacker may pay a bribe to the MKR holders to buy their votes".

**1.11 Bribery in token voting.**
- James Austgen, Andrés Fábrega, Sarah Allen, Kushal Babel, Mahimna Kelkar, Ari Juels, "DAO Decentralization: Voting-Bloc Entropy, Bribery, and Dark DAOs", arXiv:2311.03530 (2023). `[SOURCE] (abstract)`: "we present the first practical realization of a Dark DAO".
- Buterin, "On Collusion" (2019) and "Moving beyond coin voting governance" (2021), vitalik.eth.limo. `[SOURCE]` (via sub-agent). The latter: "(ii) outright attacks through various forms of (often obfuscated) vote buying."
- Paprika `[ANALYSIS]`: vote buying need not be visible on-chain (Dark DAOs, secure-enclave bribery). "The token holders were honest in 2025" is not an argument.

## 2. Optimistic mechanisms and the vigilance assumption

**2.1 1-of-N trust.** Buterin, "Trust Models", 20 Aug 2020. https://vitalik.eth.limo/general/2020/08/20/trust.html `[SOURCE]`.
- "1 of N: there are many actors, and the system works as long as at least one of them does what you expect them to." and "Any system based on fraud proofs falls into this category".

**2.2 Fraud proofs.** Mustafa Al-Bassam, Alberto Sonnino, Vitalik Buterin, "Fraud and Data Availability Proofs: Maximising Light Client Security and Scaling Blockchains with Dishonest Majorities", arXiv:1809.09044 (2018/2019). FC 2021 version with different co-authors (Al-Bassam, Sonnino, Khoffi). `[SOURCE] (abstract)`.
- The approach makes "much weaker assumptions about a minimum number of honest nodes that rebroadcast data."

**2.3 Arbitrum, any-trust.** Harry Kalodner, Steven Goldfeder, Xiaoqi Chen, S. Matthew Weinberg, Edward W. Felten, "Arbitrum: Scalable, private smart contracts", USENIX Security 2018, pp. 1353-1370. `[SOURCE]` (via sub-agent).
- "The Arbitrum protocol provides an any-trust guarantee: any one honest manager can force the VM to behave according to the VM's code."

**2.4 The verifier's dilemma.**
- Loi Luu, Jason Teutsch, Raghav Kulkarni, Prateek Saxena, "Demystifying Incentives in the Consensus Computer", ACM CCS 2015, DOI 10.1145/2810103.2813659, ePrint 2015/702. `[SOURCE] (abstract)` (via sub-agent). Rational miners "are well-incentivized to accept unvalidated blockchains."
- Jason Teutsch, Christian Reitwießner, "A scalable verification solution for blockchains" (TrueBit; whitepaper dated 16 Nov 2017, arXiv:1908.04756, 2019). `[SOURCE]` (via sub-agent). TrueBit counters the dilemma "by occasionally forcing Solvers to submit incorrect solutions" and pays a "jackpot" for finding a forced error.
- Daji Landis, "Incentive Non-Compatibility of Optimistic Rollups", arXiv:2312.01549 (2023/2024). `[SOURCE] (abstract)`: "These methods rely on economic incentives to guarantee their security", and the paper models where those incentives fail.
- Peiyao Sheng, Ranvir Rana, Senthil Bala, Himanshu Tyagi, Pramod Viswanath, "Proof of Diligence: Cryptoeconomic Security for Rollups", arXiv:2402.07241 (2024). `[SOURCE] (abstract)`: a watchtower incentive "provably secure when watchtowers are rational actors, under a mild rational independence assumption".
- Paprika `[ANALYSIS]`:
  - Paid watchers earn only from *false* claims (the claimant's bond).
  - If the bond deters false claims, watchers earn nothing and stop watching. Then false claims pay again. The equilibrium is mixed, with a positive rate of unchallenged false claims.
  - The owner is the natural watcher because its own stake is at risk. But that pushes a monitoring cost onto every honest device. This is exactly §9.2 of the spec.
  - The v2.1 contract's `AUTO_DISPUTE` (the device's stake is posted as the dispute bond on every claim) removes this dilemma. The cost moves to the oracle: every claim goes to a vote.

**2.5 Watchtowers.** Patrick McCorry, Surya Bakshi, Iddo Bentov, Sarah Meiklejohn, Andrew Miller, "Pisa: Arbitration Outsourcing for State Channels", ACM AFT 2019 (ePrint 2018/582). `[SOURCE] (abstract)` (via sub-agent).
- Parties "delegate to a third party, called the custodian, to cancel execution forks on their behalf". The custodian is accountable through its own deposit.
- Paprika `[ANALYSIS]`: an owner can hire a bonded watcher. That is a cost, not a protocol guarantee.

**2.6 Length of the challenge window and censorship.** Mario M. Alvarez, Henry Arneson, Ben Berger, …, Edward W. Felten, …, Victor Shoup, Terence Tsao (15 authors), "BoLD: Fast and Cheap Dispute Resolution", arXiv:2404.10491 (2024). `[SOURCE]` (via sub-agent).
- "The challenge period must be large enough to allow an honest party to make all of their moves and to account for censorship."
- The period is set to at least `Cmax + D`. Cmax is the tolerated censorship time ("about a week" on Ethereum) and D is the delay without censorship. BoLD also aims to "force the adversary to marshal many more resources than required by the honest parties".
- donnoh (L2BEAT), "Optimistic rollups, the challenge period and strong censorship attacks", ethresear.ch, 11 Feb 2025. `[SOURCE]` (via sub-agent). The 7-day window was originally "set to allow a social response in case of a 51% consensus attack".
- Fredrik Winzer, Benjamin Herd, Sebastian Faust, "Temporary Censorship Attacks in the Presence of Rational Miners", IEEE EuroS&PW 2019, DOI 10.1109/EuroSPW.2019.00046. `[SECONDARY]`: bribery contracts that pay miners to censor an account for a time.
- Paprika `[ANALYSIS]`: a 2-hour liveness (UMA's default, [ADJ] §1) lets an attacker win an uncontested claim by censoring or delaying the owner's dispute transaction for 2 hours. Liveness must exceed the censorship that the stake at risk can buy.

**2.7 Griefing factors.** Buterin (vbuterin), "A griefing factor analysis model", ethresear.ch, 24 Jun 2018. https://ethresear.ch/t/a-griefing-factor-analysis-model/2338 `[SOURCE]`.
- "a measure of the extent to which participants in a mechanism can abuse the mechanism to cause harm to other participants". A mechanism has griefing factor k if harm of $k can be caused per $1 spent.
- Paprika `[ANALYSIS]`, vigilant variant:
  - A false claim costs the attacker its bond B, refunded if nobody disputes.
  - It forces the owner to lock B, pay attention, and wait out the DVM.
  - If the owner is absent, the attacker *gains* αS + B (refunded) and the honest owner loses S. The griefing factor is unbounded and the attack has positive value.
  - Hence the bound `B ≥ αS` and a long liveness in section B.

## 3. Staking, slashing and deterrence

**3.1 Accountable safety and slashing conditions.**
- Vitalik Buterin, Virgil Griffith, "Casper the Friendly Finality Gadget", arXiv:1710.09437 (2017). `[SOURCE]` (via sub-agent, full text; the abstract does not contain the quote). "Accountable safety means that two conflicting checkpoints cannot both be finalized unless ≥ 1/3 of validators violate a slashing condition (meaning at least one third of the total deposit is lost)."
- Peiyao Sheng, Gerui Wang, Kartik Nayak, Sreeram Kannan, Pramod Viswanath, "BFT Protocol Forensics", ACM CCS 2021, DOI 10.1145/3460120.3484566. `[SOURCE] (abstract)` (via sub-agent).
- Joachim Neu, Ertem Nusret Tas, David Tse, "The Availability-Accountability Dilemma and its Resolution via Accountability Gadgets", FC 2022, DOI 10.1007/978-3-031-18283-9_27. `[SOURCE] (abstract)` (via sub-agent).
- Paprika `[ANALYSIS]`: `EXTRACTED`-domain signatures are a slashing condition in Casper's sense. They are a signed message that an honest device never produces, verifiable by anyone, attributable to one key. This is the strongest part of the design, and it is the part cryptographers will recognise.

**3.2 Economic limits.**
- Eric Budish, Andrew Lewis-Pye, Tim Roughgarden, "The Economic Limits of Permissionless Consensus", ACM EC 2024, DOI 10.1145/3670865.3673548, arXiv:2405.09173. `[SOURCE]` (via sub-agent). The goal is to "render consistency violations prohibitively expensive for the attacker without collateral damage to honest participants—for example, by programatically confiscating an attacker's resources ... as is the intention for slashing". The paper also proves impossibility bounds (no EAAC protocol against certain adversary sizes).
- Eric Budish, "The Economic Limits of Bitcoin and the Blockchain", NBER WP 24717 (2018). Published as "Trust at Scale: The Economic Limits of Cryptocurrencies and Blockchains", QJE 140(1):1-62, 2025, DOI 10.1093/qje/qjae033. `[SOURCE]` (via sub-agent). "the recurring, "flow", payments to miners for running the blockchain must be large relative to the one-off, "stock", benefits of attacking it."
- Paprika `[ANALYSIS]`: Paprika is "stake-based", so its security cost is the *opportunity cost* of S locked per device (`r·S` per unit time), and its security bound is S, not a flow. "Without collateral damage to honest participants" is met by the objective path. It is not met by the optimistic subjective path, where honest owners can be slashed.

**3.3 Becker and the public-enforcement literature.**
- Gary S. Becker, "Crime and Punishment: An Economic Approach", *J. Political Economy* 76(2):169-217, 1968, DOI 10.1086/259394. `[SECONDARY]`: bibliographic data only; no page opened.
- A. Mitchell Polinsky, Steven Shavell, "Public Enforcement of Law", chapter 8000 in *Encyclopedia of Law and Economics* (©1999). https://www.sfu.ca/~allen/crime%20general.pdf `[SOURCE]`. Three relevant passages:
  - Agents act if gain exceeds expected sanction: "He will commit the act if that would raise his expected utility".
  - **Errors**: an individual offends iff "g > (1 - ε₁ - ε₂)pf", and "both types of error reduce deterrence". (The symbols ε₁ and ε₂ are rendered as "0" in the PDF text extraction.)
  - **Maximal fines**: "the optimal fine is maximal when individuals are risk neutral in fines". This is Polinsky and Shavell, "The Optimal Tradeoff between the Probability and Magnitude of Fines", *AER* 69(5):880-891, 1979 `[SECONDARY]`.
- Steven Shavell, "The Judgment Proof Problem", *Int. Rev. Law & Econ.* 6(1):45-58, 1986, DOI 10.1016/0144-8188(86)90038-4. `[SOURCE] (abstract)`: the citation was confirmed at hls.harvard.edu, but the scanned PDF could not be read. The content (incentives are too weak when the injurer cannot pay the full harm) is from search summaries `[SECONDARY]`.
- Louis Kaplow, Steven Shavell, "Optimal Law Enforcement with Self-Reporting of Behavior", *JPE* 102(3):583-606, 1994, DOI 10.1086/261947. `[SOURCE] (abstract)` (RePEc): "Self-reporting offers two advantages ... enforcement resources are saved ... and risk is reduced". The survey above adds: "Self-reporting can be induced by lowering the sanction for individuals who disclose their own infractions."
- Paprika `[ANALYSIS]`:
  1. **Maximal fine.** S is the whole fine. Becker, Polinsky and Shavell say to make it as large as participation allows and economise on p.
  2. **Judgment-proof.** S is the agent's "wealth" in the system. The spec's "the stake bounds the punishment, not the damage" (§9.3) is Shavell's problem by name.
  3. **Self-reporting discount.** Paprika *does* reward self-reporting, by αS. That lowers the effective sanction to `(1-α)S`. §8.5 should read `p·(1-α)·S > G`.
  4. **Errors.** Uncontested false claims slash honest keys (ε₂ > 0). This lowers deterrence *and* raises the cost of honest participation.

**3.4 Slashing in practice: Ethereum consensus-specs** (github.com/ethereum/consensus-specs, master, `specs/*/beacon-chain.md`) `[SOURCE]`.
- phase0:
  - `WHISTLEBLOWER_REWARD_QUOTIENT` = 512
  - `MIN_SLASHING_PENALTY_QUOTIENT` = 128
  - `EPOCHS_PER_SLASHINGS_VECTOR` = 8,192
  - `MIN_VALIDATOR_WITHDRAWABILITY_DELAY` = 256 epochs
  - "whistleblower_reward = validator.effective_balance // WHISTLEBLOWER_REWARD_QUOTIENT"
- Bellatrix: `PROPORTIONAL_SLASHING_MULTIPLIER_BELLATRIX` = 3.
- Electra:
  - `WHISTLEBLOWER_REWARD_QUOTIENT_ELECTRA` = 4,096
  - `MIN_SLASHING_PENALTY_QUOTIENT_ELECTRA` = 4,096
- The sub-agent reports that `slash_validator` sets the withdrawable epoch to at least `epoch + EPOCHS_PER_SLASHINGS_VECTOR` (about 36 days), and that the correlated penalty is applied halfway through that period.
- Electra `slash_validator` (read today):
  - "slashing_penalty = validator.effective_balance // MIN_SLASHING_PENALTY_QUOTIENT_ELECTRA"
  - "decrease_balance(state, slashed_index, slashing_penalty)"
  - then "increase_balance(state, whistleblower_index, whistleblower_reward - proposer_reward)"
  - The whistleblower defaults to the block proposer.
- Paprika `[ANALYSIS]`:
  - Ethereum's reporter reward is small (1/4096 of effective balance) and is *credited separately*, not carved out of the penalty. The penalty and the later correlation penalty (×3 the share of stake slashed in the window) leave the validator and are paid to no one.
  - In Electra the initial penalty and the whistleblower reward are the same size (both /4096). A self-report therefore nets about zero *before* the correlation penalty. Deterrence comes mainly from the correlation penalty and the forced exit.
  - Lesson for Paprika: the precedent supports a small α. It also shows that Ethereum leans on correlated (mass-fault) penalties, which Paprika does not have. One Paprika key is one independent fault.
  - Ethereum also keeps the slashed validator locked for about 36 days so that correlated penalties can be applied. Paprika's unbonding period plays the same role.

**3.5 Weak subjectivity and the withdrawal window.**
- Buterin, "Proof of Stake: How I Learned to Love Weak Subjectivity", Ethereum Foundation Blog, 25 Nov 2014. `[SOURCE]` (via sub-agent). "the user has to have the right to withdraw the security deposit eventually, and once the deposit is withdrawn there is no longer any incentive not to vote on a long-range fork".
- Paprika `[ANALYSIS]`:
  - Once S is withdrawn, evidence of earlier key extraction can still flag the key. The contract accepts `proveKeyMisuse` on a Retired key, but there is nothing left to slash.
  - The unbonding period must cover the time it takes evidence to surface. For key extraction that time is unbounded, so verifiers should apply the "strict" policy (§6) to records of keys withdrawn without a flag.

**3.6 Objective / intersubjective / non-attributable faults: EIGEN** (checked at the source).
- Eigen Labs Team, "EIGEN: The Universal Intersubjective Work Token. Towards the Open Verifiable Digital Commons", whitepaper, April 2024. https://raw.githubusercontent.com/Layr-Labs/whitepaper/master/EIGEN_Token_Whitepaper.pdf (the docs.eigencloud.xyz copy returned an HTML shell). `[SOURCE]`.
- §1.2.1, **objectively attributable**: "attributable purely mathematically and cryptographically without the need to ask the opinions of others", e.g. double-signing, which is "only retroactively observable".
- §1.2.2, **intersubjectively attributable**: "a set of faults where there is a broad-based agreement among all active observers of the system". These can be retroactively observable (e.g. oracle prices) or concurrently observable (data availability, censorship).
- §1.2.3, **non-attributable**: "not attributable outside the victim of the fault".
- **Subjective "faults"** are excluded: "observers make their own judgments, with no guaranteed concordance ... we cannot build strong cryptoeconomic guarantees on these type of "faults"."
- The paper critiques majority slashing: it "is subject to the tyranny-of-majority. If the majority of workers are dishonest, then a minority of honest agents can be slashed." Its remedy is a forkable token (bEIGEN). It names Augur's REP as the precursor, and it classes UMA and Kleros as voting "without forking".
- Mapping for Paprika `[ANALYSIS]`:

  | Paprika event | EIGEN class |
  |---|---|
  | `EXTRACTED` signature (msg 3) | Objectively attributable, retroactively observable: contract-decidable |
  | "Same image published before `anchorBlock`" (msg 4, sound use) | Intersubjectively attributable, retroactively observable: needs social resolution, but observers agree |
  | "Image is AI-generated / staged" | Subjective: outside any strong crypto-economic guarantee |
  | Screen re-photography (analog hole) | Non-attributable from the record alone |

- EigenLayer Team, "EigenLayer: The Restaking Collective" (2023). `[SOURCE]` (via sub-agent, GitBook copy). "When CoC is much greater than any potential Profit-from-Corruption (PfC), we say that the system has robust security."
- Naveen Durvasula, Tim Roughgarden, "Robust Restaking Networks", ITCS 2025, DOI 10.4230/LIPIcs.ITCS.2025.48. `[SOURCE]` (via sub-agent). "if attack costs always exceed attack profits by 10%, then a sudden loss of .1% of the overall stake ... cannot result in the ultimate loss of more than 1.1%".
- Paprika `[ANALYSIS]`: this applies to level 1, where one issuer bond backs many keys. Over-collateralisation is needed, or a single slash cascades.

## 4. Token-curated registries

- Mike Goldin, "Token-Curated Registries 1.0", Medium, 14 Sep 2017. `[SECONDARY]` (Medium returned 403): "decentrally-curated lists with intrinsic economic incentives for token holders to curate the list's contents judiciously."
- Aditya Asgaonkar, Bhaskar Krishnamachari, "Token Curated Registries - A Game Theoretic Approach", arXiv:1809.01756 (2018). `[SOURCE] (abstract)` (here and in [DEV] §3.2). Accept-all and reject-all can both be Nash equilibria.
- George and Lesaege (1.3) list TCRs as Schelling games exposed to p+ε `[SOURCE]`.
- Post-mortems (adChain rejecting facebook.com and nytimes.com; Tabarrok's "correct more than ~2/3" condition) are only `[SECONDARY]`, see [DEV] §3.2. No peer-reviewed post-mortem was found today.
- Paprika `[ANALYSIS]`: Paprika is a TCR in which listing is permissionless (stake) and *delisting* is a challenge. The TCR lesson is that delisting by token vote on a subjective criterion decays to taste or to bribery. Paprika avoids this on the objective path only.

## 5. Bounties for misbehaviour, self-reporting and front-running

**5.1 Bounty as contract.** Lorenz Breidenbach, Philip Daian, Florian Tramèr, Ari Juels, "Enter the Hydra: Towards Principled Bug Bounties and Exploit-Resistant Smart Contracts", USENIX Security 2018. https://www.usenix.org/conference/usenixsecurity18/presentation/breindenbach `[SOURCE] (abstract)`.
- "Our key idea is an exploit gap, a program transformation that enables runtime detection, and rewarding, of critical bugs." The paper also observes that existing bounties lack principled sizing and need high payouts to attract rational hackers.
- Paprika `[ANALYSIS]`: `proveKeyMisuse` is a Hydra-style bounty. The proof of the fault *is* the claim, and payment is automatic. The Hydra lesson on sizing is that the bounty must beat the attacker's alternative use of the secret. A thief who extracts a key may earn more by forging with it than by claiming αS. So the αS bounty attracts *finders who do not want to forge* (researchers), not the forgers themselves.

**5.2 Self-reporting and collusion with the reporter.** Kaplow and Shavell (3.3).
- Paprika `[ANALYSIS]`: the attacker sits on both sides. It can forge, and then report itself before anyone else does, recovering αS.
  - The spec's §8.1 is right that this is a net loss.
  - But it fixes the effective fine at `(1-α)S`.
  - Unlike Kaplow and Shavell, Paprika gains nothing from self-reports. There is no enforcement agency whose costs are saved, and the record is flagged either way. So α should be no larger than what is needed to pay *third-party* finders.

**5.3 Front-running.**
- Philip Daian, Steven Goldfeder, Tyler Kell, Yunqi Li, Xueyuan Zhao, Iddo Bentov, Lorenz Breidenbach, Ari Juels, "Flash Boys 2.0: Frontrunning in Decentralized Exchanges, Miner Extractable Value, and Consensus Instability", IEEE S&P 2020, DOI 10.1109/SP40000.2020.00040. The arXiv 1904.05234 preprint has a different title. `[SOURCE] (abstract)` (via sub-agent).
- Lorenz Breidenbach, Phil Daian, Ari Juels, Florian Tramèr, "To Sink Frontrunners, Send in the Submarines", Hacking, Distributed, 28 Aug 2017. `[SECONDARY]` (page did not load).
- Paprika `[ANALYSIS]`:
  - `proveKeyMisuse` signs over `msg.sender`, so a copied proof is useless. This is correct and matches the standard defence.
  - `claimFake(H, keyId, evidenceHash)` has no such binding. The claimant is `msg.sender`, `evidenceHash` is copyable, and the contract allows one open claim per record (`require(!r.claimOpen)`).
  - A mempool observer can therefore copy the claim with a higher fee and take the reward. **Fix**: commit-reveal, or require the evidence commitment to be `H(claimant ‖ evidence ‖ salt)` and reveal before settlement.
- Item not found: no primary source on *fraud-proof reward theft in rollups* was located (sub-agent search, BoLD paper).

**5.4 Bribery contracts.**
- Joseph Bonneau, "Why Buy When You Can Rent? Bribery Attacks on Bitcoin-Style Consensus", FC 2016 Workshops, LNCS 9604, DOI 10.1007/978-3-662-53357-4_2. `[SECONDARY]`.
- Patrick McCorry, Alexander Hicks, Sarah Meiklejohn, "Smart Contracts for Bribing Miners", FC 2018 Workshops, LNCS 10958 (2019), DOI 10.1007/978-3-662-58820-8_1. `[SOURCE] (abstract)` (via sub-agent).
- Aljosha Judmayer et al., "SoK: Algorithmic Incentive Manipulation Attacks on Permissionless PoW Cryptocurrencies", FC 2021 Workshops, DOI 10.1007/978-3-662-63958-0_38. `[SECONDARY]`.
- Paprika `[ANALYSIS]`: contracts make bribes credible. Both the DVM vote and the censorship of a dispute transaction can be bought by contract.

## 6. Sybil resistance by cost

- John R. Douceur, "The Sybil Attack", IPTPS 2002, LNCS 2429, DOI 10.1007/3-540-45748-8_24. `[SOURCE]` (via sub-agent). "without a logically centralized authority, Sybil attacks are always possible except under extreme and unrealistic assumptions of resource parity and coordination among entities."
- Maria Borge, Eleftherios Kokoris-Kogias, Philipp Jovanovic, Linus Gasser, Nicolas Gailly, Bryan Ford, "Proof-of-Personhood: Redemocratizing Permissionless Cryptocurrencies", IEEE EuroS&PW 2017, DOI 10.1109/EuroSPW.2017.46. `[SOURCE] (abstract)` (via sub-agent).
- Divya Siddarth, Sergey Ivliev, Santiago Siri, Paula Berman, "Who Watches the Watchmen? A Review of Subjective Approaches for Sybil-resistance in Proof of Personhood Protocols", arXiv:2008.05300 (2020). `[SOURCE] (abstract)` (via sub-agent).
- Moritz Platt, Peter McBurney, "Sybil in the Haystack…", *Algorithms* 16(1):34, 2023, DOI 10.3390/a16010034. `[SOURCE] (abstract)` (via sub-agent).
- Brian N. Levine, Clay Shields, N. Boris Margolin, "A Survey of Solutions to the Sybil Attack", UMass TR 2006-052. `[SECONDARY]`.
- Paprika `[ANALYSIS]`:
  - "Any device can register" plus Douceur means level 0 cannot be Sybil-*resistant*. It can only be Sybil-*priced*: n identities cost n·S of locked capital. This is the "resource" escape in Douceur's statement, and the spec states it honestly ("the guarantee is economic").
  - Flag evasion costs S again (§8.4). Without per-person caps ([DEV] §3.3) or issuer admission (level 1), a flagged attacker re-enters at the cost of one stake.
  - Verifiers should weigh a record by the key's stake, its age and its history. A fresh key with minimum stake carries the minimum guarantee.

## 7. Other items worth having ready

- **Chainlink 2.0 "super-linear staking"**: Breidenbach et al., "Chainlink 2.0: Next Steps in the Evolution of Decentralized Oracle Networks", 2021. `[SECONDARY]` (search summary). Claims attack budgets quadratic in the number of nodes via a second-tier alert. A critique (E. Wall, Medium) disputes the quadratic claim `[SECONDARY]`.
- **Strategic jurors**: Ioannis Caragiannis, Nikolaj I. Schwartzbach, "Outsourcing Adjudication to Strategic Jurors", arXiv:2201.06597. `[SOURCE] (abstract)` (via sub-agent). A non-Kleros theory paper on juror incentives.
- **Kleros-adjacent review**: Yann Aouidef, Federico Ast, Bruno Deffains, "Decentralized Justice: A Comparative Analysis of Blockchain Online Dispute Resolution Projects", *Frontiers in Blockchain* 4:564551, 2021. `[SOURCE]` (via sub-agent). "They suffer from the p + ε attack, a type of bribing attack". Ast is a Kleros co-founder.
- **Minimal anti-collusion infrastructure (MACI)**: Buterin, ethresear.ch, 4 May 2019. `[SOURCE]` (via sub-agent). The standard answer to vote buying, if a vote is kept.
- **Accord** (Fabian Schuh, arXiv:2610.20666, Oct 2026). `[SOURCE] (abstract)`: a Kleros-like Solana court whose appeals grow juries from 3 to 31. A very recent single-author preprint; context only.

---

## A. Design implications

| Paprika v2 choice | Literature says | Verdict | References |
|---|---|---|---|
| Stake S at registration, slashable | Deterrence needs an attachable asset. S is the maximal fine (Becker; Polinsky-Shavell). It prices Sybils (Douceur's resource escape). It is bounded, so the system is judgment-proof for large G. | **Supports**, with the warning that S bounds punishment, not damage | 3.3, 6 |
| Reward share α < 1, rest burned | Burn prevents profitable self-slashing. Ethereum's whistleblower reward is small (1/4096 of balance) and decoupled from the penalty, which nobody receives. But self-reporting cuts the effective fine to (1-α)S (Kaplow-Shavell). α must still cover third-party challengers' costs (Hydra; verifier's dilemma). | **Supports**. **Change** §8.5 to p(1-α)S > G | 3.3, 3.4, 5.1, 5.2 |
| Objective proof (msg 3) separate from subjective claims (msg 4-5) | Exactly EIGEN's objectively vs intersubjectively attributable split; Casper slashing conditions; EIGEN excludes subjective faults. | **Strongly supports** | 3.1, 3.6 |
| Objective proof bound to the challenger | Standard front-running defence (Flash Boys 2.0, submarine sends). | **Supports**. **Extend** to `claimFake` | 5.3 |
| Optimistic default for subjective claims (uncontested ⇒ upheld) | Rests on 1-of-N watchers. The verifier's dilemma, censorship windows and griefing factors all apply. UMA's CoC>PfC does not transfer (PfC off-chain). TCR and P+ε failures apply when escalated. | **Warns** (the vigilant variant); `AUTO_DISPUTE` mitigates it | 1.2, 1.7, 2.4, 2.6, 2.7, 4 |
| Subjective path limited to publicly verifiable claims | Peer prediction: truth on unverifiable questions is one equilibrium among uninformative ones. Keynesian beauty contest. UMIP-170 "publicly verifiable". EIGEN: no guarantees for subjective faults. | **Supports** | 1.8, 1.9, 3.6, [ADJ] §4 |
| Flag, not erase; prospective flag; verifier policy | Accountability literature attributes faults; it does not rewrite history. Weak subjectivity: once stake leaves, evidence can still arrive. A time-scoped policy is sound only when the fault time is known (EIGEN: retroactively vs concurrently observable). | **Supports** | 3.1, 3.5, 3.6 |
| No treasury | Removes the "honest fee payers fund bounty hunters" path ([DEV] §3.1) and the drain target (spec §8.2). It also removes any subsidy for watchers (TrueBit jackpots, attention challenges). | **Supports**, but means watchers are unpaid unless claims are false | 2.4, [DEV] |
| Unbonding period before withdrawal | Ethereum keeps slashed validators about 36 days. Casper and weak subjectivity: after withdrawal, no incentive remains. BoLD: windows ≥ Cmax + D. | **Supports**; size it (section B) | 2.6, 3.4, 3.5 |
| Level-1 issuer bond backing many keys | Restaking cascades (Durvasula-Roughgarden); judgment-proof issuers. | **Warns**: over-collateralise | 3.6 |

## B. Parameter guidance (formulas)

Notation: S stake; α reward share; B claim bond; G forger's gain per believed fake; p probability that evidence is produced and accepted; ε₁, ε₂ adjudication error rates (missed fake, wrongly upheld claim); c_ch the challenger's cost; q the probability that a false claim is disputed; L liveness; T_dvm the worst-case oracle resolution time; C_max the tolerated censorship time; U the unbonding period.

1. **Deterrence (corrected §8.5)** `[ANALYSIS]` from Polinsky-Shavell and Kaplow-Shavell:
   `(1 - ε₁ - ε₂) · p · (1 - α) · S  >  G`.
   For several fakes n before detection, use `n·G` on the right ([DEV] §3.4).
   The protocol cannot enforce this. It publishes S, and verifiers decide.
2. **Challenger participation (third party)** `[ANALYSIS]`, Hydra and verifier's-dilemma logic: `α · S ≥ c_ch + gas`. Combined with 1, this gives the feasible band
   `c_ch / S  ≤  α  <  1 - G / ((1-ε₁-ε₂)·p·S)`.
   Precedent puts α small: Ethereum's whistleblower share is 1/512 (phase0) and 1/4096 (Electra) of the balance.
3. **Claim bond against false claims on unattended devices** (vigilant variant) `[ANALYSIS]`. A false claimant's expected value is `(1-q)·αS − q·B`. This is negative iff `q > αS / (αS + B)`.
   With `B = αS`, more than half of false claims must be disputed. With `B = 4αS`, more than one fifth.
   Rule of thumb: `B ≥ αS`, and more where monitoring is weak. Alternatively, use `AUTO_DISPUTE` (q = 1).
4. **Griefing bound** (Buterin's griefing factor) `[ANALYSIS]`. An honest owner's cost per false claim (B locked for L + T_dvm, plus attention) should not exceed the attacker's expected loss `q·B`. Symmetric bonds give a factor of about 1 when disputes are certain.
5. **Liveness** (BoLD) `[SOURCE]`/`[ANALYSIS]`. `L ≥ C_max + D`. BoLD uses about a week for C_max on Ethereum. UMA's 2-hour default ([ADJ]) is only safe if censoring the owner for 2 hours costs more than αS.
6. **Unbonding** `[ANALYSIS]` from Ethereum and Casper. `U ≥ L + T_dvm·(1 + rolls) + C_max`, where T_dvm is 48-72 h and up to 4 rolls are possible per [ADJ] §1. Ethereum's precedent is about 36 days after a slash.
   For key extraction, detection time is unbounded. Hence the "strict" verifier policy for keys that withdrew without a flag.
7. **Stake size** (Polinsky-Shavell maximal fine; Budish flow vs stock) `[ANALYSIS]`. Raising S is the cheapest lever on deterrence, but its cost is the holder's opportunity cost `r·S·U` per key lifetime. That cost prices out casual users ([DEV] §3.4.5).
   No source gives a universal S. Publish S per key and let verifiers set thresholds.
8. **Issuer bond (level 1)** `[ANALYSIS]` from Durvasula-Roughgarden. Over-collateralise by a margin γ such that issuer bond ≥ (1+γ)·Σ(per-key PfC estimate). Without such a margin, one slash can cascade.

## C. Five strongest objections and the best answers

1. **"Your security is a number, not a theorem: S is bounded and G is not."** (Becker, Shavell's judgment-proof problem, Budish.)
   - **Answer:** agreed, and the spec says so (§8.5, §9.3). The claim is calibrated: "a known amount is at risk under public conditions".
   - What *is* a theorem is the objective path: an `EXTRACTED` signature is unforgeable without the key (EUF-CMA of ECDSA), so slashing on it has no false positives.
   - Present S as a public risk parameter, like a bond rating, not as security.
2. **"Self-reporting: the forger is also the challenger, so the fine is (1-α)S, not S."** (Kaplow-Shavell.)
   - **Answer:** correct, so fix §8.5 and keep α small (Ethereum: 1/4096). The burn guarantees that self-slashing is always a net loss.
   - No good answer exists for making the forger pay *more* than S.
3. **"Optimistic resolution assumes someone is watching; the verifier's dilemma says they will not."** (Luu et al.; Landis; TrueBit.)
   - **Answer:** (a) the owner, whose stake is at risk, is the designated watcher; (b) `AUTO_DISPUTE` in v2.1 sends every claim to the oracle, so silence never upholds a claim; (c) set B ≥ αS and liveness of days.
   - The residual cost is oracle load and latency. That is a real trade-off, not a solved problem.
4. **"Any token-vote oracle is bribable (P+ε, Dark DAOs), and UMA's CoC>PfC argument needs PfC on-chain, which yours is not."**
   - **Answer:** this is why no *key-level* guarantee rests on the vote. The vote only decides claims that observers can check from public evidence (EIGEN's intersubjective class; UMIP-170). Verifiers can choose the policy that ignores `DisputeUpheld` flags.
   - Partial answer: for that path, the guarantee is no stronger than the DVM.
5. **"Sybil: a flagged attacker re-registers for S; level 0 proves nothing about cameras."** (Douceur.)
   - **Answer:** level 0 claims only priced identities, by design. Physical binding is level 1 or 2 (issuer attestation, [DEV]).
   - Douceur says Sybil resistance needs either a trusted authority or a resource. Paprika uses a resource at level 0 and an authority (issuer) at level 1, and says which is which.
   - No good answer at level 0 beyond "verifiers weigh by stake and age".

(A runner-up objection: front-running of `claimFake`. Answer: bind the evidence commitment to the claimant. It is a one-line fix and should be made.)

## D. Reading list for the defence (8 names)

1. **Buterin, "The P + epsilon Attack" (2015)**: why any Schelling vote can be bribed at zero equilibrium cost.
2. **UMA DVM whitepaper, "CoC > PfC" (2020)**: the economic-guarantee argument, and its precondition (measurable on-chain PfC) that Paprika does not meet.
3. **EIGEN whitepaper, Eigen Labs (2024), §1.2**: objectively vs intersubjectively attributable vs subjective faults, Paprika's two challenge types by name.
4. **Buterin and Griffith, "Casper FFG" (2017)**: slashing conditions and accountable safety; `EXTRACTED` signatures are a slashing condition.
5. **Luu, Teutsch, Kulkarni, Saxena, CCS 2015**: the verifier's dilemma behind "a claim nobody contests is upheld".
6. **Polinsky and Shavell, "Public Enforcement of Law" (incl. Becker 1968; Kaplow and Shavell 1994)**: expected-sanction deterrence, errors `(1-ε₁-ε₂)pf`, and the self-reporting discount.
7. **Douceur, "The Sybil Attack" (IPTPS 2002)**: no Sybil resistance without an authority or a resource cost.
8. **Breidenbach, Daian, Tramèr, Juels, "Enter the Hydra" (USENIX Sec 2018)** with **Daian et al., "Flash Boys 2.0" (S&P 2020)**: bounties as contracts, and why claims must be bound to the claimant.

---

## Claims table

| # | Claim | Tag | Reference | Quote |
|---|---|---|---|---|
| 1 | Schelling votes can be captured at zero equilibrium cost | SOURCE | Buterin 2015, blog.ethereum.org/2015/01/28/p-epsilon-attack | "The attack has successfully managed to take over the mechanism at zero cost." |
| 2 | Appeals plus redistribution make p+ε budgets grow quadratically (under conditions) | SOURCE | George & Lesaege, CES'20 (PubPub PDF) | "budget requirements which grow quadratically in the number of participants" |
| 3 | UMA's security condition is CoC > PfC | SOURCE | UMA DVM whitepaper v0.2 (GitHub) | "the cost of corruption must always remain greater than the profit from corruption" |
| 4 | UMA measures PfC via registered contracts | SOURCE | same | "All contracts using the system must be registered with the DVM." |
| 5 | Kleros assumes honesty is the focal point | SOURCE (via sub-agent) | Kleros short paper v1.0.7 | "In Kleros, the Schelling Point is honesty and fairness." |
| 6 | Beauty contest: coordinate on expected average opinion | SOURCE | Keynes 1936 ch. 12 (marxists.org) | "anticipating what average opinion expects" |
| 7 | Peer prediction: honest reporting is a Nash equilibrium | SOURCE (abstract) | Miller, Resnick, Zeckhauser 2005 | "Honest reporting proves to be a Nash equilibrium." |
| 8 | Peer prediction also has uninformative equilibria | SOURCE (via sub-agent) | Dasgupta & Ghosh WWW 2013 | "always reporting 'good' or always reporting 'bad' both constitute Nash equilibria" |
| 9 | Peer prediction needs a common prior | SOURCE (via sub-agent) | Witkowski & Parkes EC 2012 | "critically depends on the assumption of a common prior" |
| 10 | Fraud-proof systems are 1-of-N trust | SOURCE | Buterin, "Trust Models" 2020 | "Any system based on fraud proofs falls into this category" |
| 11 | Arbitrum any-trust | SOURCE (via sub-agent) | Kalodner et al. USENIX Sec 2018 | "any one honest manager can force the VM to behave" |
| 12 | Verifier's dilemma | SOURCE (abstract, via sub-agent) | Luu et al. CCS 2015 / ePrint 2015/702 | "are well-incentivized to accept unvalidated blockchains" |
| 13 | TrueBit forced errors | SOURCE (via sub-agent) | Teutsch & Reitwießner, arXiv 1908.04756 | "occasionally forcing Solvers to submit incorrect solutions" |
| 14 | Challenge period must cover censorship | SOURCE (via sub-agent) | Alvarez et al., BoLD, arXiv 2404.10491 | "large enough to allow an honest party to make all of their moves and to account for censorship" |
| 15 | Griefing factor definition | SOURCE | Buterin, ethresear.ch/t/2338 | "a measure of the extent to which participants in a mechanism can abuse the mechanism" |
| 16 | Accountable safety via slashing conditions | SOURCE (via sub-agent) | Buterin & Griffith, arXiv 1710.09437 | "cannot both be finalized unless ≥ 1/3 of validators violate a slashing condition" |
| 17 | Slashing as confiscation without collateral damage | SOURCE (via sub-agent) | Budish, Lewis-Pye, Roughgarden EC 2024 | "without collateral damage to honest participants" |
| 18 | Flow vs stock security | SOURCE (via sub-agent) | Budish NBER WP 24717 | "must be large relative to the one-off, "stock", benefits of attacking it" |
| 19 | Errors reduce deterrence: g > (1-ε₁-ε₂)pf | SOURCE | Polinsky & Shavell, "Public Enforcement of Law" (sfu.ca PDF) | "both types of error reduce deterrence" |
| 20 | Optimal fine is maximal (risk-neutral) | SOURCE | same | "the optimal fine is maximal when individuals are risk neutral in fines" |
| 21 | Self-reporting induced by lowering sanction | SOURCE | same; Kaplow & Shavell JPE 1994 (abstract) | "Self-reporting can be induced by lowering the sanction for individuals who disclose their own infractions." |
| 22 | Judgment-proof problem | SOURCE (citation) + SECONDARY (content) | Shavell 1986, IRLE 6:45 | n/a (scanned PDF unreadable) |
| 23 | Ethereum whistleblower share 1/512 → 1/4096 | SOURCE | ethereum/consensus-specs phase0, electra | "`WHISTLEBLOWER_REWARD_QUOTIENT_ELECTRA` \| `Uint64(2**12)` (= 4,096)" |
| 24 | EIGEN: objectively attributable faults | SOURCE | EIGEN whitepaper §1.2.1 | "attributable purely mathematically and cryptographically without the need to ask the opinions of others" |
| 25 | EIGEN: intersubjective faults | SOURCE | §1.2.2 | "broad-based agreement among all active observers of the system" |
| 26 | EIGEN: subjective faults excluded | SOURCE | §1.2.3 | "we cannot build strong cryptoeconomic guarantees on these type of "faults"" |
| 27 | Majority slashing = tyranny of majority | SOURCE | EIGEN §1.1 | "a minority of honest agents can be slashed" |
| 28 | Restaking CoC/PfC | SOURCE (via sub-agent) | EigenLayer whitepaper 2023 | "When CoC is much greater than any potential Profit-from-Corruption (PfC)" |
| 29 | Restaking cascades bounded by overcollateralisation | SOURCE (via sub-agent) | Durvasula & Roughgarden ITCS 2025 | "if attack costs always exceed attack profits by 10%" |
| 30 | Sybil impossibility without authority | SOURCE (via sub-agent) | Douceur IPTPS 2002 | "Sybil attacks are always possible except under extreme and unrealistic assumptions" |
| 31 | Weak subjectivity: withdrawn deposit removes incentive | SOURCE (via sub-agent) | Buterin 2014 blog | "once the deposit is withdrawn there is no longer any incentive" |
| 32 | Hydra exploit gap pays bounty at runtime | SOURCE (abstract) | Breidenbach et al. USENIX Sec 2018 | "enables runtime detection, and rewarding, of critical bugs" |
| 33 | Vote buying in coin voting | SOURCE (via sub-agent) | Buterin 2021, "Moving beyond coin voting governance" | "outright attacks through various forms of (often obfuscated) vote buying" |
| 34 | Dark DAO realised | SOURCE (abstract) | Austgen et al. arXiv 2311.03530 | "we present the first practical realization of a Dark DAO" |
| 35 | Oracles: voting allows accumulation and bribery | SOURCE (via sub-agent) | Eskandari et al. AFT 2021 | "an actor can accumulate voting rights to sway the vote" |
| 36 | Optimistic rollup incentives questioned | SOURCE (abstract) | Landis arXiv 2312.01549 | "These methods rely on economic incentives to guarantee their security" |
| 37 | Rational watchtowers secure under independence | SOURCE (abstract) | Sheng et al. arXiv 2402.07241 | "provably secure when watchtowers are rational actors" |
| 38 | 7-day window was for social response | SOURCE (via sub-agent) | donnoh, ethresear.ch 2025 | "set to allow a social response in case of a 51% consensus attack" |
| 39 | Unverifiable outcomes are a recognised problem | SOURCE (abstract) | Srinivasan, Karger, Chen arXiv 2306.04305 | "difficult to verify or unverifiable" |
| 40 | `claimFake` front-runnable | ANALYSIS | `PaprikaV2_1.sol` l.106-125 | `require(!r.claimOpen, "claim open")`; evidenceHash not bound to sender |
| 41 | Becker 1968 citation | SECONDARY | JPE 76(2), DOI 10.1086/259394 | n/a |
| 42 | TCR 1.0 definition | SECONDARY | Goldin 2017 (Medium 403) | n/a |
| 43 | Chainlink super-linear staking | SECONDARY | Chainlink 2.0 whitepaper 2021 | n/a |

## Could not verify

- **Becker 1968**: no page opened (403 or blocked). Bibliographic data only.
- **Shavell 1986**: the scanned PDF was unreadable. The content is from search summaries.
- **Polinsky & Shavell 1979 AER**: bibliographic data only. The claim is taken from their own survey.
- **Goldin "TCR 1.0"**: Medium returned 403.
- **Submarine sends**: the post did not load.
- **Bonneau 2016; Judmayer et al. 2021; Winzer et al. 2019; Levine et al. 2006**: metadata only.
- **Kleros yellow paper** at its official URL: only a mirror was read.
- **Augur v2 whitepaper**: search only.
- **Chainlink 2.0 super-linear staking** and its critique: search summaries only.
- **Primary source on theft or front-running of fraud-proof rewards in rollups**: not found.
- **"Kleros: a socio-legal case study of decentralized justice"**: title not found. Do not cite.
- **McConaghy's TCR posts; Ito & Tanaka on curation markets**: not verified.
- **Robust BTS (Witkowski & Parkes, AAAI 2012)**: AAAI page blocked.
- **Peer-review status of George & Lesaege (CES'20)**: unclear.
- **Exact page numbers for CCS 2015 (706-719)**: from search results.

## [MEMORY] list (unverified, do not cite as fact)

- Schelling, *The Strategy of Conflict* (1960), as the origin of "focal point". George & Lesaege cite "[Schelling 1980]", an edition, which was not checked.
- Jurca & Faltings as the source of the "blind agreement" equilibria cited by Dasgupta & Ghosh. Not checked.
- Felten's blog post "Cheater checking: How attention challenges solve the verifier's dilemma" (cited by Sheng et al. 2402.07241, per a search summary). Not opened.
- That Ethereum's slashing penalties reduce total ETH supply: the spec code only shows `decrease_balance` on the slashed validator, with the rewards credited separately. "Burned" is an inference from the code, not a quoted statement.
- EigenLayer's later "redistributable slashing" (2025), as a contrast to burning. Not checked today.
