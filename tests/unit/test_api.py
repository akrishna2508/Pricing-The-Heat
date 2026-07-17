"""Offline API tests: /resolve-location and /simulate-policy.

No network calls -- both endpoints only read the local cities.yaml (and, if
present, the already-built data/processed/wage_loss.parquet). Coordinates are
sent ONLY in POST bodies, never a query string, per the location-privacy rule.
"""

from __future__ import annotations

from fastapi.testclient import TestClient

from backend.main import app

client = TestClient(app)

# Ahmedabad's configured centroid (see backend/data/cities.yaml)
AHMEDABAD_LAT, AHMEDABAD_LON = 23.03, 72.58
# Far from any configured city.
OUT_OF_COVERAGE_LAT, OUT_OF_COVERAGE_LON = 0.0, 0.0


def test_resolve_location_happy_path():
    resp = client.post("/resolve-location", json={"lat": AHMEDABAD_LAT, "lon": AHMEDABAD_LON})
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "configured"
    assert data["city_key"] == "ahmedabad"
    assert data["distance_km"] < 150.0


def test_resolve_location_out_of_coverage():
    resp = client.post("/resolve-location", json={"lat": OUT_OF_COVERAGE_LAT, "lon": OUT_OF_COVERAGE_LON})
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "out_of_coverage"
    assert data["message"] is not None


def test_simulate_policy_with_lat_lon_resolves_city():
    resp = client.post("/simulate-policy", json={
        "lat": AHMEDABAD_LAT, "lon": AHMEDABAD_LON, "occupation": "vendor",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "configured"
    assert data["city_key"] == "ahmedabad"
    assert data["baseline_daily_wage"] is not None
    assert data["baseline_daily_wage"]["value"] > 0
    assert data["baseline_daily_wage"]["verified"] is False


def test_simulate_policy_out_of_coverage_is_honest_not_fabricated():
    resp = client.post("/simulate-policy", json={
        "lat": OUT_OF_COVERAGE_LAT, "lon": OUT_OF_COVERAGE_LON, "occupation": "vendor",
    })
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "out_of_coverage"
    assert data["baseline_daily_wage"] is None
    assert data["mean_wage_loss_fraction"] is None
    assert data["message"] is not None
    assert "not computed" in data["note"].lower() or "no data" in data["note"].lower()


def test_simulate_policy_explicit_city_unchanged():
    resp = client.post("/simulate-policy", json={"city": "ahmedabad", "occupation": "construction"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["mode"] == "explicit"
    assert data["city_key"] == "ahmedabad"
    assert data["baseline_daily_wage"] is not None
