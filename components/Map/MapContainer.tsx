"use client";

import { useRef, useCallback } from "react";
import Map, { MapProvider, GeolocateControl } from "react-map-gl/mapbox";
import type { MapRef } from "react-map-gl/mapbox";
import type { GeolocateControl as GeolocateControlType } from "mapbox-gl";
import "mapbox-gl/dist/mapbox-gl.css";
import type { PWSStation } from "@/types/weather";
import { HeatmapLayer } from "./HeatmapLayer";
import { StationMarkers } from "./StationMarkers";

const SF_FALLBACK = { lat: 37.773, lon: -122.431 };
const MAPBOX_STYLE = "mapbox://styles/mapbox/dark-v11";

interface MapContainerProps {
  stations: PWSStation[];
  onCoordsChange: (coords: { lat: number; lon: number }, status: "granted" | "denied") => void;
  onMapCenter: (lat: number, lon: number) => void;
}

export function MapContainer({ stations, onCoordsChange, onMapCenter }: MapContainerProps) {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN;
  const mapRef = useRef<MapRef>(null);
  const geoRef = useRef<GeolocateControlType>(null);

  const handleLoad = useCallback(() => {
    geoRef.current?.trigger();
  }, []);

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
              <HeatmapLayer stations={stations} />
              <StationMarkers stations={stations} />
            </>
          )}
        </Map>
      </MapProvider>
    </div>
  );
}
