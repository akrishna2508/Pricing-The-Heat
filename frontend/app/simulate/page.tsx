"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  explainPolicy,
  getStates,
  resolveLocation,
  simulatePolicy,
} from "@/lib/api";
import type {
  ExplainResponse,
  SimulatePolicyResponse,
  StateListEntry,
} from "@/lib/types";
import { ErrorBanner } from "@/components/ErrorBanner";
import { FeatureBars } from "@/components/FeatureBars";
import { PayoutChart } from "@/components/PayoutChart";
import { Sparkline } from "@/components/Sparkline";

const OCCUPATIONS = ["vendor", "construction", "delivery"];
// UX-only default: every state's real contract.json currently selects a
// 14-day window (see docs/STATEWISE_RESULTS.md); this only drives the date
// picker's auto-computed window end, never what actually gets priced --
// the backend is the single source of truth for the real per-state window.
const WINDOW_DAYS_UX_DEFAULT = 14;

// NASA POWER's real daily processing lag, mirroring
// backend/data/weather.py's NASA_POWER_LAG_DAYS. Pricing past the
// calibration period forward-applies the fitted models to live-fetched real
// weather, so the picker's ceiling is now set by what NASA POWER has really
// published, not by the end of the calibrated series.
const NASA_POWER_LAG_DAYS = 3;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Latest window START whose full 14-day window still ends on a day NASA
// POWER has real data for.
function latestWindowStart(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - NASA_POWER_LAG_DAYS - (WINDOW_DAYS_UX_DEFAULT - 1));
  return d.toISOString().slice(0, 10);
}

function groupByCountry(states: StateListEntry[]): Map<string, StateListEntry[]> {
  const groups = new Map<string, StateListEntry[]>();
  const sorted = [...states].sort((a, b) => a.state.localeCompare(b.state));
  for (const s of sorted) {
    const key = s.country === "IN" ? "India" : s.country === "US" ? "United States" : s.country;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(s);
  }
  return groups;
}

// Some real wage sources in config/wages_by_state.yaml carry a human note after
// the URL (e.g. "https://labour.gov.in (see state Labour Dept notification)").
// The URL parser treats that trailing text as part of the authority and
// percent-encodes it, which rendered as
// "labour.gov.in%20(see%20state%20labour%20dept%20notification)" -- so take
// only the first whitespace-delimited token before parsing.
function cleanUrl(url: string): string {
  return url.trim().split(/\s+/)[0];
}

function sourceLabel(url: string | null): string {
  if (!url) return "source not on file";
  try {
    return new URL(cleanUrl(url)).hostname.replace(/^www\./, "");
  } catch {
    return cleanUrl(url);
  }
}

