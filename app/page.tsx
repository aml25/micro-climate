"use client";

import { useState, useCallback, useRef } from "react";
import useSWR from "swr";
import dynamic from "next/dynamic";
import { Spinner, Chip } from "@heroui/react";
import type { StationsResponse } from "@/types/weather";
import type { Metric } from "@/lib/metrics";
import { haversineKm } from "@/lib/interpolation/point-idw";
import { Legend } from "@/components/Map/Legend";

// Mapbox requires a browser environment — load dynamically with no SSR
const MapContainer = dynamic(
  () => import("@/components/Map/MapContainer").then((m) => m.MapContainer),
  { ssr: false }
);

const POLL_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
// Trigger a new station fetch when the map center moves more than half the fetch radius
const REFETCH_DISTANCE_KM = 16; // ~10 miles (fetch radius is 20 miles)

export default function HomePage() {
  const [fetchCoords, setFetchCoords] = useState<{ lat: number; lon: number } | null>(null);
  const [geoStatus, setGeoStatus] = useState<"pending" | "granted" | "denied">("pending");
  const [activeMetric, setActiveMetric] = useState<Metric>("temperature");

  const abortControllerRef = useRef<AbortController | null>(null);
  const isInteractingRef = useRef(false);

  const fetcher = useCallback(async (url: string): Promise<StationsResponse> => {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return res.json();
  }, []);

  // Called by GeolocateControl on first fix — seeds the initial fetch location
  const handleCoordsChange = useCallback(
    (coords: { lat: number; lon: number }, status: "granted" | "denied") => {
      setFetchCoords(coords);
      setGeoStatus(status);
    },
    []
  );

  // Abort the in-flight request immediately when the user starts panning
  const handleInteractionStart = useCallback(() => {
    isInteractingRef.current = true;
    abortControllerRef.current?.abort();
  }, []);

  // Called once when the map settles (moveend) — fetch immediately if center moved enough
  const handleMapCenter = useCallback((lat: number, lon: number) => {
    isInteractingRef.current = false;
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
    isPaused: () => isInteractingRef.current,
  });

  const stations = data?.stations ?? [];
  const fetchedAt = data?.fetchedAt;

  return (
    <div className="relative w-screen h-screen">
      <MapContainer
        stations={stations}
        activeMetric={activeMetric}
        onCoordsChange={handleCoordsChange}
        onMapCenter={handleMapCenter}
        onInteractionStart={handleInteractionStart}
      />

      {/* Locating chip */}
      {geoStatus === "pending" && (
        <div className="absolute top-3 left-3 z-20">
          <Chip color="default" variant="flat" size="sm">
            Locating you…
          </Chip>
        </div>
      )}

      {/* Loading overlay */}
      {isLoading && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/40">
          <Spinner size="lg" color="white" />
        </div>
      )}

      {/* Error badge */}
      {error && (
        <div className="absolute top-3 right-3 z-20">
          <Chip color="danger" variant="solid">
            Failed to load station data
          </Chip>
        </div>
      )}

      {/* Bottom bar: "Updated" chip stacked above full-width legend card */}
      <div className="absolute bottom-0 inset-x-0 z-20 flex flex-col items-start gap-2 p-3 pointer-events-none">
        {fetchedAt && (
          <div className="pointer-events-auto">
            <Chip color="default" variant="flat" size="sm">
              Updated {new Date(fetchedAt).toLocaleTimeString()}
            </Chip>
          </div>
        )}
        <div className="w-full pointer-events-auto">
          <Legend activeMetric={activeMetric} onMetricChange={setActiveMetric} />
        </div>
      </div>
    </div>
  );
}
