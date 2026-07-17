"use client";

import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

type SimulateResult = {
  city_key: string;
  city: string;
  mode: "configured" | "explicit" | "out_of_coverage";
  distance_km: number | null;
  message: string | null;
  occupation: string | null;
  baseline_daily_wage: { value: number; currency: string; verified: boolean } | null;
  mean_wage_loss_fraction: number | null;
  note: string;
};

const OCCUPATIONS = ["vendor", "construction", "delivery"];

export default function SimulatePage() {
  const [city, setCity] = useState("ahmedabad");
  const [occupation, setOccupation] = useState("vendor");
  const [result, setResult] = useState<SimulateResult | null>(null);
  const [locationNotice, setLocationNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function priceByCity() {
    setLoading(true);
    setLocationNotice(null);
    try {
      const resp = await fetch(`${API_URL}/simulate-policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ city, occupation }),
      });
      setResult(await resp.json());
    } finally {
      setLoading(false);
    }
  }

  async function priceByLocation(lat: number, lon: number) {
    setLoading(true);
    try {
      // Coordinates go ONLY in this POST body -- never a URL/query string --
      // and are never stored beyond this request.
      const resp = await fetch(`${API_URL}/simulate-policy`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lon, occupation }),
      });
      setResult(await resp.json());
    } finally {
      setLoading(false);
    }
  }

  function useMyLocation() {
    setLocationNotice(null);
    if (!("geolocation" in navigator)) {
      setLocationNotice("Geolocation isn't supported by this browser. Use the city selector below.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        priceByLocation(position.coords.latitude, position.coords.longitude);
      },
      () => {
        setLocationNotice("Location permission denied. Use the city selector below instead.");
      },
    );
  }

  return (
    <main className="min-h-screen p-8 max-w-xl mx-auto">
      <h1 className="text-2xl font-semibold mb-6">Simulate a policy</h1>

      <div className="mb-6">
        <label className="block text-sm mb-2">Occupation</label>
        <select
          className="border rounded px-3 py-2 w-full"
          value={occupation}
          onChange={(e) => setOccupation(e.target.value)}
        >
          {OCCUPATIONS.map((occ) => (
            <option key={occ} value={occ}>
              {occ}
            </option>
          ))}
        </select>
      </div>

      <button
        onClick={useMyLocation}
        disabled={loading}
        className="w-full mb-3 rounded bg-blue-600 text-white px-4 py-2 disabled:opacity-50"
      >
        Use my location
      </button>

      {locationNotice && (
        <p className="text-sm text-amber-700 mb-4" role="status">
          {locationNotice}
        </p>
      )}

      <div className="mb-6">
        <label className="block text-sm mb-2">Or pick a city manually</label>
        <select
          className="border rounded px-3 py-2 w-full mb-2"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        >
          <option value="ahmedabad">Ahmedabad</option>
        </select>
        <button
          onClick={priceByCity}
          disabled={loading}
          className="w-full rounded border border-blue-600 text-blue-600 px-4 py-2 disabled:opacity-50"
        >
          Price this city
        </button>
      </div>

      {result && (
        <div className="border rounded p-4">
          {result.mode === "out_of_coverage" ? (
            <>
              <p className="font-medium text-amber-700">Not covered yet</p>
              <p className="text-sm mt-1">{result.message}</p>
            </>
          ) : (
            <>
              <p className="font-medium">
                Priced for {result.city}
                {result.distance_km != null && ` (~${result.distance_km} km from you)`}
              </p>
              {result.baseline_daily_wage && (
                <p className="text-sm mt-2">
                  Baseline daily wage: {result.baseline_daily_wage.currency}{" "}
                  {result.baseline_daily_wage.value}{" "}
                  {result.baseline_daily_wage.verified ? "(verified)" : "(unverified -- pending human confirmation)"}
                </p>
              )}
              {result.mean_wage_loss_fraction != null && (
                <p className="text-sm">
                  Historical mean wage-loss fraction: {(result.mean_wage_loss_fraction * 100).toFixed(2)}%
                </p>
              )}
              <p className="text-xs text-gray-500 mt-3">{result.note}</p>
            </>
          )}
        </div>
      )}
    </main>
  );
}
