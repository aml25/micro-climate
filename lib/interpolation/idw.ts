import { featureCollection } from "@turf/helpers";
import type { FeatureCollection, Polygon, GeoJsonProperties } from "geojson";
import type { PWSStation } from "@/types/weather";

// SF bounding box
export const SF_BBOX: [number, number, number, number] = [
  -122.517, // west
  37.708,   // south
  -122.355, // east
  37.834,   // north
];

// Heatmap cells fade from fully opaque → invisible over this distance band
const FADE_START_KM = 10;
const FADE_END_KM = 20;

// Flat-earth approximation: 1° lat ≈ 111.32 km (accurate to <0.3% at mid-latitudes)
const KM_PER_DEG = 111.32;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export function interpolateTemperatures(
  stations: PWSStation[],
  bbox: [number, number, number, number] = SF_BBOX,
  cellSizeKm = 0.5,
): FeatureCollection<Polygon, GeoJsonProperties> {
  if (stations.length === 0) {
    return featureCollection([]) as FeatureCollection<Polygon, GeoJsonProperties>;
  }

  const [west, south, east, north] = bbox;

  // Safety cap — bail out before touching every cell of a massive viewport
  const MAX_CELLS = 20_000;
  const midLatEst = (south + north) / 2;
  const cosLatEst = Math.cos((midLatEst * Math.PI) / 180);
  const estLonCells = Math.ceil((east - west) / (cellSizeKm / (KM_PER_DEG * cosLatEst)));
  const estLatCells = Math.ceil((north - south) / (cellSizeKm / KM_PER_DEG));
  if (estLonCells * estLatCells > MAX_CELLS) {
    return featureCollection([]) as FeatureCollection<Polygon, GeoJsonProperties>;
  }

  // Precompute cosLat once for flat-earth lon→km conversion
  const midLat = (south + north) / 2;
  const cosLat = Math.cos((midLat * Math.PI) / 180);

  // Grid step sizes in degrees
  const dLat = cellSizeKm / KM_PER_DEG;
  const dLon = cellSizeKm / (KM_PER_DEG * cosLat);
  const hLat = dLat / 2;
  const hLon = dLon / 2;

  // Precompute station positions scaled to km (avoids repeated multiply in inner loop)
  const sLat = stations.map((s) => s.lat * KM_PER_DEG);
  const sLon = stations.map((s) => s.lon * cosLat * KM_PER_DEG);

  const features = [];
  const n = stations.length;

  for (let cy = south + hLat; cy < north; cy += dLat) {
    const cyKm = cy * KM_PER_DEG;

    for (let cx = west + hLon; cx < east; cx += dLon) {
      const cxKm = cx * cosLat * KM_PER_DEG;

      // Single pass: compute IDW weights + nearest-station distance simultaneously
      let wSum = 0, tempSum = 0, humSum = 0, windSum = 0;
      let minDist2 = Infinity;
      let exactIdx = -1;

      for (let i = 0; i < n; i++) {
        const dy = cyKm - sLat[i];
        const dx = cxKm - sLon[i];
        const d2 = dx * dx + dy * dy;

        if (d2 < 1e-6) { // within ~1m — treat as exact hit
          exactIdx = i;
          minDist2 = 0;
          break;
        }

        if (d2 < minDist2) minDist2 = d2;

        // IDW power = 2: weight = 1/d², d² already computed, no sqrt needed
        const w = 1 / d2;
        wSum += w;
        tempSum += w * stations[i].tempF;
        humSum  += w * stations[i].humidity;
        windSum += w * stations[i].windspeedmph;
      }

      // One sqrt per cell (not per station) for the alpha boundary fade
      const minDistKm = exactIdx >= 0 ? 0 : Math.sqrt(minDist2);
      const alpha =
        minDistKm <= FADE_START_KM ? 1.0
        : minDistKm >= FADE_END_KM ? 0.0
        : 1.0 - (minDistKm - FADE_START_KM) / (FADE_END_KM - FADE_START_KM);

      if (alpha === 0) continue;

      const temperature  = exactIdx >= 0 ? stations[exactIdx].tempF        : tempSum / wSum;
      const humidity     = exactIdx >= 0 ? stations[exactIdx].humidity      : humSum  / wSum;
      const windspeedmph = exactIdx >= 0 ? stations[exactIdx].windspeedmph  : windSum / wSum;

      const ring = [
        [cx - hLon, cy - hLat],
        [cx + hLon, cy - hLat],
        [cx + hLon, cy + hLat],
        [cx - hLon, cy + hLat],
        [cx - hLon, cy - hLat],
      ];

      features.push({
        type: "Feature" as const,
        geometry: { type: "Polygon" as const, coordinates: [ring] },
        properties: { temperature, humidity, windspeedmph, alpha },
      });
    }
  }

  return featureCollection(features) as FeatureCollection<Polygon, GeoJsonProperties>;
}
