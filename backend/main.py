"""FastAPI backend exposing the pipeline as a service (Prompt 7; /forecast and
/flag-anomaly wired to real models in Prompt 8; /assistant/ask wired to a
grounded Claude assistant in Prompt 9).

PRODUCT FRAMING (carried from Prompt 6b, non-negotiable everywhere in this
module): the peril is chronic -- outdoor workers lose wages on ~66% of
worker-days -- and 0 of 36 grid points in the contract-design sweep behaved
like catastrophe insurance. This is HIGH-FREQUENCY INCOME SMOOTHING, never
"catastrophe insurance", in every user-facing string, field name, and response.

CONTRACT: strike=75, window=14 days, read from backend/config.py's
load_contract_config() (backed by backend/data/cities.yaml's `contract:`
section) -- NEVER hardcoded here, so the API and the backtest cannot drift.

LAZY MODEL LOADING: no *.pt / copula.json / mu_tevi.parquet is read at import
time -- only inside request handlers -- so this module (and CI) can import
`app` with zero trained artifacts on disk. A missing artifact returns 503
rather than crashing.

PRIVACY: lat/lon travel ONLY in POST bodies (never a query string), are used
transiently to resolve a city, and are never logged or persisted -- only the
resolved city name is retained (in the in-memory policy cache and responses).
"""

import uuid
from datetime import date
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd
import yaml
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from backend.assistant import service as assistant_service
from backend.config import load_contract_config
from backend.data.location import resolve_city
from backend.data.wages import WageLoader
from models.pricing.lsmc_pricer import LSMCPricer

limiter = Limiter(key_func=get_remote_address)

app = FastAPI(title="Pricing the Heat", version="0.8.0")
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CITIES_YAML_PATH = Path(__file__).parent / "data" / "cities.yaml"
MU_TEVI_PATH = Path("data/processed/mu_tevi.parquet")
STGCN_PATH = Path("models/artifacts/stgcn.pt")
FORECASTER_PATH = Path("models/artifacts/forecaster.pt")
ANOMALY_PATH = Path("models/artifacts/anomaly.pkl")

MODEL_NOT_TRAINED_DETAIL = "model artifact not trained yet — run make train"

CONTRACT = load_contract_config()          # {"strike", "window_days", "product_type"}
PRODUCT_TYPE = CONTRACT["product_type"]    # "income_smoothing" -- never "catastrophe_insurance".

# In-memory cache: policy_id -> everything /explain needs to reconstruct the
# pricer and re-derive an explanation. No DB required (Prompt 7's rule).
_policy_cache: dict[str, dict[str, Any]] = {}

# Lazy STGCN handle, populated on first /heatmap call only.
_stgcn_cache: dict[str, Any] = {}

# Lazy GRU forecaster handle, populated on first /forecast call only.
_forecaster_cache: dict[str, Any] = {}

# Lazy anomaly-detector handle, populated on first /flag-anomaly call only.
_anomaly_cache: dict[str, Any] = {}


def _load_cities_config() -> dict:
    with open(CITIES_YAML_PATH) as f:
        return yaml.safe_load(f)


def _load_pricer() -> LSMCPricer | None:
    """Lazily loads the frozen LSMC pricer from copula.json. None if untrained."""
    try:
        return LSMCPricer.from_copula_json()
    except FileNotFoundError:
        return None


def _load_stgcn():
    """Lazily loads the trained STGCN checkpoint. (None, None) if untrained."""
    if "model" in _stgcn_cache:
        return _stgcn_cache["model"], _stgcn_cache["ckpt"]
    if not STGCN_PATH.exists():
        return None, None

    import torch

    from models.stgcn.model import STGCN

    ckpt = torch.load(STGCN_PATH, map_location="cpu", weights_only=False)
    cfg = ckpt["config"]
    model = STGCN(in_channels=cfg["in_channels"], hidden=cfg["hidden"], horizon=cfg["horizon"],
                  t_in=cfg["t_in"], k_order=cfg["k_order"], kernel_size=cfg["kernel_size"])
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    _stgcn_cache["model"] = model
    _stgcn_cache["ckpt"] = ckpt
    return model, ckpt


@app.get("/health")
def health_check():
    return {"status": "ok"}


# --- /resolve-location -----------------------------------------------------


class ResolveLocationRequest(BaseModel):
    lat: float
    lon: float


class ResolveLocationResponse(BaseModel):
    city_key: str
    city: str
    distance_km: float
    mode: str
    message: str | None = None


