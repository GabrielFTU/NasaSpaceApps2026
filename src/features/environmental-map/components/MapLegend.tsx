import { useState } from "react";
import { CalendarClock, ChevronDown, CircleSlash, Loader2, Satellite, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { SLOPE_CLASSES, TEXTURE_STYLE, type EnvLayer } from "@/services/environment/catalog";
import type { SnappedDate } from "@/services/environment/gibsTime";
import type { Load } from "../hooks";

interface Item {
  layer: EnvLayer;
  date?: Load<SnappedDate>;
}

export function MapLegend({ items, zoom, tileErrors }: { items: Item[]; zoom: number; tileErrors: Set<string> }) {
  const [collapsed, setCollapsed] = useState(false);
  if (!items.length) return null;
  return (
    <div className="pointer-events-auto w-[min(320px,calc(100vw-2rem))] overflow-hidden rounded-lg border border-border bg-surface/95 shadow-md backdrop-blur">
      <button
        type="button"
        onClick={() => setCollapsed(!collapsed)}
        className="flex w-full cursor-pointer items-center justify-between px-3 py-2 text-left text-[13px] font-semibold"
        aria-expanded={!collapsed}
      >
        Legenda · {items.length} {items.length === 1 ? "camada" : "camadas"}
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", !collapsed && "rotate-180")} />
      </button>
      {!collapsed && (
        <div className="max-h-[42vh] divide-y divide-border overflow-y-auto border-t border-border">
          {[...items].sort((a, b) => b.layer.z - a.layer.z).map(({ layer, date }) => (
            <div key={layer.id} className="px-3 py-2.5">
              <div className="flex items-baseline justify-between gap-2">
                <p className="text-[13px] font-medium">{layer.short}</p>
                <p className="truncate text-[11px] text-muted-foreground">{layer.source}</p>
              </div>

              {layer.render.kind === "gibs" && (
                <>
                  <img src={layer.render.legendUrl} alt={`Legenda oficial: ${layer.label}`} className="mt-1.5 w-full rounded-sm bg-white" loading="lazy" />
                  <DateLine layer={layer} date={date} error={tileErrors.has(layer.id)} />
                </>
              )}

              {layer.render.kind === "computed" && (
                <>
                  <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                    {SLOPE_CLASSES.map((c) => (
                      <li key={c.label} className="flex items-center gap-1.5">
                        <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
                        <span className="truncate">{c.label}</span>
                        <span className="tabular ml-auto text-muted-foreground">{c.range}</span>
                      </li>
                    ))}
                  </ul>
                  {zoom < 12 && (
                    <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-warning">
                      <ZoomIn className="size-3.5" /> Aproxime o mapa (zoom ≥ 12) para calcular a declividade.
                    </p>
                  )}
                </>
              )}

              {layer.render.kind === "user" && (
                <ul className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
                  {Object.values(TEXTURE_STYLE).map((t) => (
                    <li key={t.label} className="flex items-center gap-1.5">
                      <span className="inline-block size-2.5 rounded-sm" style={{ background: t.color }} />
                      {t.label}
                    </li>
                  ))}
                </ul>
              )}

              <p className="mt-1 text-[11px] text-muted-foreground">Resolução: {layer.spatialResolution}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DateLine({ layer, date, error }: { layer: EnvLayer; date?: Load<SnappedDate>; error: boolean }) {
  if (layer.temporal === "static")
    return (
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Satellite className="size-3.5" /> Imagem real NASA · {layer.temporalLabel}
      </p>
    );
  if (!date || date.status === "loading" || date.status === "idle")
    return (
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="size-3.5 animate-spin" /> Consultando datas publicadas…
      </p>
    );
  if (date.status === "error")
    return (
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-danger">
        <CircleSlash className="size-3.5" /> Não foi possível consultar o GIBS ({date.error}).
      </p>
    );
  const d = date.data;
  if (!d.date)
    return (
      <p className="mt-1 flex items-center gap-1.5 text-[11px] text-warning">
        <CircleSlash className="size-3.5" /> Sem imagem publicada perto de {formatDate(d.requested)}.
      </p>
    );
  const fmtD = layer.temporal === "monthly" ? formatDate(d.date, { month: "long", year: "numeric" }) : formatDate(d.date);
  return (
    <div className="mt-1 text-[11px]">
      <p className="flex items-center gap-1.5 text-foreground">
        <Satellite className="size-3.5 text-success" />
        Imagem real NASA · {layer.temporal === "16day" ? `composição iniciada em ${fmtD}` : fmtD}
      </p>
      {!d.exact && layer.temporal === "daily" && (
        <p className="mt-0.5 flex items-center gap-1.5 text-warning">
          <CalendarClock className="size-3.5" />
          {d.deltaDays < 0 ? `${Math.abs(d.deltaDays)} dia(s) antes` : `${d.deltaDays} dia(s) depois`} da data escolhida — mais próxima publicada.
        </p>
      )}
      {error && <p className="mt-0.5 text-danger">Alguns blocos da imagem falharam ao carregar.</p>}
    </div>
  );
}
