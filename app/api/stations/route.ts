import { NextResponse } from "next/server";
import { fetchSFStations } from "@/lib/weather/synoptic";
import { filterOutliers } from "@/lib/weather/outliers";
import type { StationsResponse } from "@/types/weather";

const SF_LAT = 37.773;
const SF_LON = -122.431;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get("lat") ?? "") || SF_LAT;
  const lon = parseFloat(searchParams.get("lon") ?? "") || SF_LON;

  try {
    const raw = await fetchSFStations(lat, lon);
    const stations = filterOutliers(raw).filter((s) => !s.isOutlier);

    const body: StationsResponse = {
      stations,
      fetchedAt: new Date().toISOString(),
    };

    return NextResponse.json(body, {
      headers: {
        "Cache-Control": "s-maxage=300, stale-while-revalidate=60",
      },
    });
  } catch (err) {
    console.error("Failed to fetch stations:", err);
    return NextResponse.json(
      { error: "Failed to fetch station data" },
      { status: 502 }
    );
  }
}
