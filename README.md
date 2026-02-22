# micro-climate

A full-screen weather heatmap powered by hyper-local data from the [Synoptic Data](https://synopticdata.com/) personal weather station network. Opens on your location, shows real-time readings from nearby stations, and renders a smooth color overlay for temperature, humidity, or wind speed. The overlay uses a canvas layer with CSS `mix-blend-mode: multiply` over a grayscale street map — roads appear as dark streaks through vivid heatmap colors without either washing out.

## Getting Started

### 1. Get API keys

You need two keys:

| Key | Where to get it |
|---|---|
| `SYNOPTIC_API_TOKEN` | [Synoptic Data](https://synopticdata.com/) — free tier available |
| `NEXT_PUBLIC_MAPBOX_TOKEN` | [Mapbox](https://account.mapbox.com/access-tokens/) — free tier available |

### 2. Configure environment

```bash
cp .env.local.example .env.local
```

Fill in both keys in `.env.local`.

### 3. Install and run

```bash
npm install
npm run dev     # http://localhost:3000
```

## Usage

- **On load** — the browser requests your location. Grant it and the map flies to you and loads nearby stations. Deny it and the map falls back to San Francisco.
- **Pan/zoom** — the heatmap recomputes as you move. When you pan more than ~10 miles from the last fetch point, new stations are loaded automatically.
- **Metric switcher** — use the tabs in the legend bar (bottom of screen) to switch between temperature, humidity, and wind speed.
- **Station markers** — off by default. Enable in the browser console: `__showStationMarkers(true)`

## Build & Lint

```bash
npm run build   # Production build + TypeScript check
npm run lint    # ESLint
```

## API

### `GET /api/stations?lat={lat}&lon={lon}`

Fetches weather stations within 20 miles of the given coordinates, with outliers removed.

Falls back to SF (`37.773, -122.431`) if params are absent.

**Response:**
```json
{
  "stations": [
    {
      "stationID": "KSFOFRAN123",
      "lat": 37.77,
      "lon": -122.43,
      "neighborhood": "Mission District",
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

## Stack

- **Next.js 16** (App Router, Turbopack)
- **TypeScript**
- **Tailwind CSS v4** + **HeroUI 2**
- **react-map-gl v8** / **Mapbox GL JS**
- **SWR** — data fetching + polling
