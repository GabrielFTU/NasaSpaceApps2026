import { memo, useMemo, useState, type ReactNode } from "react";
import { ChevronDown, CircleSlash, FlaskConical, Info, Loader2, MapPin, Satellite } from "lucide-react";
import type { DataOrigin } from "@/types";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import { Segmented } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { fmt, formatDate } from "@/lib/format";
import { POWER_SOURCE, SMAP_SOURCE, MODIS_SOURCE } from "@/services/nasa";
import { SLOPE_CLASSES, TEXTURE_STYLE } from "@/services/environment/catalog";
import { TERRAIN_SOURCE } from "@/services/environment/terrain";
import type { Load, useAreaEnvironment } from "../hooks";
import { climateIndicators, ndviIndicators, soilIndicators } from "../indicators";
import { availableEnd, PERIOD_PRESETS, periodDays, presetPeriod, safraLabel, validatePeriod, type Period, type PeriodPreset } from "../period";
import { granularityFor, HumidityChart, NdviChart, RainTempChart, SlopeClassChart, SoilMoistureChart } from "./EnvCharts";

type Env = ReturnType<typeof useAreaEnvironment>;
type Tab = "clima" | "ur" | "solo" | "ndvi" | "relevo";

interface Props {
  env: Env;
  period: Period;
  onPeriod: (p: Period) => void;
  areaName: string;
  areaHa: number | null;
  isDemo: boolean;
  hasBoundary: boolean;
  texture: { value: string; source: "talhão" | "propriedade" };
  open: boolean;
  onToggle: () => void;
}

const v = (x: number | null | undefined, f = fmt.n1) => (x === null || x === undefined ? "—" : f(x));
const originOf = (l: Load<{ origin: string }>) => (l.status === "ready" ? (l.data.origin as DataOrigin) : undefined);

