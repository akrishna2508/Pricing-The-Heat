from pathlib import Path

import yaml
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

from backend.data.location import resolve_city
from backend.data.wages import WageLoader

app = FastAPI(title="Pricing the Heat", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CITIES_YAML_PATH = Path(__file__).parent / "data" / "cities.yaml"
WAGE_LOSS_PARQUET_PATH = Path("data/processed/wage_loss.parquet")


def _load_cities_config() -> dict:
    with open(CITIES_YAML_PATH) as f:
        return yaml.safe_load(f)


@app.get("/health")
def health_check():
    return {"status": "ok"}


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
    transiently for distance computation -- never logged or persisted.
    """
    cities_cfg = _load_cities_config()
    result = resolve_city(req.lat, req.lon, cities_cfg)
    return ResolveLocationResponse(**result)


class SimulatePolicyRequest(BaseModel):
    city: str | None = None
    occupation: str | None = "vendor"
    lat: float | None = None
    lon: float | None = None


class SimulatePolicyResponse(BaseModel):
    city_key: str
    city: str
    mode: str
    distance_km: float | None = None
    message: str | None = None
    occupation: str | None = None
    baseline_daily_wage: dict | None = None
    mean_wage_loss_fraction: float | None = None
    note: str


@app.post("/simulate-policy", response_model=SimulatePolicyResponse)
def simulate_policy(req: SimulatePolicyRequest):
    """Price wage-loss context for a city -- resolved either explicitly or
    from an OPTIONAL lat/lon in the body (never a query string).

    NOTE: this returns wage-loss CONTEXT (cited baseline wage + historical
    mean wage-loss fraction for the resolved city), not a full actuarial
    premium -- the Longstaff-Schwartz + Wang-Transform pricing engine is a
    separate, later component. Coordinates are never logged or persisted;
    only the resolved city name is retained in the response.
    """
    cities_cfg = _load_cities_config()

    if req.lat is not None and req.lon is not None:
        resolved = resolve_city(req.lat, req.lon, cities_cfg)
    else:
        city_key = req.city or cities_cfg["default_city"]
        if city_key not in cities_cfg["cities"]:
            return SimulatePolicyResponse(
                city_key=city_key,
                city=city_key,
                mode="out_of_coverage",
                message=f"'{city_key}' is not a configured city.",
                note="No pricing computed: unknown city.",
            )
        resolved = {
            "city_key": city_key,
            "city": cities_cfg["cities"][city_key]["name"],
            "distance_km": None,
            "mode": "explicit",
        }

    if resolved["mode"] == "out_of_coverage":
        return SimulatePolicyResponse(
            city_key=resolved["city_key"],
            city=resolved["city"],
            mode=resolved["mode"],
            distance_km=resolved.get("distance_km"),
            message=resolved.get("message"),
            note="No pricing computed: location is outside covered cities. "
                 "No data was fabricated for this point.",
        )

    occupation = req.occupation or "vendor"
    wage_loader = WageLoader()
    baseline_wages = wage_loader.occupation_baseline_wages(city_key=resolved["city_key"])
    wage_provenance = {
        rec["occupation"]: rec
        for rec in wage_loader.wage_provenance(city_key=resolved["city_key"])
    }

    if occupation not in baseline_wages:
        return SimulatePolicyResponse(
            city_key=resolved["city_key"],
            city=resolved["city"],
            mode=resolved["mode"],
            distance_km=resolved.get("distance_km"),
            note=f"No pricing computed: unknown occupation '{occupation}'.",
        )

    wage_rec = wage_provenance[occupation]
    verified_tag = "verified" if wage_rec["verified"] else "UNVERIFIED"

    mean_fraction = None
    if WAGE_LOSS_PARQUET_PATH.exists():
        import pandas as pd

        df = pd.read_parquet(WAGE_LOSS_PARQUET_PATH)
        subset = df[df["occupation"] == occupation]
        if not subset.empty:
            mean_fraction = float(subset["wage_loss_fraction"].mean())

    return SimulatePolicyResponse(
        city_key=resolved["city_key"],
        city=resolved["city"],
        mode=resolved["mode"],
        distance_km=resolved.get("distance_km"),
        occupation=occupation,
        baseline_daily_wage={
            "value": wage_rec["value"],
            "currency": wage_rec["currency"],
            "verified": wage_rec["verified"],
        },
        mean_wage_loss_fraction=mean_fraction,
        note=(
            f"Wage-loss context only (baseline wage is {verified_tag}); "
            f"full actuarial premium pricing is not yet implemented."
        ),
    )
