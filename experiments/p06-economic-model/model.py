#!/usr/bin/env python3
"""p06: quantitative incentive model of the Paprika v2 stake-and-challenge protocol.

Python 3 standard library only. Deterministic (fixed seeds). One command regenerates everything:

    python3 model.py            # writes output/*.csv, output/tables.md, prints the console report

Every formula below is written out in README.md (section "Formal model"), with the same names.
Units: ETH unless a name ends in _usd. Times in days unless stated.
"""
import csv
import math
import os
import random
import sys

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "output")

# ----------------------------------------------------------------------------------------------
# Inputs. MEASURED = taken from a run; ASSUMED = chosen here, nobody measured it.
# ----------------------------------------------------------------------------------------------
# MEASURED: gasUsed from experiments/p03-paprika-v2-hardened/output/2026-11-20-run.txt
# (Hardhat, optimizer 200 runs, hardfork osaka). p03 has no README yet; the run output is the source.
GAS = {
    "register": 127018,
    "attest": 86026,
    "attest_deposit": 91118,
    "claimFake": 251579,
    "settle_undisputed": 162412,
    "claimCredit": 28557,
    "dispute": 44632,
    "settle_rejected": 65323,
    "settle_upheld": 120520,
    "proveKeyMisuse": 99220,
    "requestUnbond": 51013,
    "withdraw": 35213,
}
# Composite gas bills per role (who pays which call is a modelling choice, stated in README A9).
G_CLAIM = GAS["claimFake"] + GAS["settle_undisputed"] + GAS["claimCredit"]   # claimant, worst case
G_DISPUTE = GAS["dispute"] + GAS["claimCredit"]                                # disputer
G_FORGE_KEY = GAS["register"] + GAS["requestUnbond"] + GAS["withdraw"]         # key life-cycle
G_MISUSE = GAS["proveKeyMisuse"]

ETH_USD = 3000.0          # ASSUMED price of ETH in USD (stake volatility is out of scope, README L5)
GAS_GWEI = {"low (L2-like, 0.05 gwei)": 0.05, "mid (1 gwei)": 1.0, "high (20 gwei)": 20.0}  # ASSUMED
GP_BASE = 1.0             # ASSUMED gas price used in the sweeps, gwei
R_YEAR = 0.05             # ASSUMED annual opportunity cost of locked capital
BETA_OOV3 = 0.5           # MEASURED from source: OOv3 pays the winner half of the loser's bond
BETA_MOCK = 1.0           # the p03 mock pays the winner the whole loser bond
UMA_MIN_BOND_ETH = 0.11   # SOURCE: 2 x final fee 0.055 WETH (docs/research/adjudication... sec. 1)

# Prototype parameters as built in p03 (contracts/PaprikaV2.sol)
PROTO = dict(S=0.1, alpha=0.5, B=0.05, U=7.0, L_h=2.0, d=0.0)

# Sweep grid (task section 8)
S_GRID = [0.01, 0.1, 1.0, 10.0]
ALPHA_GRID = [0.25, 0.5, 0.75, 0.9]
BS_GRID = [0.1, 0.5, 1.0, 2.0]
P_GRID = [0.001, 0.01, 0.1, 0.5]
Q_GRID = [0.6, 0.8, 0.95]
W_GRID = [0.0, 0.5, 0.9, 1.0]
G_USD_GRID = [10, 100, 1_000, 10_000, 100_000, 1_000_000, 10_000_000]
PHI_GRID = [0.0, 1.0]
C_USD_BASE = 50.0         # ASSUMED cost for a challenger to find and package evidence, USD


def gas_eth(g, gwei=GP_BASE):
    return g * gwei * 1e-9


def usd(x):
    return x * ETH_USD


# ----------------------------------------------------------------------------------------------
# 1. Forgery deterrence
# ----------------------------------------------------------------------------------------------
def penalty_factor(alpha, phi):
    """lambda: fraction of the stake the forger actually loses when caught.
    With probability phi the forger snipes the challenge (self-reports through a Sybil before the
    challenger is paid) and recovers alpha*S; otherwise it loses S."""
    return 1.0 - phi * alpha


def forge_ev(G, S, alpha, p, phi, U=7.0, d=0.0, gwei=GP_BASE, r=R_YEAR):
    """Expected payoff of one forgery on a dedicated key (one key per fake). ETH."""
    lam = penalty_factor(alpha, phi)
    at_risk = S + d
    gas = gas_eth(G_FORGE_KEY + GAS["attest"], gwei) + p * phi * gas_eth(G_MISUSE, gwei)
    capital = r * at_risk * U / 365.0
    return G - gas - capital - p * lam * at_risk


def forge_gmax(S, alpha, p, phi, U=7.0, d=0.0, gwei=GP_BASE, r=R_YEAR):
    """Largest gain per fake that is deterred (EV <= 0)."""
    return forge_ev(0.0, S, alpha, p, phi, U, d, gwei, r) * -1.0


def forge_smin(G, alpha, p, phi, U=7.0, gwei=GP_BASE, r=R_YEAR):
    """Minimum stake that deters a forgery of gain G (d = 0)."""
    gas = gas_eth(G_FORGE_KEY + GAS["attest"], gwei) + p * phi * gas_eth(G_MISUSE, gwei)
    denom = p * penalty_factor(alpha, phi) + r * U / 365.0
    return max(0.0, (G - gas) / denom)


def forge_gmax_nkey(n, S, alpha, p, phi, U=7.0, d=0.0, gwei=GP_BASE, r=R_YEAR, stop=False):
    """Per-fake deterred gain when one key carries n fakes, each detected independently with p.
    stop=False: closed form A (forger completes all n fakes, punished once at the end).
    stop=True : closed form B (a detection flags the key at once, later fakes are never made)."""
    lam = penalty_factor(alpha, phi)
    gas_fixed = gas_eth(G_FORGE_KEY, gwei)
    ga = gas_eth(GAS["attest_deposit"] if d > 0 else GAS["attest"], gwei)
    if not stop:
        pc = 1 - (1 - p) ** n
        loss = lam * (S + n * d) * pc
        cap = r * (S + n * d) * U / 365.0
        return (loss + cap + gas_fixed + n * ga) / n
    # with stopping: fake j (1-based) is made iff no detection among the first j-1.
    exp_fakes = sum((1 - p) ** (j - 1) for j in range(1, n + 1))
    # caught after fake j with prob (1-p)^(j-1) p; stake then S + j d
    loss = sum((1 - p) ** (j - 1) * p * lam * (S + j * d) for j in range(1, n + 1))
    cap = r * (S + n * d) * U / 365.0
    return (loss + cap + gas_fixed + exp_fakes * ga) / exp_fakes


# ----------------------------------------------------------------------------------------------
# 2. Self-report
# ----------------------------------------------------------------------------------------------
def self_report(S, alpha, d=0.0, gwei=GP_BASE):
    misuse = alpha * (S + d) - (S + d) - gas_eth(GAS["register"] + G_MISUSE, gwei)
    subj = alpha * S - S - gas_eth(GAS["register"] + GAS["attest"] + G_CLAIM, gwei)
    return misuse, subj


# ----------------------------------------------------------------------------------------------
# 3. Honest challenger
# ----------------------------------------------------------------------------------------------
def forger_disputes(S, B, q, beta, gwei=GP_BASE):
    """Does a guilty owner dispute a true claim? It wins (1-q): saves S, earns beta*B."""
    return (1 - q) * (S + beta * B) - q * B - gas_eth(G_DISPUTE, gwei) > 0


