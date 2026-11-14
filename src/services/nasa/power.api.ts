import type { ClimateSeries, DailyClimate } from "@/types";
import { POWER_SOURCE } from "./parameters";

/**
 * Cliente real da NASA POWER (endpoint diário por ponto). Não requer chave de API.
 * Documentação: https://power.larc.nasa.gov/docs/services/api/temporal/daily/
 *
 * Valores de preenchimento (-999) são convertidos em null e tratados como indisponíveis.
 */

const BASE = "https://power.larc.nasa.gov/api/temporal/daily/point";
const PARAMS = ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "ALLSKY_SFC_SW_DWN"] as const;

type PowerResponse = {
  properties: { parameter: Record<(typeof PARAMS)[number], Record<string, number>> };
  header?: { fill_value?: number };
};

export class PowerApiError extends Error {}

const compact = (iso: string) => iso.replaceAll("-", "");
const expand = (k: string) => `${k.slice(0, 4)}-${k.slice(4, 6)}-${k.slice(6, 8)}`;

export async function fetchPowerApi(lat: number, lon: number, start: string, end: string): Promise<ClimateSeries> {
  const url = new URL(BASE);
  url.searchParams.set("parameters", PARAMS.join(","));
  url.searchParams.set("community", POWER_SOURCE.community);
  url.searchParams.set("latitude", lat.toFixed(4));
  url.searchParams.set("longitude", lon.toFixed(4));
  url.searchParams.set("start", compact(start));
  url.searchParams.set("end", compact(end));
  url.searchParams.set("format", "JSON");

  let res: Response;
  try {
    res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  } catch {
    throw new PowerApiError("Não foi possível conectar à NASA POWER. Verifique a conexão ou use os dados simulados.");
  }
  if (!res.ok) throw new PowerApiError(`A NASA POWER respondeu com erro (HTTP ${res.status}).`);

  const json = (await res.json()) as PowerResponse;
  const p = json.properties?.parameter;
  if (!p?.T2M) throw new PowerApiError("Resposta da NASA POWER em formato inesperado.");

  const fill = json.header?.fill_value ?? -999;
  const v = (x: number | undefined) => (x === undefined || x === fill || x <= -998 ? null : x);

  const records: DailyClimate[] = Object.keys(p.T2M)
    .sort()
    .map((k) => ({
      date: expand(k),
      t2m: v(p.T2M[k]),
      t2mMax: v(p.T2M_MAX?.[k]),
      t2mMin: v(p.T2M_MIN?.[k]),
      precip: v(p.PRECTOTCORR?.[k]),
      rh: v(p.RH2M?.[k]),
      radiation: v(p.ALLSKY_SFC_SW_DWN?.[k]),
    }));

  const lastWithData = [...records].reverse().find((r) => r.t2m !== null || r.precip !== null);
  // resposta "vazia" (só valores de preenchimento −999): tratar como falha — não guardar em cache
  // nem desenhar gráfico vazio. withFallback() decide o que mostrar, sempre identificado.
  if (!lastWithData) throw new PowerApiError("A NASA POWER respondeu, mas sem valores para este local e período.");

  return {
    origin: "real",
    source: POWER_SOURCE.name,
    parameters: [...PARAMS],
    latitude: lat,
    longitude: lon,
    resolution: POWER_SOURCE.resolution,
    cellSizeDeg: POWER_SOURCE.cellSizeDeg,
    records,
    lastAvailableDate: lastWithData?.date ?? end,
    fetchedAt: new Date().toISOString(),
  };
}
