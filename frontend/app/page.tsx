"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap } from "maplibre-gl";
import { ApiError, getHeatmap, getStates } from "@/lib/api";
import type { HeatmapResponse, StateListEntry } from "@/lib/types";
import { ErrorBanner } from "@/components/ErrorBanner";

// 5-step colorblind-safe sequential scale (ColorBrewer OrRd) -- see
// tailwind.config.js's `heat` tokens; duplicated as hex here because MapLibre
// paint expressions take literal values, not CSS classes.
const HEAT_COLORS = ["#fef0d9", "#fdcc8a", "#fc8d59", "#e34a33", "#b30000"];
const DEFAULT_STATE_KEY = "IN-Gujarat";
const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

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

export default function HeatmapPage() {
  const mapContainer = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const [mapReady, setMapReady] = useState(false);

  const [states, setStates] = useState<StateListEntry[] | null>(null);
  const [statesError, setStatesError] = useState<string | null>(null);
  const [stateKey, setStateKey] = useState<string>(DEFAULT_STATE_KEY);

  const [date, setDate] = useState("2023-12-31");
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Load the real 79-state config once, so the selector never hand-duplicates it.
  useEffect(() => {
    getStates()
      .then((rows) => {
        setStates(rows);
        if (!rows.some((r) => r.state_key === DEFAULT_STATE_KEY) && rows.length > 0) {
          setStateKey(rows.find((r) => r.mode !== "unpriced")?.state_key ?? rows[0].state_key);
        }
      })
      .catch((err: unknown) => {
        setStatesError(err instanceof ApiError ? err.message : "Failed to load the state list.");
      });
  }, []);

  const grouped = useMemo(
    () => (states ? groupByCountry(states) : new Map<string, StateListEntry[]>()),
    [states],
  );
  const selectedState = states?.find((s) => s.state_key === stateKey) ?? null;

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    getHeatmap(stateKey, date)
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
  }, [stateKey, date]);

  // Initialize the MapLibre map ONCE, client-side only, on a real free OSM
  // raster basemap -- a MapLibre "style" with zero sources/layers renders as
  // blank gray with floating markers; a raster tile source fixes that root
  // cause. maplibre-gl touches window/WebGL at construction time, so it is
  // dynamically imported inside this effect rather than statically at module
  // scope -- keeps this a "use client" page that still builds/SSRs cleanly
  // with zero trained backend or network dependency at build time.
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
          sources: {
            osm: {
              type: "raster",
              tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
              tileSize: 256,
              attribution: OSM_ATTRIBUTION,
            },
          },
          layers: [{ id: "osm-tiles", type: "raster", source: "osm" }],
        },
        center: [78.9629, 22.5], // rough India/US midpoint fallback until the first heatmap fetch fits bounds
        zoom: 3,
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

  // Push fetched data into the map and fit the view to this state's real
  // anchor-metro grid. MapLibre's own GeoJSON source/paint types are
  // version-sensitive; the `data` shape here already satisfies the real
  // GeoJSON contract the backend returns, so the casts below are a narrow,
  // intentional escape hatch at the MapLibre boundary only.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady || !data || data.features.length === 0) return;

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
    } else {
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
    }

    const lons = data.features.map((f) => f.geometry.coordinates[0]);
    const lats = data.features.map((f) => f.geometry.coordinates[1]);
    const bounds: [[number, number], [number, number]] = [
      [Math.min(...lons), Math.min(...lats)],
      [Math.max(...lons), Math.max(...lats)],
    ];
    map.fitBounds(bounds, { padding: 60, duration: 500, maxZoom: 10 });
  }, [data, mapReady]);

  const stateMuTevi = data?.features[0]?.properties.mu_tevi ?? null;
  const frame = data?.metadata.frame ?? null;

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold mb-1">Real-time heat severity map</h1>
      <p className="text-sm text-gray-600 mb-4 max-w-2xl">
        Street-level heat forecast (STGCN) over the real NASA POWER grid for the selected state, with
        that state&rsquo;s own mu-TEVI index for the selected date. Per-node color is the street-level
        heat forecast and varies by node; mu-TEVI is one state-level trigger index for the date, the
        same across every cell shown -- that is by design, not a bug.
      </p>

      {statesError && (
        <div className="mb-4">
          <ErrorBanner message={statesError} />
        </div>
      )}

      <div className="flex flex-wrap items-end gap-4 mb-4">
        <label className="text-sm text-gray-700">
          State
          <select
            value={stateKey}
            onChange={(e) => setStateKey(e.target.value)}
            disabled={!states}
            className="mt-1 ml-2 border border-gray-300 rounded px-2 py-1 text-sm"
          >
            {states === null && <option>Loading states...</option>}
            {[...grouped.entries()].map(([country, rows]) => (
              <optgroup key={country} label={country}>
                {rows.map((s) => (
                  <option key={s.state_key} value={s.state_key}>
                    {s.state}
                    {s.mode === "excluded" ? " (excluded -- insufficient heat-exposure signal)" : ""}
                    {s.mode === "unpriced" ? " (pipeline not yet trained)" : ""}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </label>

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

        {selectedState && (
          <div className="text-sm">
            <span className="text-gray-500">Anchor metro:</span>{" "}
            <span className="font-mono">{selectedState.metro}</span>
          </div>
        )}

        {stateMuTevi != null && (
          <div className="text-sm">
            State-level mu-TEVI index:{" "}
            <span className="font-mono font-semibold">{stateMuTevi.toFixed(1)}</span>
            <span className="text-gray-500"> / 100 (one value for the whole state, this date)</span>
            {frame && (
              <span className="ml-2 text-xs uppercase tracking-wide text-heat-4 font-medium">
                {frame.replace(/_/g, " ")}
              </span>
            )}
          </div>
        )}

        {loading && (
          <span className="text-xs text-gray-400">
            Loading... (first load can take up to a minute if the server is waking up)
          </span>
        )}
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="relative">
        <div ref={mapContainer} className="w-full h-[520px] rounded border border-gray-200 bg-gray-100" />
        {!mapReady && !error && (
          <div className="absolute inset-0 flex items-center justify-center text-sm text-gray-400 bg-gray-100/70 rounded">
            Loading map...
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 mt-4 text-xs text-gray-600">
        <span>Cooler</span>
        {HEAT_COLORS.map((c) => (
          <span key={c} className="w-6 h-3 rounded-sm inline-block" style={{ backgroundColor: c }} />
        ))}
        <span>Hotter (per-node STGCN shade-WBGT forecast)</span>
        <span className="ml-auto text-gray-400">{OSM_ATTRIBUTION}</span>
      </div>
    </main>
  );
}