def challenger_ev_obj(S, alpha, c, phi, d=0.0, gwei=GP_BASE):
    return (1 - phi) * alpha * (S + d) - c - gas_eth(G_MISUSE, gwei)


def challenger_ev_sub(S, alpha, B, q, c, phi, beta=BETA_OOV3, gwei=GP_BASE):
    disputed = forger_disputes(S, B, q, beta, gwei)
    if disputed:
        win = q * (alpha * S + beta * B) - (1 - q) * B
    else:
        win = alpha * S
    return (1 - phi) * win - c - gas_eth(G_CLAIM, gwei), disputed


def challenger_smin_sub(alpha, B, q, c, beta=BETA_OOV3, gwei=GP_BASE):
    """Min S for a true-claim filer when the guilty owner disputes and phi = 0."""
    return ((c + gas_eth(G_CLAIM, gwei) + (1 - q) * B) / q - beta * B) / alpha


# ----------------------------------------------------------------------------------------------
# 4. Griefing
# ----------------------------------------------------------------------------------------------
def grief(S, alpha, B, q, w, V, beta=BETA_OOV3, gwei=GP_BASE, d=0.0):
    """Griefer X files false claims against an honest device until one is upheld.
    Returns a dict of closed-form quantities (ETH)."""
    gc, gd, gr = gas_eth(G_CLAIM, gwei), gas_eth(G_DISPUTE, gwei), gas_eth(GAS["register"], gwei)
    ps = (1 - w) + w * (1 - q)                     # P(upheld) per attempt
    cost_att = w * q * B + gc                      # X's expected outlay per attempt (bond lost + gas)
    gain_flag = alpha * (S + d) + V                # reward + private value, at success
    bonus_att = w * (1 - q) * beta * B             # X wins the disputer's bond when the vote errs
    # victim (owner) flows per attempt when it (or a watcher acting for it) disputes
    vict_att = w * (q * (beta * B - gd) - (1 - q) * (B + gd))   # >0 means owner gains
    out = {"ps": ps}
    if ps <= 0:
        out.update(attempts=math.inf, x_cost=math.inf, x_net=-math.inf, victim_loss=0.0, gf=0.0)
        return out
    attempts = 1.0 / ps
    x_cost = cost_att * attempts
    x_net = gain_flag + (bonus_att - cost_att) * attempts
    victim_loss = (S + d) + gr - vict_att * attempts
    out.update(attempts=attempts, x_cost=x_cost, x_net=x_net, victim_loss=victim_loss,
               gf=victim_loss / x_cost)
    return out


def grief_bmin(S, alpha, q, w, V, beta=BETA_OOV3, gwei=GP_BASE):
    """Smallest bond B making griefing irrational (x_net <= 0). inf if impossible."""
    gc = gas_eth(G_CLAIM, gwei)
    ps = (1 - w) + w * (1 - q)
    k = w * (q - beta * (1 - q))
    num = ps * (alpha * S + V) - gc
    if num <= 0:
        return 0.0
    if k <= 0:
        return math.inf
    return num / k


def grief_wmin(S, alpha, B, q, V, beta=BETA_OOV3, gwei=GP_BASE):
    """Smallest vigilance w making griefing irrational. >1 means unreachable."""
    gc = gas_eth(G_CLAIM, gwei)
    A = alpha * S + V
    den = q * (A + B) - (1 - q) * beta * B
    if A - gc <= 0:
        return 0.0
    if den <= 0:
        return math.inf
    return (A - gc) / den


def watcher_profit_per_dispute(B, q, beta=BETA_OOV3, gwei=GP_BASE):
    return q * beta * B - (1 - q) * B - gas_eth(G_DISPUTE, gwei)


# ----------------------------------------------------------------------------------------------
# 5. Bribery
# ----------------------------------------------------------------------------------------------
def bribe_thresholds(S, alpha, B, V, beta=BETA_OOV3, phi=0.0):
    """Value of one flipped vote to (a) a griefer who wants a wrongful flag, (b) a forger who
    wants to save a guilty device. The oracle bounds the protocol iff K > max(a, b)."""
    a = alpha * S + V + beta * B
    b = penalty_factor(alpha, phi) * S + beta * B
    return a, b


# ----------------------------------------------------------------------------------------------
# 6/7. Sybil capital and honest cost
# ----------------------------------------------------------------------------------------------
def sybil_capital(S, U, fakes_per_day):
    """Capital locked by a forger rotating one key per fake: keys stay bonded for U days."""
    return S * fakes_per_day * U


def honest_cost_year(S, photos, gwei, d=0.0, griefs_per_year=0.0, ps=0.0, r=R_YEAR):
    capital = r * (S + d * photos / 2.0)
    gas = photos * gas_eth(GAS["attest_deposit"] if d > 0 else GAS["attest"], gwei) \
        + gas_eth(GAS["register"], gwei) / 3.0     # register amortised over a 3-year device life
    grief_loss = griefs_per_year * ps * S
    return capital, gas, grief_loss


# ----------------------------------------------------------------------------------------------
# Monte Carlo
# ----------------------------------------------------------------------------------------------
def mc_grief(S, alpha, B, q, w, V, beta, n, seed, budget=None, gwei=GP_BASE):
    rng = random.Random(seed)
    gc, gd, gr = gas_eth(G_CLAIM, gwei), gas_eth(G_DISPUTE, gwei), gas_eth(GAS["register"], gwei)
    sx_cost = sx_net = sv = s_att = 0.0
    s_net2 = 0.0
    flags = 0
    for _ in range(n):
        cost = gain = vic = 0.0
        att = 0
        flagged = False
        while budget is None or att < budget:
            att += 1
            cost += gc
            if rng.random() < w:                    # disputed
                vic -= gd
                if rng.random() < q:                # vote correct -> rejected
                    cost += B
                    vic += beta * B
                else:                               # vote wrong -> upheld, disputer loses bond
                    gain += beta * B
                    vic -= B
                    flagged = True
            else:
                flagged = True
            if flagged:
                break
        if flagged:
            gain += alpha * S + V
            vic -= S + gr
            flags += 1
        net = gain - cost
        sx_cost += cost
        sx_net += net
        s_net2 += net * net
        sv += -vic
        s_att += att
    m = sx_net / n
    se = math.sqrt(max(0.0, s_net2 / n - m * m) / n)
    return dict(x_cost=sx_cost / n, x_net=m, x_net_se=se, victim_loss=sv / n,
                attempts=s_att / n, p_flag=flags / n)


def mc_forge_nkey(n_fakes, S, alpha, p, phi, d, trials, seed, U=7.0, gwei=GP_BASE, r=R_YEAR):
    """Forger puts up to n_fakes on one key; each fake detected with p; detection flags the key
    immediately (later fakes impossible). Returns the per-fake deterred gain (break-even G)."""
    rng = random.Random(seed)
    lam = penalty_factor(alpha, phi)
    ga = gas_eth(GAS["attest_deposit"] if d > 0 else GAS["attest"], gwei)
    tot_cost = tot_fakes = 0.0
    for _ in range(trials):
        cost = gas_eth(G_FORGE_KEY, gwei) + r * (S + n_fakes * d) * U / 365.0
        made = 0
        for j in range(1, n_fakes + 1):
            made += 1
            cost += ga
            if rng.random() < p:
                cost += lam * (S + j * d)
                break
        tot_cost += cost
        tot_fakes += made
    return tot_cost / tot_fakes


