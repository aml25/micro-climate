import type { PWSStation } from "@/types/weather";

const IDW_POWER = 2;

export function haversineKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.asin(Math.sqrt(a));
}

export interface NearestResult {
  station: PWSStation;
  distanceKm: number;
}

export interface IDWResult {
  tempF: number;
  humidity: number;
  windspeedmph: number;
}

export function nearestStation(lat: number, lon: number, stations: PWSStation[]): NearestResult {
  let best = stations[0];
  let bestDist = haversineKm(lat, lon, best.lat, best.lon);
  for (let i = 1; i < stations.length; i++) {
    const d = haversineKm(lat, lon, stations[i].lat, stations[i].lon);
    if (d < bestDist) {
      bestDist = d;
      best = stations[i];
    }
  }
  return { station: best, distanceKm: bestDist };
}

export function idwPoint(lat: number, lon: number, stations: PWSStation[]): IDWResult {
  // Exact hit: return the station's own values
  for (const s of stations) {
    if (haversineKm(lat, lon, s.lat, s.lon) < 0.001) {
      return { tempF: s.tempF, humidity: s.humidity, windspeedmph: s.windspeedmph };
    }
  }

  let wSum = 0, tempSum = 0, humSum = 0, windSum = 0;
  for (const s of stations) {
    const w = 1 / Math.pow(haversineKm(lat, lon, s.lat, s.lon), IDW_POWER);
    wSum += w;
    tempSum += w * s.tempF;
    humSum += w * s.humidity;
    windSum += w * s.windspeedmph;
  }

  return {
    tempF: tempSum / wSum,
    humidity: humSum / wSum,
    windspeedmph: windSum / wSum,
  };
}
