# Pricing the Heat

A parametric micro-insurance pricing engine for informal outdoor workers'
heatwave wage loss. See `CLAUDE.md` for the full project brief and standing
engineering rules.

## Data pipeline (`backend/data/`)

| Module | Purpose |
|---|---|
| `recovery.py` | Shared MODE A / MODE B handling: `fetch_json`, `fetch_json_cached`, `fill_gaps_nearest`, `fatal_abort`. The only place network calls happen. |
| `weather.py` | NASA POWER regional API loader (T2M, RH2M -> heat index, shade-WBGT approximation). |
| `wages.py` | World Bank Indicators v2 loader (labor-structure context) + cited baseline daily wages from `cities.yaml`. |
| `wages_ilostat.py` | Optional ILOSTAT SDMX enrichment. Never on the required path; fails soft. |
| `elasticity.py` | Cited heat -> wage-loss elasticity constants (the one labeled modeling assumption). |
| `survey.py` | Optional swap seam: real field-survey elasticity override. |
| `build_wage_loss.py` | Assembles `data/processed/wage_loss.parquet` from the above. |
| `cities.yaml` | City bounding boxes + cited baseline wage schedule. |

Run the full pipeline: `make data` (equivalently `make reproduce`, since raw
responses are cached under `data/raw/` and reused deterministically).

### Real-data-only policy

No synthetic, fabricated, or placeholder data anywhere. Two failure modes:

- **MODE A** (source unreachable/unparseable after retries): aborts with a
  `FATAL:` banner and nonzero exit. No output file is written.
- **MODE B** (a returned cell is null/-999): filled with the nearest REAL
  observed value (same node nearest day within 7 days, else same day nearest
  node, else escalates to MODE A). Every proxy fill is recorded and the
  overall proxy rate is printed in the provenance banner.

### Survey data swap seam

`backend/data/survey.py` lets a real, primary field survey override the cited
literature elasticity constants: drop a `data/raw/survey_real.csv` (columns:
`occupation, per_deg, wbgt_threshold_c`) and that occupation's provenance
flips to `"primary field data"`.

The Indian PLFS (Periodic Labour Force Survey) microdata is a real candidate
source for such a survey, but it is gated behind registration at
[microdata.gov.in](https://microdata.gov.in) and cannot be fetched
automatically. If obtained, derive `per_deg`/`wbgt_threshold_c` from it and
drop the CSV in manually -- this is a manual drop-in, not an automated fetch.

### Baseline wage figures

`cities.yaml` cites the Gujarat Minimum Wages Act, 1948 notification
(Labour & Employment Department, Government of Gujarat) for Ahmedabad's
per-occupation baseline daily wages. Each `baseline_daily_wage` record carries
`source_name`, `source_url`, `effective_date`, and a `verified: false` flag.
Run `python -m backend.data.verify_wages` to print exactly what needs
checking against the live Government Resolution. Only a human can flip
`verified: true` (after confirming the figure) -- the agent never sets it
itself, since it cannot confirm a live government notification.

### Location-based pricing

`backend/data/location.py` resolves a real GPS coordinate to the nearest
configured city (haversine distance, `THRESHOLD_KM = 150`). A hit within
range prices using that city's real NASA POWER grid and cited wage schedule;
a miss returns an honest `out_of_coverage` response naming the nearest
configured city and its distance -- never fabricated data for the raw point.
Coordinates travel only in POST bodies (`/resolve-location`,
`/simulate-policy`) and are never logged, cached, or persisted.

## Tests

`tests/unit/test_data.py` runs fully offline against committed fixtures in
`tests/fixtures/` (recorded once, with network, via `tests/fixtures/_record.py`).
`tests/unit/test_location.py` and `tests/unit/test_api.py` cover city
resolution and the `/resolve-location` + `/simulate-policy` endpoints.

```
PYTHONPATH=. pytest tests/unit -q
```
