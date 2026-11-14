import type { NdviComposite, VegetationResult } from "@/types";
import { clamp, hashCoords, round, seededRandom } from "@/lib/utils";
import { parseISODate, toISODate } from "@/lib/format";
import { MODIS_SOURCE } from "./parameters";
import { mapLimit, samplePoint } from "./gibs";

/**
 * MOCK DOCUMENTADO — NASA MODIS NDVI (MOD13Q1, composições de 16 dias, pixel de 250 m)
 *
 * Gera um NDVI sazonal para lavouras do noroeste do Paraná: vegetação mais vigorosa no
 * pico da safra de verão (jan–fev) e na segunda safra (mai–jun), quedas após as colheitas
 * (mar e set–out). Algumas composições ficam sem valor, imitando cobertura de nuvens.
 * Os valores NÃO são observações.
 */

// NDVI de referência por mês (jan → dez)
const MONTHLY = [0.78, 0.74, 0.52, 0.48, 0.62, 0.66, 0.55, 0.42, 0.34, 0.36, 0.55, 0.72];

function ndviAt(d: Date) {
  const m = d.getMonth();
  const frac = (d.getDate() - 1) / 30;
  const next = MONTHLY[(m + 1) % 12];
  return MONTHLY[m] + (next - MONTHLY[m]) * frac;
}

/** Datas de início das composições MODIS de 16 dias (dia 1, 17, 33… de cada ano) dentro do intervalo. */
export function compositeDates(start: string, end: string): string[] {
  const s = parseISODate(start);
  const e = parseISODate(end);
  const out: string[] = [];
  for (let y = s.getFullYear(); y <= e.getFullYear(); y++) {
    for (let doy = 0; doy < 366; doy += 16) {
      const d = new Date(y, 0, 1 + doy);
      if (d >= s && d <= e && d.getFullYear() === y) out.push(toISODate(d));
    }
  }
  return out;
}

/** NDVI real via NASA GIBS (MODIS Terra, 16 dias, 250 m) no ponto central da propriedade. */
export async function fetchNdviReal(lat: number, lon: number, start: string, end: string): Promise<VegetationResult> {
  // a composição é publicada ~2 semanas após o fim do período
  const e = parseISODate(end);
  e.setDate(e.getDate() - 30);
  const dates = compositeDates(start, toISODate(e));
  const records: NdviComposite[] = await mapLimit(dates, 6, async (date) => {
    const v = await samplePoint({ layer: MODIS_SOURCE.layer, colormap: MODIS_SOURCE.colormap, date, lat, lon, halfDeg: 0.002 }).catch(() => null);
    return { date, ndvi: v === null ? null : round(v, 2) };
  });
  const valid = records.filter((r) => r.ndvi !== null);
  if (!valid.length) throw new Error("O MODIS não retornou dados para este ponto.");
  return {
    origin: "real",
    source: MODIS_SOURCE.name,
    resolution: MODIS_SOURCE.resolution,
    records,
    lastAvailableDate: valid.at(-1)!.date,
    fetchedAt: new Date().toISOString(),
  };
}

export async function fetchNdviMock(lat: number, lon: number, start: string, end: string): Promise<VegetationResult> {
  await new Promise((r) => setTimeout(r, 300));
  const rand = seededRandom(hashCoords(lat, lon) + 53);
  const offset = ((hashCoords(lat, lon) % 9) - 4) / 100;
  const records: NdviComposite[] = [];
  // composições MODIS começam no dia 1 do ano e se repetem a cada 16 dias
  const s = parseISODate(start);
  const e = parseISODate(end);
  for (let y = s.getFullYear(); y <= e.getFullYear(); y++) {
    for (let doy = 0; doy < 366; doy += 16) {
      const d = new Date(y, 0, 1 + doy);
      if (d < s || d > e || d.getFullYear() !== y) continue;
      const cloudy = rand() < 0.08;
      records.push({
        date: toISODate(d),
        ndvi: cloudy ? null : round(clamp(ndviAt(d) + offset + (rand() - 0.5) * 0.06, 0.1, 0.92), 2),
      });
    }
  }
  // composição fica disponível ~2 semanas após o fim do período
  const available = records.filter((r) => {
    const d = parseISODate(r.date);
    d.setDate(d.getDate() + 30);
    return d <= e;
  });
  return {
    origin: "simulado",
    source: `${MODIS_SOURCE.name} (mock documentado)`,
    resolution: MODIS_SOURCE.resolution,
    records: available,
    lastAvailableDate: available.at(-1)?.date ?? end,
    fetchedAt: new Date().toISOString(),
  };
}
