// Types mirroring backend/main.py's Pydantic response models exactly -- kept
// in one place so a backend schema change surfaces as a single TS diff here.

import type { Feature, MultiPolygon, Polygon } from "geojson";

// GET /state-boundary returns the raw admin-1 Feature verbatim -- Polygon OR
// MultiPolygon (22 of 87 states are MultiPolygon), never coerced to one type.
export type StateBoundary = Feature<Polygon | MultiPolygon>;

export type CoverageMode = "configured" | "excluded" | "out_of_coverage";
export type StateMode = "configured" | "excluded" | "unpriced";
export type Frame = "income_smoothing" | "catastrophe_insurance";

export type StateListEntry = {
  state_key: string;
  state: string;
  country: string;
  currency: string;
  metro: string;
  mode: StateMode;
};

export type ResolveLocationRequest = { lat: number; lon: number };

export type ResolveLocationResponse = {
  country: string | null;
  state: string | null;
  state_key: string | null;
  currency: string | null;
  mode: CoverageMode;
  message: string | null;
};

export type HeatmapFeature = {
  type: "Feature";
  geometry: { type: "Point"; coordinates: [number, number] };
  properties: {
    node_id: string;
    heat_index: number;
    mu_tevi: number | null;
  };
};

export type HeatmapResponse = {
  type: "FeatureCollection";
  features: HeatmapFeature[];
  metadata: {
    state_key: string;
    state: string;
    date: string;
    frame: Frame | null;
    note: string;
  };
};

export type DateRange = { start: string; end: string };

export type SimulatePolicyRequest = {
  state_key?: string;
  occupation: string;
  date_range: DateRange;
  lat?: number;
  lon?: number;
};

export type BasisRisk = {
  basis_risk_rmse: number;
  shortfall_rate: number;
  overpay_rate: number;
  correlation: number;
};

export type PayoutSchedule = {
  form: string;
  strike: number;
  cap: number;
  trigger_frequency: number;
  sample_points: Record<string, number>;
};

export type MuTeviPoint = { ts: string; mu_tevi: number };

export type WageProvenance = {
  state: string;
  occupation: string;
  value: number;
  currency: string;
  source_url: string | null;
  confidence: string | null;
  note: string | null;
};

export type SimulatePolicyResponse = {
  policy_id: string;
  coverage_mode: CoverageMode;
  country: string | null;
  state: string | null;
  state_key: string | null;
  currency: string | null;
  frame: Frame | null;
  strike: number | null;
  window_days: number | null;
  occupation: string | null;
  premium_lsmc: number | null;
  premium_wang: number | null;
  payout_schedule: PayoutSchedule | null;
  mu_tevi_series: MuTeviPoint[] | null;
  basis_risk: BasisRisk | null;
  wage_provenance: WageProvenance | null;
  message: string | null;
  note: string;
};

export type ExplainResponse = {
  policy_id: string;
  method: string;
  feature_contributions: Record<string, number>;
  feature_contributions_normalized: Record<string, number>;
  note: string;
};
