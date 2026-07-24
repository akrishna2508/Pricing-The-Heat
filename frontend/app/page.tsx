"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Popup } from "maplibre-gl";
// MapLibre's own stylesheet -- without it the NavigationControl and the OSM
// attribution render unpositioned/unstyled on top of the canvas. Imported
// here rather than in globals.css so it travels with the only page that
// actually mounts a map.
import "maplibre-gl/dist/maplibre-gl.css";
import mask from "@turf/mask";
import bbox from "@turf/bbox";
import { ApiError, getHeatmap, getStateBoundary, getStates } from "@/lib/api";
import type { HeatmapResponse, StateBoundary, StateListEntry } from "@/lib/types";
import { ErrorBanner } from "@/components/ErrorBanner";

// 5-step colorblind-safe sequential scale (ColorBrewer OrRd) -- see
// tailwind.config.js's `heat` tokens; duplicated as hex here because MapLibre
// paint expressions take literal values, not CSS classes.
const HEAT_COLORS = ["#fef0d9", "#fdcc8a", "#fc8d59", "#e34a33", "#b30000"];
// Matches the app body background (Tailwind bg-gray-50). The clip mask paints
// everything OUTSIDE the state with this, so the area beyond the real border
// reads as blank page, not basemap.
const MASK_FILL = "#f9fafb";
const DEFAULT_STATE_KEY = "IN-Gujarat";
const OSM_ATTRIBUTION = "© OpenStreetMap contributors";

