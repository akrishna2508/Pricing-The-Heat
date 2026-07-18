"use client";

import { useState } from "react";
import { ApiError, explainPolicy, simulatePolicy } from "@/lib/api";
import type { ExplainResponse, SimulatePolicyResponse } from "@/lib/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FeatureBars } from "@/components/FeatureBars";
import { PayoutChart } from "@/components/PayoutChart";
import { Sparkline } from "@/components/Sparkline";

const OCCUPATIONS = ["vendor", "construction", "delivery"];
// Mirrors the chosen contract in backend/data/cities.yaml (window_days: 14).
// The backend is the single source of truth for pricing -- this only drives
// the date picker's UX (auto-computing the window end) and does not affect
// what actually gets priced server-side.
const WINDOW_DAYS = 14;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export default function SimulatePage() {
  const [occupation, setOccupation] = useState("vendor");
  const [startDate, setStartDate] = useState("2019-06-01");
  const [result, setResult] = useState<SimulatePolicyResponse | null>(null);
  const [explainResult, setExplainResult] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);

  const endDate = addDays(startDate, WINDOW_DAYS - 1);

  async function runSimulate(coords?: { lat: number; lon: number }) {
    setLoading(true);
    setError(null);
    setResult(null);
    setExplainResult(null);
    setExplainError(null);
    try {
      const resp = await simulatePolicy({
        occupation,
        date_range: { start: startDate, end: endDate },
        ...(coords ?? {}),
      });
      setResult(resp);
      if (resp.coverage_mode !== "out_of_coverage" && typeof window !== "undefined") {
        // Lets /assistant pick this policy up automatically for the natural
        // "simulate, then ask about it" flow. Never stores the raw lat/lon --
        // only the resulting policy_id, matching the location-privacy rule.
        window.localStorage.setItem("lastPolicyId", resp.policy_id);
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the pricing server.");
    } finally {
      setLoading(false);
    }
  }

  function useMyLocation() {
    setLocationNotice(null);
    if (!("geolocation" in navigator)) {
      setLocationNotice("Geolocation isn't supported by this browser. Pricing the default city instead.");
      void runSimulate();
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // lat/lon are sent ONLY in the POST body below -- never a URL/query
        // string -- and are never persisted beyond this one request.
        void runSimulate({ lat: position.coords.latitude, lon: position.coords.longitude });
      },
      () => {
        setLocationNotice("Location permission denied. Pricing the default city instead.");
        void runSimulate();
      },
    );
  }

  async function runExplain() {
    if (!result) return;
    setExplainLoading(true);
    setExplainError(null);
    try {
      setExplainResult(await explainPolicy(result.policy_id));
    } catch (err) {
      setExplainError(err instanceof ApiError ? err.message : "Couldn't fetch the explanation.");
    } finally {
      setExplainLoading(false);
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold mb-1">Simulate a policy</h1>
      <p className="text-sm text-gray-600 mb-6">
        This prices a {WINDOW_DAYS}-day income-smoothing contract for chronic heat wage-loss --
        not a payout for a single rare event.
      </p>

      <div className="space-y-4 mb-6">
        <label className="block text-sm text-gray-700">
          Occupation
          <select
            value={occupation}
            onChange={(e) => setOccupation(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm"
          >
            {OCCUPATIONS.map((occ) => (
              <option key={occ} value={occ}>
                {occ}
              </option>
            ))}
          </select>
        </label>

        <label className="block text-sm text-gray-700">
          Coverage window start ({WINDOW_DAYS} days, ending {endDate})
          <input
            type="date"
            value={startDate}
            min="2014-01-01"
            max="2023-12-18"
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
          />
        </label>

        <div className="flex gap-2">
          <button
            onClick={useMyLocation}
            disabled={loading}
            className="flex-1 rounded bg-gray-900 text-white px-4 py-2 text-sm disabled:opacity-50"
          >
            Use my location
          </button>
          <button
            onClick={() => void runSimulate()}
            disabled={loading}
            className="flex-1 rounded border border-gray-300 text-gray-800 px-4 py-2 text-sm disabled:opacity-50"
          >
            Price default city
          </button>
        </div>

        {locationNotice && (
          <p className="text-sm text-amber-700" role="status">
            {locationNotice}
          </p>
        )}
      </div>

      {loading && <p className="text-sm text-gray-400 mb-4">Pricing...</p>}
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {result && result.coverage_mode === "out_of_coverage" && (
        <div className="border border-amber-200 bg-amber-50 rounded p-4">
          <p className="font-medium text-amber-800">Not covered yet</p>
          <p className="text-sm mt-1 text-amber-900">{result.message}</p>
          <p className="text-xs mt-2 text-amber-700">{result.note}</p>
        </div>
      )}

      {result && result.coverage_mode !== "out_of_coverage" && (
        <div className="border border-gray-200 rounded bg-white p-4 space-y-5">
          <div>
            <p className="text-sm text-gray-600">
              Priced for {result.resolved_city}
              {result.distance_km != null && ` (~${result.distance_km} km from you)`} -- {result.occupation}
            </p>
            <p className="text-xs uppercase tracking-wide text-heat-4 font-medium mt-1">
              {result.product_type.replace(/_/g, " ")}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Premium (fair actuarial price)</p>
              <p className="font-mono text-lg">{result.premium_lsmc?.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Premium (with insurer&rsquo;s risk load)</p>
              <p className="font-mono text-lg">{result.premium_wang?.toFixed(2)}</p>
            </div>
          </div>

          {result.payout_schedule && (
            <div>
              <p className="text-xs text-gray-500 mb-2">Payout schedule</p>
              <PayoutChart
                strike={result.payout_schedule.strike}
                cap={result.payout_schedule.cap}
                samplePoints={result.payout_schedule.sample_points}
              />
            </div>
          )}

          {result.mu_tevi_series && result.mu_tevi_series.length > 0 && (
            <div>
              <p className="text-xs text-gray-500 mb-2">mu-TEVI index over the coverage window</p>
              <Sparkline points={result.mu_tevi_series} />
            </div>
          )}

          {result.basis_risk && (
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs text-gray-500 mb-2">Basis risk -- disclosed honestly, not fine print</p>
              <p className="text-sm text-gray-800">
                On about{" "}
                <span className="font-mono">{(result.basis_risk.shortfall_rate * 100).toFixed(1)}%</span> of
                days the index-based payout may fall short of your actual loss (shortfall), and on{" "}
                <span className="font-mono">{(result.basis_risk.overpay_rate * 100).toFixed(1)}%</span> of
                days it may pay more than your actual loss (overpay). Correlation between the payout and
                actual loss:{" "}
                <span className="font-mono">{result.basis_risk.correlation.toFixed(2)}</span>.
              </p>
            </div>
          )}

          <div className="border-t border-gray-100 pt-4">
            <button
              onClick={() => void runExplain()}
              disabled={explainLoading}
              className="text-sm rounded border border-gray-300 px-3 py-1.5 disabled:opacity-50"
            >
              {explainLoading ? "Explaining..." : "Explain this premium"}
            </button>
            {explainError && (
              <div className="mt-3">
                <ErrorBanner message={explainError} />
              </div>
            )}
            {explainResult && (
              <div className="mt-3">
                <p className="text-xs text-gray-500 mb-2">
                  What drives this premium (method: {explainResult.method.replace(/_/g, " ")})
                </p>
                <FeatureBars contributions={explainResult.feature_contributions_normalized} />
                <p className="text-xs text-gray-500 mt-2">
                  When one feature dominates (often the window&rsquo;s peak heat index), that IS the honest
                  explanation for this payoff -- we don&rsquo;t manufacture an artificially even spread to
                  look more balanced.
                </p>
              </div>
            )}
          </div>

          <p className="text-xs text-gray-400 pt-2 border-t border-gray-100">{result.note}</p>
        </div>
      )}
    </main>
  );
}
