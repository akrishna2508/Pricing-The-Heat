# State-wise Contract Results

_Generated 2026-07-23T05:17:01.253159+00:00 from each state's `models/artifacts/<state>/contract.json`. 3 of 79 states designed so far; the rest fill in as `make train-all-states` runs._

**Frame is chosen by climate regime, never forced** (see `backend/backtest/contract_design.py`): chronic-moderate peril -> INCOME SMOOTHING; consistently-extreme peril -> rare-trigger CATASTROPHE insurance. Premium is the LSMC fair-value premium (`premium_to_cap * cap * representative daily wage`), each **in that state's own currency -- never converted, never mixed unlabeled**.

| State | Metro | Frame | Strike | Window | Grid-ceiling censored? | Premium (fair-value) | Premium (wage-frac) | Cat-passing | MAE vs flat |
|---|---|---|---:|---:|:---:|---:|---:|---:|---:|
| Assam (`IN-Assam`) | Guwahati | **income smoothing** | 85 | 14d | no | 286.05 INR (construction) | 0.603 | 0 | +40.3% |
| Bihar (`IN-Bihar`) | Patna | **income smoothing** | 75 | 14d | no | 293.20 INR (construction) | 0.649 | 0 | +42.2% |
| Arizona (`US-Arizona`) | Phoenix | **catastrophe insurance** | 98 | 14d | no | 27.21 USD (construction) | 0.212 | 3 | +44.5% |

**Grid-ceiling audit**: 0 of 3 chosen strikes land on STRIKE_GRID's maximum (99) -- a flagged state's true optimum may be censored beyond the grid and must be reviewed before its premium is trusted.

