"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { Map as MapLibreMap, Popup } from "maplibre-gl";
// MapLibre's own stylesheet -- without it the NavigationControl and the OSM
// attribution render unpositioned/unstyled on top of the canvas. Imported
// here rather than in globals.css so it travels with the only page that
// actually mounts a map.
import "maplibre-gl/dist/maplibre-gl.css";
import type { Feature, FeatureCollection, MultiPolygon, Point, Polygon } from "geojson";
import bbox from "@turf/bbox";
import interpolate from "@turf/interpolate";
import intersect from "@turf/intersect";
import booleanPointInPolygon from "@turf/boolean-point-in-polygon";
import { featureCollection } from "@turf/helpers";
import { ApiError, getHeatmap, getStateBoundary, getStates } from "@/lib/api";
import type { HeatmapResponse, StateBoundary, StateListEntry } from "@/lib/types";
import { ErrorBanner } from "@/components/ErrorBanner";

// 5-step colorblind-safe sequential scale (ColorBrewer OrRd) -- see
// tailwind.config.js's `heat` tokens; duplicated as hex here because MapLibre
// paint expressions take literal values, not CSS classes.
const HEAT_COLORS = ["#fef0d9", "#fdcc8a", "#fc8d59", "#e34a33", "#b30000"];
const DEFAULT_STATE_KEY = "IN-Gujarat";
const OSM_ATTRIBUTION = "© OpenStreetMap contributors";
// Roughly how many cells span the covered region's longest dimension. Adaptive
// cell size = span / this, so a 0.2deg state (DC) and a 13deg state (Texas)
// both get a smooth surface without one hardcoded cellSize serving neither.
// Raised from 48 -> 90 once coverage went whole-state (v2.7): at 48 a 13deg
// state's cells were ~0.27deg and read as a visible lattice; ~0.15deg cells are
// fine enough to look continuous. The corner-classification optimisation keeps
// the added interior cells cheap (only border cells are polygon-clipped).
const CELLS_ACROSS = 90;

