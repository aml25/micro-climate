"use client";

import { useRef, useCallback, useEffect, useState } from "react";
import Map, { MapProvider, GeolocateControl } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import type { GeolocateControl as GeolocateControlType } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { PWSStation } from "@/types/weather";
import type { Metric } from "@/lib/metrics";
import { HeatmapCanvas } from "./HeatmapCanvas";
import { StationMarkers } from "./StationMarkers";

const SF_FALLBACK = { lat: 37.773, lon: -122.431 };
const MAPBOX_STYLE = "mapbox://styles/mapbox/streets-v12";

// Set to true to show individual station markers on the map.
// Can also be toggled at runtime via the browser console: __showStationMarkers(true)
const SHOW_STATION_MARKERS = false;

interface MapContainerProps {
  stations: PWSStation[];
  activeMetric: Metric;
  onCoordsChange: (coords: { lat: number; lon: number }, status: "granted" | "denied") => void;
  onMapCenter: (lat: number, lon: number) => void;
  onInteractionStart?: () => void;
}

export function MapContainer({ stations, activeMetric, onCoordsChange, onMapCenter, onInteractionStart }: MapContainerProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapRef = useRef<MapRef>(null);
  const geoRef = useRef<GeolocateControlType>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [showMarkers, setShowMarkers] = useState(SHOW_STATION_MARKERS);

  useEffect(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (window as any).__showStationMarkers = (val: boolean) => setShowMarkers(val);
  }, []);

  const handleLoad = useCallback(() => {
    geoRef.current?.trigger();
    setMapLoaded(true);
  }, []);

  // Use the native Mapbox movestart event — it includes originalEvent for user
  // interactions (mouse/touch/wheel) but not for programmatic moves (flyTo, easeTo)
  useEffect(() => {
    if (!mapLoaded || !mapRef.current) return;
    const nativeMap = mapRef.current.getMap();
    if (!nativeMap) return;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const handler = (e: any) => {
      if (e?.originalEvent) onInteractionStart?.();
    };
    nativeMap.on("movestart", handler);
    return () => { nativeMap.off("movestart", handler); };
  }, [mapLoaded, onInteractionStart]);

  const handleGeolocate = useCallback(
    (e: { coords: GeolocationCoordinates }) => {
      const coords = { lat: e.coords.latitude, lon: e.coords.longitude };
      onCoordsChange(coords, "granted");
    },
    [onCoordsChange]
  );

  const handleError = useCallback(() => {
    onCoordsChange(SF_FALLBACK, "denied");
    mapRef.current?.flyTo({
      center: [SF_FALLBACK.lon, SF_FALLBACK.lat],
      zoom: 12,
      duration: 1500,
    });
  }, [onCoordsChange]);

  const handleMoveEnd = useCallback(() => {
    if (mapRef.current) {
      const { lat, lng } = mapRef.current.getCenter();
      onMapCenter(lat, lng);
    }
  }, [onMapCenter]);

  return (
    <div style={{ position: "relative", width: "100%", height: "100%" }}>
      <MapProvider>
        <Map
          id="sfMap"
          ref={mapRef}
          mapboxAccessToken={token}
          initialViewState={{
            longitude: -98,
            latitude: 39,
            zoom: 4,
          }}
          style={{ width: "100%", height: "100%" }}
          mapStyle={MAPBOX_STYLE}
          interactiveLayerIds={["station-circles"]}
          onLoad={handleLoad}
          onMoveEnd={handleMoveEnd}
        >
          <GeolocateControl
            ref={geoRef}
            positionOptions={{ enableHighAccuracy: true }}
            trackUserLocation={false}
            showAccuracyCircle={true}
            onGeolocate={handleGeolocate}
            onError={handleError}
            position="top-right"
          />
          {stations.length > 0 && (
            <>
              <HeatmapCanvas stations={stations} activeMetric={activeMetric} />
              {showMarkers && <StationMarkers stations={stations} />}
            </>
          )}
        </Map>
      </MapProvider>
    </div>
  );
}
