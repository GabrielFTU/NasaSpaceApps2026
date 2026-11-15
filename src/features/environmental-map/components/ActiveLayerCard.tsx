import { useEffect, useState } from "react";
import { loadLegendScale, type LegendScale, type UnitConversion } from "@/services/environment/colormap";
import { ChevronDown, ChevronLeft, ChevronRight, CircleSlash, Info, Loader2, ZoomIn } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt, formatDate } from "@/lib/format";
import { SLOPE_CLASSES, TEXTURE_STYLE, type EnvLayer, type LayerId } from "@/services/environment/catalog";
import type { SnappedDate } from "@/services/environment/gibsTime";
import type { AreaEnv, EnvSummary, Load } from "../hooks";
import { availableEnd } from "../period";
import type { LayerChip } from "./LayerBar";

interface Props {
  layer: EnvLayer;
  chip: LayerChip;
  env: AreaEnv;
  summary: EnvSummary;
  texture: string;
  hasBoundary: boolean;
  opacity: number;
  onOpacity: (v: number) => void;
  onVariant: (id: LayerId) => void;
  date?: Load<SnappedDate>;
  mapDate: string;
  onMapDate: (d: string) => void;
  onStep: (dir: -1 | 1) => void;
  tileError: boolean;
}

type Tone = "good" | "mid" | "low";
interface Hero {
  value: string | null;
  unit?: string;
  badge?: { label: string; tone: Tone };
  note?: string;
  date?: string | null;
  load?: Load<unknown>;
  unavailable?: string;
}

const n = (x: number | null | undefined, f = fmt.n1) => (x === null || x === undefined ? null : f(x));

/** Valor principal da camada ativa, calculado com os dados da área selecionada. */
function heroFor(layer: EnvLayer, chip: LayerChip, env: AreaEnv, s: EnvSummary, texture: string, hasBoundary: boolean): Hero {
  const { ci, si, ni, t } = s;
  switch (chip.key) {
    case "ndvi": {
      const v = ni?.last?.ndvi ?? null;
      const badge: Hero["badge"] =
        v === null ? undefined : v < 0.3 ? { label: "Vigor baixo", tone: "low" } : v < 0.6 ? { label: "Vigor moderado", tone: "mid" } : { label: "Vigor alto", tone: "good" };
      return {
        value: n(v, fmt.n2),
        badge,
        date: ni?.last?.date,
        load: env.vegetation,
        unavailable: env.vegetation.status === "ready" && env.vegetation.data.origin === "indisponivel" ? env.vegetation.data.reason : undefined,
      };
    }
    case "precip":
      return { value: n(ci?.totalPrecip, fmt.n0), unit: "mm", note: ci ? `acumulado no período · ${ci.rainyDays} dias com chuva` : undefined, load: env.climate };
    case "soilwater": {
      const root = layer.id === "smap_root";
      return {
        value: n(root ? si?.last?.rootZone : si?.last?.surface, fmt.n2),
        unit: "m³/m³",
        note: root ? "zona das raízes (0–100 cm)" : "superfície (0–5 cm)",
        date: si?.last?.date,
        load: env.soil,
        unavailable: env.soil.status === "ready" && env.soil.data.origin === "indisponivel" ? env.soil.data.reason : undefined,
      };
    }
    case "temp":
      return { value: n(ci?.meanTemp), unit: "°C", note: ci ? `média do período · ${n(ci.minTemp) ?? "—"} a ${n(ci.maxTemp) ?? "—"} °C` : undefined, load: env.climate };
    case "rh":
      return { value: n(ci?.meanRh, fmt.n0), unit: "%", note: "média do período", load: env.climate };
    case "elevation":
      return {
        value: n(t?.elevation.mean, fmt.n0),
        unit: "m",
        note: t ? `de ${fmt.n0(t.elevation.min)} a ${fmt.n0(t.elevation.max)} m` : undefined,
        load: hasBoundary ? env.terrain : undefined,
        unavailable: hasBoundary ? undefined : "Desenhe o contorno do talhão para calcular.",
      };
    case "slope": {
      const dom = t ? t.slopeClasses.indexOf(Math.max(...t.slopeClasses)) : -1;
      return {
        value: n(t?.slope.mean),
        unit: "%",
        badge: dom >= 0 ? { label: SLOPE_CLASSES[dom].label, tone: dom <= 1 ? "good" : dom <= 3 ? "mid" : "low" } : undefined,
        note: "inclinação média",
        load: hasBoundary ? env.terrain : undefined,
        unavailable: hasBoundary ? undefined : "Desenhe o contorno do talhão para calcular.",
      };
    }
    default:
      return { value: TEXTURE_STYLE[texture]?.label ?? null, note: "textura cadastrada" };
  }
}

const TONE: Record<Tone, string> = {
  good: "bg-primary-soft text-primary-soft-foreground",
  mid: "bg-[#eef6d9] text-[#46600b]",
  low: "bg-warning-soft text-warning",
};

