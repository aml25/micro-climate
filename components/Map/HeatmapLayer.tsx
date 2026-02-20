"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Source, Layer, useMap } from "react-map-gl/mapbox";
import type { FillLayerSpecification } from "react-map-gl/mapbox";
import { interpolateTemperatures } from "@/lib/interpolation/idw";
import type { PWSStation } from "@/types/weather";

// Hide heatmap when zoomed too far out — grid would be too coarse to be useful
const MIN_ZOOM = 7;
// Extend the computed grid beyond the visible viewport so edges never show during a pan
const BBOX_PADDING = 0.5; // 50% extra on each side → 2× viewport coverage

type Bbox = [number, number, number, number];

/** Coarser cells at lower zoom keeps computation fast; finer cells at high zoom look crisp */
function cellSizeKm(zoom: number): number {
  if (zoom >= 12) return 0.5;
  if (zoom >= 10) return 1;
  if (zoom >= 8) return 2;
  return 4;
}

const COLOR_RAMP: FillLayerSpecification["paint"] = {
  "fill-color": [
    "interpolate", ["linear"], ["get", "temperature"],
    35, "#00cfff",
    45, "#3a86ff",
    52, "#06d6a0",
    58, "#ffd166",
    65, "#ff9900",
    75, "#ef233c",
  ],
  "fill-outline-color": "rgba(0,0,0,0)",
};

interface HeatmapLayerProps {
  stations: PWSStation[];
}

export function HeatmapLayer({ stations }: HeatmapLayerProps) {
  const { current: map } = useMap();
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [zoom, setZoom] = useState(12);
  const [opacity, setOpacity] = useState(0);
  const fadeTimer = useRef<ReturnType<typeof setTimeout>>();

  /** Snapshot the current viewport (+ padding) and zoom level */
  const updateView = useCallback(() => {
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    const dLon = (bounds.getEast() - bounds.getWest()) * BBOX_PADDING;
    const dLat = (bounds.getNorth() - bounds.getSouth()) * BBOX_PADDING;
    setBbox([
      bounds.getWest() - dLon,
      bounds.getSouth() - dLat,
      bounds.getEast() + dLon,
      bounds.getNorth() + dLat,
    ]);
    setZoom(map.getZoom());
  }, [map]);

  // Seed initial viewport and recompute bbox whenever the map settles
  useEffect(() => {
    if (!map) return;
    updateView();
    map.on("moveend", updateView);
    return () => { map.off("moveend", updateView); };
  }, [map, updateView]);

  // Fade in whenever fresh station data arrives
  useEffect(() => {
    if (stations.length === 0) return;
    clearTimeout(fadeTimer.current);
    setOpacity(0);
    fadeTimer.current = setTimeout(() => setOpacity(0.65), 50);
    return () => clearTimeout(fadeTimer.current);
  }, [stations]);

  // Recompute grid when viewport or station data changes
  const grid = useMemo(() => {
    if (!bbox || stations.length === 0) return null;
    return interpolateTemperatures(stations, bbox, cellSizeKm(zoom));
  }, [stations, bbox, zoom]);

  // Only rebuild the layer spec when the animated opacity or zoom threshold changes.
  // Per-cell alpha (organic boundary) is stored on each feature and multiplied in.
  const fillLayer = useMemo<FillLayerSpecification>(() => ({
    id: "temperature-fill",
    type: "fill",
    source: "temperature-grid",
    paint: {
      ...COLOR_RAMP,
      "fill-opacity": zoom >= MIN_ZOOM
        ? ["*", opacity, ["get", "alpha"]] as unknown as number
        : 0,
      "fill-opacity-transition": { duration: 500 },
    },
  }), [opacity, zoom]);

  if (!grid) return null;

  return (
    <Source id="temperature-grid" type="geojson" data={grid}>
      <Layer {...fillLayer} />
    </Source>
  );
}
