import { useEffect, useState } from "react";
import { loadLegendScale, type LegendScale, type UnitConversion } from "@/services/environment/colormap";
import { CalendarClock, ChevronDown, ChevronLeft, ChevronRight, CircleSlash, ExternalLink, Loader2, Minus, MousePointer2, Satellite, ZoomIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/form";
import { Segmented } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import { SLOPE_CLASSES, TEXTURE_STYLE, type EnvLayer, type LayerId } from "@/services/environment/catalog";
import type { SnappedDate } from "@/services/environment/gibsTime";
import type { Load } from "../hooks";
import { availableEnd } from "../period";
import type { LayerChip } from "./LayerBar";

interface Props {
  layer: EnvLayer;
  chip: LayerChip;
  opacity: number;
  onOpacity: (v: number) => void;
  onVariant: (id: LayerId) => void;
  date?: Load<SnappedDate>;
  mapDate: string;
  onMapDate: (d: string) => void;
  onStep: (dir: -1 | 1) => void;
  zoom: number;
  tileError: boolean;
}

/** Cartão único da camada ativa: o que mostra, como ler, legenda, data, transparência e fonte. */
export function ActiveLayerCard(p: Props) {
  const { layer, chip } = p;
  const [min, setMin] = useState(false);
  const [about, setAbout] = useState(false);
  const Icon = chip.icon;
  const temporal = layer.render.kind === "gibs" && layer.temporal !== "static";

  if (min)
    return (
      <button
        type="button"
        onClick={() => setMin(false)}
        className="pointer-events-auto flex cursor-pointer items-center gap-2 rounded-full bg-surface/95 px-3 py-2 text-[13px] font-medium shadow-md backdrop-blur"
      >
        <Icon className="size-4 text-primary" /> {chip.label} · ver legenda
      </button>
    );

  return (
    <div className="pointer-events-auto w-[min(340px,calc(100vw-1.5rem))] rounded-lg border border-border bg-surface/95 shadow-md backdrop-blur">
      <div className="flex items-start gap-2 px-3 pt-2.5">
        <Icon className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">{chip.label}</p>
          <p className="text-[13px] leading-snug text-muted-foreground">{chip.what}</p>
        </div>
        <Button variant="ghost" size="icon-sm" className="-mr-1 -mt-1" onClick={() => setMin(true)} aria-label="Minimizar legenda" title="Minimizar">
          <Minus />
        </Button>
      </div>

      <div className="space-y-2.5 px-3 pb-3 pt-2">
        {chip.layers.length > 1 && (
          <Segmented
            aria-label="Profundidade"
            value={layer.id}
            onChange={p.onVariant}
            options={[
              { value: "smap_surface", label: "Superfície (0–5 cm)" },
              { value: "smap_root", label: "Raízes (0–100 cm)" },
            ]}
          />
        )}

        <Legend layer={layer} zoom={p.zoom} />
        <p className="text-xs leading-snug text-foreground">{chip.read}</p>
        {layer.render.kind === "gibs" && layer.render.probe && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-primary" title={`Lido da imagem da NASA pela paleta oficial · precisão ${layer.render.probe.precision}`}>
            <MousePointer2 className="size-3.5" /> Passe o mouse no mapa para ver o valor ({layer.render.probe.unit}).
          </p>
        )}

        {temporal && (
          <div>
            <div className="flex items-center gap-1">
              <Button variant="outline" size="icon-sm" onClick={() => p.onStep(-1)} aria-label="Imagem anterior" title="Imagem anterior">
                <ChevronLeft />
              </Button>
              <Input
                type="date"
                aria-label="Data da imagem"
                className="h-8 flex-1 text-[13px]"
                value={p.mapDate}
                min="2000-03-01"
                max={availableEnd()}
                onChange={(e) => e.target.value && p.onMapDate(e.target.value)}
              />
              <Button variant="outline" size="icon-sm" onClick={() => p.onStep(1)} disabled={p.mapDate >= availableEnd()} aria-label="Próxima imagem" title="Próxima imagem">
                <ChevronRight />
              </Button>
            </div>
            <DateLine layer={layer} date={p.date} error={p.tileError} />
          </div>
        )}

        <label className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">Transparência</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.05}
            value={p.opacity}
            onChange={(e) => p.onOpacity(Number(e.target.value))}
            className="h-1 w-full cursor-pointer"
            aria-label="Opacidade da camada"
          />
          <span className="tabular w-8 text-right">{Math.round(p.opacity * 100)}%</span>
        </label>

        <div className="border-t border-border pt-2">
          <button
            type="button"
            onClick={() => setAbout(!about)}
            className="flex w-full cursor-pointer items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
            aria-expanded={about}
          >
            Sobre os dados · {layer.source}
            <ChevronDown className={cn("size-3.5 transition-transform", about && "rotate-180")} />
          </button>
          {about && (
            <div className="animate-in mt-1.5 space-y-1 text-xs leading-relaxed text-muted-foreground">
              <p className="text-foreground">{layer.product}</p>
              <p>
                Detalhe: <span className="text-foreground">{layer.spatialResolution}</span> · Frequência: <span className="text-foreground">{layer.temporalLabel}</span>
              </p>
              <p>{layer.limitations}</p>
              {layer.sourceUrl && (
                <a href={layer.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                  Sobre o produto <ExternalLink className="size-3" />
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** Régua desenhada a partir da paleta oficial com a unidade convertida (ex.: K → °C). */
function ScaleLegend({ layer, colormap, conversion }: { layer: EnvLayer; colormap: string; conversion: UnitConversion }) {
  const [state, setState] = useState<{ scale?: LegendScale; failed?: boolean }>({});
  useEffect(() => {
    let alive = true;
    loadLegendScale(colormap, conversion)
      .then((scale) => alive && setState({ scale }))
      .catch(() => alive && setState({ failed: true }));
    return () => {
      alive = false;
    };
  }, [colormap, conversion]);

  // sem a paleta: mostra a legenda oficial e explica a conversão
  if (state.failed && layer.render.kind === "gibs")
    return (
      <>
        <img src={layer.render.legendUrl} alt={`Legenda oficial: ${layer.label}`} className="w-full rounded-sm bg-white" />
        <p className="text-[11px] text-muted-foreground">Legenda oficial em Kelvin: °C = K − 273,15 (ex.: 300 K = 27 °C).</p>
      </>
    );
  if (!state.scale) return <div className="h-9 animate-pulse rounded-sm bg-muted" />;

  const { stops, min, max, unit } = state.scale;
  const span = max - min || 1;
  const gradient = `linear-gradient(to right, ${stops.map((s) => `${s.color} ${(((s.value - min) / span) * 100).toFixed(2)}%`).join(", ")})`;
  const step = span > 120 ? 20 : 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) ticks.push(t);

  return (
    <div>
      <div className="h-3 w-full rounded-sm" style={{ background: gradient }} role="img" aria-label={`Escala de ${fmtN(min)} a ${fmtN(max)} ${unit}`} />
      <div className="relative mt-0.5 h-4 text-[11px] text-muted-foreground">
        {ticks.map((t) => (
          <span key={t} className="tabular absolute -translate-x-1/2" style={{ left: `${((t - min) / span) * 100}%` }}>
            {t}
          </span>
        ))}
      </div>
      <p className="text-right text-[11px] font-medium text-foreground">{unit}</p>
    </div>
  );
}

const fmtN = (v: number) => Math.round(v).toString();

function Legend({ layer, zoom }: { layer: EnvLayer; zoom: number }) {
  if (layer.render.kind === "gibs" && layer.render.legendFrom)
    return <ScaleLegend layer={layer} colormap={layer.render.legendFrom.colormap} conversion={layer.render.legendFrom.conversion} />;
  if (layer.render.kind === "gibs") return <img src={layer.render.legendUrl} alt={`Legenda oficial: ${layer.label}`} className="w-full rounded-sm bg-white" loading="lazy" />;
  if (layer.render.kind === "computed")
    return (
      <>
        <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
          {SLOPE_CLASSES.map((c) => (
            <li key={c.label} className="flex items-center gap-1.5">
              <span className="inline-block size-2.5 shrink-0 rounded-sm" style={{ background: c.color }} />
              <span className="truncate">{c.label}</span>
              <span className="tabular ml-auto text-muted-foreground">{c.range}</span>
            </li>
          ))}
        </ul>
        {zoom < 12 && (
          <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
            <ZoomIn className="size-3.5" /> Aproxime o mapa para ver a declividade.
          </p>
        )}
      </>
    );
  return (
    <ul className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px]">
      {Object.values(TEXTURE_STYLE).map((t) => (
        <li key={t.label} className="flex items-center gap-1.5">
          <span className="inline-block size-2.5 rounded-sm" style={{ background: t.color }} />
          {t.label}
        </li>
      ))}
    </ul>
  );
}

function DateLine({ layer, date, error }: { layer: EnvLayer; date?: Load<SnappedDate>; error: boolean }) {
  const base = "mt-1 flex items-center gap-1.5 text-[11px]";
  if (!date || date.status === "loading" || date.status === "idle")
    return (
      <p className={cn(base, "text-muted-foreground")}>
        <Loader2 className="size-3.5 animate-spin" /> Procurando a imagem mais próxima…
      </p>
    );
  if (date.status === "error")
    return (
      <p className={cn(base, "text-danger")}>
        <CircleSlash className="size-3.5" /> Não foi possível consultar a NASA agora.
      </p>
    );
  const d = date.data;
  if (!d.date)
    return (
      <p className={cn(base, "text-warning")}>
        <CircleSlash className="size-3.5" /> Não há imagem publicada perto desta data.
      </p>
    );
  const shown = layer.temporal === "monthly" ? formatDate(d.date, { month: "long", year: "numeric" }) : formatDate(d.date);
  return (
    <>
      <p className={cn(base, "text-foreground")}>
        {date.stale ? <Loader2 className="size-3.5 animate-spin" /> : <Satellite className="size-3.5 text-success" />}
        Imagem real da NASA de {layer.temporal === "16day" ? `16 dias a partir de ${shown}` : shown}
      </p>
      {!d.exact && layer.temporal === "daily" && (
        <p className={cn(base, "mt-0.5 text-warning")}>
          <CalendarClock className="size-3.5" /> Sem imagem no dia escolhido — mostrando a mais próxima.
        </p>
      )}
      {error && <p className={cn(base, "mt-0.5 text-danger")}>Parte da imagem não carregou.</p>}
    </>
  );
}
