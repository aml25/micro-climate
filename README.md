# micro-climate

A full-screen temperature heatmap using hyper-local data from the [Synoptic Data](https://synopticdata.com/) weather station network. The map centers on your location, displays real-time readings from nearby personal weather stations, and renders a smooth IDW-interpolated temperature overlay.

## Features

- **Geolocation** — auto-centers on the user's location on load; falls back to SF if denied
- **Live station data** — fetches stations within a 20-mile radius via the Synoptic API; refreshes every 5 minutes
- **Dynamic station loading** — re-fetches stations as you pan, keeping coverage centered on the current map view
- **IDW heatmap** — Inverse Distance Weighting interpolation rendered as a smooth fill layer; cell size adapts to zoom level
- **Organic boundary** — the heatmap fades out beyond ~10–20 km from any real station, avoiding misleading extrapolation
- **Station markers** — hover any station dot for ID, neighborhood, temperature, and last-updated time

## Stack

- **Next.js 16** (App Router, Turbopack)
- **TypeScript**
- **Tailwind CSS v4** + **HeroUI 2**
- **react-map-gl v8** / **Mapbox GL JS** — map rendering
- **@turf/interpolate** — IDW spatial interpolation grid
- **SWR** — data fetching + polling

## Getting Started

```bash
cp .env.local.example .env.local   # fill in your API keys
npm install
npm run dev                         # http://localhost:3000
```

## Environment Variables

| Variable | Where used | Notes |
|---|---|---|
| `SYNOPTIC_API_TOKEN` | Server only (`lib/weather/synoptic.ts`) | No `NEXT_PUBLIC_` prefix — never exposed to browser |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | Browser (`components/Map/MapContainer.tsx`) | Public token — safe to expose |

## Dev Commands

```bash
npm run dev    # Start dev server with Turbopack
npm run build  # Production build + type check
npm run lint   # ESLint
```

## API

### `GET /api/stations?lat={lat}&lon={lon}`

Returns weather stations within 20 miles of the given coordinates, with outliers filtered out.

Falls back to SF (`37.773, -122.431`) if `lat`/`lon` are absent.

**Response** — `StationsResponse`:
```json
{
  "stations": [
    {
      "stationID": "...",
      "lat": 37.77,
      "lon": -122.43,
      "neighborhood": "...",
      "tempF": 62.1,
      "humidity": 74.0,
      "windspeedmph": 8.2,
      "lastUpdateTime": "2025-01-01T00:00:00Z",
      "isOutlier": false
    }
  ],
  "fetchedAt": "2025-01-01T00:00:00Z"
}
```
