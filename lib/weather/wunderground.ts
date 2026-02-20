// Server-side only — do not import from client components
import type { PWSStation } from "@/types/weather";

// SF center for the WU geocode query
const SF_LAT = 37.773;
const SF_LON = -122.431;
const RADIUS_MILES = 20;

interface WUObservation {
  stationID: string;
  lat: number;
  lon: number;
  neighborhood: string;
  humidity: number | null;
  imperial?: {
    temp: number | null;
    windSpeed: number | null;
  };
  obsTimeUtc: string;
}

interface WUResponse {
  observations?: WUObservation[];
}

export async function fetchSFStations(): Promise<PWSStation[]> {
  const apiKey = process.env.WEATHER_UNDERGROUND_API_KEY;
  if (!apiKey || apiKey === "your_key_here") {
    console.warn("WEATHER_UNDERGROUND_API_KEY not set — returning empty station list");
    return [];
  }

  const url = new URL(
    "https://api.weather.com/v2/pws/observations/all/1day/summary"
  );
  url.searchParams.set("geocode", `${SF_LAT},${SF_LON}`);
  url.searchParams.set("radius", String(RADIUS_MILES));
  url.searchParams.set("units", "e");
  url.searchParams.set("apiKey", apiKey);
  url.searchParams.set("format", "json");

  const res = await fetch(url.toString(), { next: { revalidate: 300 } });
  if (!res.ok) {
    throw new Error(`WU API error: ${res.status} ${res.statusText}`);
  }

  const data: WUResponse = await res.json();
  const observations = data.observations ?? [];

  return observations
    .filter((obs) => {
      return (
        obs.lat != null &&
        obs.lon != null &&
        obs.imperial?.temp != null
      );
    })
    .map((obs): PWSStation => ({
      stationID: obs.stationID,
      lat: obs.lat,
      lon: obs.lon,
      neighborhood: obs.neighborhood ?? "",
      tempF: obs.imperial!.temp!,
      humidity: obs.humidity ?? 0,
      windspeedmph: obs.imperial?.windSpeed ?? 0,
      lastUpdateTime: obs.obsTimeUtc,
      isOutlier: false,
    }));
}