def population_sim(seed, rounds=2000, n_devices=1000, n_griefers=20, n_watch_cand=10,
                   S=0.1, alpha=0.5, B=0.11, q=0.8, V=0.0, beta=BETA_OOV3, w_owner=0.5,
                   watch_notice=0.9, M_usd_day=5.0, window=30, n_forgers=10, p=0.01, phi=1.0,
                   G=0.02, gwei=GP_BASE):
    """Mixed population, one round = one day.
    - honest owners notice a claim against them within liveness with prob w_owner;
    - each active watcher notices any claim with prob watch_notice, pays M per day;
      watchers exit when trailing-window profit < 0 and enter when the trailing false-claim
      count would have paid for the window;
    - each griefer attacks one random honest device per round iff its estimated EV > 0, using
      the observed dispute rate of the last window (adaptive, myopic);
    - each forger makes one fake per round on a fresh key iff forge_ev(G) > 0 (static).
    Returns averages over the second half of the run."""
    rng = random.Random(seed)
    M = M_usd_day / ETH_USD
    gc, gd = gas_eth(G_CLAIM, gwei), gas_eth(G_DISPUTE, gwei)
    active = [False] * n_watch_cand
    profit_hist = [[0.0] * window for _ in range(n_watch_cand)]
    claims_hist = [0] * window
    disputed_hist = [0] * window
    w_est = 0.5
    stats = dict(attacks=0.0, flags=0.0, watchers=0.0, forgeries=0.0, x_net=0.0, n=0, rounds_with_attacks=0, disputed=0)
    pi_w = watcher_profit_per_dispute(B, q, beta, gwei)
    for t in range(rounds):
        idx = t % window
        for i in range(n_watch_cand):
            profit_hist[i][idx] = -M if active[i] else 0.0
        # griefers decide
        g = grief(S, alpha, B, q, w_est, V, beta, gwei)
        n_att = n_griefers if g["x_net"] > 0 else 0
        flags = disputed = 0
        xnet_round = 0.0
        for _ in range(n_att):
            xnet_round -= gc
            noticing = [i for i in range(n_watch_cand) if active[i] and rng.random() < watch_notice]
            owner = rng.random() < w_owner
            if noticing or owner:
                disputed += 1
                who = rng.choice(noticing) if noticing else None
                if rng.random() < q:
                    xnet_round -= B
                    if who is not None:
                        profit_hist[who][idx] += beta * B - gd
                else:
                    flags += 1
                    xnet_round += alpha * S + V + beta * B
                    if who is not None:
                        profit_hist[who][idx] += -B - gd
            else:
                flags += 1
                xnet_round += alpha * S + V
        claims_hist[idx] = n_att
        disputed_hist[idx] = disputed
        tot_claims = sum(claims_hist)
        if tot_claims > 0:
            w_est = sum(disputed_hist) / tot_claims
        else:
            # no data: griefers assume vigilance equals the current coverage
            w_est = 1 - (1 - w_owner) * (1 - watch_notice) ** sum(active)
        # watcher entry / exit
        for i in range(n_watch_cand):
            trailing = sum(profit_hist[i])
            if active[i] and trailing < 0 and t >= window:
                active[i] = False
            elif not active[i]:
                n_act = sum(active)
                exp_rev = tot_claims * pi_w / (n_act + 1)
                if exp_rev > M * window:
                    active[i] = True
        n_forge = n_forgers if forge_ev(G, S, alpha, p, phi) > 0 else 0
        if t >= rounds // 2:
            stats["attacks"] += n_att
            stats["flags"] += flags
            stats["watchers"] += sum(active)
            stats["forgeries"] += n_forge
            stats["x_net"] += xnet_round
            stats["n"] += 1
            stats["rounds_with_attacks"] += 1 if n_att else 0
            stats["disputed"] += disputed
    n = stats["n"]
    return dict(attacks_per_day=stats["attacks"] / n, wrongful_flags_per_day=stats["flags"] / n,
                observed_w=(stats["disputed"] / stats["attacks"]) if stats["attacks"] else float("nan"),
                active_watchers=stats["watchers"] / n, attack_round_share=stats["rounds_with_attacks"] / n,
                griefer_net_per_day_eth=stats["x_net"] / n, forgeries_per_day=stats["forgeries"] / n,
                pi_w=pi_w, M=M)


# ----------------------------------------------------------------------------------------------
# v2.1: every claim auto-disputed with a bond B taken from the device's stake; open claims have
# priority on the stake; one open claim per device; requires stake >= B.
# ----------------------------------------------------------------------------------------------
# MEASURED: experiments/p03-paprika-v2-hardened/output/2026-11-20-run-v2_1.txt, "GAS v2.1 [auto=on]"
GAS21 = {
    "register": 127154,
    "attest": 63776,
    "claimFake": 266827,
    "settle_upheld": 136378,
    "settle_rejected": 95176,
    "claimCredit": 28557,
    "proveKeyMisuse": 100554,
    "requestUnbond": 51013,
    "withdraw": 38280,
}
G21_CLAIM = GAS21["claimFake"] + GAS21["settle_upheld"] + GAS21["claimCredit"]   # claimant, worst case
G21_CLAIM_REJ = GAS21["claimFake"] + GAS21["settle_rejected"]                     # a claim that loses
G21_REVERT = 60000        # ASSUMED gas burnt by a claimFake that reverts after being front-run
G21_FORGE_KEY = GAS21["register"] + GAS21["requestUnbond"] + GAS21["withdraw"]
T_VOTE_DAYS = (2.0, 3.0)  # SOURCE: DVM vote 48-72 h; the claim slot is busy for this long


def forge21_gmax(S, alpha, p, phi, U=30.0, gwei=GP_BASE, r=R_YEAR):
    """Same game as v2; phi is now only the mempool race before the claim is open."""
    gas = gas_eth(G21_FORGE_KEY + GAS21["attest"], gwei)
    return gas + (p * penalty_factor(alpha, phi) + r * U / 365.0) * S


def upheld_reward21(S, alpha, B, beta):
    """Claimant's reward on an upheld claim: alpha x (stake left after the dispute bond) + beta x dispute bond."""
    return alpha * (S - B) + beta * B


def grief21(S, alpha, B, e, V, beta=BETA_OOV3, gwei=GP_BASE):
    """False claims against an honest device; the contract always disputes; e = P(false claim upheld)."""
    g = gas_eth(G21_CLAIM, gwei)
    greg = gas_eth(GAS21["register"], gwei)
    out = {"ps": e, "feasible": S >= B}
    per_claim_owner = (1 - e) * beta * B - e * (S + greg)     # owner's EV per false claim
    out["owner_ev_per_claim"] = per_claim_owner
    out["x_ev_per_claim"] = e * (upheld_reward21(S, alpha, B, beta) + V) - (1 - e) * B - g
    if e <= 0:
        out.update(attempts=math.inf, x_cost=math.inf, x_net=-math.inf, victim_loss=-math.inf, gf=-math.inf)
        return out
    attempts = 1.0 / e
    x_cost = ((1 - e) * B + g) / e
    x_net = upheld_reward21(S, alpha, B, beta) + V - x_cost
    victim_loss = S + greg - (1 - e) / e * beta * B
    out.update(attempts=attempts, x_cost=x_cost, x_net=x_net, victim_loss=victim_loss, gf=victim_loss / x_cost)
    return out


