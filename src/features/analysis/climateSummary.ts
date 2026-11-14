import type { ClimateSeries, ClimateSummary } from "@/types";
import { lastNDays, mean, sum } from "@/features/dashboard/climateStats";
import { round } from "@/lib/utils";

export function summarizeClimate(series: ClimateSeries): ClimateSummary {
  const year = lastNDays(series.records, 365, series.lastAvailableDate);
  const isSummer = (iso: string) => {
    const m = Number(iso.slice(5, 7));
    return m >= 10 || m <= 3;
  };
  const summer = year.filter((r) => isSummer(r.date));
  const winter = year.filter((r) => !isSummer(r.date));
  const mins = year.map((r) => r.t2mMin).filter((v): v is number => v !== null);

  return {
    origin: series.origin,
    periodStart: year[0]?.date ?? series.lastAvailableDate,
    periodEnd: series.lastAvailableDate,
    summerPrecipMm: round(sum(summer.map((r) => r.precip)) ?? 0, 0),
    winterPrecipMm: round(sum(winter.map((r) => r.precip)) ?? 0, 0),
    annualPrecipMm: round(sum(year.map((r) => r.precip)) ?? 0, 0),
    meanTemp: round(mean(year.map((r) => r.t2m)) ?? 0, 1),
    minTempObserved: round(mins.length ? Math.min(...mins) : 0, 1),
    frostRiskDays: mins.filter((v) => v <= 2).length,
  };
}
