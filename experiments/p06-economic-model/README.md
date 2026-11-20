# p06: economic model of the Paprika v2 stake-and-challenge game

## Purpose
Make the incentive argument of `spec/PROTOCOL.md` (sections 4, 5, 8, 9) explicit and checkable: who
the players are, what they can do, what each outcome pays, and for which parameter values each
inequality of the red-team review (`docs/reviews/paprika-redteam.md` section 5.3) holds. The output
is a set of closed-form thresholds, parameter sweeps (CSV), Monte Carlo checks of the closed forms,
and a recommended parameter set for the prototype with the region where it works and where it does not.

## How to run
```
python3 model.py
```
Python 3.13 standard library only, no network, deterministic (every random generator has a fixed
seed). Runtime about 1 s. It rewrites everything in `output/`:

| File | Content |
|---|---|
| `output/console-run.txt` | raw console output of the final run (all tables T1-T24) |
| `output/tables.md` | the same tables as Markdown |
| `output/sweep_forgery.csv` | S x alpha x p x phi x G (896 rows): forger EV, G_max, deterred? |
| `output/sweep_challenger.csv` | S x alpha x B/S x q x phi (384 rows): honest claimant EV |
| `output/sweep_griefing.csv` | S x alpha x B/S x q x w x V x beta (4608 rows): griefer EV, griefing factor, B_min, w_min, watcher profit, UMA-minimum check |
| `output/sweep_joint.csv` | S x alpha x B/S x p x q x w (3072 rows): all verdicts side by side |
| `output/sweep_v2_1.csv` | v2.1 scenario: S x alpha x B/S (<= 1) x e_false x V x q_true x phi (3456 rows) |

The v2 results (T1-T17) are unchanged; the v2.1 scenario (T18-T24) is in the section "v2.1 scenario" below.

## Inputs: what is measured and what is assumed

**Measured** (gasUsed, Hardhat, optimizer 200, hardfork osaka) from
`experiments/p03-paprika-v2-hardened/output/2026-11-20-run.txt` (p03 has no README yet; its run
output is the source): register 127,018; attest 86,026 (91,118 with deposit); claimFake 251,579;
settle undisputed 162,412; claimCredit 28,557; dispute 44,632; proveKeyMisuse 99,220;
requestUnbond 51,013; withdraw 35,213. Composite bills: claimant 442,548 (claim + settle + credit),
disputer 73,189, key life-cycle 213,244.

**From sources** (`docs/research/adjudication-uma-and-alternatives.md` section 1): OOv3 pays the winner
of a dispute its own bond back plus half of the loser's bond (beta = 0.5; the other half goes to UMA's
Store); minimum bond = 2 x final fee = 0.11 WETH (500 USDC); default liveness 2 h; vote 48-72 h.
The p03 mock pays the winner the whole loser bond (beta = 1); both are modelled.

**Assumed, measured by nobody here**: ETH = 3000 USD; gas price 0.05 / 1 / 20 gwei (L1 data fees
of rollups not included; p05 chain options did not exist when this ran); cost of capital r = 5 %/yr;
challenger's cost to find and package evidence c = 50 USD; 1000 photos per device per year;
watcher monitoring cost M = 5 USD/day. **p, q, w, G and V are not measured by anyone**; they are
swept, never estimated.

## Formal model

### Players and strategies
| Player | Strategies | Payoff-relevant parameters |
|---|---|---|
| Forger F | forge or not; one key per fake, or n fakes per key; snipe its own challenge (self-report through a Sybil) | G per accepted fake, k identities |
| Honest owner H | register, attest, dispute claims against itself if it notices them | S, d, check interval |
| Challenger C | file a misuse proof or a claim, or not | c, alpha, B |
| Griefer X | file false claims against H until one is upheld, or not | V (private value of H being flagged) |
| Watcher W | monitor all claims and dispute false ones, or not | M per day |
| Voters | vote correctly with probability q; can be bribed at cost K | q, K |

