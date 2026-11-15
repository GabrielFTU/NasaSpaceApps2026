import { useEffect, useState } from "react";
import type { Property, ZarcResult } from "@/types";
import { getZarc, type Place } from "@/services/zarc";

/**
 * Janelas do ZARC para um município, usando o solo da propriedade.
 * Sem `place`, usa o município da propriedade. `null` enquanto carrega.
 */
export function useZarc(property: Property | null, place?: Place | null): ZarcResult | null {
  const [state, setState] = useState<ZarcResult | null>(null);
  const city = place?.city ?? property?.city;
  const uf = place?.state ?? property?.state;
  const texture = property?.soil.texture;

  useEffect(() => {
    if (!city || !uf || !texture) return;
    let alive = true;
    setState(null);
    getZarc({ city, state: uf }, texture).then((z) => alive && setState(z));
    return () => {
      alive = false;
    };
  }, [city, uf, texture]);

  return state;
}
