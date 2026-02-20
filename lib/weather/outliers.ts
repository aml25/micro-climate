import type { PWSStation } from "@/types/weather";

const STALE_MINUTES = 45;
const TEMP_MIN_F = 20;  // absolute floor — catches busted sensors (-12°F seen in data)
const TEMP_MAX_F = 115;
const ZSCORE_THRESHOLD = 2.5;

function isStale(lastUpdateTime: string): boolean {
  const updated = new Date(lastUpdateTime).getTime();
  const now = Date.now();
  return now - updated > STALE_MINUTES * 60 * 1000;
}

function mean(values: number[]): number {
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function stddev(values: number[], avg: number): number {
  const variance =
    values.reduce((sum, v) => sum + (v - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function filterOutliers(stations: PWSStation[]): PWSStation[] {
  // Step 1: Apply staleness and hard temperature bounds
  const candidates = stations.map((s) => ({
    ...s,
    isOutlier:
      isStale(s.lastUpdateTime) ||
      s.tempF < TEMP_MIN_F ||
      s.tempF > TEMP_MAX_F,
  }));

  // Step 2: Z-score filter on the passing candidates
  const passing = candidates.filter((s) => !s.isOutlier);
  if (passing.length < 3) {
    // Not enough data points for meaningful z-score — return as-is
    return candidates;
  }

  const temps = passing.map((s) => s.tempF);
  const avg = mean(temps);
  const sd = stddev(temps, avg);

  return candidates.map((s) => {
    if (s.isOutlier) return s;
    const z = sd === 0 ? 0 : Math.abs(s.tempF - avg) / sd;
    return { ...s, isOutlier: z > ZSCORE_THRESHOLD };
  });
}