def grief21_bmin(S, alpha, e, V, beta=BETA_OOV3, gwei=GP_BASE):
    g = gas_eth(G21_CLAIM, gwei)
    num = e * (alpha * S + V) - g
    den = (1 - e) + e * alpha - e * beta
    if num <= 0:
        return 0.0
    return num / den if den > 0 else math.inf


def grief21_estar(S, alpha, B, V, beta=BETA_OOV3, gwei=GP_BASE):
    """Largest error rate on false claims at which griefing is still irrational."""
    g = gas_eth(G21_CLAIM, gwei)
    return (B + g) / (upheld_reward21(S, alpha, B, beta) + V + B)


def challenger21(S, alpha, B, qt, c, phi, beta=BETA_OOV3, gwei=GP_BASE):
    """True, publicly evidenced claim; auto-disputed; upheld with prob qt. phi = the forger wins the
    mempool race before the claim is open (self-slashes; the claim then reverts)."""
    ev_open = qt * upheld_reward21(S, alpha, B, beta) - (1 - qt) * B - gas_eth(G21_CLAIM, gwei)
    return (1 - phi) * ev_open - phi * gas_eth(G21_REVERT, gwei) - c


def challenger21_smin(alpha, B, qt, c, beta=BETA_OOV3, gwei=GP_BASE):
    return ((c + gas_eth(G21_CLAIM, gwei) + (1 - qt) * B) / qt - beta * B) / alpha + B


def slot_block_cost_per_day(S, alpha, B, e, beta, t_vote, who, gwei=GP_BASE):
    """Cost per day of keeping one device's single claim slot busy with back-to-back false claims.
    who='griefer' (blocks an honest owner's withdrawal; the owner receives beta B per rejection),
    who='forger' (its Sybil squats its own device to block genuine claims; beta B comes back)."""
    if who == "griefer":
        per = (1 - e) * B + gas_eth(G21_CLAIM_REJ, gwei) - e * upheld_reward21(S, alpha, B, beta)
    else:
        per = (1 - e) * (1 - beta) * B + e * (S - upheld_reward21(S, alpha, B, beta)) \
            + gas_eth(G21_CLAIM_REJ, gwei)
    return per / t_vote


def squat_U_min(S, B, beta, t_vote, phi=0.0, alpha=0.5):
    """U above which squatting the slot for the whole unbonding period costs more than the stake it saves."""
    return penalty_factor(alpha, phi) * S * t_vote / ((1 - beta) * B)


def population_sim21(seed, e, rounds=2000, n_devices=1000, n_griefers=20, S=0.25, alpha=0.5, B=0.11, V=0.0,
                     beta=BETA_OOV3, t_vote=3, gwei=GP_BASE):
    """v2.1 population: no watchers. Each griefer files one claim per day on a random device whose slot
    is free, iff its per-campaign EV (with the true e) is positive. A claim occupies the slot t_vote days."""
    rng = random.Random(seed)
    g = gas_eth(G21_CLAIM, gwei)
    busy_until = [0] * n_devices
    rational = grief21(S, alpha, B, e, V, beta, gwei)["x_net"] > 0
    st = dict(att=0, flags=0, xnet=0.0, owner=0.0, busy=0.0, n=0)
    for t in range(rounds):
        att = flags = 0
        xnet = owner = 0.0
        if rational:
            for _ in range(n_griefers):
                dev = rng.randrange(n_devices)
                if busy_until[dev] > t:
                    continue
                busy_until[dev] = t + t_vote
                att += 1
                xnet -= g
                if rng.random() < e:
                    flags += 1
                    xnet += upheld_reward21(S, alpha, B, beta) + V
                    owner -= S
                else:
                    xnet -= B
                    owner += beta * B
        if t >= rounds // 2:
            st["att"] += att
            st["flags"] += flags
            st["xnet"] += xnet
            st["owner"] += owner
            st["busy"] += sum(1 for b in busy_until if b > t) / n_devices
            st["n"] += 1
    n = st["n"]
    return dict(attacks_per_day=st["att"] / n, flags_per_day=st["flags"] / n, x_net_per_day=st["xnet"] / n,
                owner_net_per_day=st["owner"] / n, busy_share=st["busy"] / n, rational=rational)