/** Painel da camada ativa: valor da área, o que significa, data e fonte. Ajustes técnicos ficam recolhidos. */
export function ActiveLayerCard(p: Props) {
  const { layer, chip } = p;
  const [details, setDetails] = useState(false);
  const [help, setHelp] = useState(false);
  const Icon = chip.icon;
  const temporal = layer.render.kind === "gibs" && layer.temporal !== "static";
  const h = heroFor(layer, chip, p.env, p.summary, p.texture, p.hasBoundary);
  const loading = !h.unavailable && h.value === null && (!h.load || h.load.status === "loading" || h.load.status === "idle");
  const stale = h.load?.status === "ready" && !!h.load.stale;
  const shown = p.date?.status === "ready" ? p.date.data.date : null;
  const obs = h.date ?? shown;

  const probe = layer.render.kind === "gibs" ? layer.render.probe : undefined;

  return (
    <section className="flex flex-col rounded-lg border border-border bg-surface p-5 shadow-card" aria-label={`Camada: ${chip.label}`}>
      <header className="flex items-center gap-2.5">
        <Icon className="size-[18px] text-primary" />
        <h2 className="flex-1 text-[15px] font-semibold">{layer.id === "ndvi" ? "Vegetação (NDVI)" : chip.label}</h2>
        <button
          type="button"
          onClick={() => setHelp((v) => !v)}
          aria-expanded={help}
          aria-label="Como ler o mapa"
          title="Como ler o mapa"
          className={cn("cursor-pointer rounded-full p-1 transition-colors hover:bg-muted hover:text-foreground", help ? "text-primary" : "text-subtle-foreground")}
        >
          <Info className="size-4" />
        </button>
      </header>

      {help && (
        <p className="animate-in mt-3 rounded-md bg-muted px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
          {chip.read}
          {probe && <> Passe o mouse no mapa para ler o valor de cada ponto.</>}
        </p>
      )}

      <div className={cn("mt-5 min-h-[52px] transition-opacity", stale && "opacity-60")}>
        {h.unavailable ? (
          <p className="flex items-start gap-1.5 text-[13px] text-muted-foreground">
            <CircleSlash className="mt-0.5 size-3.5 shrink-0" /> {h.unavailable}
          </p>
        ) : loading ? (
          <div role="status" className="h-11 w-32 animate-pulse rounded-md bg-muted"><span className="sr-only">Carregando…</span></div>
        ) : h.load?.status === "error" ? (
          <p className="text-[13px] text-danger">Não disponível agora.</p>
        ) : (
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <p className="tabular font-display text-[44px] font-bold leading-none tracking-tight">
              {h.value ?? "—"}
              {h.unit && <span className="ml-1.5 text-lg font-semibold text-muted-foreground">{h.unit}</span>}
            </p>
            {h.badge && <span className={cn("rounded-full px-3 py-1 text-[13px] font-semibold", TONE[h.badge.tone])}>{h.badge.label}</span>}
          </div>
        )}
        {h.note && !h.unavailable && <p className="mt-1.5 text-xs text-muted-foreground">{h.note}</p>}
      </div>

      <p className="mt-3 text-[13px] leading-relaxed text-muted-foreground">{chip.what}</p>

      <p className="tabular mt-5 border-t border-border pt-4 text-xs text-subtle-foreground" title={`${layer.product} · ${layer.spatialResolution}`}>
        {obs ? formatDate(obs, { day: "2-digit", month: "short", year: "numeric" }) : "Sem data"} <span className="mx-1">·</span> {layer.source}
      </p>

      {(temporal || chip.layers.length > 1 || layer.render.kind !== "user") && (
        <>
          <button
            type="button"
            onClick={() => setDetails((v) => !v)}
            aria-expanded={details}
            className="mt-3 flex cursor-pointer items-center gap-1 self-start text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Ajustes do mapa
            <ChevronDown className={cn("size-3.5 transition-transform duration-200", details && "rotate-180")} />
          </button>

          {details && (
            <div className="animate-in mt-3 space-y-3 text-xs">
              {chip.layers.length > 1 && (
                <Row label="Profundidade">
                  <div className="flex gap-1">
                    {(
                      [
                        ["smap_surface", "Superfície"],
                        ["smap_root", "Raízes"],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => p.onVariant(id)}
                        className={cn(
                          "cursor-pointer rounded-full px-2.5 py-1 font-medium transition-colors",
                          layer.id === id ? "bg-foreground text-white" : "text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </Row>
              )}

              {temporal && (
                <Row label="Imagem">
                  <div className="flex items-center gap-0.5">
                    <IconBtn onClick={() => p.onStep(-1)} label="Imagem anterior">
                      <ChevronLeft />
                    </IconBtn>
                    <label className="relative cursor-pointer rounded-full px-2 py-1 font-medium tabular hover:bg-muted">
                      {shown ? formatDate(shown, layer.temporal === "monthly" ? { month: "short", year: "numeric" } : { day: "2-digit", month: "short", year: "numeric" }) : "—"}
                      <input
                        type="date"
                        aria-label="Data da imagem"
                        className="absolute inset-0 cursor-pointer opacity-0"
                        value={p.mapDate}
                        min="2000-03-01"
                        max={availableEnd()}
                        onChange={(e) => e.target.value && p.onMapDate(e.target.value)}
                      />
                    </label>
                    <IconBtn onClick={() => p.onStep(1)} disabled={p.mapDate >= availableEnd()} label="Próxima imagem">
                      <ChevronRight />
                    </IconBtn>
                  </div>
                </Row>
              )}
              {temporal && <DateIssue layer={layer} date={p.date} error={p.tileError} />}

              {layer.render.kind !== "user" && (
                <Row label="Opacidade">
                  <div className="flex w-36 items-center gap-2">
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
                    <span className="tabular w-8 text-right text-muted-foreground">{Math.round(p.opacity * 100)}%</span>
                  </div>
                </Row>
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-h-7 items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

function IconBtn({ onClick, disabled, label, children }: { onClick: () => void; disabled?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="flex size-6 cursor-pointer items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-default disabled:opacity-30 [&_svg]:size-3.5"
    >
      {children}
    </button>
  );
}

/** Paleta oficial da camada (já na unidade do app), para colorir a área com o valor médio. */
export function useLayerScale(layer: EnvLayer | null) {
  const from = layer?.render.kind === "gibs" ? layer.render.legendFrom : undefined;
  const [scale, setScale] = useState<LegendScale | null>(null);
  useEffect(() => {
    setScale(null);
    if (!from) return;
    let alive = true;
    loadLegendScale(from.colormap, from.conversion)
      .then((s) => alive && setScale(s))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [from?.colormap]);
  return scale;
}

/** Cor da faixa da paleta que contém `v`. */
export function colorAt(scale: LegendScale, v: number) {
  let c = scale.stops[0]?.color;
  for (const s of scale.stops) if (v >= s.value) c = s.color;
  return c;
}

/** Legenda compacta que flutua sobre o mapa. */
export function MapLegend({ layer, title, zoom }: { layer: EnvLayer; title: string; zoom: number }) {
  return (
    <div className="pointer-events-auto w-[min(270px,calc(100vw-3rem))] rounded-md bg-white/95 px-3 py-2.5 shadow-card">
      <p className="mb-1.5 text-xs font-semibold">{title}</p>
      <Legend layer={layer} zoom={zoom} />
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

  if (state.failed && layer.render.kind === "gibs")
    return <img src={layer.render.legendUrl} alt={`Legenda oficial: ${layer.label}`} className="w-full rounded-sm bg-white" />;
  if (!state.scale) return <div className="h-7 animate-pulse rounded-sm bg-muted" />;

  const { stops, min, max, unit } = state.scale;
  const span = max - min || 1;
  const gradient = `linear-gradient(to right, ${stops.map((s) => `${s.color} ${(((s.value - min) / span) * 100).toFixed(2)}%`).join(", ")})`;
  const step = span > 120 ? 40 : span > 60 ? 20 : 10;
  const ticks: number[] = [];
  for (let t = Math.ceil(min / step) * step; t <= max; t += step) ticks.push(t);

  return (
    <div>
      <div className="h-2.5 w-full rounded-sm" style={{ background: gradient }} role="img" aria-label={`Escala de ${Math.round(min)} a ${Math.round(max)} ${unit}`} />
      <div className="relative mt-0.5 h-4 text-[11px] text-muted-foreground">
        {ticks.map((t) => (
          <span key={t} className="tabular absolute -translate-x-1/2" style={{ left: `${((t - min) / span) * 100}%` }}>
            {t}
          </span>
        ))}
      </div>
      <p className="text-right text-[10px] text-muted-foreground">{unit}</p>
    </div>
  );
}

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
            </li>
          ))}
        </ul>
        {zoom < 12 && (
          <p className="mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-warning">
            <ZoomIn className="size-3.5" /> Aproxime o mapa para ver.
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

/** Só aparece quando há algo a avisar sobre a imagem — o caso normal fica em silêncio. */
function DateIssue({ layer, date, error }: { layer: EnvLayer; date?: Load<SnappedDate>; error: boolean }) {
  const base = "flex items-center justify-end gap-1.5 text-[11px]";
  if (!date || date.status === "loading" || date.status === "idle" || (date.status === "ready" && date.stale))
    return (
      <p className={cn(base, "text-muted-foreground")}>
        <Loader2 className="size-3 animate-spin" /> Procurando imagem…
      </p>
    );
  if (date.status === "error") return <p className={cn(base, "text-danger")}>NASA indisponível agora.</p>;
  if (!date.data.date) return <p className={cn(base, "text-warning")}>Sem imagem perto desta data.</p>;
  if (error) return <p className={cn(base, "text-danger")}>Parte da imagem não carregou.</p>;
  if (!date.data.exact && layer.temporal === "daily") return <p className={cn(base, "text-subtle-foreground")}>Mostrando a imagem mais próxima.</p>;
  return null;
}
