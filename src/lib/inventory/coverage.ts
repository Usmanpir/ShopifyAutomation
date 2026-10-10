/**
 * Stock coverage: how many days current inventory lasts at the recent sales
 * velocity, plus acceleration vs the longer-term average.
 */
export type CoverageInput = {
  stock: number;
  /** Units sold per day over the recent window, oldest → newest. */
  dailySales: number[];
  /** Longer-term average daily sales (e.g. 30 days) for acceleration. */
  baselineDailyAverage?: number;
};

export type CoverageResult = {
  averageDailySales: number;
  coverageDays: number | null; // null = no sales (infinite coverage)
  velocityMultiplier: number | null;
  status: "OUT_OF_STOCK" | "CRITICAL" | "LOW" | "HEALTHY" | "OVERSTOCKED" | "NO_SALES";
};

export function computeCoverage(input: CoverageInput, warningDays = 5): CoverageResult {
  const days = input.dailySales.length || 1;
  const total = input.dailySales.reduce((a, b) => a + b, 0);
  const averageDailySales = Math.round((total / days) * 10) / 10;
  const coverageDays = averageDailySales > 0 ? Math.round((input.stock / averageDailySales) * 10) / 10 : null;
  const velocityMultiplier =
    input.baselineDailyAverage && input.baselineDailyAverage > 0
      ? Math.round((averageDailySales / input.baselineDailyAverage) * 10) / 10
      : null;

  let status: CoverageResult["status"];
  if (input.stock <= 0) status = "OUT_OF_STOCK";
  else if (coverageDays === null) status = "NO_SALES";
  else if (coverageDays < Math.max(1, warningDays / 2.5)) status = "CRITICAL";
  else if (coverageDays < warningDays) status = "LOW";
  else if (coverageDays > 120) status = "OVERSTOCKED";
  else status = "HEALTHY";

  return { averageDailySales, coverageDays, velocityMultiplier, status };
}

/** Suggested reorder quantity to reach `targetDays` of coverage. */
export function suggestedReorder(stock: number, averageDailySales: number, targetDays = 30): number {
  if (averageDailySales <= 0) return 0;
  return Math.max(0, Math.ceil(averageDailySales * targetDays - stock));
}