// HONESTY NOTE (carried in code so it can't drift from the UI): rendering the
// heat field as a smooth kernel-density overlay instead of discrete dots is a
// VISUALIZATION choice, not a data change. The numbers stay the real per-node
// heat_index that /heatmap returns and that pricing consumes; the ONLY thing
// interpolated is how the map is drawn between those real sample points. This
// is standard cartography for point-sampled physical fields -- the same
// technique weather-radar and pollution maps use -- and the clip to the real
// admin-1 border (not a bounding box) keeps the drawn extent honest to the
// state's true shape.

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
  // maplibre-gl is dynamically imported (WebGL/window at construction time),
  // so the maplibregl namespace (its default export) is stashed here for the
  // render effect to build a Popup without re-importing. Typed structurally to
  // just the Popup constructor -- `typeof import()` as a type operator doesn't
  // synthesize the default export the way a value import does.
  const glRef = useRef<{ Popup: typeof Popup } | null>(null);
  const popupRef = useRef<Popup | null>(null);
  const lastFittedKey = useRef<string | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [tileWarning, setTileWarning] = useState<string | null>(null);

  const [states, setStates] = useState<StateListEntry[] | null>(null);
  const [statesError, setStatesError] = useState<string | null>(null);
  const [stateKey, setStateKey] = useState<string>(DEFAULT_STATE_KEY);

  const [date, setDate] = useState("2023-12-31");
  const [data, setData] = useState<HeatmapResponse | null>(null);
  const [boundary, setBoundary] = useState<StateBoundary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [boundaryError, setBoundaryError] = useState<string | null>(null);
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

  // Per-node heat data: depends on both the state and the date.
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

  // Real state boundary polygon: depends only on the state, not the date.
  // On failure we KEEP the previous boundary (and thus the last good clipped
  // view) and surface an honest error -- we never silently substitute a
  // bounding-box rectangle, which would misdraw the state's real shape.
  useEffect(() => {
    let cancelled = false;
    setBoundaryError(null);
    getStateBoundary(stateKey)
      .then((geo) => {
        if (!cancelled) setBoundary(geo);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setBoundaryError(
            err instanceof ApiError
              ? `Couldn't load ${stateKey}'s real border (${err.message}); the map is keeping the ` +
                  `previous state's shape rather than drawing a rectangle.`
              : "Couldn't load this state's real border.",
          );
        }
      });
    return () => {
      cancelled = true;
    };
  }, [stateKey]);

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
      glRef.current = maplibregl;
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
        center: [78.9629, 22.5], // rough India/US midpoint fallback until the first boundary fetch fits bounds
        zoom: 3,
      });
      map.addControl(new maplibregl.NavigationControl(), "top-right");

      // Mark the map usable as soon as the STYLE parses, not on "load".
      // "load" waits for the first visually-complete render, which never
      // happens if any basemap tile fails -- OpenStreetMap's public tile
      // server burst-throttles with HTTP 503 under its usage policy, and
      // gating on "load" left the map permanently hidden behind the
      // "Loading map..." overlay even though the canvas and the real data
      // layer were fine. styledata fires off the parsed style alone, so
      // tile availability can no longer block the whole UI.
      map.once("styledata", () => setMapReady(true));
      map.once("load", () => setMapReady(true));

      // Surface basemap tile failures honestly instead of silently showing a
      // partly-blank map -- the data layer below is unaffected by them.
      map.on("error", (e: { error?: { status?: number } }) => {
        if (e?.error?.status === 429 || e?.error?.status === 503) {
          setTileWarning(
            "OpenStreetMap is rate-limiting basemap tiles right now, so parts of the map " +
              "background may be blank. The heat data below is unaffected.",
          );
        }
      });

      mapRef.current = map;
      // A fresh map instance has fitted nothing yet. Reset here so the fit
      // guard below re-fits on THIS map -- critical because React StrictMode
      // (dev) and HMR recreate the map while lastFittedKey (a ref) persists
      // across the remount; without this reset the very first fit runs on the
      // discarded map and the live one stays zoomed out under the clip mask.
      lastFittedKey.current = null;
    });

    return () => {
      cancelled = true;
      popupRef.current?.remove();
      popupRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, []);

  // Draw / update the continuous overlay. MapLibre's own source/paint types
  // are version-sensitive; the GeoJSON shapes here already satisfy the real
  // contract, so the casts are a narrow escape hatch at the MapLibre boundary.
  useEffect(() => {
    const map = mapRef.current;
    const gl = glRef.current;
    if (!map || !mapReady) return;

    const upsertSource = (id: string, geojson: unknown) => {
      const src = map.getSource(id) as { setData?: (d: unknown) => void } | undefined;
      if (src && src.setData) src.setData(geojson);
      else map.addSource(id, { type: "geojson", data: geojson as never });
    };

    // Real per-node heat_index -> a 0..1 heatmap weight, from THIS state's own
    // observed min/max (never a hardcoded weight). Guard the degenerate
    // all-equal case so the interpolate stops stay strictly increasing.
    let weightExpr: unknown = null;
    if (data && data.features.length > 0) {
      upsertSource("grid", data);
      const values = data.features.map((f) => f.properties.heat_index);
      let min = Math.min(...values);
      let max = Math.max(...values);
      if (max <= min) max = min + 1;
      weightExpr = ["interpolate", ["linear"], ["get", "heat_index"], min, 0, max, 1];
    }

    if (boundary) {
      upsertSource("boundary", boundary);
      // turf.mask(feature) -> the whole-world polygon MINUS this state's real
      // (possibly MultiPolygon, possibly non-convex) shape. Painted opaque on
      // top of the heatmap, it makes the color exist only inside the true
      // border -- a real geometric clip, not a bbox.
      upsertSource("mask", mask(boundary));
    }

    // Create the four overlay layers exactly once, in bottom->top order:
    // heat (blended field) -> mask (clip everything outside the border) ->
    // outline (the real border line) -> node-hit (invisible but hoverable).
    if (data && boundary && !map.getLayer("heat-layer")) {
      map.addLayer({
        id: "heat-layer",
        type: "heatmap",
        source: "grid",
        paint: {
          "heatmap-weight": weightExpr as never,
          // Density 0 is transparent so the basemap shows through the cool
          // areas; the ramp then walks the SAME OrRd scale as the legend.
          "heatmap-color": [
            "interpolate", ["linear"], ["heatmap-density"],
            0, "rgba(254,240,217,0)",
            0.2, HEAT_COLORS[0],
            0.4, HEAT_COLORS[1],
            0.6, HEAT_COLORS[2],
            0.8, HEAT_COLORS[3],
            1, HEAT_COLORS[4],
          ] as never,
          // Radius grows with zoom so 12 sparse nodes still blend into a
          // continuous field at state scale AND when zoomed into the metro.
          "heatmap-radius": [
            "interpolate", ["linear"], ["zoom"],
            4, 30, 7, 60, 10, 95, 13, 150,
          ] as never,
          // Translucent: OSM streets/labels stay legible under the color.
          "heatmap-opacity": 0.65,
        },
      });
      map.addLayer({
        id: "state-mask",
        type: "fill",
        source: "mask",
        paint: { "fill-color": MASK_FILL, "fill-opacity": 1 },
      });
      map.addLayer({
        id: "state-outline",
        type: "line",
        source: "boundary",
        paint: { "line-color": "#52525b", "line-width": 2 },
      });
      // Invisible but interactive: keeps the old circles' ability to read an
      // exact real node value on hover, without their constant visual clutter.
      map.addLayer({
        id: "node-hit",
        type: "circle",
        source: "grid",
        paint: { "circle-radius": 16, "circle-opacity": 0, "circle-color": "#000000" },
      });

      if (gl) {
        const popup = new gl.Popup({ closeButton: false, closeOnClick: false, offset: 12 });
        popupRef.current = popup;
        map.on("mousemove", "node-hit", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          map.getCanvas().style.cursor = "pointer";
          const props = f.properties as { heat_index: number; node_id: string };
          const [lon, lat] = (f.geometry as unknown as { coordinates: [number, number] }).coordinates;
          popup
            .setLngLat(e.lngLat)
            .setHTML(
              `<div style="font:12px/1.4 ui-sans-serif,system-ui;color:#18181b">` +
                `<strong>${Number(props.heat_index).toFixed(1)}&deg;C</strong> shade-WBGT` +
                `<br/><span style="color:#71717a">node ${props.node_id}</span>` +
                `<br/><span style="color:#71717a">${lat.toFixed(3)}, ${lon.toFixed(3)}</span></div>`,
            )
            .addTo(map);
        });
        map.on("mouseleave", "node-hit", () => {
          map.getCanvas().style.cursor = "";
          popup.remove();
        });
      }
    }

    // Keep the weight ramp in sync with the current state's real min/max
    // (date change re-fetches data with different values).
    if (data && weightExpr && map.getLayer("heat-layer")) {
      map.setPaintProperty("heat-layer", "heatmap-weight", weightExpr as never);
    }

    // Re-fit to the STATE BOUNDARY's real extent (not the node bbox) whenever
    // the state actually changes -- so pan/zoom frames the true shape, and a
    // date-only change doesn't yank the view around.
    if (boundary && lastFittedKey.current !== boundary.properties?.state_key) {
      const [minX, minY, maxX, maxY] = bbox(boundary);
      map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 40, duration: 600, maxZoom: 9 });
      lastFittedKey.current = (boundary.properties?.state_key as string) ?? null;
    }
  }, [data, boundary, mapReady]);

  const stateMuTevi = data?.features[0]?.properties.mu_tevi ?? null;
  const frame = data?.metadata.frame ?? null;

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold mb-1">Real-time heat severity map</h1>
      <p className="text-sm text-gray-600 mb-4 max-w-2xl">
        Street-level heat forecast (STGCN) over the real NASA POWER grid for the selected state,
        drawn as a smooth heat field clipped to the state&rsquo;s real border. The color is an
        interpolated <em>rendering</em> of the real per-node forecasts -- the underlying numbers, and
        everything pricing uses, stay the exact per-node values; only the picture between nodes is
        smoothed (the standard way point-sampled fields like weather radar are mapped). mu-TEVI is
        one state-level trigger index for the date.
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

      {boundaryError && (
        <p className="mb-2 text-xs text-amber-700" role="status">
          {boundaryError}
        </p>
      )}

      {tileWarning && (
        <p className="mb-2 text-xs text-amber-700" role="status">
          {tileWarning}
        </p>
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
        <span className="ml-auto text-gray-400">Hover a node for its exact reading &middot; {OSM_ATTRIBUTION}</span>
      </div>
    </main>
  );
}
