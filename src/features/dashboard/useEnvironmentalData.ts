import { useCallback, useEffect, useState } from "react";
import type { ClimateSeries, Property, SoilMoistureResult, VegetationResult } from "@/types";
import { getDailyClimate, getSoilMoisture, getVegetationIndex } from "@/services/nasa";
import { useAppStore } from "@/app/store";

type Ready = { status: "ready"; climate: ClimateSeries; soil: SoilMoistureResult; vegetation: VegetationResult };
type State = { status: "idle" | "loading" } | { status: "error"; error: string } | Ready;

export function useEnvironmentalData(property: Property | null) {
  const mode = useAppStore((s) => s.settings.powerMode);
  const [state, setState] = useState<State>({ status: "idle" });
  const [nonce, setNonce] = useState(0);
  const lat = property?.latitude;
  const lon = property?.longitude;

  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    let alive = true;
    setState({ status: "loading" });
    Promise.all([getDailyClimate(lat, lon, mode), getSoilMoisture(lat, lon, mode), getVegetationIndex(lat, lon, mode)])
      .then(([climate, soil, vegetation]) => alive && setState({ status: "ready", climate, soil, vegetation }))
      .catch((e: unknown) => alive && setState({ status: "error", error: e instanceof Error ? e.message : "Erro desconhecido." }));
    return () => {
      alive = false;
    };
  }, [lat, lon, mode, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload } as State & { reload: () => void };
}