// Build the state-clipped IDW heat surface from the REAL per-node points.
//
// WHY IDW-INTO-A-FILL, not MapLibre's native heatmap layer (v2.5): each state's
// nodes come from its ~2deg anchor-metro NASA POWER grid, which for a tiny
// state sits ENTIRELY OUTSIDE the real border -- measured: 0 of 12 DC nodes,
// 1 of 12 Rhode Island nodes fall inside their own state. A heatmap layer can't
// be polygon-clipped, so v2.5 blanked everything outside the border with an
// opaque mask, which erased all of DC's heat (every node was outside). IDW
// instead ESTIMATES a value INSIDE the border from the surrounding real nodes,
// so a tiny state fills correctly, and the result is real polygons a fill layer
// CAN clip -- no mask, basemap stays visible everywhere.
//
// HONEST EXTRAPOLATION LIMIT (Golden Rule 5 in visual form): IDW will invent a
// value arbitrarily far from any real node. So the grid is confined to the
// COVERAGE ENVELOPE -- the node bounding box grown by one grid spacing --
// intersected with the state. Where a large state (Texas, California) extends
// past its ~2deg sampled grid, that area is left UNCOVERED (basemap only),
// never painted from data that was never sampled there.
function buildHeatSurface(
  points: FeatureCollection<Point>,
  boundary: StateBoundary,
): { surface: FeatureCollection; cellCount: number; ms: number } {
  const t0 = performance.now();
  const [nxmin, nymin, nxmax, nymax] = bbox(points);
  const [sxmin, symin, sxmax, symax] = bbox(boundary);

  // Node grid spacing = smallest gap between distinct node latitudes (the real
  // NASA POWER cell size for this state), used to grow the coverage envelope by
  // exactly one cell so IDW never reaches beyond a plausible neighbourhood.
  const lats = [...new Set(points.features.map((f) => (f.geometry as Point).coordinates[1]))].sort(
    (a, b) => a - b,
  );
  let spacing = Infinity;
  for (let i = 1; i < lats.length; i += 1) spacing = Math.min(spacing, lats[i] - lats[i - 1]);
  if (!Number.isFinite(spacing) || spacing <= 0) spacing = 0.5;

  // Coverage envelope (node bbox + one cell) intersected with the state bbox.
  const cb: [number, number, number, number] = [
    Math.max(sxmin, nxmin - spacing),
    Math.max(symin, nymin - spacing),
    Math.min(sxmax, nxmax + spacing),
    Math.min(symax, nymax + spacing),
  ];
  if (cb[0] >= cb[2] || cb[1] >= cb[3]) {
    return { surface: featureCollection([]), cellCount: 0, ms: performance.now() - t0 };
  }

  const cellSize = Math.max(cb[2] - cb[0], cb[3] - cb[1]) / CELLS_ACROSS;
  const grid = interpolate(points, cellSize, {
    gridType: "square",
    property: "heat_index",
    weight: 2,
    units: "degrees",
    bbox: cb,
  });

  // Clip cells to the REAL state polygon (Polygon OR MultiPolygon). The naive
  // approach -- intersect() every cell -- was measured at 2.8s (Gujarat) to
  // 5.8s (Texas), an unshippable freeze on the selector. The overwhelming
  // majority of cells lie ENTIRELY inside or outside the border; only the thin
  // ring of border-straddling cells actually needs the expensive polygon clip.
  // So classify each cell by its 4 corners (cheap point-in-polygon): all-in ->
  // keep the whole square; all-out -> drop (re-checking the center guards a
  // state thinner than one cell); mixed -> do the real intersect so the edge
  // follows the true border. This cut Texas from 5826ms to well under 500ms.
  const clipped: Feature[] = [];
  const boundaryPoly = boundary as Feature<Polygon | MultiPolygon>;
  for (const cell of grid.features) {
    const cellPoly = cell as Feature<Polygon>;
    const heat = (cell.properties as { heat_index: number }).heat_index;
    const ring = cellPoly.geometry.coordinates[0];
    let inside = 0;
    for (let i = 0; i < 4; i += 1) {
      if (booleanPointInPolygon(ring[i] as [number, number], boundaryPoly)) inside += 1;
    }
    if (inside === 4) {
      cellPoly.properties = { heat_index: heat };
      clipped.push(cellPoly);
      continue;
    }
    if (inside === 0) {
      const cx = (ring[0][0] + ring[2][0]) / 2;
      const cy = (ring[0][1] + ring[2][1]) / 2;
      if (!booleanPointInPolygon([cx, cy] as [number, number], boundaryPoly)) continue;
    }
    try {
      const inter = intersect(
        featureCollection([cellPoly, boundaryPoly]) as FeatureCollection<Polygon | MultiPolygon>,
        { properties: { heat_index: heat } },
      );
      if (inter) clipped.push(inter);
    } catch {
      // A rare self-touching Natural Earth ring can make one clip throw; skip
      // that single cell rather than losing the whole surface.
    }
  }
  return { surface: featureCollection(clipped), cellCount: clipped.length, ms: performance.now() - t0 };
}

