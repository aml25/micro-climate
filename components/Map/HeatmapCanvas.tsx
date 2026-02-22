"use client";

import { useMemo, useState, useEffect, useCallback, useRef } from "react";
import { useMap } from "react-map-gl/mapbox";
import { interpolateTemperatures } from "@/lib/interpolation/idw";
import { METRICS } from "@/lib/metrics";
import type { Metric, MetricStop } from "@/lib/metrics";
import type { PWSStation } from "@/types/weather";
import type { GridResult } from "@/lib/interpolation/idw";

const MIN_ZOOM = 7;
const BBOX_PADDING = 0.2;

type Bbox = [number, number, number, number];

function cellSizeKm(zoom: number): number {
  if (zoom >= 12) return 0.5;
  if (zoom >= 10) return 1;
  if (zoom >= 8)  return 2;
  return 4;
}

function hexToRgb(hex: string): [number, number, number] {
  return [
    parseInt(hex.slice(1, 3), 16),
    parseInt(hex.slice(3, 5), 16),
    parseInt(hex.slice(5, 7), 16),
  ];
}

function valueToRgb(value: number, stops: MetricStop[]): [number, number, number] {
  if (value <= stops[0].value) return hexToRgb(stops[0].color);
  const last = stops[stops.length - 1];
  if (value >= last.value) return hexToRgb(last.color);
  for (let i = 0; i < stops.length - 1; i++) {
    if (value >= stops[i].value && value <= stops[i + 1].value) {
      const t = (value - stops[i].value) / (stops[i + 1].value - stops[i].value);
      const [r1, g1, b1] = hexToRgb(stops[i].color);
      const [r2, g2, b2] = hexToRgb(stops[i + 1].color);
      return [
        Math.round(r1 + t * (r2 - r1)),
        Math.round(g1 + t * (g2 - g1)),
        Math.round(b1 + t * (b2 - b1)),
      ];
    }
  }
  return hexToRgb(last.color);
}

interface HeatmapCanvasProps {
  stations: PWSStation[];
  activeMetric: Metric;
}

