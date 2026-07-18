// Types mirroring backend/main.py's Pydantic response models exactly -- kept
// in one place so a backend schema change surfaces as a single TS diff here.

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
    date: string;
    product_type: string;
    note: string;
  };
};

export type DateRange = { start: string; end: string };

export type SimulatePolicyRequest = {
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

export type CoverageMode = "configured" | "explicit" | "out_of_coverage";

export type SimulatePolicyResponse = {
  policy_id: string;
  product_type: string;
  coverage_mode: CoverageMode;
  resolved_city: string | null;
  distance_km: number | null;
  occupation: string | null;
  premium_lsmc: number | null;
  premium_wang: number | null;
  payout_schedule: PayoutSchedule | null;
  mu_tevi_series: MuTeviPoint[] | null;
  basis_risk: BasisRisk | null;
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

export type AssistantAskResponse = {
  policy_id: string;
  answer: string;
  source: "model" | "model_ungrounded" | "fallback_no_key" | "fallback_error";
};
