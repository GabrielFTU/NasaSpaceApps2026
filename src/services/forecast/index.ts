/**
 * Previsão do tempo para a fazenda — Open-Meteo (https://open-meteo.com).
 * Gratuito, sem chave, com CORS: o navegador consulta direto. Envia só latitude/longitude.
 *
 * Diário, 16 dias: chuva (mm), probabilidade de chuva (%), temperatura máx/mín (°C),
 * evapotranspiração de referência FAO-56 (ET₀, mm) e vento máximo a 10 m (km/h).
 */

export interface ForecastDay {
  date: string;
  rain: number;
  rainProb: number | null;
  tmax: number;
  tmin: number;
  et0: number;
  wind: number;
}

export interface Forecast {
  days: ForecastDay[];
  fetchedAt: string;
}

type Daily = Record<string, (number | null)[]> & { time: string[] };

const DAILY = ["precipitation_sum", "precipitation_probability_max", "temperature_2m_max", "temperature_2m_min", "et0_fao_evapotranspiration", "wind_speed_10m_max"];
const ENSEMBLE_DAILY = ["precipitation_sum", "temperature_2m_max", "temperature_2m_min", "et0_fao_evapotranspiration", "wind_speed_10m_max"];

const cache = new Map<string, { at: number; p: Promise<Forecast> }>();
const TTL = 30 * 60 * 1000;

function cached(key: string, load: () => Promise<Forecast>): Promise<Forecast> {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < TTL) return hit.p;
  const p = load().catch((e) => {
    cache.delete(key);
    throw e instanceof Error && e.name === "TimeoutError" ? new Error("A previsão demorou demais para responder.") : e;
  });
  cache.set(key, { at: Date.now(), p });
  return p;
}

async function getDaily(url: string): Promise<Daily> {
  const r = await fetch(url, { signal: AbortSignal.timeout(25000) });
  if (!r.ok) throw new Error(`Previsão indisponível (HTTP ${r.status}).`);
  return ((await r.json()) as { daily: Daily }).daily;
}

/** Previsão determinística de 16 dias (mais detalhada) — usada nos períodos de 7 e 15 dias. */
export function getForecast(lat: number, lon: number): Promise<Forecast> {
  return cached(`det:${lat.toFixed(3)}:${lon.toFixed(3)}`, async () => {
    const d = await getDaily(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
        `&daily=${DAILY.join(",")}&forecast_days=16&timezone=auto&wind_speed_unit=kmh`,
    );
    const days: ForecastDay[] = d.time.map((date, i) => ({
      date,
      rain: d.precipitation_sum[i] ?? 0,
      rainProb: d.precipitation_probability_max[i] ?? null,
      tmax: d.temperature_2m_max[i] ?? NaN,
      tmin: d.temperature_2m_min[i] ?? NaN,
      et0: d.et0_fao_evapotranspiration[i] ?? 0,
      wind: d.wind_speed_10m_max[i] ?? 0,
    }));
    return { days, fetchedAt: new Date().toISOString() };
  });
}

/**
 * Previsão estendida de 30 dias — conjunto GFS (31 cenários, grade de 0,5°).
 * Cada valor é a média dos cenários; a chance de chuva é a fração de cenários com ≥ 1 mm.
 * Use como tendência: além de ~10 dias a incerteza cresce bastante.
 */
export function getExtendedForecast(lat: number, lon: number): Promise<Forecast> {
  return cached(`ens:${lat.toFixed(2)}:${lon.toFixed(2)}`, async () => {
    const d = await getDaily(
      `https://ensemble-api.open-meteo.com/v1/ensemble?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
        `&daily=${ENSEMBLE_DAILY.join(",")}&models=gfs05&forecast_days=31&timezone=auto&wind_speed_unit=kmh`,
    );
    const keys = Object.keys(d);
    const members = (base: string) => keys.filter((k) => k === base || k.startsWith(`${base}_member`)).map((k) => d[k]);
    const series = Object.fromEntries(ENSEMBLE_DAILY.map((b) => [b, members(b)])) as Record<string, (number | null)[][]>;
    const at = (base: string, i: number) => series[base].map((m) => m[i]).filter((v): v is number => v !== null && v !== undefined);
    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);

    const days: ForecastDay[] = [];
    d.time.forEach((date, i) => {
      const rain = at("precipitation_sum", i);
      if (!rain.length) return; // fim do horizonte do modelo
      days.push({
        date,
        rain: mean(rain),
        rainProb: Math.round((rain.filter((v) => v >= 1).length / rain.length) * 100),
        tmax: mean(at("temperature_2m_max", i)),
        tmin: mean(at("temperature_2m_min", i)),
        et0: mean(at("et0_fao_evapotranspiration", i)) || 0,
        wind: mean(at("wind_speed_10m_max", i)) || 0,
      });
    });
    return { days: days.slice(0, 30), fetchedAt: new Date().toISOString() };
  });
}

/* ---------- Indicadores para o agricultor ---------- */

/** Dia "bom para pulverizar": sem chuva prevista, baixa chance de chuva e vento máximo < 15 km/h. */
export const isSprayDay = (d: ForecastDay) => d.rain < 1 && (d.rainProb ?? 0) < 30 && d.wind < 15;

/** Chuva que conta: ≥ 2 mm com ≥ 50% de chance. */
export const isRainDay = (d: ForecastDay) => d.rain >= 2 && (d.rainProb ?? 100) >= 50;

/** Indicadores para os próximos `n` dias (a previsão traz até 16). */
export function summarize(days: ForecastDay[], n: number) {
  const span = days.slice(0, n);
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const rain = sum(span.map((d) => d.rain));
  const et0 = sum(span.map((d) => d.et0));
  return {
    rain,
    rainyDays: span.filter((d) => d.rain >= 1).length,
    nextRain: span.find(isRainDay) ?? null,
    balance: rain - et0,
    et0,
    sprayDays: span.filter(isSprayDay),
  };
}
