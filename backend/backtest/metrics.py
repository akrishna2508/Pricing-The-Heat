"""Backtest metrics: MAPE, premium-to-payout ratio, portfolio VaR/CVaR, and the
[NEW] diagnostics carried from Prompt 5 -- empirical basis risk, trigger/payout
frequency, and the real-data persistence-premium gap.

VaR/CVaR SUBJECT, stated explicitly per the prompt: these are computed on the
INSURER'S PAYOUT LIABILITY (aggregate daily payouts owed across the portfolio),
NOT on workers' wage losses. This is the "how much capital must the insurer
hold" question -- the loss variable IS the payout the insurer pays out.
"""

from __future__ import annotations

import numpy as np
import pandas as pd

from models.pricing.basis_risk import basis_risk_empirical  # re-exported, reused verbatim
from models.pricing.lsmc_pricer import LSMCPricer, persistence_premium_gap

__all__ = [
    "mape", "premium_to_payout_ratio", "value_at_risk", "expected_shortfall",
    "basis_risk_empirical", "trigger_rate", "payout_frequency",
    "real_persistence_premium_gap",
]


def mape(actual: np.ndarray, predicted: np.ndarray, min_actual: float = 1e-9) -> dict:
    """Mean Absolute Percentage Error, with the zero-actual case handled honestly.

    A percentage error against an exactly-zero actual is undefined (division by
    zero), not "large" -- the standard convention (and the only one that does not
    silently distort the headline number) is to compute MAPE over the
    NON-ZERO-actual observations only, and report how many were excluded so the
    sample size is never hidden.
    """
    actual = np.asarray(actual, dtype=float).reshape(-1)
    predicted = np.asarray(predicted, dtype=float).reshape(-1)
    if len(actual) != len(predicted):
        raise ValueError("actual and predicted must be the same length")
    if len(actual) == 0:
        raise ValueError("need at least one observation")

    included = np.abs(actual) > min_actual
    n_excluded = int((~included).sum())
    if included.sum() == 0:
        raise ValueError("every actual value is ~0 -- MAPE is undefined for this sample")

    ape = np.abs((actual[included] - predicted[included]) / actual[included]) * 100.0
    return {
        "mape": float(ape.mean()),
        "n_included": int(included.sum()),
        "n_excluded_zero_actual": n_excluded,
        "n_total": int(len(actual)),
    }


def premium_to_payout_ratio(premiums: np.ndarray, payouts: np.ndarray) -> float:
    """sum(premiums collected) / sum(payouts paid). >1 = insurer collects more
    than it pays out (solvent on average); <1 = collects less (insolvent trend)."""
    premiums = np.asarray(premiums, dtype=float)
    payouts = np.asarray(payouts, dtype=float)
    total_payout = float(payouts.sum())
    if total_payout == 0.0:
        return float("inf") if premiums.sum() > 0 else float("nan")
    return float(premiums.sum() / total_payout)


def value_at_risk(losses: np.ndarray, alpha: float) -> float:
    """VaR_alpha: the alpha-quantile of the loss distribution (empirical).

    losses = the insurer's payout liability (see module docstring), NOT wage
    loss. VaR_95 = the payout level exceeded only 5% of the time.
    """
    losses = np.asarray(losses, dtype=float)
    if not 0.0 < alpha < 1.0:
        raise ValueError(f"alpha must be in (0,1), got {alpha}")
    return float(np.quantile(losses, alpha))


def expected_shortfall(losses: np.ndarray, alpha: float) -> float:
    """ES_alpha (CVaR): mean loss in the tail beyond VaR_alpha."""
    losses = np.asarray(losses, dtype=float)
    var = value_at_risk(losses, alpha)
    tail = losses[losses >= var]
    if len(tail) == 0:
        return var
    return float(tail.mean())


def trigger_rate(window_summary: pd.DataFrame) -> float:
    """Fraction of WINDOWS (policy periods) in which the index trigger fired
    at least once. One row per window (dedupe across occupations, since the
    trigger is a single city-level event shared by every occupation)."""
    per_window = window_summary.drop_duplicates("window_id")
    return float(per_window["triggered"].mean())


def payout_frequency(n_claim_events: int, n_workers: int, n_days: int) -> float:
    """Fraction of WORKER-DAYS that actually received a payout.

    Denominator is n_workers x n_days -- the TRUE daily worker-day count, not
    n_workers x n_windows. This is a deliberate, load-bearing choice: under the
    one-shot contract each worker claims AT MOST ONCE per window (on their
    single best day), so using n_windows as the denominator would make
    n_claim_events/(n_workers*n_windows) ALGEBRAICALLY COLLAPSE to trigger_rate
    whenever every worker claims in every triggering window (n_claim_events =
    n_triggered_windows * n_workers exactly) -- caught by testing this: an
    earlier version used n_windows and the two "distinct" diagnostics came out
    numerically identical. With n_days, payout_frequency answers "on any given
    day, what is the chance THIS worker gets paid" -- a genuinely different,
    much smaller number than trigger_rate ("in any given policy period, does
    the shared trigger fire at all"), which is the contrast the diagnostic
    exists to show.
    """
    if n_workers <= 0 or n_days <= 0:
        raise ValueError("n_workers and n_days must be > 0")
    return float(n_claim_events / (n_workers * n_days))


def real_persistence_premium_gap(pricer: LSMCPricer, city_index: pd.DataFrame,
                                 window_days: int, n_paths: int,
                                 seed: int = 42) -> dict:
    """The real-data analogue of Prompt 5's simulated ~7% i.i.d.-vs-persistent
    gap, computed by REUSING models.pricing.lsmc_pricer.persistence_premium_gap
    (no new method invented) over every real, non-overlapping window.

    Only windows where the REAL ordered premium is nonzero are included (a
    window whose real values never reach the strike gives 0/0 -- undefined,
    not zero -- under EITHER ordering, since reordering cannot change the max
    of a fixed multiset of values).
    """
    from backend.backtest.historical_replay import windows  # local import: backtest -> pricing is
                                                              # the intended direction, not the reverse

    mutevi = city_index["mu_tevi"].to_numpy()
    win_bounds = windows(len(mutevi), window_days)
    rng = np.random.default_rng(seed)

    gaps = []
    n_undefined = 0
    for start, end in win_bounds:
        window = mutevi[start:end]
        gap = persistence_premium_gap(pricer, window, n_paths, rng)
        if np.isfinite(gap):
            gaps.append(gap)
        else:
            n_undefined += 1

    return {
        "mean_gap_pct": float(np.mean(gaps)) if gaps else float("nan"),
        "median_gap_pct": float(np.median(gaps)) if gaps else float("nan"),
        "n_windows_used": len(gaps),
        "n_windows_undefined": n_undefined,
        "n_windows_total": len(win_bounds),
    }
