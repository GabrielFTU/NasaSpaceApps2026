import { useCallback, useEffect, useState } from "react";
import { getExtendedForecast, getForecast, type Forecast } from "@/services/forecast";

type State = { status: "loading" } | { status: "error"; error: string } | { status: "ready"; data: Forecast };

/** `extended`: previsão de 30 dias (conjunto); senão, a de 16 dias (determinística). */
export function useForecast(lat?: number, lon?: number, extended = false) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (lat === undefined || lon === undefined) return;
    let alive = true;
    setState({ status: "loading" });
    (extended ? getExtendedForecast : getForecast)(lat, lon)
      .then((data) => alive && setState({ status: "ready", data }))
      .catch((e: unknown) => alive && setState({ status: "error", error: e instanceof Error ? e.message : "Falha ao carregar a previsão." }));
    return () => {
      alive = false;
    };
  }, [lat, lon, extended, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
