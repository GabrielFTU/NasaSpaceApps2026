import type { ClimateSeries, DailyClimate } from "@/types";
import { clamp, hashCoords, round, seededRandom } from "@/lib/utils";
import { parseISODate, toISODate } from "@/lib/format";
import { POWER_SOURCE } from "./parameters";

/**
 * MOCK DOCUMENTADO — NASA POWER (diário)
 *
 * Gera séries diárias determinísticas para um ponto (lat/lon), imitando o formato do endpoint
 * `/api/temporal/daily/point` da NASA POWER. Os valores NÃO são observações: são sintetizados a
 * partir de uma climatologia mensal aproximada do noroeste do Paraná (normais típicas da região
 * de Cianorte, ~1.500 mm/ano, verão quente e úmido, inverno mais seco com eventuais frentes frias),
 * acrescida de ruído autocorrelacionado.
 *
 * - Mesma coordenada + mesma data → mesmo valor (seed derivada das coordenadas).
 * - A série começa em ORIGIN para que a autocorrelação não dependa do período solicitado.
 * - Ajuste simples por latitude: −0,6 °C por grau ao sul de −23,66°.
 */

const ORIGIN = "2023-01-01";

// Climatologia mensal de referência (jan → dez)
const CLIM = {
  temp: [25.0, 25.0, 24.4, 22.4, 19.6, 18.1, 18.0, 19.9, 21.4, 23.0, 24.0, 24.6],
  precip: [190, 165, 130, 100, 120, 90, 60, 55, 120, 160, 160, 190],
  rainDayFreq: [0.48, 0.45, 0.38, 0.27, 0.27, 0.22, 0.17, 0.16, 0.27, 0.36, 0.38, 0.45],
  rh: [76, 76, 74, 72, 74, 72, 65, 58, 62, 68, 70, 74],
  radiation: [21.5, 21.0, 19.5, 16.5, 13.5, 12.5, 13.5, 16.0, 17.5, 20.0, 22.0, 22.5],
  range: [10, 10, 10.5, 11, 11.5, 12, 13, 13.5, 12.5, 11, 10.5, 10],
};

const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** Interpola a climatologia mensal suavemente pelo dia do mês. */
function climAt(arr: number[], date: Date): number {
  const m = date.getMonth();
  const frac = (date.getDate() - 1) / DAYS_IN_MONTH[m];
  // centro do mês em frac=0.5
  if (frac < 0.5) {
    const prev = arr[(m + 11) % 12];
    const t = frac + 0.5;
    return prev + (arr[m] - prev) * t;
  }
  const next = arr[(m + 1) % 12];
  const t = frac - 0.5;
  return arr[m] + (next - arr[m]) * t;
}

export function generateMockClimate(lat: number, lon: number, start: string, end: string): DailyClimate[] {
  const rand = seededRandom(hashCoords(lat, lon) + 7);
  const latAdj = (Math.abs(lat) - 23.66) * -0.6;
  const startDate = parseISODate(start);
  const endDate = parseISODate(end);

  const out: DailyClimate[] = [];
  let tempAnom = 0;
  let coldFront = 0; // dias restantes de massa de ar frio

  for (let d = parseISODate(ORIGIN); d <= endDate; d.setDate(d.getDate() + 1)) {
    const m = d.getMonth();
    const r1 = rand();
    const r2 = rand();
    const r3 = rand();
    const r4 = rand();

    // Frentes frias: mais prováveis entre maio e agosto
    const isWinter = m >= 4 && m <= 7;
    if (coldFront <= 0 && isWinter && r4 < 0.035) coldFront = 3 + Math.floor(r4 * 100) % 3;
    const frontDrop = coldFront > 0 ? 6 + r3 * 3 : 0;
    if (coldFront > 0) coldFront--;

    tempAnom = 0.75 * tempAnom + (r1 - 0.5) * 2.2;
    const freq = climAt(CLIM.rainDayFreq, d);
    const isRain = r2 < freq;
    const meanAmount = climAt(CLIM.precip, d) / (DAYS_IN_MONTH[m] * freq);
    const precip = isRain ? -Math.log(1 - r3 * 0.999) * meanAmount : 0;

    const t2m = climAt(CLIM.temp, d) + latAdj + tempAnom - frontDrop - (isRain ? 1.2 : 0);
    const range = climAt(CLIM.range, d) * (isRain ? 0.65 : 1) + (frontDrop > 0 ? 2 : 0);
    const rh = clamp(climAt(CLIM.rh, d) + (isRain ? 12 : -4) + (r4 - 0.5) * 8, 25, 99);
    const radiation = clamp(climAt(CLIM.radiation, d) * (isRain ? 0.55 + r1 * 0.2 : 1.02 + (r4 - 0.5) * 0.15), 3, 32);

    if (d >= startDate) {
      out.push({
        date: toISODate(d),
        t2m: round(t2m, 2),
        t2mMax: round(t2m + range * 0.55, 2),
        t2mMin: round(t2m - range * 0.45, 2),
        precip: round(precip, 2),
        rh: round(rh, 1),
        radiation: round(radiation, 2),
      });
    }
  }
  return out;
}

export async function fetchPowerMock(lat: number, lon: number, start: string, end: string): Promise<ClimateSeries> {
  // latência simulada para exercitar os estados de carregamento
  await new Promise((r) => setTimeout(r, 450));
  const records = generateMockClimate(lat, lon, start, end);
  return {
    origin: "simulado",
    source: `${POWER_SOURCE.name} (mock documentado)`,
    parameters: ["T2M", "T2M_MAX", "T2M_MIN", "PRECTOTCORR", "RH2M", "ALLSKY_SFC_SW_DWN"],
    latitude: lat,
    longitude: lon,
    resolution: POWER_SOURCE.resolution,
    cellSizeDeg: POWER_SOURCE.cellSizeDeg,
    records,
    lastAvailableDate: records.at(-1)?.date ?? end,
    fetchedAt: new Date().toISOString(),
  };
}
