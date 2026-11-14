import { useEffect, useState } from "react";
import type { ClimateSeries, SoilMoistureResult, VegetationResult } from "@/types";
import { useAppStore } from "@/app/store";
import { browserEnvironmentProvider as provider } from "@/services/environment/provider";
import type { TerrainStats } from "@/services/environment/terrain";
import { getAvailableDates, searchWindow, snapDate, type SnappedDate } from "@/services/environment/gibsTime";
import type { EnvLayer } from "@/services/environment/catalog";
import type { Period } from "./period";

export type Load<T> = { status: "idle" } | { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: T };

const msg = (e: unknown) => (e instanceof Error ? e.message : "Erro desconhecido.");

function useLoad<T>(enabled: boolean, deps: unknown[], loader: () => Promise<T>): Load<T> {
  const [state, setState] = useState<Load<T>>({ status: "idle" });
  useEffect(() => {
    if (!enabled) return setState({ status: "idle" });
    let alive = true;
    setState({ status: "loading" });
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
  return { climate, soil, vegetation, terrain, mode };
}

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
      setDates((d) => ({ ...d, [l.id]: { status: "loading" } }));
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