### Assumptions (numbered; every formula below depends on them)
- **A1** Risk-neutral players maximising expected value; one-shot decisions; no reputation.
- **A2** F collects G whether or not it is caught later (a flag is prospective, spec section 6).
- **A3** p = P(evidence against a key is produced and acted on before its stake is withdrawn, i.e.
  within U of the forgery). Two channels combine as p = 1 - (1 - p_obj)(1 - p_sub). The sweeps use p.
- **A4** phi = P(F snipes the challenge): F holds its own key, so when it sees a challenge coming
  (a 2 h public liveness window, or a misuse proof in a public mempool) it submits its own misuse
  proof from a Sybil and collects alpha S itself. p03 test 12 shows this works in v2 as built, so
  **phi = 1 for the subjective path of v2 as built**. phi = 0 needs private order flow and a contract
  change (below).
- **A5** A disputed claim is decided correctly with probability q, independently of everything else.
  "Cannot be verified from public evidence" resolves as not upheld (UMIP-170/191), which is correct
  for false claims and counted as an error for true-but-unprovable ones (it lowers q for true claims).
- **A6** Winner of a dispute: own bond back + beta x loser's bond. beta = 0.5 (OOv3), 1 (p03 mock).
- **A7** A claim is disputed within the liveness L with probability w = 1 - (1 - w_owner)(1 - w_watchers);
  an owner who checks every T hours has w_owner ~ min(1, L/T).
- **A8** Who pays gas: the claimant pays claimFake + settle + claimCredit, the disputer dispute +
  claimCredit, F pays register + attest + requestUnbond + withdraw. No gas refunds.
- **A9** Locked capital costs r per year, linearly.
- **A10** Closed-form griefing: X has no budget limit and repeats until one claim is upheld (the Monte
  Carlo also runs a capped budget).
- **A11** A wrongly flagged honest owner loses S + d + the gas to register a new key; nothing else
  (no value of past records, no reputation).
- **A12** The ETH price is constant over the life of a stake.

### Payoffs and thresholds
Notation: lambda = 1 - phi alpha (fraction of stake F really loses when caught), g_x = gas of x in ETH.

1. **Forgery, one key per fake.**
   `EV_F = G - g_F - r S U/365 - p lambda (S + d)`, with g_F = gas(register + attest + unbond + withdraw).
   Deterred iff EV_F <= 0, i.e. `G <= G_max = g_F + (p lambda + r U/365) S`, or
   `S >= S_min(G) = (G - g_F) / (p (1 - phi alpha) + r U/365)`.
   Recycling the stake after U costs F only r S U/365 when it is not caught.
   **n fakes per key** (a detection flags the key at once, later fakes are never made):
   per-fake break-even `G = [sum_j (1-p)^(j-1) p lambda (S + j d) + r (S + n d) U/365 + g_key + E[n] g_a] / E[n]`,
   `E[n] = sum_{j=1..n} (1-p)^(j-1)`. For large n this tends to `lambda (p S + d)`: without a deposit the
   stake deters only ~p lambda S per fake however many fakes share the key; a deposit d adds a
   p-independent lambda d per fake, but only against forgers who keep one key long enough to be caught.
2. **Self-report.** Misuse path `Pi = -(1 - alpha)(S + d) - g_reg - g_mis`; subjective path
   `Pi = -(1 - alpha) S - g_reg - g_a - g_claim` (bond returned, claim true and undisputed).
   Negative for every alpha < 1. At alpha = 1 the loss is gas only, and lambda = 1 - phi: a sniping
   forger then loses nothing when caught.
3. **Honest challenger.** Objective: `Pi_C = (1 - phi) alpha (S + d) - c - g_mis`.
   Subjective, true claim: the guilty owner disputes iff `(1-q)(S + beta B) > q B + g_d`; then
   `Pi_C = (1 - phi)[q (alpha S + beta B) - (1 - q) B] - c - g_claim`, otherwise
   `Pi_C = (1 - phi) alpha S - c - g_claim`. With phi = 0 and a disputing owner, C acts iff
   `alpha S >= (c + g_claim + (1 - q) B)/q - beta B`. With phi = 1, Pi_C = -c - gas < 0 for every S and alpha.
