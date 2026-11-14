import type { ClimateSeries, PowerMode, SoilMoistureResult, VegetationResult } from "@/types";
import { toISODate } from "@/lib/format";
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

export function getVegetationIndex(lat: number, lon: number, mode: PowerMode): Promise<VegetationResult> {
  const { start, end } = defaultWindow();
  const key = `ndvi:${mode}:${lat.toFixed(4)}:${lon.toFixed(4)}:${start}`;
  const mock = () => fetchNdviMock(lat, lon, start, end);
  return cached(key, () => (mode === "api" ? withFallback(() => fetchNdviReal(lat, lon, start, end), mock) : mock()));
}