@app.post("/resolve-location", response_model=ResolveLocationResponse)
def resolve_location(req: ResolveLocationRequest):
    """Resolve a real GPS coordinate to the nearest configured city.

    lat/lon travel ONLY in this POST body (never a query string) and are used
    transiently for distance computation -- never logged or persisted. An
    out-of-coverage point gets an honest message and the nearest city; no
    pricing/weather is ever fabricated for it.
    """
    cities_cfg = _load_cities_config()
    result = resolve_city(req.lat, req.lon, cities_cfg)
    return ResolveLocationResponse(**result)


# --- /simulate-policy -------------------------------------------------------


class DateRange(BaseModel):
    start: date
    end: date


class SimulatePolicyRequest(BaseModel):
    occupation: str = "vendor"
    date_range: DateRange
    lat: float | None = None
    lon: float | None = None


class BasisRiskBlock(BaseModel):
    basis_risk_rmse: float
    shortfall_rate: float
    overpay_rate: float
    correlation: float


class SimulatePolicyResponse(BaseModel):
    policy_id: str
    product_type: str = PRODUCT_TYPE
    coverage_mode: str
    resolved_city: str | None = None
    distance_km: float | None = None
    occupation: str | None = None
    premium_lsmc: float | None = None
    premium_wang: float | None = None
    payout_schedule: dict | None = None
    mu_tevi_series: list[dict] | None = None
    basis_risk: BasisRiskBlock | None = None
    message: str | None = None
    note: str


def _resolve_for_request(cities_cfg: dict, lat: float | None, lon: float | None) -> dict:
    """Resolve a city from body-only lat/lon; falls back to the default city.

    Coordinates are NEVER accepted from a query string -- only Pydantic body
    fields reach here at all, so a query-string lat/lon is silently ignored by
    construction, not merely rejected after the fact.
    """
    if lat is not None and lon is not None:
        return resolve_city(lat, lon, cities_cfg)
    key = cities_cfg["default_city"]
    city = cities_cfg["cities"][key]
    return {"city_key": key, "city": city["name"], "distance_km": None, "mode": "configured"}


@app.post("/simulate-policy", response_model=SimulatePolicyResponse)
@limiter.limit("30/minute")
def simulate_policy(req: SimulatePolicyRequest, request: Request):
    """Price the income-smoothing contract (strike/window from backend/config.py)
    for a resolved city + occupation + real coverage window.

    Surfaces basis_risk as a first-class HONESTY feature (Prompt 6b, carried
    constraint D): the gap between the index-triggered payout and the
    worker's modeled loss, not hidden inside a single headline number.
    """
    policy_id = str(uuid.uuid4())
    cities_cfg = _load_cities_config()
    resolved = _resolve_for_request(cities_cfg, req.lat, req.lon)

    if resolved["mode"] == "out_of_coverage":
        _policy_cache[policy_id] = {"window_days": None}
        return SimulatePolicyResponse(
            policy_id=policy_id,
            coverage_mode=resolved["mode"],
            resolved_city=resolved["city"],
            distance_km=resolved.get("distance_km"),
            message=resolved.get("message"),
            note="No pricing computed: location is outside covered cities. "
                 "No data was fabricated for this point.",
        )

    pricer = _load_pricer()
    if pricer is None:
        raise HTTPException(status_code=503, detail=MODEL_NOT_TRAINED_DETAIL)

    wage_loader = WageLoader(country_iso3=cities_cfg["cities"][resolved["city_key"]]["country_iso3"])
    baseline_wages = wage_loader.occupation_baseline_wages(city_key=resolved["city_key"])
    if req.occupation not in baseline_wages:
        raise HTTPException(
            status_code=400,
            detail=f"unknown occupation '{req.occupation}'; have {sorted(baseline_wages)}",
        )

    window_days = int(CONTRACT["window_days"])
    if req.date_range.end < req.date_range.start:
        raise HTTPException(status_code=400, detail="date_range.end must be >= date_range.start")

    if not MU_TEVI_PATH.exists():
        raise HTTPException(status_code=503, detail=MODEL_NOT_TRAINED_DETAIL)
    city_index = pd.read_parquet(MU_TEVI_PATH).sort_values("ts").reset_index(drop=True)
    start_ts = pd.Timestamp(req.date_range.start)
    window_df = city_index[city_index["ts"] >= start_ts].head(window_days)
    if len(window_df) < window_days:
        raise HTTPException(
            status_code=404,
            detail=f"real mu-TEVI data does not cover a full {window_days}-day window "
                   f"starting {req.date_range.start}; no data was fabricated to fill it",
        )

    window_values = window_df["mu_tevi"].to_numpy()
    result = pricer.price_window(window_values, req.occupation)

    _policy_cache[policy_id] = {
        "occupation": req.occupation,
        "window_days": window_days,
        "strike": pricer.strike,
        "cap": pricer.cap,
        "city_key": resolved["city_key"],
        # Cached verbatim so /assistant/ask's get_policy_state tool (Prompt 9)
        # is grounded on the SAME values this response returned, not a re-run.
        "premium_lsmc": result["premium_lsmc"],
        "premium_wang": result["premium_wang"],
        "payout_schedule": result["payout_schedule"],
        "basis_risk": result["basis_risk"],
    }

    return SimulatePolicyResponse(
        policy_id=policy_id,
        coverage_mode=resolved["mode"],
        resolved_city=resolved["city"],
        distance_km=resolved.get("distance_km"),
        occupation=req.occupation,
        premium_lsmc=result["premium_lsmc"],
        premium_wang=result["premium_wang"],
        payout_schedule=result["payout_schedule"],
        mu_tevi_series=[
            {"ts": row["ts"].date().isoformat(), "mu_tevi": float(row["mu_tevi"])}
            for _, row in window_df.iterrows()
        ],
        basis_risk=BasisRiskBlock(**result["basis_risk"]),
        note=(
            f"Priced as high-frequency income smoothing (NOT catastrophe insurance): "
            f"a {window_days}-day coverage window at strike {pricer.strike:.0f} mu-TEVI, "
            f"starting {req.date_range.start}. basis_risk reports how often the index "
            f"under/over-pays the worker's own modeled loss -- inherent to any "
            f"parametric product, surfaced honestly rather than hidden."
        ),
    )


