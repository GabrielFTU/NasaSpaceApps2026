import type { DailyClimate, PeriodKey } from "@/types";
import { parseISODate, toISODate } from "@/lib/format";
import { round } from "@/lib/utils";

export const PERIOD_OPTIONS: { value: PeriodKey; label: string; days: number }[] = [
  { value: "7d", label: "7 dias", days: 7 },
  { value: "30d", label: "30 dias", days: 30 },
  { value: "90d", label: "90 dias", days: 90 },
  { value: "12m", label: "12 meses", days: 365 },
];

export function periodDays(p: PeriodKey) {
  return PERIOD_OPTIONS.find((o) => o.value === p)!.days;
}

export function lastNDays<T extends { date: string }>(records: T[], days: number, endISO?: string): T[] {
  const end = endISO ?? records.at(-1)?.date;
  if (!end) return [];
  const start = parseISODate(end);
  start.setDate(start.getDate() - (days - 1));
  const s = toISODate(start);
  return records.filter((r) => r.date >= s && r.date <= end);
}

const vals = (arr: (number | null)[]) => arr.filter((v): v is number => v !== null && Number.isFinite(v));
export const mean = (arr: (number | null)[]) => {
  const v = vals(arr);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
};
export const sum = (arr: (number | null)[]) => {
  const v = vals(arr);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};

export interface ClimateKpis {
  meanTemp: number | null;
  totalPrecip: number | null;
  meanRh: number | null;
  meanRadiation: number | null;
  days: number;
  missingDays: number;
}

export function computeKpis(records: DailyClimate[]): ClimateKpis {
  return {
    meanTemp: mean(records.map((r) => r.t2m)),
    totalPrecip: sum(records.map((r) => r.precip)),
    meanRh: mean(records.map((r) => r.rh)),
    meanRadiation: mean(records.map((r) => r.radiation)),
    days: records.length,
    missingDays: records.filter((r) => r.t2m === null || r.precip === null).length,
  };
}

export interface ChartPoint {
  key: string; // data ISO (diário) ou primeiro dia do mês (mensal)
  t2m: number | null;
  tRange: [number, number] | null;
  precip: number | null;
  rh: number | null;
  radiation: number | null;
}

export type Granularity = "daily" | "monthly";

export function buildChartData(records: DailyClimate[], granularity: Granularity): ChartPoint[] {
  if (granularity === "daily") {
    return records.map((r) => ({
      key: r.date,
      t2m: r.t2m,
      tRange: r.t2mMin !== null && r.t2mMax !== null ? [r.t2mMin, r.t2mMax] : null,
      precip: r.precip,
      rh: r.rh,
      radiation: r.radiation,
    }));
  }
  const groups = new Map<string, DailyClimate[]>();
  for (const r of records) {
    const k = `${r.date.slice(0, 7)}-01`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(r);
  }
  return [...groups.entries()].map(([key, rs]) => {
    const mn = mean(rs.map((r) => r.t2mMin));
    const mx = mean(rs.map((r) => r.t2mMax));
    const r1 = (v: number | null) => (v === null ? null : round(v, 1));
    return {
      key,
      t2m: r1(mean(rs.map((r) => r.t2m))),
      tRange: mn !== null && mx !== null ? [round(mn, 1), round(mx, 1)] : null,
      precip: r1(sum(rs.map((r) => r.precip))),
      rh: r1(mean(rs.map((r) => r.rh))),
      radiation: r1(mean(rs.map((r) => r.radiation))),
    };
  });
}

export function sparkSeries<T>(records: T[], pick: (r: T) => number | null): { v: number | null }[] {
  return records.map((r) => ({ v: pick(r) }));
}