export default function SimulatePage() {
  const [states, setStates] = useState<StateListEntry[] | null>(null);
  const [statesError, setStatesError] = useState<string | null>(null);
  const [manualStateKey, setManualStateKey] = useState<string>("");

  const [occupation, setOccupation] = useState("vendor");
  const [startDate, setStartDate] = useState("2019-06-01");
  const [result, setResult] = useState<SimulatePolicyResponse | null>(null);
  const [explainResult, setExplainResult] = useState<ExplainResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [explainError, setExplainError] = useState<string | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [explainLoading, setExplainLoading] = useState(false);
  const [provenanceOpen, setProvenanceOpen] = useState(false);

  useEffect(() => {
    getStates()
      .then((rows) => {
        setStates(rows);
        setManualStateKey((prev) => prev || rows[0]?.state_key || "");
      })
      .catch((err: unknown) => {
        setStatesError(err instanceof ApiError ? err.message : "Failed to load the state list.");
      });
  }, []);

  const grouped = useMemo(
    () => (states ? groupByCountry(states) : new Map<string, StateListEntry[]>()),
    [states],
  );
  const endDate = addDays(startDate, WINDOW_DAYS_UX_DEFAULT - 1);

  async function priceStateKey(stateKey: string) {
    setLoading(true);
    setError(null);
    setResult(null);
    setExplainResult(null);
    setExplainError(null);
    try {
      const resp = await simulatePolicy({
        state_key: stateKey,
        occupation,
        date_range: { start: startDate, end: endDate },
      });
      setResult(resp);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reach the pricing server.");
    } finally {
      setLoading(false);
    }
  }

  function useMyLocation() {
    setLocationNotice(null);
    setError(null);
    setResult(null);
    if (!("geolocation" in navigator)) {
      setLocationNotice("Geolocation isn't supported by this browser. Pick your state manually below.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        // lat/lon are sent ONLY in the POST body below -- never a URL/query
        // string -- and are never persisted beyond this one request.
        const { latitude: lat, longitude: lon } = position.coords;
        resolveLocation({ lat, lon })
          .then(async (geo) => {
            if (geo.mode === "out_of_coverage") {
              setLocationNotice(geo.message ?? "This location isn't covered yet. Pick your state manually below.");
              setLoading(false);
              return;
            }
            setLocationNotice(`Detected: ${geo.state}, ${geo.country}`);
            await priceStateKey(geo.state_key!);
          })
          .catch((err: unknown) => {
            setError(err instanceof ApiError ? err.message : "Couldn't resolve your location.");
            setLoading(false);
          });
      },
      () => {
        setLocationNotice("Location permission denied. Pick your state manually below.");
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
        Prices a real coverage window for whichever state you detect or select -- the frame (income
        smoothing vs. catastrophe insurance) and currency are that state&rsquo;s own, never assumed.
      </p>

      {statesError && (
        <div className="mb-4">
          <ErrorBanner message={statesError} />
        </div>
      )}

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
          Coverage window start ({WINDOW_DAYS_UX_DEFAULT} days, ending {endDate})
          <input
            type="date"
            value={startDate}
            min="2014-01-01"
            max={latestWindowStart()}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm font-mono"
          />
        </label>

        <button
          onClick={useMyLocation}
          disabled={loading}
          className="w-full rounded bg-gray-900 text-white px-4 py-2 text-sm disabled:opacity-50"
        >
          Use my location
        </button>

        {locationNotice && (
          <p className="text-sm text-amber-700" role="status">
            {locationNotice}
          </p>
        )}

        <div className="flex gap-2 items-end pt-2 border-t border-gray-100">
          <label className="flex-1 text-sm text-gray-700">
            Or pick a state manually
            <select
              value={manualStateKey}
              onChange={(e) => setManualStateKey(e.target.value)}
              disabled={!states}
              className="mt-1 w-full border border-gray-300 rounded px-3 py-2 text-sm"
            >
              {states === null && <option>Loading states...</option>}
              {[...grouped.entries()].map(([country, rows]) => (
                <optgroup key={country} label={country}>
                  {rows.map((s) => (
                    <option key={s.state_key} value={s.state_key}>
                      {s.state}
                      {s.mode === "excluded" ? " (excluded)" : ""}
                      {s.mode === "unpriced" ? " (not yet trained)" : ""}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <button
            onClick={() => void priceStateKey(manualStateKey)}
            disabled={loading || !manualStateKey}
            className="rounded border border-gray-300 text-gray-800 px-4 py-2 text-sm disabled:opacity-50"
          >
            Price
          </button>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-400 mb-4">Pricing...</p>}
      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      {result && (result.coverage_mode === "out_of_coverage" || result.coverage_mode === "excluded") && (
        <div className="border border-amber-200 bg-amber-50 rounded p-4">
          <p className="font-medium text-amber-800">
            {result.coverage_mode === "excluded" ? "Excluded from pricing" : "Not covered yet"}
          </p>
          <p className="text-sm mt-1 text-amber-900">{result.message}</p>
          <p className="text-xs mt-2 text-amber-700">{result.note}</p>
        </div>
      )}

      {result && result.coverage_mode === "configured" && (
        <div className="border border-gray-200 rounded bg-white p-4 space-y-5">
          <div>
            <p className="text-sm text-gray-600">
              Priced for {result.state}, {result.country} -- {result.occupation}
            </p>
            {result.frame && (
              <p className="text-xs uppercase tracking-wide text-heat-4 font-medium mt-1">
                {result.frame.replace(/_/g, " ")}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500">Premium (fair actuarial price)</p>
              <p className="font-mono text-2xl font-semibold">
                {result.currency} {result.premium_lsmc?.toFixed(2)}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500">Premium (with insurer&rsquo;s risk load)</p>
              <p className="font-mono text-lg">
                {result.currency} {result.premium_wang?.toFixed(2)}
              </p>
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
              {result.extended_days ? (
                <p className="text-xs text-gray-400 mt-2">
                  {result.extended_days} of these {result.window_days} days fall after this
                  state&rsquo;s calibration period (ends{" "}
                  <span className="font-mono">{result.calibrated_through}</span>). Their index comes
                  from live-fetched real NASA POWER weather run through the same already-fitted
                  models, priced with the same committed contract -- nothing was refitted for them.
                </p>
              ) : null}
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

          {result.wage_provenance && (
            <details
              open={provenanceOpen}
              onToggle={(e) => setProvenanceOpen((e.target as HTMLDetailsElement).open)}
              className="pt-2 border-t border-gray-100"
            >
              <summary className="text-xs text-gray-400 cursor-pointer select-none">
                Wage basis: {result.wage_provenance.state} &middot; {sourceLabel(result.wage_provenance.source_url)} &middot; details
              </summary>
              <div className="mt-2 text-xs text-gray-500 space-y-1">
                <p>
                  Value: <span className="font-mono">{result.wage_provenance.value}</span>{" "}
                  {result.wage_provenance.currency}/day ({result.wage_provenance.occupation})
                </p>
                {result.wage_provenance.confidence && <p>Confidence: {result.wage_provenance.confidence}</p>}
                {result.wage_provenance.source_url && (
                  <p>
                    Source:{" "}
                    {/* href uses the bare URL so the link actually resolves;
                        the full cited string (including any "see the state
                        notification" guidance) is still shown verbatim. */}
                    <a
                      href={cleanUrl(result.wage_provenance.source_url)}
                      target="_blank"
                      rel="noreferrer"
                      className="underline"
                    >
                      {result.wage_provenance.source_url}
                    </a>
                  </p>
                )}
                {result.wage_provenance.note && <p>Note: {result.wage_provenance.note}</p>}
              </div>
            </details>
          )}
        </div>
      )}
    </main>
  );
}
