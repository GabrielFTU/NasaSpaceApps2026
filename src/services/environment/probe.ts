import { samplePoint } from "@/services/nasa/gibs";
import type { UnitConversion } from "./colormap";

/**
 * Valor de uma camada GIBS num ponto: pede à NASA o pixel daquele ponto/data e converte a cor
 * pela paleta oficial (mesmo método usado nas séries de SMAP e NDVI — ver services/nasa/gibs.ts).
 * Cache por célula de ~0,05° para não repetir a consulta ao mover o mouse dentro da mesma área.
 */

const cache = new Map<string, Promise<number | null>>();

export function probeValue(opts: {
  layer: string;
  colormap: string;
  date: string;
  lat: number;
  lon: number;
  halfDeg: number;
  conversion?: UnitConversion;
}): Promise<number | null> {
  const key = `${opts.layer}:${opts.date}:${(Math.round(opts.lat / 0.05) * 0.05).toFixed(2)}:${(Math.round(opts.lon / 0.05) * 0.05).toFixed(2)}`;
  if (!cache.has(key)) {
    const p = samplePoint(opts).then((v) => (v === null ? null : opts.conversion?.from === "K" ? v - 273.15 : v));
    p.catch(() => cache.delete(key));
    if (cache.size > 500) cache.delete(cache.keys().next().value!);
    cache.set(key, p);
  }
  return cache.get(key)!;
}