def v21_tables(c):
    """All v2.1 tables (T18-T25) and sweep_v2_1.csv."""
    section("T18. v2.1 griefing (contract auto-disputes; w = 1), S=0.25, alpha=0.5, B=0.11, beta=0.5, V=0, gas 1 gwei",
            "Ps = e (false claim wrongly upheld). X cost = ((1-e)B + gas)/e; X net = alpha(S-B) + beta B + V - X cost; "
            "owner loss = S + g_reg - ((1-e)/e) beta B; GF = owner loss / X cost; owner EV per false claim = (1-e) beta B - e (S + g_reg).")
    rows = []
    for e in [0.01, 0.05, 0.1, 0.2, 0.3, 0.5]:
        for V in [0.0, 0.25]:
            g = grief21(0.25, 0.5, 0.11, e, V)
            rows.append([e, f"{V:g}", g["attempts"], usd(g["x_cost"]), usd(g["x_net"]), usd(g["victim_loss"]), g["gf"],
                         usd(g["owner_ev_per_claim"])])
    table(["e_false", "V (ETH)", "attempts", "X cost USD", "X net USD", "owner loss USD", "GF",
           "owner EV per false claim USD"], rows)

    section("T19. v2.1 thresholds (alpha=0.5, beta=0.5)",
            "B_min = (e(alpha S + V) - gas)/((1-e) + e alpha - e beta), subject to B <= S; "
            "e* = (B + gas)/(alpha(S-B) + beta B + V + B) = largest e_false at which griefing is irrational.")
    rows = []
    for S in [0.11, 0.25, 1.0]:
        for vm in [0.0, 1.0, 10.0]:
            rows.append([S, f"{vm:g}S"] + [grief21_bmin(S, 0.5, e, vm * S) / S for e in [0.01, 0.05, 0.2, 0.4]]
                        + [grief21_estar(S, 0.5, min(S, max(0.11, 0.44 * S)), vm * S)])
    table(["S", "V", "B_min/S e=.01", "e=.05", "e=.2", "e=.4", "e* at B=max(0.11, 0.44 S)"], rows)

    section("T20. v2.1 honest challenger with a true, publicly evidenced claim (USD), c=50 USD, B=0.11, beta=0.5",
            "EV = (1-phi)[q_true(alpha(S-B) + beta B) - (1-q_true)B - gas] - phi gas_revert - c. "
            "phi = forger wins the mempool race before the claim is open; after opening it cannot snipe.")
    rows = []
    for S in [0.11, 0.25, 1.0, 10.0]:
        for qt in [0.6, 0.8, 0.95]:
            rows.append([S, qt] + [usd(challenger21(S, 0.5, 0.11, qt, c, phi)) for phi in [0.0, 1.0]]
                        + [challenger21_smin(0.5, 0.11, qt, c)])
    table(["S", "q_true", "EV phi=0", "EV phi=1", "S_min (phi=0)"], rows)

    section("T21. v2.1 claim-slot blocking, cost per day to the blocker (USD), beta=0.5, e=0.05; as built (S=0.1, B=0.05) and recommended (S=0.25, B=0.11)",
            "griefer: back-to-back false claims block an honest owner's withdrawal (owner earns beta B per rejection); "
            "forger: its Sybil squats its own device so no genuine claim can open until it withdraws. "
            "U_min = (1 - phi alpha) S T_vote / ((1-beta) B): unbonding period above which squatting for all of U costs more than the stake.")
    rows = []
    for S_, B_ in [(0.1, 0.05), (0.25, 0.11)]:
      for tv in T_VOTE_DAYS:
        gcost = slot_block_cost_per_day(S_, 0.5, B_, 0.05, 0.5, tv, "griefer")
        fcost = slot_block_cost_per_day(S_, 0.5, B_, 0.05, 0.5, tv, "forger")
        rows.append([S_, B_, tv, usd(gcost), usd((1 - 0.05) * 0.5 * B_ / tv), usd(fcost), usd(fcost * 7), usd(fcost * 30),
                     usd(S_), squat_U_min(S_, B_, 0.5, tv, 0.0), squat_U_min(S_, B_, 0.5, tv, 1.0)])
    table(["S", "B", "T_vote (d)", "griefer USD/day", "owner earns USD/day", "forger squat USD/day", "squat for U=7d",
           "squat for U=30d", "stake saved USD", "U_min phi=0 (d)", "U_min phi=1 (d)"], rows)

    section("T22. v2.1 population simulation (2000 days, last 1000 averaged), 1000 devices, 20 griefers who know e_false, "
            "no watchers, slot busy 3 days per claim, S=0.25, alpha=0.5, B=0.11, beta=0.5",
            "CF flags/day = 20 x e if griefing is rational (minus the few days a chosen slot is busy), else 0.")
    rows = []
    for i, e in enumerate([0.01, 0.05, 0.1, 0.2, 0.3, 0.5]):
        for V in [0.0, 0.25, 2.5]:
            r = population_sim21(seed=201 + 10 * i + int(V * 4), e=e, V=V)
            rows.append([e, f"{V:g}", "yes" if r["rational"] else "no", 20 * e if r["rational"] else 0.0,
                         r["attacks_per_day"], r["flags_per_day"], usd(r["x_net_per_day"]),
                         usd(r["owner_net_per_day"]), r["busy_share"]])
    table(["e_false", "V (ETH)", "CF grief rational", "CF flags/day", "attacks/day", "MC flags/day",
           "griefers net USD/day", "owners net USD/day", "share of slots busy"], rows)

    section("T23. v2 vs v2.1 headline quantities (S, alpha, B as stated; q=0.8 so e_false = 0.2 and q_true = 0.8; "
            "c = 50 USD; V = 0; 1000 photos/yr at 0.05 gwei; 1 false claim per device per year)",
            "v2 'unwatched' = w 0; v2 'watched' = w 0.9. Effective penalty = (1 - phi alpha) S.")
    rows = []
    for name, ver, S, a, B in [("v2 as built", "v2", 0.1, 0.5, 0.05), ("v2.1 as built", "v21", 0.1, 0.5, 0.05),
                               ("v2.1 recommended", "v21", 0.25, 0.5, 0.11)]:
        if ver == "v2":
            g0 = grief(S, a, B, 0.8, 0.0, 0.0)
            g9 = grief(S, a, B, 0.8, 0.9, 0.0)
            gf = f"{f(g0['gf'], 0)} / {f(g9['gf'], 2)}"
            ch = f"{f(usd(challenger_ev_sub(S, a, B, 0.8, c, 1.0)[0]), 0)} (phi=1 forced by 2 h liveness)"
            pen = f"{f(usd((1 - a) * S), 0)} (phi=1)"
            cap, gas, _ = honest_cost_year(S, 1000, 0.05)
            grief_y = g9["ps"] * S
            cost = cap + gas + grief_y
            xn = f"{f(usd(g0['x_net']), 0)} / {f(usd(g9['x_net']), 0)}"
        else:
            g = grief21(S, a, B, 0.2, 0.0)
            gf = f(g["gf"], 2)
            ch = f"{f(usd(challenger21(S, a, B, 0.8, c, 0.0)), 0)} / {f(usd(challenger21(S, a, B, 0.8, c, 1.0)), 0)} (phi 0/1)"
            pen = f"{f(usd(S), 0)} / {f(usd((1 - a) * S), 0)} (phi 0/1)"
            cap = R_YEAR * S
            gas = 1000 * gas_eth(GAS21["attest"], 0.05) + gas_eth(GAS21["register"], 0.05) / 3
            cost = cap + gas - g["owner_ev_per_claim"]
            xn = f(usd(g["x_net"]), 0)
        rows.append([name, S, B, gf, xn, ch, pen, usd(cost)])
    table(["set", "S", "B", "griefing factor", "griefer net per campaign USD", "honest challenger EV USD",
           "effective penalty USD", "honest owner USD/yr"], rows)

    rows21 = []
    for S in S_GRID:
        for a in ALPHA_GRID:
            for bs in [0.1, 0.5, 1.0]:
                B = bs * S
                for e in [0.01, 0.05, 0.2, 0.4]:
                    for vm in [0.0, 1.0, 10.0]:
                        g = grief21(S, a, B, e, vm * S)
                        for qt in Q_GRID:
                            for phi in PHI_GRID:
                                rows21.append([S, a, bs, e, vm, qt, phi, usd(g["x_net"]), g["gf"], g["x_net"] <= 0,
                                               usd(g["owner_ev_per_claim"]), grief21_bmin(S, a, e, vm * S) / S,
                                               grief21_estar(S, a, B, vm * S), usd(challenger21(S, a, B, qt, c, phi)),
                                               usd(forge21_gmax(S, a, 0.1, phi)), B >= UMA_MIN_BOND_ETH])
    write_csv("sweep_v2_1.csv", ["S_eth", "alpha", "B_over_S", "e_false", "V_over_S", "q_true", "phi",
                                 "griefer_net_usd", "griefing_factor", "griefing_irrational", "owner_ev_per_false_claim_usd",
                                 "B_min_over_S", "e_star", "true_claimant_ev_usd", "G_max_usd_p0.1_U30",
                                 "B_meets_uma_min"], rows21)
    n_ok = sum(1 for r in rows21 if r[9] and r[13] > 0)
    section(f"T24. v2.1 sweep summary (sweep_v2_1.csv, {len(rows21)} cells, B <= S only, e_false in 0.01/0.05/0.2/0.4)",
            f"Cells where griefing is irrational AND a true claimant acts: {n_ok} / {len(rows21)}; "
            f"with phi=0: {sum(1 for r in rows21 if r[9] and r[13] > 0 and r[6] == 0)}, "
            f"phi=1: {sum(1 for r in rows21 if r[9] and r[13] > 0 and r[6] == 1)}.")


# ----------------------------------------------------------------------------------------------
# Output helpers
# ----------------------------------------------------------------------------------------------
def write_csv(name, header, rows):
    path = os.path.join(OUT, name)
    with open(path, "w", newline="") as f:
        wr = csv.writer(f)
        wr.writerow(header)
        for r in rows:
            wr.writerow([fmt_csv(x) for x in r])
    return path


def fmt_csv(x):
    if isinstance(x, float):
        if math.isinf(x):
            return "inf" if x > 0 else "-inf"
        return f"{x:.6g}"
    return x


