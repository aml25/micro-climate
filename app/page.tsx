"use client";

import { useState, useCallback } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import { Spinner, Chip } from "@heroui/react";
import type { StationsResponse } from "@/types/weather";
import { haversineKm } from "@/lib/interpolation/point-idw";

// Mapbox requires a browser environment — load dynamically with no SSR
const MapContainer = dynamic(
  () => import("@/components/Map/MapContainer").then((m) => m.MapContainer),
  { ssr: false }
);

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// Trigger a new station fetch when the map center moves more than half the fetch radius
const REFETCH_DISTANCE_KM = 16; // ~10 miles (fetch radius is 20 miles)

async function fetcher(url: string): Promise<StationsResponse> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

export default function HomePage() {
  const [fetchCoords, setFetchCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"pending" | "granted" | "denied">("pending");

  // Called by GeolocateControl on first fix — seeds the initial fetch location
  const handleCoordsChange = useCallback(
    (coords: { lat: number; lon: number }, status: "granted" | "denied") => {
      setFetchCoords(coords);
      setGeoStatus(status);
    },
    []
  );

  // Called by MapContainer on every onMoveEnd — refetches if the center has moved far enough
  const handleMapCenter = useCallback((lat: number, lon: number) => {
    setFetchCoords((prev) => {
      if (!prev) return prev;
      return haversineKm(prev.lat, prev.lon, lat, lon) > REFETCH_DISTANCE_KM
        ? { lat, lon }
        : prev;
    });
  }, []);

  const swrKey = fetchCoords
    ? `/api/stations?lat=${fetchCoords.lat}&lon=${fetchCoords.lon}`
    : null;

  const { data, error, isLoading } = useSWR<StationsResponse>(swrKey, fetcher, {
    refreshInterval: POLL_INTERVAL_MS,
  });

  const stations = data?.stations ?? [];
  const fetchedAt = data?.fetchedAt;

  return (
    <div style={{ width: "100vw", height: "100vh", position: "relative" }}>
      <MapContainer
        stations={stations}
        onCoordsChange={handleCoordsChange}
        onMapCenter={handleMapCenter}
      />

      {/* Locating chip */}
      {geoStatus === "pending" && (
        <div style={{ position: "absolute", top: 12, left: 12, zIndex: 20 }}>
          <Chip color="default" variant="flat" size="sm">
            Locating you…
          </Chip>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "rgba(0,0,0,0.4)",
            zIndex: 20,
          }}
        >
          <Spinner size="lg" color="white" />
        </div>
      )}

      {/* Error badge */}
      {error && (
        <div style={{ position: "absolute", top: 12, right: 12, zIndex: 20 }}>
          <Chip color="danger" variant="solid">
            Failed to load station data
          </Chip>
        </div>
      )}

      {/* Last-updated chip */}
      {fetchedAt && (
        <div style={{ position: "absolute", bottom: 24, left: 12, zIndex: 20 }}>
          <Chip color="default" variant="flat" size="sm">
            Updated {new Date(fetchedAt).toLocaleTimeString()}
          </Chip>
        </div>
      )}
    </div>
  );
}
