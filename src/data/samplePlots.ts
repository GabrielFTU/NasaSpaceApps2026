import type { Plot } from "@/types";
import { polygonAreaHa } from "@/lib/geo";
import { round } from "@/lib/utils";

/**
 * Talhões DEMONSTRATIVOS (demo: true) dentro das propriedades de exemplo.
 * Contornos fictícios, gerados por deslocamento em metros a partir do centro de cada propriedade —
 * não correspondem a lavouras reais. A interface identifica esses talhões como "Exemplo".
 */

const M_PER_DEG = 111320;

/** Retângulo [oeste→leste, sul→norte] em metros relativos ao centro. */
function box(lat: number, lon: number, x0: number, y0: number, x1: number, y1: number): [number, number][] {
  const dLon = (m: number) => m / (M_PER_DEG * Math.cos((lat * Math.PI) / 180));
  const dLat = (m: number) => m / M_PER_DEG;
  return [
    [lat + dLat(y1), lon + dLon(x0)],
    [lat + dLat(y1), lon + dLon(x1)],
    [lat + dLat(y0), lon + dLon(x1)],
    [lat + dLat(y0), lon + dLon(x0)],
  ];
}

const TS = "2026-03-02T12:00:00.000Z";

function plot(id: string, propertyId: string, name: string, boundary: [number, number][], extra: Partial<Plot> = {}): Plot {
  return { id, propertyId, name, boundary, areaHa: round(polygonAreaHa(boundary), 2), demo: true, createdAt: TS, updatedAt: TS, ...extra };
}

export const SAMPLE_PLOTS: Plot[] = [
  plot("plot_cianorte_1", "prop_cianorte", "Talhão 1 — Sede", box(-23.6599, -52.6054, -320, 20, -20, 300), {
    currentCrop: "Soja",
    soilTexture: "arenosa",
  }),
  plot("plot_cianorte_2", "prop_cianorte", "Talhão 2 — Baixada", box(-23.6599, -52.6054, 20, -300, 330, -30), {
    currentCrop: "Milho safrinha",
    soilTexture: "arenosa",
    notes: "Área com histórico de erosão (exemplo).",
  }),
  plot("plot_tapejara_1", "prop_tapejara", "Talhão A", box(-23.7317, -52.8738, -540, 40, -40, 480), { currentCrop: "Soja", soilTexture: "media" }),
  plot("plot_tapejara_2", "prop_tapejara", "Talhão B", box(-23.7317, -52.8738, 20, -470, 540, -20), { currentCrop: "Pastagem" }),
];
