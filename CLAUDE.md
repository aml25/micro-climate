# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Working Instructions

Before committing, always update `CLAUDE.md` and `README.md` to reflect any changes made — without being asked. Commit the doc updates in the same commit as the code, or as an immediate follow-up if the code was already committed.

---

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
4. Stations passed to `MapContainer` → `HeatmapCanvas` + `StationMarkers`
5. `HeatmapCanvas` listens to `moveend` on the native Mapbox map → updates viewport bbox → `useMemo` recomputes IDW grid → stored in ref → canvas redraws on every `move` frame
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
- Returns `GridResult` — a flat `CellData[]` array (row-major, south-to-north) plus `cols`, `rows`, and geographic outer edges (`west/south/east/north`). No GeoJSON — polygon ring construction was eliminated entirely.
- Safety cap: `MAX_CELLS = 20,000` — returns `null` if bbox would generate too many cells
- Skips computation entirely when zoom < `MIN_ZOOM` (7) — bbox is set to `null` in `HeatmapCanvas`

### Heatmap rendering

`components/Map/HeatmapCanvas.tsx` — HTML canvas overlay, not a Mapbox GL layer:
- Absolutely-positioned `<canvas>` over the map at `z-index: 1`; `pointerEvents: none`
- `mix-blend-mode: multiply` in CSS — multiplies heatmap color against the grayscale base: white areas take the full heatmap hue, dark roads stay dark through it
- Base map (`streets-v12`) desaturated via `.mapboxgl-canvas { filter: grayscale(100%) }` in `globals.css` — removes green/blue map tints that would skew heatmap colors under multiply
- GPS marker rendered above canvas via `.mapboxgl-user-location* { z-index: 2 }` in `globals.css`
- **Render loop split**: IDW recomputes on `moveend` (expensive, stored in `gridRef`); canvas redraws on every `move` frame (cheap, reads from ref) — smooth animation during pan/zoom
- `renderFrame` uses refs (`gridRef`, `activeMetricRef`, `zoomRef`) for all changing data — stable callback identity means map event listeners are never re-registered
- Canvas sized to match Mapbox GL canvas physical dimensions; `ctx.scale(dpr, dpr)` for correct CSS pixel drawing
- **Smooth gradients via offscreen canvas**: each IDW cell is one pixel in a tiny offscreen canvas (`cols × rows`); `ctx.drawImage` scales it up to screen size with `imageSmoothingQuality: "high"` — browser bilinear interpolation smooths between cells automatically, eliminating blocky grid tiles
- Grid is row-major south-to-north; y-axis is flipped when writing `ImageData` (ImageData row 0 = top = north)
- `valueToRgb` JS color interpolation mirrors Mapbox's `interpolate linear` expression
- Tracks `bbox` and `cellSize` (bucketed zoom) separately — raw zoom changes within the same bucket don't retrigger the grid
- Bbox deduplication (value comparison before `setState`) prevents spurious memo invalidation
- Cell size: 0.5 km (zoom ≥12), 1 km (≥10), 2 km (≥8), 4 km (<8)
- Bbox padding: 20% on each side — grid edge stays offscreen during small pans without over-computing
- CSS opacity fade (0→1, 500ms ease) on new station data or metric switch

### Metrics

`lib/metrics.ts` is the single source of truth for all three visualizable metrics:
- `temperature` (°F), `humidity` (%), `windspeedmph` (mph)
- Each has `label`, `unit`, and color `stops` (value → hex)
- `METRICS` drives both the Legend gradient and the `valueToRgb` color mapping in `HeatmapCanvas`
- `METRIC_ORDER` defines tab order in the Legend

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
| `components/Map/HeatmapCanvas.tsx` | Canvas overlay heatmap; viewport tracking; multiply blend; fade animations |
| `components/Map/StationMarkers.tsx` | Circle layer + HeroUI Tooltip (off by default — see below) |
| `components/Map/Legend.tsx` | Full-width gradient bar; HeroUI Tabs for metric switching; 5 axis tick labels |
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

### Map style exploration (dark-v11 → light-v11 → dark-v11 → streets-v12)
Tried `light-v11` to get dark road lines against the heatmap. Didn't work — light-v11's white base washes out heatmap colors (vivid color × white = pastel). Reverted to `dark-v11`. Dark base kept heatmap vivid but gray roads had limited contrast. Eventually replaced entire approach with canvas overlay (see below).