def f(x, nd=3):
    if isinstance(x, str):
        return x
    if x is None:
        return "-"
    if math.isinf(x):
        return "inf" if x > 0 else "-inf"
    if x != 0 and (abs(x) >= 1e5 or abs(x) < 1e-3):
        return f"{x:.2e}"
    return f"{x:.{nd}f}".rstrip("0").rstrip(".") if "." in f"{x:.{nd}f}" else f"{x:.{nd}f}"


def md_table(header, rows):
    s = "| " + " | ".join(header) + " |\n|" + "|".join("---" for _ in header) + "|\n"
    for r in rows:
        s += "| " + " | ".join(f(x) if not isinstance(x, str) else x for x in r) + " |\n"
    return s


MD = []


def section(title, text=""):
    MD.append(f"\n### {title}\n\n{text}")
    print(f"\n=== {title} ===")
    if text:
        print(text.strip())


def table(header, rows):
    t = md_table(header, rows)
    MD.append(t)
    print(t)


# ----------------------------------------------------------------------------------------------
def main():
    os.makedirs(OUT, exist_ok=True)
    print("p06 economic model of Paprika v2. Python", sys.version.split()[0])
    print(f"Assumed: ETH = {ETH_USD} USD, r = {R_YEAR}/yr, base gas price {GP_BASE} gwei, "
          f"challenger cost c = {C_USD_BASE} USD, beta (OOv3) = {BETA_OOV3}")
    print("Measured gas (p03 run output):", GAS)
    print(f"Composite: claimant {G_CLAIM}, disputer {G_DISPUTE}, key life-cycle {G_FORGE_KEY}, misuse {G_MISUSE}")
    P = PROTO
    c = C_USD_BASE / ETH_USD

    # ---------------- 1. Forgery deterrence -----------------------------------------------
    section("T1. Largest deterred gain per fake, G_max (USD), one key per fake, alpha=0.5, U=7d, d=0",
            "G_max = gas + (p*(1 - phi*alpha) + r*U/365) * S. phi=0: forger cannot snipe; "
            "phi=1: forger always self-reports first and keeps alpha*S.")
    rows = []
    for S in S_GRID:
        for phi in PHI_GRID:
            rows.append([S, int(phi)] + [usd(forge_gmax(S, 0.5, p, phi)) for p in P_GRID])
    table(["S (ETH)", "phi"] + [f"p={p}" for p in P_GRID], rows)

    section("T2. Minimum stake S_min (ETH) that deters gain G, alpha=0.5, U=7d",
            "S_min = (G - gas) / (p*(1 - phi*alpha) + r*U/365).")
    rows = []
    for G in G_USD_GRID:
        for p in [0.01, 0.1, 0.5]:
            rows.append([f"{G:,}", p, forge_smin(G / ETH_USD, 0.5, p, 0.0), forge_smin(G / ETH_USD, 0.5, p, 1.0)])
    table(["G (USD)", "p", "S_min phi=0", "S_min phi=1"], rows)

    section("T3. Many fakes on one key: per-fake deterred gain (USD), S=0.1, alpha=0.5, phi=1, p=0.01",
            "Closed form A ignores that a detection stops the key; closed form B and the Monte Carlo "
            "(400k/100k/20k/4k trials for n=1/10/100/1000, seed 3+n) include it. d = per-photo deposit added to the stake.")
    rows = []
    for d in [0.0, 0.001, 0.01]:
        for n in [1, 10, 100, 1000]:
            a = forge_gmax_nkey(n, 0.1, 0.5, 0.01, 1.0, d=d)
            b = forge_gmax_nkey(n, 0.1, 0.5, 0.01, 1.0, d=d, stop=True)
            trials = {1: 400000, 10: 100000, 100: 20000, 1000: 4000}[n]
            m = mc_forge_nkey(n, 0.1, 0.5, 0.01, 1.0, d, trials, seed=3 + n)
            rows.append([d, n, usd(a), usd(b), usd(m), f"{100*(m-b)/b:+.1f}%"])
    table(["d (ETH)", "fakes/key", "A: no stop", "B: stop", "MC", "MC vs B"], rows)

    fr = []
    for S in S_GRID:
        for a in ALPHA_GRID:
            for p in P_GRID:
                for phi in PHI_GRID:
                    gmax = forge_gmax(S, a, p, phi)
                    for G in G_USD_GRID:
                        ev = forge_ev(G / ETH_USD, S, a, p, phi)
                        fr.append([S, a, p, phi, G, usd(ev), usd(gmax), ev <= 0])
    write_csv("sweep_forgery.csv", ["S_eth", "alpha", "p", "phi", "G_usd", "forger_ev_usd",
                                    "G_max_usd", "deterred"], fr)

    # ---------------- 2. Self-report -------------------------------------------------------
    section("T4. Self-report: net result for the owner (USD), S=0.1 ETH, d=0, gas at 1 gwei",
            "misuse path: alpha*S - S - gas(register+proof); subjective path: alpha*S - S - gas(register+attest+claim), bond returned.")
    rows = []
    for a in [0.0, 0.25, 0.5, 0.75, 0.9, 0.99, 1.0]:
        m, s = self_report(0.1, a)
        rows.append([a, usd(m), usd(s), usd(forge_gmax(0.1, a, 0.1, 1.0))])
    table(["alpha", "misuse path", "subjective path", "G_max if phi=1, p=0.1"], rows)

    # ---------------- 3. Challenger --------------------------------------------------------
    section("T5. Honest challenger, expected profit (USD), c = 50 USD, B = 0.11 ETH (UMA minimum), beta=0.5",
            "objective: (1-phi)*alpha*S - c - gas; subjective: (1-phi)*[q(alpha S + beta B) - (1-q)B] - c - gas "
            "if the guilty owner disputes, (1-phi)*alpha*S - c - gas if not.")
    rows = []
    for S in S_GRID:
        for a in [0.25, 0.5, 0.9]:
            for q in [0.6, 0.8, 0.95]:
                ob0 = challenger_ev_obj(S, a, c, 0.0)
                sb0, disp = challenger_ev_sub(S, a, UMA_MIN_BOND_ETH, q, c, 0.0)
                sb1, _ = challenger_ev_sub(S, a, UMA_MIN_BOND_ETH, q, c, 1.0)
                rows.append([S, a, q, usd(ob0), usd(sb0), "yes" if disp else "no", usd(sb1)])
    table(["S", "alpha", "q", "obj phi=0", "subj phi=0", "owner disputes", "subj phi=1"], rows)
    cr = []
    for S in S_GRID:
        for a in ALPHA_GRID:
            for bs in BS_GRID:
                for q in Q_GRID:
                    for phi in PHI_GRID:
                        B = bs * S
                        ev, disp = challenger_ev_sub(S, a, B, q, c, phi)
                        cr.append([S, a, bs, q, phi, usd(challenger_ev_obj(S, a, c, phi)), usd(ev), disp,
                                   challenger_smin_sub(a, B, q, c)])
    write_csv("sweep_challenger.csv", ["S_eth", "alpha", "B_over_S", "q", "phi", "obj_ev_usd", "subj_ev_usd",
                                       "guilty_owner_disputes", "S_min_subj_if_disputed_eth"], cr)

    # ---------------- 4. Griefing ----------------------------------------------------------
    section("T6. Griefing at the prototype parameters (S=0.1, alpha=0.5, B=0.05), V=0, beta=0.5 (OOv3) and 1 (p03 mock)",
            "attempts = 1/Ps, Ps = (1-w) + w(1-q); X cost = (w q B + gas)/Ps; X net = alpha S + V + (w(1-q) beta B - w q B - gas)/Ps; "
            "GF = victim loss / X cost.")
    rows = []
    for beta in [BETA_OOV3, BETA_MOCK]:
        for q in Q_GRID:
            for w in W_GRID:
                g = grief(P["S"], P["alpha"], P["B"], q, w, 0.0, beta)
                rows.append([beta, q, w, g["ps"], g["attempts"], usd(g["x_cost"]), usd(g["x_net"]),
                             usd(g["victim_loss"]), g["gf"]])
    table(["beta", "q", "w", "Ps", "attempts", "X cost USD", "X net USD", "victim loss USD", "GF"], rows)

    section("T7. Bond needed to make griefing irrational, B_min / S (alpha=0.5, beta=0.5)",
            "B_min = (Ps(alpha S + V) - gas) / (w (q - beta(1-q))). inf = no bond suffices (w=0, or q <= beta/(1+beta)).")
    rows = []
    for V_mult in [0.0, 1.0, 10.0]:
        for q in Q_GRID:
            rows.append([f"V={V_mult:g}S", q] + [grief_bmin(1.0, 0.5, q, w, V_mult) / 1.0 for w in W_GRID])
    table(["V", "q"] + [f"w={w}" for w in W_GRID], rows)

    section("T8. Vigilance needed: w_min (alpha=0.5, beta=0.5), by B/S and V",
            "w_min = (A - gas) / (q(A + B) - (1-q) beta B), A = alpha S + V. Values > 1 are unreachable.")
    rows = []
    for V_mult in [0.0, 1.0, 10.0]:
        for q in Q_GRID:
            rows.append([f"V={V_mult:g}S", q] + [grief_wmin(1.0, 0.5, bs, q, V_mult) for bs in BS_GRID])
    table(["V", "q"] + [f"B/S={bs}" for bs in BS_GRID], rows)

    section("T9. Watcher profit per false claim disputed (USD): q beta B - (1-q) B - gas",
            "A watcher that also pays a monitoring cost M per day needs (false claims per day) x this > M.")
    rows = []
    for B in [0.01, 0.05, 0.11, 0.5, 1.0]:
        rows.append([B] + [usd(watcher_profit_per_dispute(B, q, beta)) for q in Q_GRID for beta in [0.5, 1.0]])
    table(["B (ETH)"] + [f"q={q} b={b}" for q in Q_GRID for b in [0.5, 1.0]], rows)

    gr = []
    for S in S_GRID:
        for a in ALPHA_GRID:
            for bs in BS_GRID:
                for q in Q_GRID:
                    for w in W_GRID:
                        for vm in [0.0, 1.0, 10.0]:
                            for beta in [BETA_OOV3, BETA_MOCK]:
                                B = bs * S
                                g = grief(S, a, B, q, w, vm * S, beta)
                                gr.append([S, a, bs, q, w, vm, beta, g["ps"], g["attempts"], usd(g["x_cost"]),
                                           usd(g["x_net"]), usd(g["victim_loss"]), g["gf"], g["x_net"] <= 0,
                                           grief_bmin(S, a, q, w, vm * S, beta) / S,
                                           grief_wmin(S, a, B, q, vm * S, beta),
                                           usd(watcher_profit_per_dispute(B, q, beta)), B >= UMA_MIN_BOND_ETH])
    write_csv("sweep_griefing.csv", ["S_eth", "alpha", "B_over_S", "q", "w", "V_over_S", "beta", "Ps", "attempts",
                                     "x_cost_usd", "x_net_usd", "victim_loss_usd", "griefing_factor",
                                     "griefing_irrational", "B_min_over_S", "w_min", "watcher_profit_per_dispute_usd",
                                     "B_meets_uma_min"], gr)

    # ---------------- 5. Bribery -----------------------------------------------------------
    section("T10. Value of one flipped vote (USD) = minimum bribe K the oracle must withstand per dispute",
            "wrongful flag: alpha S + V + beta B; saving a guilty device: (1 - phi alpha) S + beta B (+ the key's future forgeries, not counted). "
            "n disputes in the same vote round add up.")
    rows = []
    for S in S_GRID:
        for vm in [0.0, 10.0]:
            a_, b_ = bribe_thresholds(S, 0.5, max(S, UMA_MIN_BOND_ETH), vm * S)
            rows.append([S, f"{vm:g}S", usd(a_), usd(b_)])
    table(["S (ETH)", "V", "K > (wrongful flag)", "K > (save guilty)"], rows)

    # ---------------- 6. Sybil / ban evasion ----------------------------------------------
    section("T11. Capital a forger must keep locked to rotate one fresh key per fake (ETH) = S x fakes/day x U",
            "Annual cost of that capital at r=5% in USD in brackets; it is lost only when caught.")
    rows = []
    for S in [0.1, 1.0]:
        for U in [1.0, 7.0, 30.0]:
            rows.append([S, U] + [f"{f(sybil_capital(S, U, k))} ({f(usd(R_YEAR*sybil_capital(S, U, k)),0)})"
                                  for k in [1, 10, 100]])
    table(["S", "U (days)", "1 fake/day", "10 fakes/day", "100 fakes/day"], rows)

    # ---------------- 7. Honest cost -------------------------------------------------------
    section("T12. Honest user's annual cost (USD): 1000 photos/yr, capital at 5%, 1 griefing attempt/yr at w=0.9, q=0.8",
            "Columns: capital | gas | expected griefing loss | total. Gas uses the measured attest gas (86026).")
    rows = []
    ps_ref = grief(1, 0.5, 1, 0.8, 0.9, 0)["ps"]
    for S in S_GRID:
        for name, gw in GAS_GWEI.items():
            cap, gas, gl = honest_cost_year(S, 1000, gw, griefs_per_year=1.0, ps=ps_ref)
            rows.append([S, name, usd(cap), usd(gas), usd(gl), usd(cap + gas + gl)])
    table(["S", "gas scenario", "capital", "gas", "grief loss", "total"], rows)
    section("T12b. Gas per photo (USD) at the measured attest cost",
            "")
    table(["scenario", "attest (86026)", "attest+deposit (91118)", "register (127018)", "claim, claimant (442548)"],
          [[n, usd(gas_eth(GAS["attest"], g)), usd(gas_eth(GAS["attest_deposit"], g)),
            usd(gas_eth(GAS["register"], g)), usd(gas_eth(G_CLAIM, g))] for n, g in GAS_GWEI.items()])

    section("T13. Working region: deterred G (USD) vs honest annual cost (USD), alpha=0.5, U=7d, 1 gwei, 1000 photos/yr",
            "Deterred G is per fake. Honest cost excludes griefing loss.")
    rows = []
    for S in S_GRID:
        cap, gas, _ = honest_cost_year(S, 1000, 1.0)
        rows.append([S, usd(cap + gas)] + [f"{f(usd(forge_gmax(S, 0.5, p, 0.0)),0)} / {f(usd(forge_gmax(S, 0.5, p, 1.0)),0)}" for p in P_GRID])
    table(["S", "honest cost/yr"] + [f"G_max p={p} (phi 0/1)" for p in P_GRID], rows)

    # ---------------- 8. Joint sweep ------------------------------------------------------
    jr = []
    for S in S_GRID:
        for a in ALPHA_GRID:
            for bs in BS_GRID:
                for p in P_GRID:
                    for q in Q_GRID:
                        for w in W_GRID:
                            B = bs * S
                            g = grief(S, a, B, q, w, 0.0, BETA_OOV3)
                            ch, _ = challenger_ev_sub(S, a, B, q, c, 0.0)
                            cap, gas, _ = honest_cost_year(S, 1000, GP_BASE)
                            jr.append([S, a, bs, p, q, w, usd(forge_gmax(S, a, p, 0.0)), usd(forge_gmax(S, a, p, 1.0)),
                                       usd(g["x_net"]), g["gf"], g["x_net"] <= 0, usd(ch), ch > 0,
                                       usd(watcher_profit_per_dispute(B, q)) > 0, usd(cap + gas),
                                       B >= UMA_MIN_BOND_ETH])
    write_csv("sweep_joint.csv", ["S_eth", "alpha", "B_over_S", "p", "q", "w", "G_max_usd_phi0", "G_max_usd_phi1",
                                  "griefer_net_usd_V0", "griefing_factor_V0", "griefing_irrational_V0",
                                  "true_claimant_ev_usd_phi0", "true_claimant_acts", "watcher_profitable_per_dispute",
                                  "honest_cost_usd_per_year", "B_meets_uma_min"], jr)
    n_ok = sum(1 for r in jr if r[10] and r[12] and r[13])
    section("T14. Joint sweep summary (3072 cells, V=0, beta=0.5, phi=0, c=50 USD)",
            f"Cells where griefing is irrational AND a true claimant acts AND a watcher profits per dispute: {n_ok} / {len(jr)}.")
    rows = []
    for w in W_GRID:
        cells = [r for r in jr if r[5] == w]
        rows.append([w, sum(r[10] for r in cells), sum(r[12] for r in cells), sum(r[10] and r[12] and r[13] for r in cells), len(cells)])
    table(["w", "griefing irrational", "claimant acts", "all three", "cells"], rows)

    # ---------------- Monte Carlo checks --------------------------------------------------
    section("T15. Monte Carlo vs closed form: griefing campaigns (40000 campaigns each, seed 11+i), beta=0.5, V=0",
            "S=0.1, alpha=0.5. 'cap' = griefer stops after 5 attempts (the closed form assumes no budget limit).")
    rows = []
    cases = [(0.05, 0.8, 0.5, None), (0.05, 0.8, 0.9, None), (0.11, 0.95, 0.9, None), (0.2, 0.6, 1.0, None),
             (0.11, 0.95, 0.9, 5), (0.05, 0.8, 0.9, 5)]
    for i, (B, q, w, cap_) in enumerate(cases):
        g = grief(0.1, 0.5, B, q, w, 0.0)
        m = mc_grief(0.1, 0.5, B, q, w, 0.0, BETA_OOV3, 40000, seed=11 + i, budget=cap_)
        z = (m["x_net"] - g["x_net"]) / m["x_net_se"] if m["x_net_se"] > 0 else 0.0
        rows.append([B, q, w, cap_ or "none", g["attempts"], m["attempts"], usd(g["x_net"]), usd(m["x_net"]),
                     f"{z:+.1f}", usd(g["victim_loss"]), usd(m["victim_loss"]), m["p_flag"]])
    table(["B", "q", "w", "cap", "attempts CF", "attempts MC", "X net CF", "X net MC", "z", "victim CF", "victim MC",
           "P(flag) MC"], rows)

    section("T16. Population simulation (2000 days, averages over days 1001-2000), 1000 honest devices, 20 adaptive griefers, "
            "10 candidate watchers, owner online within liveness w_owner, M = 5 USD/day per watcher, S=0.1, alpha=0.5, V=0",
            "Closed-form prediction column: griefing irrational at the vigilance reached with all watchers active?")
    rows = []
    sims = [(0.05, 0.8, 0.5), (0.11, 0.8, 0.5), (0.11, 0.95, 0.5), (0.11, 0.95, 0.1), (0.5, 0.95, 0.1), (0.11, 0.6, 0.5)]
    for i, (B, q, wo) in enumerate(sims):
        r = population_sim(seed=101 + i, B=B, q=q, w_owner=wo)
        w_full = 1 - (1 - wo) * (1 - 0.9) ** 10
        w_one = 1 - (1 - wo) * (1 - 0.9)
        g_full = grief(0.1, 0.5, B, q, w_full, 0.0)
        g_owner = grief(0.1, 0.5, B, q, wo, 0.0)
        rows.append([B, q, wo, "yes" if g_owner["x_net"] > 0 else "no", "yes" if g_full["x_net"] > 0 else "no",
                     usd(r["pi_w"]), r["attacks_per_day"], r["attack_round_share"], r["observed_w"], r["active_watchers"],
                     r["wrongful_flags_per_day"], usd(r["griefer_net_per_day_eth"])])
    table(["B", "q", "w_owner", "CF grief pays (owner only)", "CF grief pays (all watchers)", "watcher USD/dispute",
           "attacks/day", "share of days attacked", "observed w", "active watchers", "wrongful flags/day",
           "griefers net USD/day"], rows)

    section("T17. Prototype as built (p03) vs recommended parameters, q=0.8, V=0 unless stated, beta=0.5",
            "Recommended: S=0.1 ETH, alpha=0.5, B=0.11 ETH (UMA minimum), L=24 h, U=30 d, d=0.")
    rows = []
    for name, S, a, B, U in [("p03 as built", 0.1, 0.5, 0.05, 7.0), ("recommended", 0.1, 0.5, 0.11, 30.0),
                             ("recommended, S=1", 1.0, 0.5, 1.0, 30.0)]:
        g5 = grief(S, a, B, 0.8, 0.5, 0.0)
        g9 = grief(S, a, B, 0.8, 0.9, 0.0)
        cap, gas, _ = honest_cost_year(S, 1000, 0.05)
        rows.append([name, usd(forge_gmax(S, a, 0.01, 1.0, U)), usd(forge_gmax(S, a, 0.1, 0.0, U)),
                     usd(g5["x_net"]), usd(g9["x_net"]), g9["gf"], grief_wmin(S, a, B, 0.8, 0.0),
                     grief_wmin(S, a, B, 0.8, S), usd(watcher_profit_per_dispute(B, 0.8)),
                     usd(cap + gas), sybil_capital(S, U, 10)])
    table(["set", "G_max p=.01 phi=1", "G_max p=.1 phi=0", "X net w=.5", "X net w=.9", "GF w=.9",
           "w_min V=0", "w_min V=S", "watcher USD/dispute", "honest USD/yr (0.05 gwei)",
           "forger capital, 10 fakes/day (ETH)"], rows)

    MD.append("\n## v2.1 scenario (auto-dispute, claim priority)\n")
    print("\n\n######## v2.1 scenario ########")
    print("Measured v2.1 gas (p03 run-v2_1, auto=on):", GAS21)
    v21_tables(c)

    with open(os.path.join(OUT, "tables.md"), "w") as fh:
        fh.write("# p06 generated tables\n\nGenerated by `python3 model.py`. Do not edit by hand.\n")
        fh.write("".join(MD))
    print("\nWrote output/sweep_forgery.csv, sweep_challenger.csv, sweep_griefing.csv, sweep_joint.csv, sweep_v2_1.csv, tables.md")


if __name__ == "__main__":
    main()
