"use client";

import { Card, CardBody, Tabs, Tab } from "@heroui/react";
import { METRICS, METRIC_ORDER } from "@/lib/metrics";
import type { Metric } from "@/lib/metrics";

const TAB_LABELS: Record<Metric, string> = {
  temperature: "Temperature",
  windspeedmph: "Wind",
  humidity: "Humidity",
};

const TICK_COUNT = 5; // 5 labels = 4 equal divisions

/** Interpolated value at a fractional position (0–1) along the gradient */
function interpolateValue(stops: { value: number }[], position: number): number {
  const n = stops.length;
  const scaled = position * (n - 1);
  const i = Math.min(Math.floor(scaled), n - 2);
  const t = scaled - i;
  return stops[i].value + t * (stops[i + 1].value - stops[i].value);
}

interface LegendProps {
  activeMetric: Metric;
  onMetricChange: (metric: Metric) => void;
}

export function Legend({ activeMetric, onMetricChange }: LegendProps) {
  const metric = METRICS[activeMetric];
  const gradient = `linear-gradient(to right, ${metric.stops.map((s) => s.color).join(", ")})`;
  const ticks = Array.from({ length: TICK_COUNT }, (_, i) =>
    Math.round(interpolateValue(metric.stops, i / (TICK_COUNT - 1)))
  );

  return (
    <Card shadow="md" className="w-full">
      <CardBody className="px-4 pt-1 pb-3 gap-3">
        <Tabs
          selectedKey={activeMetric}
          onSelectionChange={(key) => onMetricChange(key as Metric)}
          size="sm"
          variant="underlined"
          classNames={{ panel: "hidden" }}
        >
          {METRIC_ORDER.map((key) => (
            <Tab key={key} title={TAB_LABELS[key]} />
          ))}
        </Tabs>

        <div className="relative h-2 w-full rounded-full" style={{ background: gradient }}>
          {[25, 50, 75].map((pct) => (
            <div
              key={pct}
              className="absolute top-0 bottom-0 w-0.5 bg-content1"
              style={{ left: `${pct}%` }}
            />
          ))}
        </div>

        <div className="relative h-4">
          {ticks.map((value, i) => {
            const pct = (i / (TICK_COUNT - 1)) * 100;
            const isFirst = i === 0;
            const isLast = i === TICK_COUNT - 1;
            return (
              <span
                key={i}
                className="absolute text-tiny text-default-500"
                style={{
                  left: isLast ? undefined : `${pct}%`,
                  right: isLast ? 0 : undefined,
                  transform: !isFirst && !isLast ? "translateX(-50%)" : undefined,
                }}
              >
                {value}{metric.unit}
              </span>
            );
          })}
        </div>
      </CardBody>
    </Card>
  );
}