### Mapbox slot exploration (`beforeId` → `slot: "middle"` → `slot: "top"` → `slot: "middle"`)
During the `HeatmapLayer` era:
- `beforeId: "road-motorway-trunk"` — failed; dark-v11 is Standard Style, individual layer IDs not exposed
- `slot: "middle"` — correct for Standard Style; documented as "above terrain, below roads and labels"
- `slot: "top"` — tried to improve road visibility; made things worse (heatmap above roads)
- Back to `slot: "middle"` — roads above at 100% opacity; but contrast still not great on dark base

### Mapbox fill layer → HTML canvas overlay (`HeatmapLayer` → `HeatmapCanvas`)
Core issue: Mapbox GL JS has no per-layer CSS `mix-blend-mode` equivalent in WebGL. The slot system only controls z-ordering, not color blending — so the heatmap always obscured or was obscured by map features rather than blending with them.

Solution: replaced `HeatmapLayer` (GeoJSON `Source` + `Layer`) with `HeatmapCanvas` — an HTML `<canvas>` absolutely positioned over the map with `mix-blend-mode: multiply` in CSS. Switched base style to `streets-v12` (cream/white base + dark charcoal roads) and desaturated it with `.mapboxgl-canvas { filter: grayscale(100%) }`. Result: roads show as clearly darker streaks through the vivid heatmap color; green forests and blue water no longer tint the overlay. Both map and heatmap are simultaneously sharp.

### GeoJSON → flat GridResult in IDW
Originally `interpolateTemperatures` returned a `FeatureCollection<Polygon>` — each cell was a GeoJSON polygon with a ring of 5 coordinate pairs. This was wasteful since `HeatmapCanvas` only needed the value and alpha per cell, not geometry. Replaced with `GridResult` (`cols`, `rows`, `cells[]`, geographic bounds). Eliminated all polygon ring construction and the `@turf/helpers` import.

### Smooth gradients via offscreen canvas scaling
The canvas overlay initially drew each IDW cell as a `fillRect`, producing visible grid lines and blocky tiles. Fixed by writing each cell as a single pixel into an `ImageData` buffer on a tiny offscreen canvas (`cols × rows` pixels), then scaling it up to screen size with `ctx.drawImage` + `imageSmoothingQuality: "high"`. The browser's bilinear interpolation smooths between cells automatically — no custom interpolation code needed.

### Legend: Pagination → Tabs, full-width, axis ticks
- Replaced HeroUI `Pagination` dots with labeled `Tabs` ("Temperature", "Wind", "Humidity")
- Card moved from bottom-right corner to full-width bottom bar; "Updated" chip stacks above it
- Removed hover tooltip interaction; replaced start/end labels with 5 evenly-spaced axis labels at 0/25/50/75/100% of the value range; 3 `bg-content1` tick marks divide the gradient bar visually into 4 sections; intermediate labels centered on their ticks

### Bbox padding reduction (0.5 → 0.2)
Original 50% padding on each side = 4× viewport area to compute. Reduced to 20% (2.25× viewport). Enough to cover small pans without recompute, while significantly reducing cell count.

### Low-zoom freeze fix
Discovered that at zoom 4 (USA view), the padded bbox at 4km cells = ~1.35M cells. All computed synchronously on the main thread even though heatmap was invisible (opacity = 0 below zoom 7). Fixed by setting `bbox = null` when `zoom < MIN_ZOOM` in `updateView`, plus a `MAX_CELLS = 20,000` hard cap in `interpolateTemperatures`.

### Raw zoom in useMemo deps (fixed)
`zoom` state changed on every `moveend` even within the same cell-size bucket (e.g., 12.1 → 12.2 → 12.3 all produce 0.5km cells). Replaced with `cellSize` state (the bucketed value) as the grid dep. `zoom` is still tracked separately for the `fill-opacity: 0` guard at `MIN_ZOOM`.

---

## Known Constraints & Trade-offs

- **Main-thread IDW**: Grid computation still runs synchronously on the main thread. For very dense station sets or large viewports near MIN_ZOOM, this could be slow. A Web Worker would be the right long-term fix.
- **Canvas overlay vs WebGL**: The canvas is rasterized by the browser compositor, not Mapbox's WebGL pipeline. This means it won't participate in Mapbox's 3D terrain, tilt, or custom projections. Fine for a flat 2D map.