# --- /explain/{policy_id} ---------------------------------------------------


def _explain_contract(pricer: LSMCPricer, window_days: int, n_paths: int = 1000,
                      seed: int = 42) -> dict:
    """Feature-contribution surrogate for the priced contract.

    price_window's premium is a Bermudan (one-shot optimal-stopping) LSMC
    value with no native SHAP-compatible model, so this fits a small
    transparent linear surrogate -- regressing each simulated path's
    discounted payoff on three summary features of that path's mu-TEVI window
    -- and explains THAT surrogate. Uses shap.LinearExplainer if shap installs
    cleanly; otherwise falls back to sklearn permutation importance on the
    same regression. Either way this never blocks on SHAP being available.
    """
    rng = np.random.default_rng(seed)
    mutevi_paths, _loss_paths = pricer.simulate_paths(window_days, n_paths, rng)
    priced = pricer.price_paths(mutevi_paths, _loss_paths)
    y = priced["discounted_payoffs"]

    feature_names = ["max_index_in_window", "mean_index_in_window", "fraction_days_above_strike"]
    x = np.column_stack([
        mutevi_paths.max(axis=1),
        mutevi_paths.mean(axis=1),
        (mutevi_paths >= pricer.strike).mean(axis=1),
    ])

    from sklearn.linear_model import LinearRegression
    model = LinearRegression().fit(x, y)

    try:
        import shap

        explainer = shap.LinearExplainer(model, x)
        shap_values = explainer.shap_values(x)
        contributions = {name: float(np.abs(shap_values[:, i]).mean())
                         for i, name in enumerate(feature_names)}
        method = "shap"
    except ImportError:
        from sklearn.inspection import permutation_importance

        r = permutation_importance(model, x, y, n_repeats=10, random_state=seed)
        contributions = {name: float(max(r.importances_mean[i], 0.0))
                         for i, name in enumerate(feature_names)}
        method = "permutation_importance"

    total = sum(contributions.values()) or 1.0
    return {
        "method": method,
        "feature_contributions": contributions,
        "feature_contributions_normalized": {k: v / total for k, v in contributions.items()},
        "note": "Surrogate explanation of the LSMC premium's sensitivity to the priced "
                "window's heat-index summary -- not a decomposition of the exact Bermudan "
                "value, which has no closed-form attribution.",
    }


@app.get("/explain/{policy_id}")
def explain(policy_id: str):
    cached = _policy_cache.get(policy_id)
    if cached is None:
        raise HTTPException(status_code=404, detail=f"unknown policy_id {policy_id!r}")
    if cached.get("window_days") is None:
        raise HTTPException(
            status_code=404,
            detail="policy has no priced contract to explain (out-of-coverage / unpriced)",
        )

    try:
        pricer = LSMCPricer.from_copula_json(strike=cached["strike"], cap=cached["cap"])
    except FileNotFoundError:
        raise HTTPException(status_code=503, detail=MODEL_NOT_TRAINED_DETAIL)

    explanation = _explain_contract(pricer, cached["window_days"])
    return {"policy_id": policy_id, **explanation}