/** Memoizado: zoom, opacidade e demais ajustes do mapa não redesenham indicadores e gráficos. */
export const InsightsDock = memo(function InsightsDock({ env, period, onPeriod, areaName, areaHa, isDemo, hasBoundary, texture, open, onToggle }: Props) {
  const [tab, setTab] = useState<Tab>("clima");
  const { climate, soil, vegetation, terrain } = env;
  const gran = granularityFor(periodDays(period));
  const { start, end } = period;

  const ci = useMemo(
    () => (climate.status === "ready" ? climateIndicators(climate.data.records.filter((r) => r.date >= start && r.date <= end)) : null),
    [climate, start, end],
  );
  const si = useMemo(() => (soil.status === "ready" && soil.data.origin !== "indisponivel" ? soilIndicators(soil.data.records) : null), [soil]);
  const ni = useMemo(
    () =>
      vegetation.status === "ready" && vegetation.data.origin !== "indisponivel"
        ? ndviIndicators(vegetation.data.records.filter((r) => r.date >= start && r.date <= end))
        : null,
    [vegetation, start, end],
  );
  const t = terrain.status === "ready" ? terrain.data : null;
  const dominant = t ? t.slopeClasses.indexOf(Math.max(...t.slopeClasses)) : -1;
  const anySimulated = [climate, soil, vegetation].some((l) => originOf(l as Load<{ origin: string }>) === "simulado");

  return (
    <section className="flex flex-col border-t border-border bg-surface lg:h-full lg:min-h-0" aria-label="Clima e solo da área selecionada">
      {/* Cabeçalho: área + período */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <MapPin className="size-4 shrink-0 text-primary" />
          <h2 className="truncate text-[15px] font-semibold">{areaName}</h2>
          {areaHa !== null && <span className="tabular shrink-0 text-sm text-muted-foreground">{fmt.n2(areaHa)} ha</span>}
          {isDemo && (
            <Badge variant="warning" title="Contorno fictício criado pelo Semeia para demonstração">
              <FlaskConical /> Exemplo
            </Badge>
          )}
        </div>
        <PeriodPicker period={period} onPeriod={onPeriod} />
        <div className="ml-auto flex items-center gap-2">
          {anySimulated ? (
            <Badge variant="warning" title="Algum dado não veio da NASA e foi simulado — veja as etiquetas">
              <FlaskConical /> Inclui dados simulados
            </Badge>
          ) : (
            <Badge variant="success" title="Valores consultados na NASA">
              <Satellite /> Dados NASA
            </Badge>
          )}
          <button
            type="button"
            onClick={onToggle}
            className="flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-primary hover:bg-muted"
            aria-expanded={open}
          >
            {open ? "Recolher" : "Ver clima e solo"}
            <ChevronDown className={cn("size-4 transition-transform", !open && "rotate-180")} />
          </button>
        </div>
      </div>

      {open && (
        <div className="grid min-h-0 flex-1 gap-x-5 gap-y-3 px-4 pb-3 lg:grid-cols-[minmax(0,420px)_1fr]">
          {/* Indicadores */}
          <div className="grid content-start grid-cols-2 gap-x-4 gap-y-2.5 sm:grid-cols-3 lg:grid-cols-2">
            <Indicator label="Chuva" load={climate} origin={originOf(climate)} value={ci && `${v(ci.totalPrecip, fmt.n0)} mm`} detail={ci && `${ci.rainyDays} dias de chuva · seca máx. ${ci.longestDrySpell} d`} />
            <Indicator
              label="Temperatura"
              load={climate}
              origin={originOf(climate)}
              value={ci && `${v(ci.meanTemp)} °C`}
              detail={ci && `${v(ci.minTemp)} a ${v(ci.maxTemp)} °C${ci.frostRiskDays ? ` · ${ci.frostRiskDays} d c/ risco de geada` : ""}`}
            />
            <Indicator label="Umidade do ar" load={climate} origin={originOf(climate)} value={ci && `${v(ci.meanRh, fmt.n0)}%`} detail={ci && "média do período"} />
            <Indicator
              label="Umidade do solo"
              load={soil}
              origin={originOf(soil)}
              unavailable={soil.status === "ready" && soil.data.origin === "indisponivel" ? soil.data.reason : undefined}
              value={si?.last ? `${v(si.last.surface, fmt.n2)} m³/m³` : si ? "—" : null}
              detail={si?.last ? `superfície em ${formatDate(si.last.date, { day: "2-digit", month: "short" })}` : si ? "sem valor no período" : null}
            />
            <Indicator
              label="Vegetação (NDVI)"
              load={vegetation}
              origin={originOf(vegetation)}
              unavailable={vegetation.status === "ready" && vegetation.data.origin === "indisponivel" ? vegetation.data.reason : undefined}
              value={ni?.last ? v(ni.last.ndvi, fmt.n2) : ni ? "—" : null}
              detail={ni && (ni.last ? `de 0 a 1 · ${formatDate(ni.last.date, { day: "2-digit", month: "short" })}` : "sem imagem sem nuvem")}
            />
            <Indicator
              label="Relevo"
              load={hasBoundary ? terrain : undefined}
              origin={t ? "real" : undefined}
              unavailable={!hasBoundary ? "Desenhe o talhão para calcular." : undefined}
              value={t && `${v(t.slope.mean)}% inclinação`}
              detail={t && `${SLOPE_CLASSES[dominant].label.toLowerCase()} · ${fmt.n0(t.elevation.min)}–${fmt.n0(t.elevation.max)} m`}
            />
          </div>

          {/* Gráfico */}
          <div className="flex min-h-[220px] min-w-0 flex-col gap-1.5 lg:min-h-0">
            <Segmented
              aria-label="Gráfico"
              value={tab}
              onChange={setTab}
              className="self-start"
              options={[
                { value: "clima", label: "Chuva e temperatura" },
                { value: "ur", label: "Umidade do ar" },
                { value: "solo", label: "Umidade do solo" },
                { value: "ndvi", label: "Vegetação" },
                { value: "relevo", label: "Relevo" },
              ]}
            />
            <div className="min-h-0 flex-1">
              {(tab === "clima" || tab === "ur") && (
                <ChartState load={climate}>
                  {(d) =>
                    tab === "clima" ? <RainTempChart series={d} start={start} end={end} granularity={gran} /> : <HumidityChart series={d} start={start} end={end} granularity={gran} />
                  }
                </ChartState>
              )}
              {tab === "solo" && (
                <ChartState load={soil}>{(d) => (d.origin === "indisponivel" ? <Unavailable reason={d.reason} /> : <SoilMoistureChart result={d} />)}</ChartState>
              )}
              {tab === "ndvi" && (
                <ChartState load={vegetation}>
                  {(d) => (d.origin === "indisponivel" ? <Unavailable reason={d.reason} /> : <NdviChart result={d} start={start} end={end} />)}
                </ChartState>
              )}
              {tab === "relevo" &&
                (hasBoundary ? (
                  <ChartState load={terrain}>
                    {(d) => (
                      <div className="grid h-full gap-3 sm:grid-cols-[1fr_180px]">
                        <SlopeClassChart stats={d} />
                        <dl className="grid content-start gap-y-1.5 text-[13px]">
                          <Kv label="Altitude média">{fmt.n0(d.elevation.mean)} m</Kv>
                          <Kv label="Desnível no talhão">{fmt.n0(d.elevation.max - d.elevation.min)} m</Kv>
                          <Kv label="Textura do solo">
                            {TEXTURE_STYLE[texture.value]?.label ?? "—"}
                            <span className="ml-1 text-xs font-normal text-muted-foreground">({texture.source === "talhão" ? "informada no talhão" : "da propriedade"})</span>
                          </Kv>
                        </dl>
                      </div>
                    )}
                  </ChartState>
                ) : (
                  <Unavailable reason="Desenhe o contorno do talhão para calcular a declividade." />
                ))}
            </div>
            <SourceNote tab={tab} env={env} />
          </div>
        </div>
      )}
    </section>
  );
});

/* ---------- Período ---------- */

function PeriodPicker({ period, onPeriod }: { period: Period; onPeriod: (p: Period) => void }) {
  const [custom, setCustom] = useState({ start: period.start, end: period.end });
  const error = period.preset === "custom" ? validatePeriod(custom.start, custom.end) : null;
  const pick = (preset: PeriodPreset) => {
    if (preset === "custom") {
      setCustom({ start: period.start, end: period.end });
      onPeriod({ ...period, preset: "custom" });
    } else onPeriod(presetPeriod(preset));
  };
  const apply = (next: { start: string; end: string }) => {
    setCustom(next);
    if (!validatePeriod(next.start, next.end)) onPeriod({ preset: "custom", ...next });
  };
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Segmented
        aria-label="Período"
        value={period.preset}
        onChange={pick}
        options={PERIOD_PRESETS.map((o) => (o.value === "safra" ? { ...o, label: `Safra ${safraLabel(presetPeriod("safra"))}` } : o))}
      />
      {period.preset === "custom" && (
        <div className="flex items-center gap-1.5">
          <Input type="date" aria-label="Início" className="h-8 w-[136px] text-[13px]" value={custom.start} min="1981-01-01" max={availableEnd()} aria-invalid={!!error} onChange={(e) => apply({ ...custom, start: e.target.value })} />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" aria-label="Fim" className="h-8 w-[136px] text-[13px]" value={custom.end} min="1981-01-01" max={availableEnd()} aria-invalid={!!error} onChange={(e) => apply({ ...custom, end: e.target.value })} />
          {error && <span className="text-xs text-danger">{error}</span>}
        </div>
      )}
    </div>
  );
}

