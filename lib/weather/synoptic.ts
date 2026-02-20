// Server-side only — do not import from client components
import type { PWSStation } from "@/types/weather";

const RADIUS_MILES = 20;
const WITHIN_MINUTES = 60;

// Synoptic response types
interface SynopticObservations {
  air_temp_value_1?: { value: number | null; date_time: string };
  relative_humidity_value_1?: { value: number | null; date_time: string };
  wind_speed_value_1?: { value: number | null; date_time: string };
}

interface SynopticStation {
  STID: string;
  NAME: string;
  LATITUDE: string;
  LONGITUDE: string;
  OBSERVATIONS: SynopticObservations;
}

interface SynopticResponse {
  STATION?: SynopticStation[];
  SUMMARY?: { RESPONSE_CODE: number; RESPONSE_MESSAGE: string };
}

export async function fetchSFStations(lat: number, lon: number): Promise<PWSStation[]> {
  const token = process.env.SYNOPTIC_API_TOKEN;
  if (!token || token === "your_token_here") {
    console.warn("SYNOPTIC_API_TOKEN not set — returning empty station list");
    return [];
  }

  const url = new URL("https://api.synopticdata.com/v2/stations/latest");
  url.searchParams.set("token", token);
  url.searchParams.set("radius", `${lat},${lon},${RADIUS_MILES}`);
  url.searchParams.set("within", String(WITHIN_MINUTES));
  url.searchParams.set("vars", "air_temp,relative_humidity,wind_speed");
  url.searchParams.set("units", "english"); // Fahrenheit, mph
  url.searchParams.set("output", "json");

  const res = await fetch(url.toString(), { next: { revalidate: 300 } });
  if (!res.ok) {
    throw new Error(`Synoptic API error: ${res.status} ${res.statusText}`);
  }

  const data: SynopticResponse = await res.json();

  if (data.SUMMARY?.RESPONSE_CODE !== 1) {
    throw new Error(
      `Synoptic API error: ${data.SUMMARY?.RESPONSE_MESSAGE ?? "unknown"}`
    );
  }

  const stations = data.STATION ?? [];

  return stations
    .filter((s) => {
      const temp = s.OBSERVATIONS.air_temp_value_1?.value;
      const lat = parseFloat(s.LATITUDE);
      const lon = parseFloat(s.LONGITUDE);
      return temp != null && !isNaN(lat) && !isNaN(lon);
    })
    .map((s): PWSStation => {
      const obs = s.OBSERVATIONS;
      const tempObs = obs.air_temp_value_1!;
      return {
        stationID: s.STID,
        lat: parseFloat(s.LATITUDE),
        lon: parseFloat(s.LONGITUDE),
        neighborhood: s.NAME,
        tempF: tempObs.value!,
        humidity: obs.relative_humidity_value_1?.value ?? 0,
        windspeedmph: obs.wind_speed_value_1?.value ?? 0,
        lastUpdateTime: tempObs.date_time,
        isOutlier: false,
      };
    });
}