# --- /heatmap ---------------------------------------------------------------


@app.get("/heatmap")
def heatmap(date: str | None = None):
    """GeoJSON of the real grid: each cell carries its own STGCN-forecast
    heat_index (per-node shade-WBGT, degC) AND the requested date's
    CITY-LEVEL mu_tevi (the fused index -- the SAME value across every cell,
    since one mu-TEVI index covers the whole city; see models.fusion.tevi).
    """
    model, ckpt = _load_stgcn()
    if model is None:
        raise HTTPException(status_code=503, detail=MODEL_NOT_TRAINED_DETAIL)

    import torch

    from models.stgcn.train import load_weather, to_node_time_matrix

    weather = load_weather()
    arr, node_ids_current, _coords = to_node_time_matrix(weather)
    dates_sorted = sorted(weather["date"].unique())

    if date is None:
        target = dates_sorted[-1]
    else:
        target = pd.Timestamp(date)
        if target not in dates_sorted:
            raise HTTPException(
                status_code=404,
                detail=f"date {date} is not covered by the real weather data on disk",
            )

    node_order = ckpt["graph"]["node_ids"]
    col_index = {nid: i for i, nid in enumerate(node_ids_current)}
    reorder = [col_index[nid] for nid in node_order]
    arr = arr[:, reorder]

    t_in = ckpt["config"]["t_in"]
    idx = dates_sorted.index(target)
    if idx < t_in:
        raise HTTPException(
            status_code=400,
            detail=f"insufficient real history before {target.date()} "
                   f"(need {t_in} prior days on disk)",
        )

    mu, sigma = ckpt["norm"]["mu"], ckpt["norm"]["sigma"]
    window = arr[idx - t_in:idx]
    x = torch.from_numpy(((window - mu) / sigma)[None, :, :, None].astype(np.float32))
    basis = torch.from_numpy(ckpt["graph"]["cheb_basis"]).float()
    with torch.no_grad():
        pred = model(x, basis).numpy()[0]  # (N, horizon)
    heat_index = pred[:, 0] * sigma + mu    # first horizon day == `target`

    mu_tevi_value = None
    if MU_TEVI_PATH.exists():
        city_index = pd.read_parquet(MU_TEVI_PATH)
        row = city_index[city_index["ts"] == target]
        if not row.empty:
            mu_tevi_value = float(row["mu_tevi"].iloc[0])

    coords = ckpt["graph"]["coords"]
    features = [
        {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [float(coords[i][1]), float(coords[i][0])]},
            "properties": {
                "node_id": nid,
                "heat_index": float(heat_index[i]),
                "mu_tevi": mu_tevi_value,
            },
        }
        for i, nid in enumerate(node_order)
    ]
    return {
        "type": "FeatureCollection",
        "features": features,
        "metadata": {
            "date": str(target.date()),
            "product_type": PRODUCT_TYPE,
            "note": "heat_index is the per-node STGCN shade-WBGT forecast (degC), one value "
                    "per real grid cell. mu_tevi is the CITY-LEVEL fused index and is "
                    "IDENTICAL across every cell for this date -- there is one contract "
                    "trigger for the whole city, not a per-node one.",
        },
    }


# --- /forecast (Prompt 8) ---------------------------------------------------


def _load_forecaster():
    """Lazily loads the trained GRU forecaster checkpoint. (None, None) if untrained."""
    if "model" in _forecaster_cache:
        return _forecaster_cache["model"], _forecaster_cache["ckpt"]
    if not FORECASTER_PATH.exists():
        return None, None

    import torch

    from models.forecast.model import GRUForecaster

    ckpt = torch.load(FORECASTER_PATH, map_location="cpu", weights_only=False)
    cfg = ckpt["config"]
    model = GRUForecaster(input_size=cfg["input_size"], hidden=cfg["hidden"], horizon=cfg["horizon"])
    model.load_state_dict(ckpt["state_dict"])
    model.eval()
    _forecaster_cache["model"] = model
    _forecaster_cache["ckpt"] = ckpt
    return model, ckpt


