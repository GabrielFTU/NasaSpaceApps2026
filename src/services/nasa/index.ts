import type { ClimateSeries, PowerMode, SoilMoistureResult, VegetationResult } from "@/types";
import { parseISODate, toISODate } from "@/lib/format";
import { fetchPowerMock } from "./power.mock";
import { fetchPowerApi } from "./power.api";
import { fetchSmapMock, fetchSmapReal } from "./smap";
import { fetchNdviMock, fetchNdviReal } from "./modis.mock";

export * from "./parameters";
export { PowerApiError } from "./power.api";

/**
 * Ponto único de acesso aos dados ambientais. A interface só conhece estas funções.
 *
 * Modo "api" (padrão): consulta a NASA de verdade — POWER (clima), SMAP e MODIS (via GIBS).
 * Se a NASA não responder, usa o mock documentado e marca o dado como "simulado" com `note`.
 * Modo "mock": sempre simulado (demonstração offline).
 */

const cache = new Map<string, Promise<unknown>>();

export function clearNasaCache() {
  cache.clear();
}

function cached<T>(key: string, loader: () => Promise<T>): Promise<T> {
  const hit = cache.get(key);
  if (hit) return hit as Promise<T>;
  const p = loader().catch((e) => {
    cache.delete(key);
    throw e;
  });
  cache.set(key, p);
  return p;
}

/** Janela padrão: últimos ~13 meses até a data de disponibilidade (hoje − latência). */
export function defaultWindow(latencyDays = 3) {
  const end = new Date();
  end.setDate(end.getDate() - latencyDays);
  const start = new Date(end);
  start.setDate(start.getDate() - 395);
  return { start: toISODate(start), end: toISODate(end) };
}

const FALLBACK_NOTE = "NASA indisponível no momento — exibindo dados simulados.";

async function withFallback<T extends { origin: string }>(real: () => Promise<T>, mock: () => Promise<T>): Promise<T> {
  try {
    return await real();
  } catch {
    const m = await mock();
    return { ...m, note: FALLBACK_NOTE };
  }
}

export function getDailyClimate(lat: number, lon: number, mode: PowerMode): Promise<ClimateSeries> {
  const { start, end } = defaultWindow();
  const key = `power:${mode}:${lat.toFixed(4)}:${lon.toFixed(4)}:${start}`;
  const mock = () => fetchPowerMock(lat, lon, start, end);
  return cached(key, () => (mode === "api" ? withFallback(() => fetchPowerApi(lat, lon, start, end), mock) : mock()));
}

export function getSoilMoisture(lat: number, lon: number, mode: PowerMode): Promise<SoilMoistureResult> {
  const { start, end } = defaultWindow();
  const key = `smap:${mode}:${lat.toFixed(4)}:${lon.toFixed(4)}:${start}`;
  const mock = () => fetchSmapMock(lat, lon, start, end);
  return cached(key, () => (mode === "api" ? withFallback(() => fetchSmapReal(lat, lon, end), mock) : mock()));
}

/* ---------- Consultas por período (Mapa Ambiental) ---------- */

/** Início de cada produto: antes disso o dado não existe — a interface deve dizer isso, não simular. */
export const PRODUCT_START = { power: "1981-01-01", smap: "2015-03-31", modis: "2000-02-18" } as const;

const dayDiff = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86400000) + 1;

/** Série diária POWER para um período arbitrário (limitado à data de disponibilidade). */
export function getDailyClimateRange(lat: number, lon: number, start: string, end: string, mode: PowerMode): Promise<ClimateSeries> {
  const avail = defaultWindow().end;
  const e = end > avail ? avail : end;
  const s = start < PRODUCT_START.power ? PRODUCT_START.power : start;
  const key = `power-range:${mode}:${lat.toFixed(4)}:${lon.toFixed(4)}:${s}:${e}`;
  const mock = () => fetchPowerMock(lat, lon, s, e);
  return cached(key, () => (mode === "api" ? withFallback(() => fetchPowerApi(lat, lon, s, e), mock) : mock()));
}

export function getSoilMoistureRange(lat: number, lon: number, start: string, end: string, mode: PowerMode): Promise<SoilMoistureResult> {
  if (end < PRODUCT_START.smap)
    return Promise.resolve({ origin: "indisponivel", source: "NASA SMAP", reason: "O SMAP L4 só existe a partir de 31/03/2015." });
  const avail = defaultWindow().end;
  const e = end > avail ? avail : end;
  const s = start < PRODUCT_START.smap ? PRODUCT_START.smap : start;
  const days = Math.max(1, dayDiff(s, e));
  const key = `smap-range:${mode}:${lat.toFixed(4)}:${lon.toFixed(4)}:${s}:${e}`;
  const mock = () => fetchSmapMock(lat, lon, s, e, days);
  return cached(key, () => (mode === "api" ? withFallback(() => fetchSmapReal(lat, lon, e, days), mock) : mock()));
}

export function getVegetationRange(lat: number, lon: number, start: string, end: string, mode: PowerMode): Promise<VegetationResult> {
  if (end < PRODUCT_START.modis)
    return Promise.resolve({ origin: "indisponivel", source: "NASA MODIS", reason: "O MODIS NDVI só existe a partir de fev/2000." });
  const s = start < PRODUCT_START.modis ? PRODUCT_START.modis : start;
  // fetchNdviReal recua 30 dias a partir de `end` (latência de publicação); damos essa folga ao período
  const e = parseISODate(end);
  e.setDate(e.getDate() + 30);
  const avail = defaultWindow().end;
  const eISO = toISODate(e) > avail ? avail : toISODate(e);
  const key = `ndvi-range:${mode}:${lat.toFixed(4)}:${lon.toFixed(4)}:${s}:${eISO}`;
  const mock = () => fetchNdviMock(lat, lon, s, eISO);
  return cached(key, () => (mode === "api" ? withFallback(() => fetchNdviReal(lat, lon, s, eISO), mock) : mock()));
}

export function getVegetationIndex(lat: number, lon: number, mode: PowerMode): Promise<VegetationResult> {
  const { start, end } = defaultWindow();
  const key = `ndvi:${mode}:${lat.toFixed(4)}:${lon.toFixed(4)}:${start}`;
  const mock = () => fetchNdviMock(lat, lon, start, end);
  return cached(key, () => (mode === "api" ? withFallback(() => fetchNdviReal(lat, lon, start, end), mock) : mock()));
}