4. **Griefing** (false claim against H). Per attempt: upheld with `Ps = (1 - w) + w(1 - q) = 1 - wq`.
   Attempts until one is upheld `N = 1/Ps`. X's outlay `Cost_X = (w q B + g_claim)/Ps`.
   X's net `Net_X = alpha S + V + (w(1-q) beta B - w q B - g_claim)/Ps`.
   H's loss `Loss_H = S + d + g_reg - w[q(beta B - g_d) - (1 - q)(B + g_d)]/Ps` (negative = H gains from bonds).
   **Griefing factor** `GF = Loss_H / Cost_X`.
   Griefing is irrational iff `B >= B_min = (Ps(alpha S + V) - g_claim) / (w (q - beta(1 - q)))`, which
   needs w > 0 and q > beta/(1 + beta) (1/3 for OOv3); equivalently iff
   `w >= w_min = (alpha S + V - g_claim) / (q (alpha S + V + B) - (1 - q) beta B)`.
   **Watcher**: profit per false claim disputed `pi_W = q beta B - (1 - q) B - g_d`, positive iff
   q > 1/(1 + beta) (2/3 under OOv3, 1/2 under the mock). Running a watcher pays iff
   (false claims per day) x pi_W > M. If griefing is deterred there are no false claims, so the
   watcher's revenue is zero: w -> 1 is **not** self-sustaining (section T16).
