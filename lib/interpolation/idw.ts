import interpolate from "@turf/interpolate";
import { featureCollection, point } from "@turf/helpers";
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

function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

function nearestDistKm(lat: number, lon: number, stations: PWSStation[]): number {
  let min = Infinity;
  for (const s of stations) {
    const d = haversineKm(lat, lon, s.lat, s.lon);
    if (d < min) min = d;
  }
  return min;
}

export function interpolateTemperatures(
  stations: PWSStation[],
  bbox: [number, number, number, number] = SF_BBOX,
  cellSizeKm = 0.5,
): FeatureCollection<Polygon, GeoJsonProperties> {
  if (stations.length === 0) {
    return featureCollection([]) as FeatureCollection<Polygon, GeoJsonProperties>;
  }

  const points = featureCollection(
    stations.map((s) =>
      point([s.lon, s.lat], { temperature: s.tempF })
    )
  );

  const grid = interpolate(points, cellSizeKm, {
    gridType: "square",
    property: "temperature",
    bbox,
    units: "kilometers",
    weight: 3,
  });

  // For each cell, compute alpha based on distance to nearest station.
  // This creates an organic boundary that hugs the actual station coverage
  // rather than filling the full rectangular grid.
  const featuresWithAlpha = grid.features
    .map((f) => {
      const coords = f.geometry.coordinates[0];
      // Centroid of square cell = midpoint of opposite corners
      const cx = (coords[0][0] + coords[2][0]) / 2;
      const cy = (coords[0][1] + coords[2][1]) / 2;
      const dist = nearestDistKm(cy, cx, stations);
      const alpha =
        dist <= FADE_START_KM ? 1.0
        : dist >= FADE_END_KM ? 0.0
        : 1.0 - (dist - FADE_START_KM) / (FADE_END_KM - FADE_START_KM);
      return { ...f, properties: { ...f.properties, alpha } };
    })
    .filter((f) => (f.properties?.alpha ?? 0) > 0);

  return featureCollection(featuresWithAlpha) as FeatureCollection<Polygon, GeoJsonProperties>;
}
