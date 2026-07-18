"use client";

import { useEffect, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { ApiError, getHeatmap } from "@/lib/api";
import type { HeatmapResponse } from "@/lib/types";
import { ErrorBanner } from "@/components/ErrorBanner";

// 5-step colorblind-safe sequential scale (ColorBrewer OrRd) -- see
// tailwind.config.js's `heat` tokens; duplicated as hex here because MapLibre
// paint expressions take literal values, not CSS classes.
const HEAT_COLORS = ["#fef0d9", "#fdcc8a", "#fc8d59", "#e34a33", "#b30000"];
const CITY_CENTER: [number, number] = [72.5714, 23.0225]; // Ahmedabad, matches backend/data/cities.yaml

export default function HeatmapPage() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [date, setDate] = useState("2023-12-31");
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getHeatmap(date)
      .then((resp) => {
        if (!cancelled) setData(resp);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : "Failed to load the heat map.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [date]);

  // Initialize the MapLibre map ONCE, client-side only. maplibre-gl touches
  // window/WebGL at construction time, so it is dynamically imported inside
  // this effect rather than statically at module scope -- keeps this a
  // "use client" page that still builds/SSRs cleanly with zero trained
  // backend or network dependency at build time.
  useEffect(() => {
    if (!mapContainer.current || mapRef.current) return;
    let cancelled = false;

    void import("maplibre-gl").then((mod) => {
      const maplibregl = mod.default;
      if (cancelled || !mapContainer.current) return;
      const map = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "background", type: "background", paint: { "background-color": "#f4f4f5" } }],
        },
        center: CITY_CENTER,
        zoom: 8,
      });
      map.addControl(new maplibregl.NavigationControl(), "top-right");
      map.once("load", () => setMapReady(true));
      mapRef.current = map;
    });

    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Push fetched data into the map. MapLibre's own GeoJSON source/paint types
  // are version-sensitive; the `data` shape here already satisfies the real
  // GeoJSON contract the backend returns, so the casts below are a narrow,
  // intentional escape hatch at the MapLibre boundary only.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !data) return;

    const values = data.features.map((f) => f.properties.heat_index);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const step = (max - min) / 4 || 1;
    const colorExpr = [
      "interpolate", ["linear"], ["get", "heat_index"],
      min, HEAT_COLORS[0],
      min + step, HEAT_COLORS[1],
      min + step * 2, HEAT_COLORS[2],
      min + step * 3, HEAT_COLORS[3],
      max, HEAT_COLORS[4],
    ];

    const existing = map.getSource("grid");
    if (existing) {
      (existing as unknown as { setData: (d: unknown) => void }).setData(data);
      map.setPaintProperty("grid-circles", "circle-color", colorExpr as never);
      return;
    }

    map.addSource("grid", { type: "geojson", data: data as never });
    map.addLayer({
      id: "grid-circles",
      type: "circle",
      source: "grid",
      paint: {
        "circle-radius": 22,
        "circle-opacity": 0.85,
        "circle-stroke-width": 1,
        "circle-stroke-color": "#3f3f46",
        "circle-color": colorExpr as never,
      },
    });
  }, [data, mapReady]);

  const cityMuTevi = data?.features[0]?.properties.mu_tevi ?? null;

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold mb-1">Real-time heat severity map</h1>
      <p className="text-sm text-gray-600 mb-4 max-w-2xl">
        Street-level heat forecast (STGCN) over the real NASA POWER grid, with the city-level
        mu-TEVI income-smoothing index for the selected date. This is a HIGH-FREQUENCY INCOME
        SMOOTHING product for chronic heat wage-loss -- not disaster insurance for a rare event.
      </p>

      <div className="flex flex-wrap items-center gap-4 mb-4">
        <label className="text-sm text-gray-700">
          Date
          <input
            type="date"
            value={date}
            min="2014-01-01"
            max="2023-12-31"
            onChange={(e) => setDate(e.target.value)}
            className="ml-2 border border-gray-300 rounded px-2 py-1 text-sm font-mono"
          />
        </label>
        {cityMuTevi != null && (
          <div className="text-sm">
            City-level mu-TEVI index:{" "}
            <span className="font-mono font-semibold">{cityMuTevi.toFixed(1)}</span>
            <span className="text-gray-500"> / 100 (same across every cell)</span>
          </div>
        )}
        {loading && <span className="text-xs text-gray-400">Loading...</span>}
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div ref={mapContainer} className="w-full h-[520px] rounded border border-gray-200 bg-gray-100" />

      <div className="flex items-center gap-2 mt-4 text-xs text-gray-600">
        <span>Cooler</span>
        {HEAT_COLORS.map((c) => (
          <span key={c} className="w-6 h-3 rounded-sm inline-block" style={{ backgroundColor: c }} />
        ))}
        <span>Hotter (per-node STGCN shade-WBGT forecast)</span>
      </div>
    </main>
  );
}
