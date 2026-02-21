# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Dev Commands

```bash
npm run dev    # Start dev server (http://localhost:3000)
npm run build  # Production build + type check
npm run lint   # ESLint check
```

---

## Project Overview

**micro-climate** is a full-screen weather heatmap. It geolocates the user, fetches nearby personal weather stations from the Synoptic Data API, and renders a smooth IDW-interpolated overlay showing temperature, humidity, or wind speed. The map is interactive — panning triggers new station fetches, and the heatmap grid recomputes dynamically to match the viewport.

---

## How It All Works Together

### Data flow (end to end)

1. Map loads → `GeolocateControl` auto-triggers → browser asks for location
2. On fix: `onCoordsChange` in `MapContainer` → `page.tsx` sets `fetchCoords` → SWR key becomes `/api/stations?lat=&lon=`
3. `/api/stations` calls `synoptic.ts` → fetches stations within 20-mile radius → filters outliers → returns `StationsResponse`
4. Stations passed to `MapContainer` → `HeatmapLayer` + `StationMarkers`
5. `HeatmapLayer` listens to `moveend` on the native Mapbox map → updates viewport bbox → `useMemo` recomputes IDW grid → Mapbox source updated
6. As user pans: `onMoveEnd` → `page.tsx` `handleMapCenter` → if moved >16 km from last fetch point, updates `fetchCoords` → new SWR fetch fires immediately
7. User interaction abort: `movestart` with `originalEvent` (user-initiated) → aborts in-flight fetch → `isInteractingRef = true` → SWR polling paused; `moveend` clears interaction state and triggers fresh fetch if needed

### Request lifecycle

- **Abort on interaction**: when the user starts panning, any in-flight `/api/stations` request is aborted via `AbortController`. SWR's `isPaused` suppresses polling while interacting.
- **Refetch threshold**: `REFETCH_DISTANCE_KM = 16` (~10 miles). Fetch radius is 20 miles, so threshold is ~half, ensuring full coverage before edges thin out.
- **5-min polling**: SWR `refreshInterval` keeps data fresh at the current location without user action.
- **`moveend` vs `movestart`**: `onInteractionStart` fires on `movestart` (abort immediately); `handleMapCenter` fires on `moveend` (fetch immediately after pan settles — no debounce).

### IDW computation

`lib/interpolation/idw.ts` — all custom, no turf for the heavy lifting:
- Generates a lat/lon grid over the padded viewport bbox
- For each cell: single loop over all stations computing IDW weights (`1/d²`) + nearest-station distance simultaneously
- Flat-earth distance approximation (no sin/cos/asin in inner loop — just multiply/add/sqrt)
- `cosLat` precomputed once per call; station positions scaled to km upfront
- One `sqrt` per cell (for the organic boundary alpha), not per station
- Returns GeoJSON `FeatureCollection<Polygon>` with `{ temperature, humidity, windspeedmph, alpha }` on each feature
- Safety cap: `MAX_CELLS = 20,000` — bails out early if bbox would generate too many cells
- Skips computation entirely when zoom < `MIN_ZOOM` (7) — bbox is set to `null` in `HeatmapLayer`

### Heatmap rendering

`components/Map/HeatmapLayer.tsx`:
- Tracks `bbox` and `cellSize` (bucketed zoom) separately — raw zoom changes within the same cell-size bucket don't trigger grid recomputes
- Deduplicates bbox updates (value comparison before `setState`) to avoid spurious memo invalidation
- `fill-opacity` expression: `["*", globalOpacity, ["get", "alpha"]]` — combines fade-in animation with per-cell organic boundary
- `fill-outline-color: rgba(0,0,0,0)` removes grid lines
- `slot: "middle"` in Mapbox Standard Style — places heatmap below roads and labels so they render fully on top
- Opacity: 0.65 — dark-v11 base makes colors vivid; roads/labels show above at full opacity
- Cell size: 0.5 km (zoom ≥12), 1 km (≥10), 2 km (≥8), 4 km (<8)
- Bbox padding: 20% on each side — grid edge stays offscreen during small pans without over-computing

### Metrics

`lib/metrics.ts` is the single source of truth for all three visualizable metrics:
- `temperature` (°F), `humidity` (%), `windspeedmph` (mph)
- Each has `label`, `unit`, and color `stops` (value → hex)
- `METRICS` drives both the Legend gradient and the Mapbox `fill-color` expression in `HeatmapLayer`
- `METRIC_ORDER` defines pagination order in the Legend

---

## Key Files

