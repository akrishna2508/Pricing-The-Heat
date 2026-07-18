"""Offline API tests (Prompt 7): must pass with NO trained artifacts (CI).

Every route that depends on a trained model artifact (*.pt) or a processed
parquet is exercised here either via its honest 503 path (artifact absent) or
via monkeypatched seams (backend.main._load_pricer, MU_TEVI_PATH, STGCN_PATH)
that stub in a fixed result -- so the /simulate-policy response schema
(product_type="income_smoothing" + basis_risk) is asserted without requiring
`make train` to have run first. Coordinates travel ONLY in POST bodies, never
a query string (location-privacy rule) -- verified explicitly below.
"""

from __future__ import annotations

from pathlib import Path

import pandas as pd
import pytest
from fastapi.testclient import TestClient

import backend.main as main_module
from backend.main import app

client = TestClient(app)

# Ahmedabad's configured centroid (see backend/data/cities.yaml).
AHMEDABAD_LAT, AHMEDABAD_LON = 23.03, 72.58
# Far from any configured city.
OUT_OF_COVERAGE_LAT, OUT_OF_COVERAGE_LON = 0.0, 0.0


def test_health_ok():
    resp = client.get("/health")
    assert resp.status_code == 200
    assert resp.json() == {"status": "ok"}


def test_simulate_policy_malformed_body_returns_422():
    resp = client.post("/simulate-policy", json={"occupation": "vendor"})  # missing date_range
    assert resp.status_code == 422


def test_heatmap_without_trained_model_returns_503(monkeypatch):
    monkeypatch.setattr(main_module, "STGCN_PATH", Path("models/artifacts/__does_not_exist__.pt"))
    main_module._stgcn_cache.clear()
    resp = client.get("/heatmap")
    assert resp.status_code == 503
    assert "not trained" in resp.json()["detail"]


def test_resolve_location_happy_path():
    resp = client.post("/resolve-location", json={"lat": AHMEDABAD_LAT, "lon": AHMEDABAD_LON})
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "configured"
    assert data["city_key"] == "ahmedabad"
    assert data["distance_km"] < 150.0


def test_resolve_location_out_of_coverage_is_honest():
    resp = client.post("/resolve-location", json={"lat": OUT_OF_COVERAGE_LAT, "lon": OUT_OF_COVERAGE_LON})
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "out_of_coverage"
    assert data["message"] is not None


def test_resolve_location_rejects_query_string_coords():
    """lat/lon MUST be POST body fields; supplying them only as a query string
    leaves the (required) body empty -> 422, never silently used."""
    resp = client.post(f"/resolve-location?lat={AHMEDABAD_LAT}&lon={AHMEDABAD_LON}")
    assert resp.status_code == 422


class _StubPricer:
    strike = 75.0
    cap = 0.9

    def price_window(self, window_values, occupation):
        return {
            "premium_lsmc": 42.0,
            "premium_wang": 55.0,
            "payout_schedule": {
                "form": "cap * (mu_tevi - strike)_+ / (100 - strike)",
                "strike": 75.0, "cap": 0.9, "trigger_frequency": 0.2,
            },
            "basis_risk": {
                "basis_risk_rmse": 12.3, "shortfall_rate": 0.25,
                "overpay_rate": 0.10, "correlation": 0.6,
            },
        }


@pytest.fixture
def stub_pricing(monkeypatch, tmp_path):
    """Stubs the pricer and mu-TEVI parquet so /simulate-policy prices without
    any trained artifact on disk (CI has neither copula.json nor mu_tevi.parquet)."""
    monkeypatch.setattr(main_module, "_load_pricer", lambda: _StubPricer())

    mu_tevi_path = tmp_path / "mu_tevi.parquet"
    dates = pd.date_range("2020-01-01", periods=30, freq="D")
    pd.DataFrame({"ts": dates, "mu_tevi": [60.0 + i for i in range(30)]}).to_parquet(mu_tevi_path)
    monkeypatch.setattr(main_module, "MU_TEVI_PATH", mu_tevi_path)
    return mu_tevi_path


def test_simulate_policy_schema_is_income_smoothing_with_basis_risk(stub_pricing):
    resp = client.post("/simulate-policy", json={
        "occupation": "vendor",
        "date_range": {"start": "2020-01-01", "end": "2020-01-14"},
        "lat": AHMEDABAD_LAT, "lon": AHMEDABAD_LON,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["product_type"] == "income_smoothing"
    assert data["coverage_mode"] == "configured"
    assert data["premium_lsmc"] == 42.0
    assert data["premium_wang"] == 55.0
    br = data["basis_risk"]
    assert {"basis_risk_rmse", "shortfall_rate", "overpay_rate", "correlation"} == set(br)
    assert "policy_id" in data and data["policy_id"]


def test_simulate_policy_out_of_coverage_is_honest_not_fabricated(stub_pricing):
    resp = client.post("/simulate-policy", json={
        "occupation": "vendor",
        "date_range": {"start": "2020-01-01", "end": "2020-01-14"},
        "lat": OUT_OF_COVERAGE_LAT, "lon": OUT_OF_COVERAGE_LON,
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["coverage_mode"] == "out_of_coverage"
    assert data["premium_lsmc"] is None
    assert data["basis_risk"] is None
    assert data["message"] is not None
    assert "not fabricated" in data["note"].lower() or "no data" in data["note"].lower()


def test_simulate_policy_ignores_lat_lon_in_query_string(stub_pricing):
    """Coordinates in the query string must be silently ignored -- pricing
    falls back to the default city, not the out-of-coverage query point."""
    resp = client.post(
        f"/simulate-policy?lat={OUT_OF_COVERAGE_LAT}&lon={OUT_OF_COVERAGE_LON}",
        json={"occupation": "vendor",
              "date_range": {"start": "2020-01-01", "end": "2020-01-14"}},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["coverage_mode"] == "configured"
    assert data["resolved_city"] == "Ahmedabad"


def test_explain_unknown_policy_id_returns_404():
    resp = client.get("/explain/does-not-exist")
    assert resp.status_code == 404


def test_forecast_without_trained_model_returns_503(monkeypatch):
    # /forecast is now wired to a real GRU forecaster (Prompt 8); this test
    # only covers the lazy-503 path, so it forces the untrained state rather
    # than assuming forecaster.pt is absent (see tests/unit/test_forecast.py
    # for the real-artifact coverage).
    monkeypatch.setattr(main_module, "FORECASTER_PATH", Path("models/artifacts/__does_not_exist__.pt"))
    main_module._forecaster_cache.clear()
    resp = client.get("/forecast")
    assert resp.status_code == 503


def test_assistant_ask_returns_503_stub():
    resp = client.post("/assistant/ask", json={"question": "will it be hot next week?"})
    assert resp.status_code == 503
