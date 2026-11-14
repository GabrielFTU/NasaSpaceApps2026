import { useEffect, useState } from "react";
import type { Property, ZarcResult } from "@/types";
import { getZarc } from "@/services/zarc";

/** Janelas do ZARC para o município e o solo da propriedade. `null` enquanto carrega. */
export function useZarc(property: Property | null): ZarcResult | null {
  const [state, setState] = useState<ZarcResult | null>(null);
  const city = property?.city;
  const uf = property?.state;
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
