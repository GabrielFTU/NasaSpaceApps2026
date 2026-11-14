import { parseISODate, toISODate } from "@/lib/format";

/**
 * Datas realmente publicadas de uma camada do GIBS (WMTS DescribeDomains).
 *
 * O WMS do GIBS devolve uma imagem transparente (HTTP 200) quando a data pedida não existe —
 * sem consultar o domínio, o mapa ficaria vazio sem explicação. Por isso a interface sempre
 * encaixa a data escolhida na data publicada mais próxima e informa o encaixe ao usuário.
 */

export const GIBS_WMS_3857 = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi";
const DOMAINS = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0";

const cache = new Map<string, Promise<string[]>>();

/** Expande "2026-08-01/2026-11-06/P1D,2026-11-08" em datas ISO, limitado a `cap` itens. */
export function expandDomain(domain: string, cap = 5000): string[] {
  const out: string[] = [];
  for (const part of domain.split(",").map((s) => s.trim()).filter(Boolean)) {
    const [a, b, period] = part.split("/");
    if (!b) {
      out.push(a.slice(0, 10));
      continue;
    }
    const m = /^P(\d+)([DM])$/.exec(period ?? "P1D");
    const step = m ? Number(m[1]) : 1;
    const unit = m?.[2] ?? "D";
    const end = b.slice(0, 10);
    for (let d = parseISODate(a); toISODate(d) <= end && out.length < cap; ) {
      out.push(toISODate(d));
      if (unit === "M") d.setMonth(d.getMonth() + step);
      else d.setDate(d.getDate() + step);
    }
  }
  return [...new Set(out)].sort();
}

/** Datas disponíveis da camada entre `start` e `end` (inclusive). */
export function getAvailableDates(layer: string, tms: string, start: string, end: string): Promise<string[]> {
  const key = `${layer}:${start}:${end}`;
  if (!cache.has(key)) {
    const p = fetch(`${DOMAINS}/${layer}/default/${tms}/all/${start}--${end}.xml`, { signal: AbortSignal.timeout(20000) })
      .then((r) => {
        if (!r.ok) throw new Error(`GIBS respondeu HTTP ${r.status}`);
        return r.text();
      })
      .then((xml) => {
        const doc = new DOMParser().parseFromString(xml, "application/xml");
        const domain = doc.getElementsByTagName("Domain")[0]?.textContent ?? "";
        return expandDomain(domain).filter((d) => d >= start && d <= end);
      })
      .catch((e) => {
        cache.delete(key);
        throw e;
      });
    cache.set(key, p);
  }
  return cache.get(key)!;
}

export interface SnappedDate {
  /** Data efetivamente exibida, ou null se não houver nenhuma na janela consultada. */
  date: string | null;
  requested: string;
  exact: boolean;
  /** Diferença em dias entre pedida e exibida (negativo = anterior). */
  deltaDays: number;
  available: string[];
}

/** Mais recente ≤ pedida; se não houver, a primeira depois. */
export function snapDate(available: string[], requested: string): SnappedDate {
  let date: string | null = null;
  for (const d of available) if (d <= requested) date = d;
  if (!date) date = available.find((d) => d > requested) ?? null;
  const deltaDays = date ? Math.round((parseISODate(date).getTime() - parseISODate(requested).getTime()) / 86400000) : 0;
  return { date, requested, exact: date === requested, deltaDays, available };
}

/** Janela de busca de datas em torno da data pedida, adequada à frequência da camada. */
export function searchWindow(requested: string, temporal: "daily" | "16day" | "monthly") {
  const back = temporal === "monthly" ? 420 : temporal === "16day" ? 120 : 60;
  const s = parseISODate(requested);
  s.setDate(s.getDate() - back);
  const e = parseISODate(requested);
  e.setDate(e.getDate() + (temporal === "monthly" ? 40 : 20));
  return { start: toISODate(s), end: toISODate(e) };
}
