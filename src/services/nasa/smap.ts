import type { DailySoilMoisture, SoilMoistureResult } from "@/types";
import { clamp, hashCoords, round, seededRandom } from "@/lib/utils";
import { parseISODate, toISODate } from "@/lib/format";
import { SMAP_SOURCE } from "./parameters";
import { mapLimit, samplePoint } from "./gibs";
import { generateMockClimate } from "./power.mock";

/** Datas amostradas: últimos `days` dias, a cada `step` dias, terminando em `end`. */
function sampleDates(end: string, days: number, step: number): string[] {
  const out: string[] = [];
  const d = parseISODate(end);
  for (let i = 0; i < days; i += step) {
    out.unshift(toISODate(d));
    d.setDate(d.getDate() - step);
  }
  return out;
}

/**
 * SMAP L4 real via NASA GIBS (superficial 0–5 cm e zona das raízes 0–100 cm, grade de 9 km).
 * Amostra os últimos 60 dias a cada 2 dias. Dias sem produto publicado retornam null.
 */
export async function fetchSmapReal(lat: number, lon: number, end: string): Promise<SoilMoistureResult> {
  const dates = sampleDates(end, 60, 2);
  const common = { colormap: SMAP_SOURCE.colormap, lat, lon, halfDeg: 0.05 };
  const records: DailySoilMoisture[] = await mapLimit(dates, 6, async (date) => {
    const [surface, rootZone] = await Promise.all([
      samplePoint({ ...common, layer: SMAP_SOURCE.layers.surface, date }).catch(() => null),
      samplePoint({ ...common, layer: SMAP_SOURCE.layers.rootZone, date }).catch(() => null),
    ]);
    return { date, surface: surface === null ? null : round(surface, 3), rootZone: rootZone === null ? null : round(rootZone, 3) };
  });
  const valid = records.filter((r) => r.surface !== null || r.rootZone !== null);
  if (valid.length === 0) throw new Error("O SMAP não retornou dados para este ponto.");
  return {
    origin: "real",
    source: SMAP_SOURCE.name,
    resolution: SMAP_SOURCE.resolution,
    records,
    lastAvailableDate: valid.at(-1)!.date,
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * MOCK DOCUMENTADO — balanço hídrico simples alimentado pela chuva do mock POWER.
 * Usado no modo "dados simulados" ou quando a NASA não responde.
 */
export async function fetchSmapMock(lat: number, lon: number, start: string, end: string): Promise<SoilMoistureResult> {
  await new Promise((r) => setTimeout(r, 250));
  const climate = generateMockClimate(lat, lon, start, end);
  const rand = seededRandom(hashCoords(lat, lon) + 31);
  const base = 0.12 + (hashCoords(lat, lon) % 40) / 1000;
  let surface = base + 0.05;
  let root = base + 0.06;
  const records: DailySoilMoisture[] = climate.map((c) => {
    const rain = c.precip ?? 0;
    const et = ((c.radiation ?? 15) / 15) * 0.012;
    surface = clamp(surface + rain * 0.006 - et - (surface - base) * 0.18, 0.04, 0.42);
    root = clamp(root + rain * 0.0012 - et * 0.18 - (root - base) * 0.015, 0.06, 0.38);
    return { date: c.date, surface: round(surface + (rand() - 0.5) * 0.01, 3), rootZone: round(root, 3) };
  });
  const last60 = records.slice(-60);
  return {
    origin: "simulado",
    source: `${SMAP_SOURCE.name} (simulado)`,
    resolution: SMAP_SOURCE.resolution,
    records: last60,
    lastAvailableDate: last60.at(-1)?.date ?? end,
    fetchedAt: new Date().toISOString(),
  };
}
