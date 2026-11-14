import type { DailyClimate, DailySoilMoisture, NdviComposite } from "@/types";
import { mean, sum } from "@/features/dashboard/climateStats";

/** Indicadores de clima do período — só sobre dias com dado (dias ausentes são contados, nunca preenchidos). */
export interface ClimateIndicators {
  days: number;
  missingDays: number;
  totalPrecip: number | null;
  rainyDays: number;
  longestDrySpell: number;
  meanTemp: number | null;
  minTemp: number | null;
  maxTemp: number | null;
  frostRiskDays: number;
  heatDays: number;
  meanRh: number | null;
}

export function climateIndicators(records: DailyClimate[]): ClimateIndicators {
  let spell = 0;
  let longest = 0;
  for (const r of records) {
    if (r.precip === null) {
      spell = 0;
      continue;
    }
    spell = r.precip < 1 ? spell + 1 : 0;
    longest = Math.max(longest, spell);
  }
  const mins = records.map((r) => r.t2mMin).filter((v): v is number => v !== null);
  const maxs = records.map((r) => r.t2mMax).filter((v): v is number => v !== null);
  return {
    days: records.length,
    missingDays: records.filter((r) => r.precip === null || r.t2m === null).length,
    totalPrecip: sum(records.map((r) => r.precip)),
    rainyDays: records.filter((r) => (r.precip ?? 0) >= 1).length,
    longestDrySpell: longest,
    meanTemp: mean(records.map((r) => r.t2m)),
    minTemp: mins.length ? Math.min(...mins) : null,
    maxTemp: maxs.length ? Math.max(...maxs) : null,
    frostRiskDays: mins.filter((v) => v <= 2).length,
    heatDays: maxs.filter((v) => v >= 35).length,
    meanRh: mean(records.map((r) => r.rh)),
  };
}

export function soilIndicators(records: DailySoilMoisture[]) {
  const last = [...records].reverse().find((r) => r.surface !== null || r.rootZone !== null) ?? null;
  return {
    last,
    meanSurface: mean(records.map((r) => r.surface)),
    meanRoot: mean(records.map((r) => r.rootZone)),
    samples: records.length,
    valid: records.filter((r) => r.surface !== null || r.rootZone !== null).length,
  };
}

export function ndviIndicators(records: NdviComposite[]) {
  const valid = records.filter((r) => r.ndvi !== null);
  return {
    last: valid.at(-1) ?? null,
    mean: mean(records.map((r) => r.ndvi)),
    max: valid.length ? Math.max(...valid.map((r) => r.ndvi!)) : null,
    composites: records.length,
    cloudy: records.length - valid.length,
  };
}
