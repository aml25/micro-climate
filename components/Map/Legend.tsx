"use client";

import { useRef, useState } from "react";
import { Card, CardBody, Pagination } from "@heroui/react";
import { METRICS, METRIC_ORDER } from "@/lib/metrics";
import type { Metric } from "@/lib/metrics";

interface LegendProps {
  activeMetric: Metric;
  onMetricChange: (metric: Metric) => void;
}

/** Linear interpolation between stop values based on cursor position (0–1) */
function interpolateValue(stops: { value: number }[], position: number): number {
  const n = stops.length;
  const scaled = position * (n - 1);
  const i = Math.min(Math.floor(scaled), n - 2);
  const t = scaled - i;
  return stops[i].value + t * (stops[i + 1].value - stops[i].value);
}

export function Legend({ activeMetric, onMetricChange }: LegendProps) {
  const metric = METRICS[activeMetric];
  const page = METRIC_ORDER.indexOf(activeMetric) + 1;
  const gradient = `linear-gradient(to right, ${metric.stops.map((s) => s.color).join(", ")})`;

  const barRef = useRef<HTMLDivElement>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const [hoverValue, setHoverValue] = useState<number | null>(null);

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = barRef.current?.getBoundingClientRect();
    if (!rect) return;
    const p = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    setHoverX(p * rect.width);
    setHoverValue(interpolateValue(metric.stops, p));
  };

  const handleMouseLeave = () => {
    setHoverX(null);
    setHoverValue(null);
  };

  return (
    <Card shadow="sm" className="min-w-0">
      <CardBody className="px-3 py-2 gap-2">
        <p className="text-tiny font-medium text-default-400 uppercase tracking-widest">
          {metric.label}
        </p>

        {/* Gradient bar with hover interaction */}
        <div
          ref={barRef}
          className="relative h-2 w-40 rounded-full cursor-crosshair"
          style={{ background: gradient }}
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          {hoverX !== null && hoverValue !== null && (
            <>
              {/* Cursor line */}
              <div
                className="absolute top-0 bottom-0 w-px bg-white/80 pointer-events-none"
                style={{ left: hoverX }}
              />
              {/* Value label — clamp to bar edges so it never overflows */}
              <div
                className="absolute -top-6 -translate-x-1/2 bg-foreground text-background text-tiny font-medium px-1.5 py-0.5 rounded pointer-events-none whitespace-nowrap"
                style={{
                  left: Math.max(16, Math.min(hoverX, 144)),
                }}
              >
                {Math.round(hoverValue)}{metric.unit}
              </div>
            </>
          )}
        </div>

        <div className="flex justify-between">
          <span className="text-tiny text-default-500">
            {metric.stops[0].value}{metric.unit}
          </span>
          <span className="text-tiny text-default-500">
            {metric.stops[metric.stops.length - 1].value}{metric.unit}
          </span>
        </div>

        <div className="flex justify-center">
          <Pagination
            total={METRIC_ORDER.length}
            page={page}
            onChange={(p) => onMetricChange(METRIC_ORDER[p - 1])}
            size="sm"
            variant="light"
            classNames={{ cursor: "bg-default-400" }}
          />
        </div>
      </CardBody>
    </Card>
  );
}