/* ---------- Peças ---------- */

const isStale = (l?: Load<unknown>) => l?.status === "ready" && !!l.stale;

function Indicator({ label, load, origin, value, detail, unavailable }: { label: string; load?: Load<unknown>; origin?: DataOrigin; value?: ReactNode; detail?: ReactNode; unavailable?: string }) {
  const stale = isStale(load);
  return (
    <div className={cn("min-w-0 transition-opacity", stale && "opacity-60")} aria-busy={stale}>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <span className="truncate">{label}</span>
        {stale && <Loader2 className="size-3 shrink-0 animate-spin" />}
        {/* só destacamos quando NÃO é dado real — o padrão é real */}
        {!stale && origin === "simulado" && !unavailable && (
          <Badge variant="warning" className="px-1 py-0 text-[10px]" title="Gerado por simulação — não é observação">
            Simulado
          </Badge>
        )}
      </p>
      {unavailable ? (
        <p className="mt-0.5 flex items-start gap-1 text-xs text-muted-foreground">
          <CircleSlash className="mt-0.5 size-3 shrink-0" /> {unavailable}
        </p>
      ) : !load || load.status === "loading" || load.status === "idle" ? (
        <div className="mt-1 h-5 w-20 animate-pulse rounded bg-muted" aria-label="Carregando" />
      ) : load.status === "error" ? (
        <p className="mt-0.5 text-xs text-danger" title={load.error}>
          Não disponível agora
        </p>
      ) : (
        <>
          <p className="tabular text-base font-semibold leading-tight">{value ?? "—"}</p>
          {detail && (
            <p className="truncate text-xs text-muted-foreground" title={typeof detail === "string" ? detail : undefined}>
              {detail}
            </p>
          )}
        </>
      )}
    </div>
  );
}

