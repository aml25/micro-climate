"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { Source, Layer, useMap } from "react-map-gl/mapbox";
import type { FillLayerSpecification } from "react-map-gl/mapbox";
import { interpolateTemperatures } from "@/lib/interpolation/idw";
import { METRICS, METRIC_ORDER } from "@/lib/metrics";
import type { Metric } from "@/lib/metrics";
import type { PWSStation } from "@/types/weather";

// Hide heatmap when zoomed too far out — grid would be too coarse to be useful
const MIN_ZOOM = 7;
// Extend the computed grid beyond the visible viewport so edges don't clip during small pans
const BBOX_PADDING = 0.2; // 20% extra on each side

type Bbox = [number, number, number, number];

/** Coarser cells at lower zoom keeps computation fast; finer cells at high zoom look crisp */
function cellSizeKm(zoom: number): number {
  if (zoom >= 12) return 0.5;
  if (zoom >= 10) return 1;
  if (zoom >= 8)  return 2;
  return 4;
}

interface HeatmapLayerProps {
  stations: PWSStation[];
  activeMetric: Metric;
}

export function HeatmapLayer({ stations, activeMetric }: HeatmapLayerProps) {
  const { current: map } = useMap();
  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [zoom, setZoom] = useState(12);
  // Track the bucketed cell size separately — zoom within the same bucket won't retrigger the grid
  const [cellSize, setCellSize] = useState(0.5);
  const [opacity, setOpacity] = useState(0);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  /** Snapshot the current viewport (+ padding) and zoom level */
  const updateView = useCallback(() => {
    if (!map) return;
    const bounds = map.getBounds();
    if (!bounds) return;
    const dLon = (bounds.getEast() - bounds.getWest()) * BBOX_PADDING;
    const dLat = (bounds.getNorth() - bounds.getSouth()) * BBOX_PADDING;
    const next: Bbox = [
      bounds.getWest() - dLon,
      bounds.getSouth() - dLat,
      bounds.getEast() + dLon,
      bounds.getNorth() + dLat,
    ];
    const nextZoom = map.getZoom();
    const nextSize = cellSizeKm(nextZoom);

    // Below MIN_ZOOM the heatmap is invisible — skip computation entirely
    if (nextZoom < MIN_ZOOM) {
      setBbox(null);
      setZoom(nextZoom);
      return;
    }

    // Only update bbox state when it actually changes — avoids spurious grid recomputes
    setBbox((prev) => {
      if (
        prev &&
        Math.abs(prev[0] - next[0]) < 0.001 &&
        Math.abs(prev[1] - next[1]) < 0.001 &&
        Math.abs(prev[2] - next[2]) < 0.001 &&
        Math.abs(prev[3] - next[3]) < 0.001
      ) {
        return prev;
      }
      return next;
    });

    setZoom((prev) => (prev === nextZoom ? prev : nextZoom));
    setCellSize((prev) => (prev === nextSize ? prev : nextSize));
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

  // Also fade when metric switches so the new ramp feels intentional
  useEffect(() => {
    clearTimeout(fadeTimer.current);
    setOpacity(0);
    fadeTimer.current = setTimeout(() => setOpacity(0.65), 50);
    return () => clearTimeout(fadeTimer.current);
  }, [activeMetric]);

  // Recompute grid only when bbox, station data, or cell-size BUCKET changes
  const grid = useMemo(() => {
    if (!bbox || stations.length === 0) return null;
    return interpolateTemperatures(stations, bbox, cellSize);
  }, [stations, bbox, cellSize]);

  // Rebuild fill-color and opacity when metric or opacity changes (no grid recompute)
  const fillLayer = useMemo<FillLayerSpecification>(() => {
    const { stops } = METRICS[activeMetric];
    const fillColor = [
      "interpolate", ["linear"], ["get", activeMetric],
      ...stops.flatMap((s) => [s.value, s.color]),
    ];
    return {
      id: "temperature-fill",
      type: "fill",
      source: "temperature-grid",
      // Standard Style slot: "middle" sits below roads and labels.
      // With light-v11, roads are dark charcoal and render at full opacity on top
      // of the heatmap — no contrast issues.
      slot: "middle",
      paint: {
        "fill-color": fillColor as unknown as NonNullable<FillLayerSpecification["paint"]>["fill-color"],
        "fill-outline-color": "rgba(0,0,0,0)",
        "fill-opacity": zoom >= MIN_ZOOM
          ? ["*", opacity, ["get", "alpha"]] as unknown as number
          : 0,
        "fill-opacity-transition": { duration: 500 },
      },
    } as unknown as FillLayerSpecification;
  }, [activeMetric, opacity, zoom]);

  if (!grid) return null;

  // Validate that activeMetric is a known key to keep TS happy
  void METRIC_ORDER;

  return (
    <Source id="temperature-grid" type="geojson" data={grid}>
      <Layer {...fillLayer} />
    </Source>
  );
}
