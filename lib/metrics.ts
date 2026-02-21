export type Metric = "temperature" | "humidity" | "windspeedmph";

export interface MetricStop {
  value: number;
  color: string;
}

export interface MetricConfig {
  label: string;
  unit: string;
  stops: MetricStop[];
}

export const METRICS: Record<Metric, MetricConfig> = {
  temperature: {
    label: "Temperature",
    unit: "°F",
    stops: [
      { value: 35, color: "#00cfff" },
      { value: 45, color: "#3a86ff" },
      { value: 52, color: "#06d6a0" },
      { value: 58, color: "#ffd166" },
      { value: 65, color: "#ff9900" },
      { value: 75, color: "#ef233c" },
    ],
  },
  humidity: {
    label: "Humidity",
    unit: "%",
    stops: [
      { value: 10, color: "#fef9c3" },
      { value: 30, color: "#86efac" },
      { value: 50, color: "#22d3ee" },
      { value: 70, color: "#3b82f6" },
      { value: 90, color: "#1e3a8a" },
    ],
  },
  windspeedmph: {
    label: "Wind Speed",
    unit: "mph",
    stops: [
      { value: 0,  color: "#f0fdf4" },
      { value: 5,  color: "#86efac" },
      { value: 10, color: "#22c55e" },
      { value: 20, color: "#0ea5e9" },
      { value: 30, color: "#7c3aed" },
    ],
  },
};

export const METRIC_ORDER: Metric[] = ["temperature", "humidity", "windspeedmph"];