function ChartState<T>({ load, children }: { load: Load<T>; children: (d: T) => ReactNode }) {
  if (load.status === "ready")
    return load.stale ? (
      <div className="relative h-full" aria-busy>
        <div className="h-full opacity-50">{children(load.data)}</div>
        <span className="absolute right-2 top-0 flex items-center gap-1.5 rounded-full bg-surface px-2.5 py-1 text-xs text-muted-foreground shadow-sm">
          <Loader2 className="size-3.5 animate-spin" /> Atualizando…
        </span>
      </div>
    ) : (
      <>{children(load.data)}</>
    );
  if (load.status === "error") return <Unavailable reason={`Não foi possível carregar: ${load.error}`} />;
  return (
    <div className="flex h-full min-h-40 items-center justify-center gap-2 rounded-md bg-muted/50 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Carregando…
    </div>
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="flex h-full min-h-40 items-center justify-center gap-2 rounded-md border border-dashed border-input px-4 text-center text-sm text-muted-foreground">
      <CircleSlash className="size-4 shrink-0" /> {reason}
    </div>
  );
}

function Kv({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tabular font-medium">{children}</dd>
    </div>
  );
}

/** Fonte e método em uma linha; texto completo ao passar o mouse. */
function SourceNote({ tab, env }: { tab: Tab; env: Env }) {
  let text = "";
  let note: string | undefined;
  if (tab === "clima" || tab === "ur") {
    const d = env.climate.status === "ready" ? env.climate.data : null;
    note = d?.note;
    text = `${d?.source ?? POWER_SOURCE.name} · grade de ${POWER_SOURCE.cellSizeDeg.lat}° × ${POWER_SOURCE.cellSizeDeg.lon}° (≈ 55 km). Valor da célula que contém a área — sem interpolação.`;
  } else if (tab === "solo") {
    const d = env.soil.status === "ready" && env.soil.data.origin !== "indisponivel" ? env.soil.data : null;
    note = d?.note;
    text = `${d?.source ?? SMAP_SOURCE.name} L4 · pixel de 9 km que contém a área. Valor regional, não medição no talhão.`;
  } else if (tab === "ndvi") {
    const d = env.vegetation.status === "ready" && env.vegetation.data.origin !== "indisponivel" ? env.vegetation.data : null;
    note = d?.note;
    text = `${d?.source ?? MODIS_SOURCE.name} · pixel de 250 m no centro da área, a cada 16 dias. Falhas = nuvens.`;
  } else {
    text = `${TERRAIN_SOURCE.name} (${TERRAIN_SOURCE.base}) · pixels dentro do contorno, classes de relevo da Embrapa. Textura: cadastro do usuário.`;
  }
  return (
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground" title={text}>
      {note ? <FlaskConical className="size-3.5 shrink-0 text-warning" /> : <Info className="size-3.5 shrink-0" />}
      <span className={cn("truncate", note && "font-medium text-warning")}>{note ?? text}</span>
    </p>
  );
}
