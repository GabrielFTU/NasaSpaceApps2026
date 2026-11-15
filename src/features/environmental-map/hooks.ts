import { useEffect, useMemo, useState } from "react";
import type { ClimateSeries, SoilMoistureResult, VegetationResult } from "@/types";
import { useAppStore } from "@/app/store";
import { browserEnvironmentProvider as provider } from "@/services/environment/provider";
import type { TerrainStats } from "@/services/environment/terrain";
import { getAvailableDates, searchWindow, snapDate, type SnappedDate } from "@/services/environment/gibsTime";
import type { EnvLayer } from "@/services/environment/catalog";
import type { Period } from "./period";
import { climateIndicators, ndviIndicators, soilIndicators } from "./indicators";

/**
 * `stale: true` = o valor exibido é da consulta anterior e uma nova está a caminho.
 * A interface mostra esse valor esmaecido com "Atualizando…" em vez de esvaziar a tela.
 */
export type Load<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: T; stale?: boolean };

const msg = (e: unknown) => (e instanceof Error ? e.message : "Erro desconhecido.");

function useLoad<T>(enabled: boolean, deps: unknown[], loader: () => Promise<T>): Load<T> {
  const [state, setState] = useState<Load<T>>({ status: "idle" });
  useEffect(() => {
    if (!enabled) return setState({ status: "idle" });
    let alive = true;
    setState((prev) => (prev.status === "ready" ? { ...prev, stale: true } : { status: "loading" }));
    loader()
      .then((data) => alive && setState({ status: "ready", data }))
      .catch((e) => alive && setState({ status: "error", error: msg(e) }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, ...deps]);
  return state;
}

export interface AreaTarget {
  /** Ponto de consulta: centro do talhão (ou da propriedade). */
  lat: number;
  lon: number;
  boundary?: [number, number][];
  key: string;
}

/** Séries e estatísticas ambientais da área selecionada, carregadas de forma independente. */
export function useAreaEnvironment(target: AreaTarget | null, period: Period) {
  const mode = useAppStore((s) => s.settings.powerMode);
  const on = !!target;
  const lat = target?.lat ?? 0;
  const lon = target?.lon ?? 0;
  const base = [lat.toFixed(5), lon.toFixed(5), period.start, period.end, mode];

  const climate = useLoad<ClimateSeries>(on, base, () => provider.getClimate(lat, lon, period.start, period.end, mode));
  const soil = useLoad<SoilMoistureResult>(on, base, () => provider.getSoilMoisture(lat, lon, period.start, period.end, mode));
  const vegetation = useLoad<VegetationResult>(on, base, () => provider.getVegetation(lat, lon, period.start, period.end, mode));
  const boundaryKey = target?.boundary?.map((p) => p.join()).join("|") ?? "";
  const terrain = useLoad<TerrainStats>(!!target?.boundary && target.boundary.length >= 3, [boundaryKey], () =>
    provider.getTerrain(target!.boundary!),
  );
  // objeto estável: componentes memoizados só re-renderizam quando algum dado muda
  return useMemo(() => ({ climate, soil, vegetation, terrain, mode }), [climate, soil, vegetation, terrain, mode]);
}

export type AreaEnv = ReturnType<typeof useAreaEnvironment>;

/** Indicadores do período (clima, solo, vegetação, relevo) calculados uma vez e compartilhados pelos painéis. */
export function useEnvSummary(env: AreaEnv, period: Period) {
  const { climate, soil, vegetation, terrain } = env;
  const { start, end } = period;
  return useMemo(() => {
    const ci = climate.status === "ready" ? climateIndicators(climate.data.records.filter((r) => r.date >= start && r.date <= end)) : null;
    const si = soil.status === "ready" && soil.data.origin !== "indisponivel" ? soilIndicators(soil.data.records) : null;
    const ni =
      vegetation.status === "ready" && vegetation.data.origin !== "indisponivel"
        ? ndviIndicators(vegetation.data.records.filter((r) => r.date >= start && r.date <= end))
        : null;
    const t = terrain.status === "ready" ? terrain.data : null;
    const anySimulated = [climate, soil, vegetation].some((l) => l.status === "ready" && (l.data as { origin: string }).origin === "simulado");
    return { ci, si, ni, t, anySimulated };
  }, [climate, soil, vegetation, terrain, start, end]);
}
export type EnvSummary = ReturnType<typeof useEnvSummary>;

/** Data efetivamente exibida para cada camada temporal ativa do GIBS. */
export function useLayerDates(layers: EnvLayer[], requested: string) {
  const [dates, setDates] = useState<Record<string, Load<SnappedDate>>>({});
  const ids = layers.map((l) => l.id).join(",");

  useEffect(() => {
    let alive = true;
    for (const l of layers) {
      if (l.render.kind !== "gibs" || l.temporal === "static") continue;
      const { layer, tms } = l.render;
      const w = searchWindow(requested, l.temporal);
      // mantém a imagem atual no mapa enquanto consulta (evita remover/recriar a camada)
      setDates((d) => {
        const prev = d[l.id];
        return { ...d, [l.id]: prev?.status === "ready" ? { ...prev, stale: true } : { status: "loading" } };
      });
      getAvailableDates(layer, tms, w.start, w.end)
        .then((av) => alive && setDates((d) => ({ ...d, [l.id]: { status: "ready", data: snapDate(av, requested) } })))
        .catch((e) => alive && setDates((d) => ({ ...d, [l.id]: { status: "error", error: msg(e) } })));
    }
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, requested]);

  return dates;
}
