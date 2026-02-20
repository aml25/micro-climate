# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**micro-climate** — A full-screen temperature heatmap using hyper-local data from the Synoptic Data weather station network. Geolocates the user on load, fetches nearby stations, and renders a smooth IDW-interpolated heatmap. Built with Next.js 16, HeroUI, and Mapbox GL JS.

## Dev Commands

```bash
npm run dev    # Start dev server (http://localhost:3000)
npm run build  # Production build
npm run lint   # ESLint check
```

## Architecture

### Data flow
1. Browser requests geolocation → `GeolocateControl` auto-triggers on map load
2. On fix: `onCoordsChange` → `page.tsx` sets `fetchCoords` → SWR fetches `/api/stations?lat=&lon=`
3. As user pans: `onMoveEnd` → `onMapCenter` → if moved >16 km, `fetchCoords` updates → new SWR fetch
4. SWR polls every 5 min to refresh station data for the current area

### Key files

- **`app/page.tsx`** — Client component; manages `fetchCoords` + `geoStatus` state; SWR polls `/api/stations`; renders full-screen map
- **`app/api/stations/route.ts`** — Proxy route; reads `lat`/`lon` query params (falls back to SF); fetches Synoptic API, filters outliers, returns `StationsResponse` JSON
- **`app/layout.tsx`** — Wraps app with `HeroUIProvider`
- **`lib/weather/synoptic.ts`** — Server-only Synoptic API client; fetches stations within 20-mile radius of given coords
- **`lib/weather/outliers.ts`** — Three-stage outlier filter: staleness (45 min), hard bounds (20–115°F), z-score (>2.5σ)
- **`lib/interpolation/idw.ts`** — IDW grid via `@turf/interpolate`; dynamic bbox + cell size; per-cell alpha for organic boundary fade (10–20 km from nearest station)
- **`lib/interpolation/point-idw.ts`** — Point-query IDW + nearest-station lookup + haversine distance (available for future use)
- **`components/Map/MapContainer.tsx`** — `react-map-gl` Map wrapper; `GeolocateControl` auto-triggers on load; `onMoveEnd` reports map center; initial view USA zoom-4, flies to user location
- **`components/Map/HeatmapLayer.tsx`** — Dynamic heatmap: listens to `moveend` to update viewport bbox; zoom-adaptive cell size (0.5–4 km); fade-in on new station data; organic boundary via per-cell alpha
- **`components/Map/StationMarkers.tsx`** — Circle layer + HeroUI Tooltip on hover
- **`types/weather.ts`** — Shared `PWSStation` and `StationsResponse` interfaces

## Environment Variables

Copy `.env.local.example` to `.env.local` and fill in real keys:

| Variable | Where used | Notes |
|---|---|---|
| `SYNOPTIC_API_TOKEN` | Server only (`lib/weather/synoptic.ts`) | No `NEXT_PUBLIC_` prefix — never exposed to browser |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Browser (`components/Map/MapContainer.tsx`) | Public token — safe to expose |

## Key Libraries

- **Next.js 16** with App Router + Turbopack
- **HeroUI 2** (`@heroui/react`) — configured via `tailwind.config.js` (CJS) + `@config` in `globals.css`
- **Tailwind CSS v4** — no `tailwind.config.ts`; config lives in `tailwind.config.js`
- **react-map-gl v8** — wraps `@vis.gl/react-mapbox`; import from `react-map-gl/mapbox`
- **@turf/interpolate** — IDW spatial interpolation grid
- **swr** — data fetching + polling

## Heatmap details

- Cell size adapts to zoom: 0.5 km (≥12), 1 km (≥10), 2 km (≥8), 4 km (<8); hidden below zoom 7
- Viewport bbox expanded 50% on each side so grid edge is never visible during a pan
- Per-cell `alpha` property: 1.0 within 10 km of nearest station, linear fade to 0 at 20 km
- `fill-opacity` expression: `["*", globalOpacity, ["get", "alpha"]]` — combines fade-in animation with organic boundary
- `fill-outline-color: rgba(0,0,0,0)` removes grid lines between cells

## Dynamic station fetching

- `REFETCH_DISTANCE_KM = 16` (~10 miles) — threshold to trigger a new API fetch when panning
- Fetch radius is 20 miles; threshold is half that, ensuring full coverage before edges thin out
- SWR `refreshInterval: 300000` (5 min) handles freshness at the current location