// HONESTY NOTE (carried in code so it can't drift from the UI): rendering the
// heat field as a smooth IDW-interpolated surface instead of discrete dots is a
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
    // Request the real full-state forecast; the backend falls back to real
    // anchor coverage (never extrapolation) if the whole-state fetch fails or
    // the state is too small to hold grid nodes -- the caption reflects which.
    getHeatmap(stateKey, date, "state")
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

  // Draw / update the overlay. MapLibre's own source/paint types are
  // version-sensitive; the GeoJSON shapes here already satisfy the real
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

    // Data-driven OrRd fill color from THIS state+date's real observed min/max,
    // so winter and summer both keep usable contrast (never a hardcoded range).
    let colorExpr: unknown = null;
    if (data && data.features.length > 0) {
      upsertSource("grid", data); // raw real nodes: hover targets + IDW input
      const values = data.features.map((f) => f.properties.heat_index);
      let min = Math.min(...values);
      let max = Math.max(...values);
      if (max <= min) max = min + 1;
      const step = (max - min) / 4;
      colorExpr = [
        "interpolate", ["linear"], ["get", "heat_index"],
        min, HEAT_COLORS[0],
        min + step, HEAT_COLORS[1],
        min + step * 2, HEAT_COLORS[2],
        min + step * 3, HEAT_COLORS[3],
        max, HEAT_COLORS[4],
      ];
    }

    if (boundary) upsertSource("boundary", boundary);

    // Build the IDW surface (needs both the real points and the real border).
    if (data && data.features.length > 0 && boundary) {
      const { surface, cellCount, ms } = buildHeatSurface(
        data as unknown as FeatureCollection<Point>,
        boundary,
      );
      // Timing surfaced so a slow (>500ms) large-state interpolation is visible
      // rather than a quietly laggy selector (DoD 8).
      console.log(
        `[heat-surface] ${boundary.properties?.state_key}: ${cellCount} clipped cells in ${ms.toFixed(0)}ms`,
      );
      upsertSource("surface", surface);
    }

    // Create the layers exactly once, bottom->top: heat fill (state-clipped IDW
    // surface) -> real border line -> invisible-but-interactive node points.
    // NO mask layer: the basemap stays visible everywhere outside the state.
    if (data && boundary && !map.getLayer("heat-fill")) {
      map.addLayer({
        id: "heat-fill",
        type: "fill",
        source: "surface",
        paint: {
          "fill-color": colorExpr as never,
          // Translucent so OSM streets/labels stay legible underneath.
          "fill-opacity": 0.6,
          // false removes the 1px antialiased seam between adjacent cells, so
          // the grid reads as one smooth surface, not a visible lattice.
          "fill-antialias": false,
        },
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

    // Keep the fill color in sync with the current state+date's real min/max.
    if (colorExpr && map.getLayer("heat-fill")) {
      map.setPaintProperty("heat-fill", "fill-color", colorExpr as never);
    }

    // Re-fit to the STATE BOUNDARY's real extent (not the node bbox) whenever
    // the state actually changes -- for a large state this deliberately frames
    // the WHOLE state so its honestly-uncovered area is visible, not just the
    // sampled patch. A date-only change never yanks the view.
    if (boundary && lastFittedKey.current !== boundary.properties?.state_key) {
      const [minX, minY, maxX, maxY] = bbox(boundary);
      map.fitBounds([[minX, minY], [maxX, maxY]], { padding: 40, duration: 600, maxZoom: 9 });
      lastFittedKey.current = (boundary.properties?.state_key as string) ?? null;
    }
  }, [data, boundary, mapReady]);

  const stateMuTevi = data?.features[0]?.properties.mu_tevi ?? null;
  const frame = data?.metadata.frame ?? null;
  // Whether the served surface is the real full-state forecast or the honest
  // anchor-metro fallback (whole-state fetch failed, or state too small).
  const coverage = data?.metadata.coverage ?? null;

  return (
    <main className="max-w-6xl mx-auto p-4 sm:p-6">
      <h1 className="text-xl font-semibold mb-1">Real-time heat severity map</h1>
      <p className="text-sm text-gray-600 mb-4 max-w-2xl">
        Real full-state heat forecast (STGCN over live NASA POWER weather), drawn as a smooth
        inverse-distance-weighted surface clipped to the state&rsquo;s real border. The color is an
        interpolated <em>rendering</em> of the real per-node forecasts -- the underlying numbers stay
        the exact per-node values; only the picture between nodes is smoothed (the standard way
        point-sampled fields like weather radar are mapped). mu-TEVI, the priced index, is one
        state-level trigger from the anchor-metro grid -- a deliberately different extent (see below).
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
            Fetching real whole-state weather... (a large state&rsquo;s first load can take ~10-30s;
            it&rsquo;s cached after)
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

      {coverage === "state" ? (
        <p className="mt-2 text-xs text-gray-400 max-w-3xl">
          The heat surface is the real full-state forecast: live NASA POWER weather fetched across
          the whole state, run through the same trained STGCN applied inductively to the wider grid.
          The priced <span className="font-mono">mu-TEVI</span> index and the premium, by contrast,
          come from the anchor-metro grid the model was calibrated on -- two different real extents,
          deliberately, not an inconsistency.
        </p>
      ) : (
        <p className="mt-2 text-xs text-amber-700 max-w-3xl">
          Showing this state&rsquo;s real anchor-metro grid: the whole-state forecast isn&rsquo;t
          available here (the live fetch didn&rsquo;t return, or the state is smaller than a NASA
          POWER grid cell). The surface stops at real data and is never extrapolated to fill the rest.
        </p>
      )}
    </main>
  );
}