export function HeatmapCanvas({ stations, activeMetric }: HeatmapCanvasProps) {
  const { current: map } = useMap();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);

  const [bbox, setBbox] = useState<Bbox | null>(null);
  const [zoom, setZoom] = useState(12);
  const [cellSize, setCellSize] = useState(0.5);
  const [opacity, setOpacity] = useState(0);
  const fadeTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // Refs let the stable renderFrame function always read the latest values
  // without needing to be recreated (which would re-register map event listeners)
  const gridRef = useRef<GridResult | null>(null);
  const activeMetricRef = useRef(activeMetric);
  const zoomRef = useRef(zoom);
  useEffect(() => { activeMetricRef.current = activeMetric; }, [activeMetric]);
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);

  /** Snapshot viewport bbox and zoom; skip below MIN_ZOOM */
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

    if (nextZoom < MIN_ZOOM) {
      setBbox(null);
      setZoom(nextZoom);
      return;
    }

    setBbox((prev) => {
      if (
        prev &&
        Math.abs(prev[0] - next[0]) < 0.001 &&
        Math.abs(prev[1] - next[1]) < 0.001 &&
        Math.abs(prev[2] - next[2]) < 0.001 &&
        Math.abs(prev[3] - next[3]) < 0.001
      ) return prev;
      return next;
    });
    setZoom((prev) => (prev === nextZoom ? prev : nextZoom));
    setCellSize((prev) => (prev === nextSize ? prev : nextSize));
  }, [map]);

  useEffect(() => {
    if (!map) return;
    updateView();
    map.on("moveend", updateView);
    return () => { map.off("moveend", updateView); };
  }, [map, updateView]);

  // IDW grid — only recomputes when bbox, stations, or cell-size bucket changes
  const grid = useMemo(() => {
    if (!bbox || stations.length === 0) return null;
    return interpolateTemperatures(stations, bbox, cellSize);
  }, [stations, bbox, cellSize]);

  useEffect(() => { gridRef.current = grid; }, [grid]);

  // Fade in on new station data
  useEffect(() => {
    if (stations.length === 0) return;
    clearTimeout(fadeTimer.current);
    setOpacity(0);
    fadeTimer.current = setTimeout(() => setOpacity(1), 50);
    return () => clearTimeout(fadeTimer.current);
  }, [stations]);

  // Fade when metric switches
  useEffect(() => {
    clearTimeout(fadeTimer.current);
    setOpacity(0);
    fadeTimer.current = setTimeout(() => setOpacity(1), 50);
    return () => clearTimeout(fadeTimer.current);
  }, [activeMetric]);

  /**
   * Draws the current grid onto the canvas using an offscreen canvas scaled up
   * with imageSmoothingEnabled — each IDW cell is one pixel on the offscreen
   * canvas; bilinear scaling produces smooth gradients with no grid lines.
   *
   * Reads grid/metric/zoom from refs so this function never needs to be
   * recreated — stable identity means map listeners aren't re-registered.
   */
  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !map) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas physical size to the Mapbox GL canvas (handles DPR)
    const mapCanvas = map.getCanvas();
    if (canvas.width !== mapCanvas.width || canvas.height !== mapCanvas.height) {
      canvas.width = mapCanvas.width;
      canvas.height = mapCanvas.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const currentGrid = gridRef.current;
    const currentZoom = zoomRef.current;
    const currentMetric = activeMetricRef.current;

    if (!currentGrid || currentZoom < MIN_ZOOM) return;

    const { cols, rows, west, south, east, north, cells } = currentGrid;
    const stops = METRICS[currentMetric].stops;

    // Create or resize the offscreen canvas (one pixel per IDW cell)
    if (
      !offscreenRef.current ||
      offscreenRef.current.width !== cols ||
      offscreenRef.current.height !== rows
    ) {
      const oc = document.createElement("canvas");
      oc.width = cols;
      oc.height = rows;
      offscreenRef.current = oc;
    }
    const offscreen = offscreenRef.current;
    const offCtx = offscreen.getContext("2d");
    if (!offCtx) return;

    // Write one RGBA pixel per cell into an ImageData buffer.
    // Grid row 0 = southmost; ImageData row 0 = top = north → flip y axis.
    const imageData = offCtx.createImageData(cols, rows);
    const buf = imageData.data;

    for (let row = 0; row < rows; row++) {
      const imgRow = rows - 1 - row; // flip: grid south = image bottom
      for (let col = 0; col < cols; col++) {
        const cell = cells[row * cols + col];
        const value = cell[currentMetric as keyof typeof cell] as number;
        const [r, g, b] = valueToRgb(value, stops);
        const px = (imgRow * cols + col) * 4;
        buf[px]     = r;
        buf[px + 1] = g;
        buf[px + 2] = b;
        buf[px + 3] = Math.round(cell.alpha * 255);
      }
    }

    offCtx.putImageData(imageData, 0, 0);

    // Project the grid's geographic bounds to CSS pixel coordinates, then
    // drawImage scaled up — browser bilinear interpolation smooths the pixels.
    const dpr = window.devicePixelRatio || 1;
    const topLeft     = map.project([west, north]);
    const bottomRight = map.project([east, south]);

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(
      offscreen,
      topLeft.x,
      topLeft.y,
      bottomRight.x - topLeft.x,
      bottomRight.y - topLeft.y,
    );
    ctx.restore();
  }, [map]); // stable — all changing data read via refs

  // Redraw every frame during map movement (panning/zooming animation)
  useEffect(() => {
    if (!map) return;
    map.on("move", renderFrame);
    map.on("resize", renderFrame);
    return () => {
      map.off("move", renderFrame);
      map.off("resize", renderFrame);
    };
  }, [map, renderFrame]);

  // Also redraw when the grid or metric changes outside of map movement
  useEffect(() => {
    renderFrame();
  }, [grid, activeMetric, renderFrame]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        mixBlendMode: "multiply",
        pointerEvents: "none",
        zIndex: 1,
        opacity,
        transition: "opacity 500ms ease",
      }}
    />
  );
}