5. **Bribery.** One flipped vote is worth `alpha S + V + beta B` to a griefer (wrongful flag) and
   `(1 - phi alpha) S + beta B` (+ the key's future forgeries) to a forger (save a guilty key). The
   oracle's economic security bounds the protocol's iff, for every vote round,
   `K_round > sum over disputes in that round of max(alpha S + V + beta B, (1 - phi alpha) S + beta B)`;
   the oracle's K_round is shared with all its other integrations.
6. **Sybils / ban evasion.** N identities cost N (g_reg + S) of locked capital. Rotating one key per
   fake at f fakes/day keeps `S f U` locked (cost r S f U per year); a flag costs the flagged stake
   (times lambda) and one new registration.
7. **Honest user, per year.** `r (S + d n/2) + n g_a + g_reg/3 + (griefing attempts) x Ps x S`.

## Key results (numbers from `output/console-run.txt`)

**Forgery deterrence is weak and scales only with p S.** Largest deterred gain per fake (USD), alpha = 0.5, U = 7 d (T1):

| S (ETH) | phi | p=0.001 | p=0.01 | p=0.1 | p=0.5 |
|---|---|---|---|---|---|
| 0.1 | 0 | 1.5 | 4.2 | 31 | 151 |
| 0.1 | 1 | 1.3 | 2.7 | 16 | 76 |
| 1 | 0 | 6.8 | 34 | 304 | 1,504 |
| 10 | 0 | 60 | 330 | 3,030 | 15,030 |

Stake needed (T2): G = 1,000 USD needs 3.3 ETH at p = 0.1 (6.5 ETH if phi = 1); G = 100,000 USD needs
330 ETH at p = 0.1; G = 10M USD needs 6,654 ETH even at p = 0.5. Many fakes on one key (T3, S = 0.1,
p = 0.01, phi = 1): per-fake deterrence falls from 2.7 USD (one key per fake) to 1.8 USD; a deposit
d = 0.01 ETH lifts it to 17 USD at 1000 fakes/key, at the price of 10 ETH locked per 1000 photos for an
honest user.

**Self-report** (T4, S = 0.1): loses 151 USD at alpha = 0.5, 31 USD at 0.9, 0.7-2 USD (gas only) at
alpha = 1. Never profitable while alpha < 1 and there is no external subsidy; at alpha = 1 any outside
value turns it into a free option, and a sniping forger loses nothing when caught.

**Honest challenger** (T5, c = 50 USD): needs alpha S >= ~51 USD (c + gas), i.e. S >= 0.034 ETH at
alpha = 0.5; above S ~ 1 ETH a guilty owner finds it worth disputing a true claim (q <= 0.8) and the
claimant's EV drops (but stays positive). **With phi = 1 (v2 as built) the claimant earns -51 USD for
every S and alpha**: nobody is paid to file claims against forger-controlled keys, so p_sub rests on
altruists. Tension with (2): sniping makes the effective penalty (1 - alpha) S and the reward
alpha S (1 - phi); alpha = 0.5 maximises the worse of the two.

**Griefing** (T6, prototype S = 0.1, alpha = 0.5, B = 0.05, beta = 0.5):

| q | w | attempts | X outlay USD | X net USD | H loss USD | GF |
|---|---|---|---|---|---|---|
| any | 0 | 1 | 1.33 | +149 | 300 | **226** |
| 0.8 | 0.5 | 1.7 | 102 | +60 | 276 | 2.7 |
| 0.8 | 0.9 | 3.6 | 390 | -192 | 205 | 0.52 |
| 0.95 | 0.9 | 6.9 | 894 | -720 | -94 (H gains) | <0 |
| 0.6 | 0.9 | 2.2 | 179 | +30 | 330 | 1.8 |

Across the whole sweep the unwatched (w = 0) griefing factor is 23 to 22,600 (it is S / gas). Bond needed
(T7, B_min/S, alpha = 0.5): V = 0, q = 0.8: 0.86 at w = 0.5, 0.22 at w = 0.9; V = S: 2.6 and 0.67;
V = 10 S: 18 and 4.7; w = 0: no bond suffices. Vigilance needed (T8): with B = S and q = 0.8, w_min =
0.45 (V = 0), 0.79 (V = S), 1.15 i.e. impossible (V = 10 S). Watchers (T9) lose money at q = 0.6
under OOv3's 50 % burn; at q = 0.8, B = 0.11 they earn 66 USD per false claim disputed.

**Bribery** (T10): one wrongful flag is worth 315 USD at S = 0.1 (V = 0) and 33,000 USD at S = 1,
V = 10 S. Per dispute this is far below any plausible cost of corrupting a UMA round (not measured;
the research notes put UMA's market cap near 95M USD, secondary source), so the binding limit is
q on interpretive questions and batched disputes, not single-vote bribery.

**Honest cost** (T12, 1000 photos/yr): at S = 0.1, capital 15 USD/yr + gas 13 USD (0.05 gwei),
258 USD (1 gwei) or 5,164 USD (20 gwei). Gas dominates unless gas is L2-cheap; per photo 0.013 /
0.26 / 5.2 USD (T12b).

**Joint sweep** (T14, 3072 cells, V = 0, phi = 0): griefing irrational in 0 / 296 / 552 / 628 of 768
cells at w = 0 / 0.5 / 0.9 / 1; all three conditions (griefing irrational, true claimant acts,
watcher profitable per dispute) in 840 cells, none with w = 0.

## Simulation vs closed form
- **Agree.** Griefing campaigns (T15, 40,000 campaigns per case): attempts, X net and victim loss
  match the closed form within sampling error (|z| <= 2.0). Many fakes per key with stopping (T3):
  Monte Carlo within -0.2 % to +1.1 % of closed form B.
- **Disagree, by construction of the closed form.** (a) Closed form A (no stopping) understates the
  per-fake deterrence by up to 4x at 1000 fakes/key; B is the right formula. (b) A griefer capped at 5
  attempts (T15) succeeds only 54 % of the time at B = 0.11, q = 0.95, w = 0.9 and loses less in
  total; the unlimited-budget formula is the worst case for H, not the typical case.
- **Disagree, substantively: the watcher equilibrium.** The population simulation (T16, 1000 devices,
  20 adaptive griefers, 10 candidate watchers, M = 5 USD/day) does not settle at the closed-form
  "all watchers active, griefing irrational" point. Watchers leave when there are no false claims,
  griefers return when vigilance drops, and the system cycles: with B = 0.05, q = 0.8, w_owner = 0.5,
  griefers attack on 6 % of days and cause 0.5 wrongful flags/day (per 1000 devices) although they lose
  25 USD/day overall; with B = 0.11, q = 0.95 but w_owner = 0.1: 0.56 wrongful flags/day. With q = 0.6
  (watchers unprofitable under OOv3) no watcher ever enters and griefing runs every day:
  14 wrongful flags/day, griefers +738 USD/day. Where the owner's own vigilance already meets w_min
  (B = 0.11, q >= 0.8, w_owner = 0.5; or B = 0.5, w_owner = 0.1) no griefing occurs at all. Lesson:
  **owner vigilance (long L) is the stable defence; paid watchers are a cyclic, not a standing, one.**

## Recommended parameters for the prototype
| Parameter | p03 as built | Recommended | Reason |
|---|---|---|---|
| S (MIN_STAKE) | 0.1 ETH | **0.1 ETH** (demo); state that it deters only G up to ~3-30 USD per fake (p = 0.01-0.1) | Honest cost 15 USD/yr capital. Any S an individual can afford deters only small G; the stake is a public number a verifier weighs, not a guarantee. |
| alpha (REWARD_BPS) | 0.5 | **0.5** | Maximises min(alpha, 1 - alpha): a sniping forger still loses S/2; an unsniped challenger earns S/2 (> c + gas for S >= 0.034 ETH, c = 50 USD). alpha = 1 voids deterrence under sniping. |
| B (CLAIM_BOND) | 0.05 ETH | **0.11 ETH** (= UMA's minimum bond in WETH; 0.05 is below it) | Griefing irrational at q = 0.8 for w >= 0.42 (V = 0) and w >= 0.76 (V = S); watcher earns 66 USD per dispute (T17). B >= S as S grows. |
| L (liveness) | 2 h | **24 h** | Griefing defence rests on owner vigilance w_owner ~ L/T; a phone owner does not check every 2 h. Cost: a true claim flags a key 22 h later (the flag is prospective anyway). |
| U (unbonding) | 7 d | **30 d** | Must exceed L + vote (72 h); p accrues only while the stake is locked; quadruples the forger's rotation capital (S f U) at no running cost to honest users (one-time delay at retirement). |
| d (deposit) | optional | **0** | Deters only long-lived high-volume keys (lambda d per fake) and locks capital per photo for honest users; leave optional. |
| Contract change | - | **reward of a misuse proof made while a claim is open goes to that claimant; commit-reveal for claims** | Moves phi from 1 towards 0. Without it the subjective path pays no challenger (T5) and the penalty is S/2, not S. |

T17 compares the sets: the recommended set turns griefing at w = 0.5 from +60 USD to -45 USD for X and
lowers GF at w = 0.9 from 0.52 to 0.10, without changing the honest user's cost.

## Where the mechanism works and where it does not (plain words)
**Works:** low-value, high-volume fakes (G of a few to a few hundred USD per fake) when the
probability that evidence surfaces within U is at least a few percent; honest users on cheap gas
(<= 0.05 gwei) pay ~30 USD/yr at S = 0.1; false claims against owners who answer within the liveness
window (w >= 0.5) lose money for the griefer when the vote is right at least 80 % of the time and
B ~ S; self-reporting never pays for alpha < 1; there is nothing to drain.

**Does not work:** any forgery worth more than about p x S/2 (e.g. a 10,000 USD political fake needs
33-65 ETH of stake even with a 10 % detection chance, more than any device owner will lock); forgers
who snipe their own challenges (v2 as built) cut their loss to S/2 and leave honest challengers unpaid;
unmonitored devices (w = 0) can be flagged for the price of gas, griefing factor in the hundreds;
griefers with a private motive V much larger than S (competitors, harassment) cannot be priced out by
any bond unless vigilance is near 1; at vote accuracy q <= 2/3 OOv3's half-burn makes watching
unprofitable and griefing permanent; on L1 gas (20 gwei) attestation alone costs ~5 USD per photo.

## What the model leaves out
Reputation and the off-chain value of a device's past records; correlated voter errors and voter
herding (q is independent per vote here); off-chain collusion between forger and challenger, or
griefer and voters, beyond a single bribe; price volatility of the staked ETH (A12) and of gas;
rollup L1 data fees; strategic timing by griefers (the simulated griefers are myopic, a smarter
griefer would attack exactly when watchers have left); multiple claims per record set and spam claims
that only block withdrawal (p03 test 13); assurance levels 1-2 and issuer bonds; the value of a key's
future forgeries in the bribery bound; legal liability; the claim that verifiers actually weigh records
by stake. p, q, w, G, V, c and M are assumptions, swept and never estimated.

## v2.1 scenario (spec sections 4, 5, 8, 10 as revised after p03)

v2.1 makes three changes to the game, and the model now also covers it (tables T18-T24, `sweep_v2_1.csv`):
(1) the contract disputes every subjective claim itself, using a dispute bond B taken from the
device's stake (one open claim per device; claims need stake >= B). So w = 1 by construction and every
flag needs an affirmative vote. (2) Open claims have priority on the stake: a misuse proof made while a
claim is open pays the prover nothing if the claim is upheld. (3) Every claim takes a DVM vote
(48-72 h) and occupies the device's claim slot for that time.
**Gas** is measured in `experiments/p03-paprika-v2-hardened/output/2026-11-20-run-v2_1.txt`
("GAS v2.1, auto=on"): register 127,154; attest 63,776; claimFake 266,827; settle upheld 136,378;
settle rejected 95,176; claimCredit 28,557; proveKeyMisuse 100,554. The only assumed gas figure is
the 60,000 gas burnt by a front-run claim that reverts.

### Additional assumptions
- **A13** The vote has two error rates. q_true is the probability that a true claim backed by publicly
  checkable evidence is upheld. e_false is the probability that a false or unevidenced claim is
  upheld. A true claim without public evidence resolves "not upheld" (UMIP-170/191), so it loses B.
  Both rates are assumptions; T23 uses q = 0.8, i.e. q_true = 0.8 and e_false = 0.2.
- **A14** phi is now only the mempool race before a claim is open. The owner sees the pending
  `claimFake` and self-slashes first; the claim then reverts with "stake < bond" (p03 test 12b).
  phi = 0 means private submission or commit-reveal; phi = 1 means a public mempool and an attentive forger.
- **A15** Upheld claim: the claimant gets its bond back plus alpha (S - B) plus beta B (beta of the
  device's dispute bond). The owner loses S in total. Rejected claim: the claimant loses B, and
  beta B is added to the device's stake.

### Payoffs and thresholds under v2.1
- **Griefing.** Each attempt is upheld with Ps = e_false. Attempts until one is upheld: 1/e.
  - `Cost_X = ((1-e) B + g_claim)/e`
  - `Net_X = alpha (S - B) + beta B + V - Cost_X`
  - `Loss_H = S + g_reg - ((1-e)/e) beta B`
  - `GF = Loss_H / Cost_X`
  - The owner's EV per false claim is `(1-e) beta B - e (S + g_reg)`, so **an honest device earns
    money from being griefed iff (1-e) beta B > e S**.
  - Griefing is irrational iff `B >= B_min = (e (alpha S + V) - g) / ((1-e) + e alpha - e beta)`
    (with B <= S), equivalently iff `e_false <= e* = (B + g) / (alpha (S - B) + beta B + V + B)`.
  - There is no vigilance term left. B and the vote's error rate are the only levers.
- **Honest challenger** (true, evidenced claim):
  `EV = (1-phi)[q_true (alpha (S-B) + beta B) - (1-q_true) B - g_claim] - phi g_revert - c`.
  With phi = 0 the challenger acts iff `S >= [(c + g + (1-q_true) B)/q_true - beta B]/alpha + B`.
  With phi = 1 it never acts.
- **Effective penalty** for a caught forger: `(1 - phi alpha) S`. This is S with phi = 0 and
  (1 - alpha) S with phi = 1. Once a claim is open the forger cannot reduce it.
- **Slot blocking.**
  - A griefer keeps an honest owner's withdrawal blocked for `((1-e) B + g_rej - e (alpha(S-B) + beta B)) / T_vote`
    per day. Meanwhile the owner earns `(1-e) beta B / T_vote` per day.
  - A forger's Sybil can squat its own device's slot so that no genuine claim opens before it
    withdraws (p03 test 14). This costs `((1-e)(1-beta) B + e (S - reward) + g_rej) / T_vote` per day.
  - Squatting for the whole unbonding period costs more than the stake it saves iff
    `U >= U_min = (1 - phi alpha) S T_vote / ((1-beta) B)`.

### v2 vs v2.1 (T23; q = 0.8, c = 50 USD, V = 0, 0.05 gwei, 1000 photos/yr, 1 false claim/yr)
| Set | S | B | Griefing factor | Griefer net/campaign USD | Honest challenger EV USD | Effective penalty USD | Honest owner USD/yr |
|---|---|---|---|---|---|---|---|
| v2 as built | 0.1 | 0.05 | 226 (unwatched) / 0.52 (w = 0.9) | +149 / -192 | -51 (phi = 1 forced by the 2 h public liveness) | 150 | 112 |
| v2.1 as built | 0.1 | 0.05 | 0.0006 | -456 | +39 / -50 (phi 0/1) | 300 / 150 | 25 |
| v2.1 recommended | 0.25 | 0.11 | 0.07 | -951 | +183 / -50 (phi 0/1) | 750 / 375 | 65 |

### Other v2.1 results
- **Griefing** (T18, S = 0.25, B = 0.11, V = 0). The griefing factor is negative for e <= 0.1 (the
  owner gains 73-156 USD per false claim), 0.07 at e = 0.2, 0.47 at e = 0.3 and 1.76 at e = 0.5.
  Griefing first pays at e = 0.5 (V = 0) or at e = 0.3 (V = S).
- **Error-rate threshold e*** (T19, at B = max(0.11, 0.44 S)): about 0.47 for V = 0, 0.23 for
  V = S and 0.04 for V = 10 S. A griefer who values a flag at 10 x the stake needs a bond larger than
  the stake once e >= 0.2, which v2.1 cannot accept because B <= S.
- **Honest challenger** (T20, phi = 0). The minimum stake is 0.20 ETH at q_true = 0.6, 0.10 at 0.8
  and 0.05 at 0.95. With phi = 1 the EV is -50 USD at every S.
- **Sweep** (T24). Griefing is irrational and a true claimant acts in 662 of the 3456 cells. All of
  them have phi = 0; none has phi = 1.
- **Slot blocking** (T21, e = 0.05).
  - Blocking an honest owner's withdrawal costs a griefer 45-148 USD/day, while the owner earns
    24-78 USD/day from it.
  - A forger squatting its own slot pays 27-40 USD/day at the as-built S = 0.1, B = 0.05. Over the
    as-built U = 7 d that is 186-279 USD, **less than the 300 USD stake it saves**, so squatting is
    rational for a forger who knows its fake will be exposed.
  - U_min is 8-12 d (as built) and 9-14 d (recommended). U = 30 d removes the incentive.
- **Population simulation** (T22, no watchers, 20 griefers who know e). **The watcher/griefer cycle
  of v2 disappears.** Vigilance no longer depends on anyone's profit, so griefing is either always or
  never rational, and the simulation matches the closed form `wrongful flags/day = n_griefers x e`
  (minus about 5 % of attempts that find the target's slot busy).
  - With S = 0.25, B = 0.11 and V = 0, nobody griefs for e <= 0.3 (0 wrongful flags per day per
    1000 devices). At e = 0.5 there are 9.5 per day.
  - With V = S, griefing starts at e = 0.3 (5.7 per day).
  - With V = 10 S, griefing starts already at e = 0.05: 1.0, 1.8, 3.7, 5.8 and 9.6 per day at
    e = 0.05 / 0.1 / 0.2 / 0.3 / 0.5.

### Recommended parameters for v2.1
| Parameter | v2.1 as built | Recommended | Reason |
|---|---|---|---|
| S | 0.1 ETH | **0.25 ETH** | Must be >= B (auto-dispute bond), and B >= 0.11 WETH on real UMA. Makes a true claimant profitable down to q_true = 0.6 (S_min 0.20). Capital costs 37.5 USD/yr. Still deters only G <= ~p x 750 USD per fake. |
| alpha | 0.5 | **0.5** | With phi = 1 the penalty is (1 - alpha) S and the reward 0; with phi = 0 the penalty is S and the reward alpha (S - B) + beta B. 0.5 balances the two. |
| B | 0.05 ETH | **0.11 ETH** (UMA minimum, B/S = 0.44) | Griefing is irrational for e_false <= 0.47 (V = 0) and <= 0.23 (V = S). The owner earns from false claims while e < 0.18. |
| L | 2 h | **2 h** (no longer matters for griefing) | The contract disputes at once. The vote dominates the delay: a true claim takes 2-3 days. |
| U | 7 d | **30 d** | Must exceed U_min (9-14 d) so that squatting the claim slot costs more than the stake. Also lengthens the window in which evidence can surface. |
| d | optional | **0** | As in v2. |
| Claim submission | public | **commit-reveal or private submission of claimFake** | This is the only way to obtain phi = 0. Without it no honest challenger is paid (T20, T24). |

### Where v2.1 works and where it does not
**Works**
- Griefing is solved by construction for V <= S as long as the vote errs on false claims less than
  about 25-45 % of the time. Owners need not watch, and they are paid when griefed while
  e < beta B/(S + beta B).
- The watcher cycle is gone.
- Once a claim is open the forger cannot reduce its penalty.

**Does not work**
- Deterrence of valuable forgeries: the same p x S bound applies as in v2.
- Any challenger in a public mempool (phi = 1).
- True claims without public evidence. They are rejected and cost the claimant B, so p_sub covers
  only publicly evidenced fakes.
- Griefers with a private motive V >> S once e_false is above a few percent, since no bond <= S
  stops them.
- A forger who expects exposure and squats its own claim slot, when U < U_min (this includes the
  as-built U = 7 d).

### New weaknesses created by the v2.1 rules
1. **Claim-slot squatting** (above): the single slot per device turns into a paid shield for the forger.
2. **Every claim is a DVM vote.** This costs 48-72 h of latency, and (1 - beta) B goes to UMA's Store
   on every rejection. Each claim adds load on token holders' votes, and voter attention is the
   resource that sets e_false and q_true. The model treats both as fixed, which is optimistic under spam.
3. **The honest owner's capital is always in the game.** With probability e each false claim costs
   it S, and the owner can no longer avoid that by settling or conceding. Above
   e = beta B/(S + beta B) (0.18 at the recommended set) each false claim has negative expected
   value for the owner.
4. **Front-running before opening (phi).** This is now the only route by which a forger can halve its
   penalty. It also sets every challenger's reward to zero.
5. **S >= B is required.** Small stakes cannot be used with real UMA bonds, so the minimum stake
   rises to 0.11 WETH.
