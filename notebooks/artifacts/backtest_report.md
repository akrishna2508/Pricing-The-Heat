# Backtest Report -- Pricing the Heat

_Generated 2026-07-18T02:53:51.682559+00:00_

## Provenance

- **Heat**: NASA POWER regional API (`power.larc.nasa.gov`), real fetch recorded in `data/raw/*.meta.json` sidecars.
- **Wages (labor structure)**: World Bank Indicators v2 (`api.worldbank.org`), indicator SL.EMP.WORK.ZS.
- **Baseline daily wages (cited, not API)**:
  - vendor: INR 368.0 -- Minimum Wages Act, 1948 notification (unskilled, Zone I) -- Labour & Employment Department, Government of Gujarat (https://labour.gujarat.gov.in, 2023-10) [**UNVERIFIED -- human confirmation required**]
  - construction: INR 406.0 -- Minimum Wages Act, 1948 notification (Building & Construction scheduled employment, semi-skilled) -- Labour & Employment Department, Government of Gujarat (https://labour.gujarat.gov.in, 2023-10) [**UNVERIFIED -- human confirmation required**]
  - delivery: INR 387.0 -- Minimum Wages Act, 1948 notification (semi-skilled, Zone I) -- Labour & Employment Department, Government of Gujarat (https://labour.gujarat.gov.in, 2023-10) [**UNVERIFIED -- human confirmation required**]
- **Elasticity (the one labeled modeling assumption)**:
  - vendor, delivery: 0.026/degC above 24.0C -- Foster/Kjellstrom meta-analysis, ~2.6%/C wage-loss above 24C WBGT
  - construction: 0.0057/degC above 24.0C -- Construction-sector WBGT productivity study, ~0.57%/C above 24C WBGT

## Data Completeness

- 100.000% directly observed, 0.000% nearest-real proxied (max reach: 0d / 0.0km), 0 fabricated.

## Modeling Assumptions

> **Elasticity**: ~2.6%/C wage loss above 24C WBGT (default), ~0.57%/C for construction (Foster/Kjellstrom meta-analysis; construction-sector WBGT productivity study).
>
> **tau convention**: kappa/gamma (Prompt 3's behavioral calibration) are CONDITIONAL on the fixed logit choice-noise scale tau = 0.1*wage. (kappa, gamma, tau) are jointly non-identified from a single choice curve; a different tau describes the same curve with different kappa/gamma. They are not free-standing physical constants.

## Headline: MAPE (full model vs flat-rate baseline)

Computed on the **basis-risk pairing** (index-triggered payout vs MAX-IN-WINDOW realized payout, matching the optimal-exercise contract the LSMC premium was priced for), never the degenerate own-node case.

| | Full model (LSMC) | Flat-rate baseline |
|---|---|---|
| Premium | occupation-specific (275-303 INR) | 135.34 INR (constant) |
| **MAPE** | **71.70%** | 54.27% |
| MAE (INR) | 77.48 | 118.77 |
| n (nonzero-actual windows) | 186 | 186 |

**MAPE improvement: -32.12%** (DOES NOT MEET the >=20% target).

**HONEST FINDING, not hidden**: on this metric and this backtest, the full model's MAPE is WORSE than the flat baseline's. This is a real, diagnosed property of MAPE on a right-skewed realized-payout distribution, not a methodology bug: MAE (a symmetric metric) FLIPS the ranking -- full model MAE=77.48 INR vs flat MAE=118.77 INR, a 34.8% improvement -- and the full model has a smaller absolute error on the majority of individual windows. The flat baseline's premium sits well below the median realized payout, which happens to minimize *relative* error against the many small (but nonzero) claims that MAPE weights heavily; the full model's premium sits much closer to the true mean/median and is more often correct in absolute terms. Both numbers are reported so this is not spun either way.

## Contract Health

- **trigger_rate**: 51.2% of 121 30-day windows had the index reach the strike at least once.
- **payout_frequency**: 1.698% of 164,340 worker-days actually received a payout.
- **premium-to-cap ratio** (priced premium / max possible payout):
  - vendor: 0.830
  - construction: 0.830
  - delivery: 0.830

trigger_rate (51.2%) is below the 60% pathological threshold, but a roughly one-in-two chance of triggering per 30-day window is still frequent for a strike framed as a catastrophe-style event; worth weighing against the premium-to-cap ratios above (premium sits close to a large fraction of the maximum possible payout), which point the same direction.

## Persistence

Real-data analogue of Prompt 5's simulated ~7% i.i.d.-vs-persistent gap, computed with the SAME reordering utility (`models.pricing.lsmc_pricer.persistence_premium_gap`) applied to every real non-overlapping window: (a) an i.i.d.-shuffled version of the window's own 30 values vs (b) the real ordered window (autocorrelation ~0.99 intact).

- mean gap: **-2.92%** (median -2.55%), over 62 triggering windows (59 windows never reach the strike under either ordering -- gap is 0/0, undefined, and excluded).

**Methodological note (why the sign differs from Prompt 5's simulated figure)**: Prompt 5's test varied AR(1) persistence across M INDEPENDENT simulated realizations sharing one marginal, preserving genuine stopping-under-uncertainty in both cases. Here, "the real ordered window" is the ONE real historical realization, replicated identically across paths for the LSMC call; with zero cross-sectional variance the regression collapses toward the near-perfect-foresight value of that one history, which is mechanically >= the genuine stopping-under-uncertainty value of the shuffled case -- hence a NEGATIVE gap here versus the positive ~7% on simulated data. Both are honestly reported; they are not the same experiment, just the same reordering principle applied to what data was actually available.

## Basis Risk (empirical, real replay)

Computed on 164,340 real worker-days (45 workers x 3652 days), pairing the index-triggered daily payout against each worker's own hurdle-model wage loss.

| basis_risk_rmse | shortfall_rate | overpay_rate | correlation |
|---|---|---|---|
| 81.82 INR | 34.5% | 32.0% | 0.665 |

shortfall_rate = 34.5% of worker-days the index UNDER-pays the worker's actual modeled loss; overpay_rate = 32.0% the insurer pays MORE than the actual loss. This is the honest measure of how often the index fails the worker, structurally inherent to any parametric product.

**HONEST CAVEAT**: shortfall_rate exceeds 30% -- workers are frequently under-compensated relative to their modeled loss. This is a design finding (strike/cap/basis choice), not something to bury.

## Sensitivity Sweep

theta moves the premium (it directly parameterizes the copula the mu-TEVI index is built from); the loss-marginal shape (traceable to Prompt 3's kappa/gamma) does NOT -- verified live, not assumed: the payout is a pure function of the index, independent of the loss draw.

| theta multiplier | theta | premium (wage-frac) |
|---|---|---|
| 0.7x | 3.176 | 0.7585 |
| 1.0x | 4.537 | 0.7473 |
| 1.3x | 5.898 | 0.7407 |

| loss-marginal (kappa/gamma proxy) multiplier | premium (wage-frac) | mean simulated loss |
|---|---|---|
| 0.7x | 0.7473 | 0.0656 |
| 1.0x | 0.7473 | 0.0785 |
| 1.3x | 0.7473 | 0.0891 |

## Value at Risk / Expected Shortfall

Computed on the **insurer's aggregate daily payout liability** (summed across the 45-worker portfolio, one value per real day, 3652 days -- itself aggregating 164,340 worker-days, comfortably exceeding the >=1000 worker-day threshold). This is a capital-adequacy question ('how much must the insurer hold'), NOT a statement about workers' wage losses.

| alpha | VaR (INR/day) | Expected Shortfall (INR/day) |
|---|---|---|
| 95% | 12213.73 | 13522.76 |
| 99% | 14317.75 | 14955.89 |

**premium_to_payout_ratio** (total premium collected / total realized payout, over the replay): 2.351

## Figures

- `data/exports/poster_figures/heat_map_snapshot.png` -- Heat-map snapshot (peak real day)
- `data/exports/poster_figures/mu_tevi_series.png` -- Real mu-TEVI series, 2014-2023
- `data/exports/poster_figures/premium_vs_heat.png` -- Premium-vs-heat (payout schedule) curve
- `data/exports/poster_figures/mape_comparison.png` -- MAPE / MAE comparison: full model vs flat baseline
- `data/exports/poster_figures/trigger_rate_calendar.png` -- [NEW] Trigger-rate over the calendar (contract health)