| File | Role |
|---|---|
| `app/page.tsx` | Root client component; fetch state, SWR, abort/interaction logic |
| `app/api/stations/route.ts` | API proxy; reads lat/lon params, calls Synoptic, filters outliers |
| `lib/weather/synoptic.ts` | Synoptic API client (server-only) |
| `lib/weather/outliers.ts` | 3-stage filter: staleness (45 min), hard bounds (20–115°F), z-score (>2.5σ) |
| `lib/interpolation/idw.ts` | IDW grid computation — custom, no turf |
| `lib/interpolation/point-idw.ts` | Point-query IDW + haversine for pan-threshold check |
| `lib/metrics.ts` | Metric config (label, unit, color stops) for all 3 metrics |
| `components/Map/MapContainer.tsx` | Map wrapper; GeolocateControl; native movestart listener for abort |
| `components/Map/HeatmapLayer.tsx` | Dynamic heatmap fill layer; viewport tracking; fade animations |
| `components/Map/StationMarkers.tsx` | Circle layer + HeroUI Tooltip (off by default — see below) |
| `components/Map/Legend.tsx` | Gradient bar with hover tooltip; HeroUI Pagination for metric switching |
| `types/weather.ts` | `PWSStation`, `StationsResponse` interfaces |

---

## Environment Variables

| Variable | Where used | Notes |
|---|---|---|
| `SYNOPTIC_API_TOKEN` | Server only (`lib/weather/synoptic.ts`) | No `NEXT_PUBLIC_` prefix |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Browser (`components/Map/MapContainer.tsx`) | Safe to expose |

---

## Feature Flags

### Station markers (`SHOW_STATION_MARKERS`)

In `components/Map/MapContainer.tsx`:
```ts
const SHOW_STATION_MARKERS = false; // set true to show station dots
```
Also togglable at runtime via browser console:
```js
__showStationMarkers(true)   // enable
__showStationMarkers(false)  // disable
```

---

## History: Features Tried, Removed, or Evolved

### Custom crosshair / center interpolation (removed)
Early version had a crosshair at the map center that computed a live IDW value at that exact point as the user panned. Removed because it added complexity and console noise without clear user value. The `CenterTarget` component and `runInterpolation` logic were fully deleted.

### `@turf/interpolate` (replaced)
Originally used `@turf/interpolate` to generate the grid geometry AND run IDW. This was wasteful — turf's IDW result was thrown away and replaced by our own `idwAtPoint` pass. The `Math.min(...stations.map(haversineKm))` alpha pass added a third full O(N) loop per cell. Together these caused ~1.9M haversine calls per recompute (sin/cos/asin in inner loops), causing freezes. Replaced with a single custom loop using flat-earth distance and `1/d²` weights with no trig in the inner loop.

### 3-second debounce (removed)
Initially added a 3-second delay after `moveend` before triggering a new station fetch, to avoid hammering the API during panning. After IDW performance was fixed, the debounce added unnecessary latency. Removed — the abort-on-interaction pattern already handles request hygiene, and `moveend` only fires once per gesture (including after momentum).

### Map style exploration (dark-v11 → light-v11 → dark-v11)
Tried `light-v11` to get dark/black road lines visible against the heatmap. Didn't work — light-v11's white base completely washes out heatmap colors (80% vivid color over white = pastel). Reverted to `dark-v11`. Dark base makes heatmap colors vivid; roads/labels render above via `slot: "middle"` at full opacity.

### Mapbox slot exploration (`beforeId` → `slot: "middle"` → `slot: "top"` → `slot: "middle"`)
- `beforeId: "road-motorway-trunk"` — failed; dark-v11 is Standard Style, individual layer IDs not exposed
- `slot: "middle"` — correct for Standard Style; documented as "above terrain, below roads and labels"
- `slot: "top"` — tried to improve road visibility; made things worse (heatmap above roads, roads only 30% visible through transparency)
- Back to `slot: "middle"` — roads fully above at 100% opacity; contrast is acceptable on dark base

### Bbox padding reduction (0.5 → 0.2)
Original 50% padding on each side = 4× viewport area to compute. Reduced to 20% (2.25× viewport). Enough to cover small pans without recompute, while significantly reducing cell count.

### Low-zoom freeze fix
Discovered that at zoom 4 (USA view), the padded bbox at 4km cells = ~1.35M cells. All computed synchronously on the main thread even though heatmap was invisible (opacity = 0 below zoom 7). Fixed by setting `bbox = null` when `zoom < MIN_ZOOM` in `updateView`, plus a `MAX_CELLS = 20,000` hard cap in `interpolateTemperatures`.

### Raw zoom in useMemo deps (fixed)
`zoom` state changed on every `moveend` even within the same cell-size bucket (e.g., 12.1 → 12.2 → 12.3 all produce 0.5km cells). Replaced with `cellSize` state (the bucketed value) as the grid dep. `zoom` is still tracked separately for the `fill-opacity: 0` guard at `MIN_ZOOM`.

---

## Known Constraints & Trade-offs

- **Main-thread IDW**: Grid computation still runs synchronously on the main thread. For very dense station sets or large viewports near MIN_ZOOM, this could be slow. A Web Worker would be the right long-term fix.
- **Mapbox blend modes**: No per-layer CSS `mix-blend-mode` equivalent in WebGL/Mapbox GL JS. The slot system is the only tool for layering; true multiply/screen blending would require a custom WebGL layer or canvas overlay.
- **dark-v11 road contrast**: Gray road lines in dark-v11 have limited contrast against vivid heatmap colors. This is inherent to the style — roads are designed to show against a dark neutral background, not against colored fills.