@app.get("/forecast")
def forecast(horizon_days: int = 7):
    """GRU forecast of the city-level mu-TEVI index, `horizon_days` ahead of
    the most recent real day on disk. Surfaces the training-time validation
    comparison against a persistence baseline (Prompt 8's honesty requirement)
    on every call, not just at training time.
    """
    model, ckpt = _load_forecaster()
    if model is None:
        raise HTTPException(status_code=503, detail=MODEL_NOT_TRAINED_DETAIL)

    max_horizon = ckpt["config"]["horizon"]
    if not 1 <= horizon_days <= max_horizon:
        raise HTTPException(
            status_code=400,
            detail=f"horizon_days must be in [1, {max_horizon}] (forecaster trained to {max_horizon}d)",
        )

    import torch

    mu, sigma = ckpt["norm"]["mu"], ckpt["norm"]["sigma"]
    last_window = np.asarray(ckpt["last_window"], dtype=np.float32)
    x = torch.from_numpy(((last_window - mu) / sigma)[None, :, None].astype(np.float32))
    with torch.no_grad():
        pred_norm = model(x).numpy()[0]  # (horizon,)
    pred = pred_norm * sigma + mu

    last_date = pd.Timestamp(ckpt["last_date"])
    metrics = ckpt["metrics"]
    return {
        "as_of": last_date.date().isoformat(),
        "horizon_days": horizon_days,
        "forecast": [
            {
                "days_ahead": h + 1,
                "ts": (last_date + pd.Timedelta(days=h + 1)).date().isoformat(),
                "mu_tevi": float(pred[h]),
            }
            for h in range(horizon_days)
        ],
        "validation": {
            "model_mae": metrics["model_mae"],
            "persistence_mae": metrics["persistence_mae"],
            "beats_persistence": metrics["beats_persistence"],
            "note": "GRU forecaster's chronological hold-out MAE vs a persistence "
                    "(tomorrow=today) baseline, reported honestly whichever wins -- "
                    "see models/forecast/train.py.",
        },
    }


# --- /flag-anomaly (Prompt 8) ------------------------------------------------


def _load_anomaly_detector():
    """Lazily loads the trained IsolationForest claim-anomaly detector. None if untrained."""
    if "detector" in _anomaly_cache:
        return _anomaly_cache["detector"]
    if not ANOMALY_PATH.exists():
        return None

    import pickle

    with open(ANOMALY_PATH, "rb") as f:
        detector = pickle.load(f)
    _anomaly_cache["detector"] = detector
    return detector


class FlagAnomalyRequest(BaseModel):
    heat_index: float
    occupation: str
    claimed_payout: float
    days_since_last_claim: float | None = None


class FlagAnomalyResponse(BaseModel):
    is_anomalous: bool
    anomaly_score: float


@app.post("/flag-anomaly", response_model=FlagAnomalyResponse)
def flag_anomaly(req: FlagAnomalyRequest):
    """Score a single claim's feature vector against the trained Isolation
    Forest (top 1% most anomalous flagged, see models/anomaly/detector.py).
    """
    detector = _load_anomaly_detector()
    if detector is None:
        raise HTTPException(status_code=503, detail=MODEL_NOT_TRAINED_DETAIL)

    row = pd.DataFrame([{
        "heat_index": req.heat_index,
        "occupation": req.occupation,
        "claimed_payout": req.claimed_payout,
        "days_since_last_claim": (
            req.days_since_last_claim if req.days_since_last_claim is not None else float("nan")
        ),
    }])
    is_anomalous = bool(detector.predict(row)[0])
    anomaly_score = float(detector.score(row)[0])
    return FlagAnomalyResponse(is_anomalous=is_anomalous, anomaly_score=anomaly_score)


# --- /assistant/ask (Prompt 9) -----------------------------------------------


class AssistantAskRequest(BaseModel):
    policy_id: str
    question: str


class AssistantAskResponse(BaseModel):
    policy_id: str
    answer: str
    source: str


@app.post("/assistant/ask", response_model=AssistantAskResponse)
@limiter.limit("30/minute")
def assistant_ask(req: AssistantAskRequest, request: Request):
    """Grounded Claude policy assistant: get_policy_state (backend.assistant.tools)
    is the model's ONLY source of numeric facts about a policy -- see
    backend.assistant.service for the tool-use loop and the no-key /
    on-error deterministic fallback that keeps this route from ever 500ing.
    """
    result = assistant_service.ask(req.policy_id, req.question, _policy_cache)
    return AssistantAskResponse(policy_id=req.policy_id, answer=result["answer"],
                                source=result["source"])
