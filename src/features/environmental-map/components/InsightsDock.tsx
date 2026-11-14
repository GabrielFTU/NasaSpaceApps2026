import { useState, type ReactNode } from "react";
import { ChevronDown, CircleSlash, FlaskConical, Info, Loader2, MapPin } from "lucide-react";
import type { DataOrigin, Property } from "@/types";
import { DataOriginBadge } from "@/components/shared";
import { Badge } from "@/components/ui/badge";
import { Segmented } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { fmt, formatDate, formatDateTime } from "@/lib/format";
import { POWER_SOURCE, SMAP_SOURCE, MODIS_SOURCE } from "@/services/nasa";
import { SLOPE_CLASSES, TEXTURE_STYLE } from "@/services/environment/catalog";
import { TERRAIN_SOURCE } from "@/services/environment/terrain";
import type { Load, useAreaEnvironment } from "../hooks";
import { climateIndicators, ndviIndicators, soilIndicators } from "../indicators";
import { periodDays, type Period } from "../period";
import { granularityFor, HumidityChart, NdviChart, RainTempChart, SlopeClassChart, SoilMoistureChart } from "./EnvCharts";

type Env = ReturnType<typeof useAreaEnvironment>;
type Tab = "clima" | "ur" | "solo" | "ndvi" | "relevo";

interface Props {
  env: Env;
  period: Period;
  areaName: string;
  areaHa: number | null;
  isDemo: boolean;
  hasBoundary: boolean;
  texture: { value: string; source: "talhão" | "propriedade" };
  property: Property;
  open: boolean;
  onToggle: () => void;
}

const v = (x: number | null | undefined, f = fmt.n1) => (x === null || x === undefined ? "—" : f(x));

export function InsightsDock({ env, period, areaName, areaHa, isDemo, hasBoundary, texture, open, onToggle }: Props) {
  const [tab, setTab] = useState<Tab>("clima");
  const { climate, soil, vegetation, terrain } = env;
  const days = periodDays(period);
  const gran = granularityFor(days);

  const ci = climate.status === "ready" ? climateIndicators(climate.data.records.filter((r) => r.date >= period.start && r.date <= period.end)) : null;
  const si = soil.status === "ready" && soil.data.origin !== "indisponivel" ? soilIndicators(soil.data.records) : null;
  const ni =
    vegetation.status === "ready" && vegetation.data.origin !== "indisponivel"
      ? ndviIndicators(vegetation.data.records.filter((r) => r.date >= period.start && r.date <= period.end))
      : null;
  const t = terrain.status === "ready" ? terrain.data : null;
  const dominant = t ? t.slopeClasses.indexOf(Math.max(...t.slopeClasses)) : -1;

  return (
    <section className="flex min-h-0 flex-col border-t border-border bg-surface" aria-label="Indicadores ambientais da área selecionada">
      {/* Cabeçalho */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-2.5">
        <MapPin className="size-4 text-primary" />
        <h2 className="text-[15px] font-semibold">{areaName}</h2>
        {areaHa !== null && <span className="tabular text-sm text-muted-foreground">{fmt.n2(areaHa)} ha</span>}
        {isDemo && (
          <Badge variant="warning" title="Contorno fictício criado pelo Semeia para demonstração">
            <FlaskConical /> Talhão de exemplo
          </Badge>
        )}
        <span className="text-[13px] text-muted-foreground">
          {formatDate(period.start)} – {formatDate(period.end)} · {days} dias
        </span>
        <button
          type="button"
          onClick={onToggle}
          className="ml-auto flex cursor-pointer items-center gap-1 rounded-md px-2 py-1 text-[13px] font-medium text-primary hover:bg-muted"
          aria-expanded={open}
        >
          {open ? "Ocultar gráficos" : "Ver gráficos"}
          <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
        </button>
      </div>

      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-px border-y border-border bg-border sm:grid-cols-3 xl:grid-cols-6">
        <Indicator
          label="Chuva no período"
          load={climate}
          origin={climate.status === "ready" ? climate.data.origin : undefined}
          value={ci && `${v(ci.totalPrecip, fmt.n0)} mm`}
          detail={ci && `${ci.rainyDays} dias com chuva · maior veranico ${ci.longestDrySpell} d`}
        />
        <Indicator
          label="Temperatura média"
          load={climate}
          origin={climate.status === "ready" ? climate.data.origin : undefined}
          value={ci && `${v(ci.meanTemp)} °C`}
          detail={ci && `mín ${v(ci.minTemp)} · máx ${v(ci.maxTemp)} °C${ci.frostRiskDays ? ` · ${ci.frostRiskDays} d com risco de geada` : ""}`}
        />
        <Indicator
          label="Umidade relativa"
          load={climate}
          origin={climate.status === "ready" ? climate.data.origin : undefined}
          value={ci && `${v(ci.meanRh, fmt.n0)}%`}
          detail={ci && (ci.missingDays ? `${ci.missingDays} dia(s) sem dado` : "média diária a 2 m")}
        />
        <Indicator
          label="Umidade do solo"
          load={soil}
          origin={soil.status === "ready" ? soil.data.origin : undefined}
          unavailable={soil.status === "ready" && soil.data.origin === "indisponivel" ? soil.data.reason : undefined}
          value={si?.last && `${v(si.last.surface, fmt.n2)} m³/m³`}
          detail={si?.last ? `0–5 cm em ${formatDate(si.last.date)} · raízes ${v(si.last.rootZone, fmt.n2)}` : si ? "Sem valor válido no período" : null}
        />
        <Indicator
          label="NDVI"
          load={vegetation}
          origin={vegetation.status === "ready" ? vegetation.data.origin : undefined}
          unavailable={vegetation.status === "ready" && vegetation.data.origin === "indisponivel" ? vegetation.data.reason : undefined}
          value={ni?.last ? v(ni.last.ndvi, fmt.n2) : ni ? "—" : null}
          detail={ni && (ni.last ? `composição ${formatDate(ni.last.date)} · média ${v(ni.mean, fmt.n2)}` : "Sem composição válida no período")}
        />
        <Indicator
          label="Relevo"
          load={hasBoundary ? terrain : undefined}
          origin={t ? "real" : undefined}
          unavailable={!hasBoundary ? "Desenhe o contorno para calcular elevação e declividade." : undefined}
          value={t && `${v(t.slope.mean)}% decliv.`}
          detail={t && `${SLOPE_CLASSES[dominant].label.toLowerCase()} · ${fmt.n0(t.elevation.min)}–${fmt.n0(t.elevation.max)} m`}
        />
      </div>

      {open && (
        <div className="flex min-h-0 flex-1 flex-col gap-2 px-4 pb-3 pt-2.5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Segmented
              aria-label="Série histórica"
              value={tab}
              onChange={setTab}
              options={[
                { value: "clima", label: "Chuva e temperatura" },
                { value: "ur", label: "Umidade do ar" },
                { value: "solo", label: "Umidade do solo" },
                { value: "ndvi", label: "NDVI" },
                { value: "relevo", label: "Relevo e solo" },
              ]}
            />
            <span className="text-xs text-muted-foreground">{gran === "monthly" && (tab === "clima" || tab === "ur") ? "Agregado por mês (período > 120 dias)" : ""}</span>
          </div>

          <div className="min-h-[200px] flex-1">
            {(tab === "clima" || tab === "ur") && (
              <ChartState load={climate}>
                {(d) =>
                  tab === "clima" ? (
                    <RainTempChart series={d} start={period.start} end={period.end} granularity={gran} />
                  ) : (
                    <HumidityChart series={d} start={period.start} end={period.end} granularity={gran} />
                  )
                }
              </ChartState>
            )}
            {tab === "solo" && (
              <ChartState load={soil}>
                {(d) => (d.origin === "indisponivel" ? <Unavailable reason={d.reason} /> : <SoilMoistureChart result={d} />)}
              </ChartState>
            )}
            {tab === "ndvi" && (
              <ChartState load={vegetation}>
                {(d) => (d.origin === "indisponivel" ? <Unavailable reason={d.reason} /> : <NdviChart result={d} start={period.start} end={period.end} />)}
              </ChartState>
            )}
            {tab === "relevo" && (
              <div className="grid h-full gap-4 lg:grid-cols-[1fr_260px]">
                {hasBoundary ? <ChartState load={terrain}>{(d) => <SlopeClassChart stats={d} />}</ChartState> : <Unavailable reason="Desenhe o contorno do talhão para calcular a declividade." />}
                <dl className="grid grid-cols-2 content-start gap-x-4 gap-y-2 text-[13px]">
                  <Kv label="Elevação média">{t ? `${fmt.n0(t.elevation.mean)} m` : "—"}</Kv>
                  <Kv label="Amplitude">{t ? `${fmt.n0(t.elevation.max - t.elevation.min)} m` : "—"}</Kv>
                  <Kv label="Declividade p90">{t ? `${fmt.n1(t.slope.p90)}%` : "—"}</Kv>
                  <Kv label="Pixels no talhão">{t ? `${fmt.n0(t.pixelCount)} × ${fmt.n0(t.pixelSizeM)} m` : "—"}</Kv>
                  <Kv label="Textura do solo">
                    {TEXTURE_STYLE[texture.value]?.label ?? "—"}{" "}
                    <Badge variant="info" className="ml-1">
                      informada {texture.source === "talhão" ? "no talhão" : "p/ propriedade"}
                    </Badge>
                  </Kv>
                </dl>
              </div>
            )}
          </div>

          <SourceNote tab={tab} env={env} />
        </div>
      )}
    </section>
  );
}

function Indicator({
  label,
  load,
  origin,
  value,
  detail,
  unavailable,
}: {
  label: string;
  load?: Load<unknown>;
  origin?: DataOrigin;
  value?: ReactNode;
  detail?: ReactNode;
  unavailable?: string;
}) {
  return (
    <div className="min-w-0 bg-surface px-4 py-2.5">
      <div className="flex items-center justify-between gap-1">
        <p className="truncate text-xs text-muted-foreground">{label}</p>
        {origin && !unavailable && <DataOriginBadge origin={origin} className="shrink-0" />}
      </div>
      {unavailable ? (
        <p className="mt-1 flex items-start gap-1 text-xs text-muted-foreground">
          <CircleSlash className="mt-0.5 size-3.5 shrink-0" /> {unavailable}
        </p>
      ) : !load || load.status === "loading" || load.status === "idle" ? (
        <p className="mt-1 flex items-center gap-1.5 text-sm text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" /> Carregando…
        </p>
      ) : load.status === "error" ? (
        <p className="mt-1 text-xs text-danger" title={load.error}>
          Indisponível: {load.error}
        </p>
      ) : (
        <>
          <p className="tabular mt-0.5 text-lg font-semibold leading-tight">{value ?? "—"}</p>
          {detail && <p className="truncate text-xs text-muted-foreground" title={typeof detail === "string" ? detail : undefined}>{detail}</p>}
        </>
      )}
    </div>
  );
}

function ChartState<T>({ load, children }: { load: Load<T>; children: (d: T) => ReactNode }) {
  if (load.status === "ready") return <>{children(load.data)}</>;
  if (load.status === "error") return <Unavailable reason={`Não foi possível carregar: ${load.error}`} />;
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center gap-2 rounded-md bg-muted/50 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Carregando série…
    </div>
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="flex h-full min-h-[160px] items-center justify-center gap-2 rounded-md border border-dashed border-input px-4 text-center text-sm text-muted-foreground">
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

/** Fonte, resolução e método de cada série — sempre visível abaixo do gráfico. */
function SourceNote({ tab, env }: { tab: Tab; env: Env }) {
  let text: ReactNode = null;
  let note: string | undefined;
  if (tab === "clima" || tab === "ur") {
    const d = env.climate.status === "ready" ? env.climate.data : null;
    note = d?.note;
    text = (
      <>
        {d?.source ?? POWER_SOURCE.name} · {d?.parameters.filter((p) => (tab === "ur" ? p === "RH2M" : p !== "RH2M" && p !== "ALLSKY_SFC_SW_DWN")).join(", ")} ·{" "}
        {POWER_SOURCE.resolution}. Valor da célula da grade que contém o centro da área — não há interpolação entre células.
        {d && ` Atualizado em ${formatDateTime(d.fetchedAt)}.`}
      </>
    );
  } else if (tab === "solo") {
    const d = env.soil.status === "ready" && env.soil.data.origin !== "indisponivel" ? env.soil.data : null;
    note = d?.note;
    text = (
      <>
        {d?.source ?? SMAP_SOURCE.name} L4 · {SMAP_SOURCE.resolution}. Pixel que contém o centro da área, lido da imagem GIBS pela paleta oficial (precisão ≈ 0,003 m³/m³); amostras
        espaçadas no período, dias sem produto ficam em branco.
      </>
    );
  } else if (tab === "ndvi") {
    const d = env.vegetation.status === "ready" && env.vegetation.data.origin !== "indisponivel" ? env.vegetation.data : null;
    note = d?.note;
    text = (
      <>
        {d?.source ?? MODIS_SOURCE.name} · {MODIS_SOURCE.product} · {MODIS_SOURCE.resolution}. Pixel no centro da área (6,25 ha), não média do talhão. Lacunas = nuvem.
      </>
    );
  } else {
    text = (
      <>
        Elevação e declividade: {TERRAIN_SOURCE.name} ({TERRAIN_SOURCE.base}), pixels cujo centro cai dentro do contorno, método de Horn, classes Embrapa. Textura: informada pelo
        usuário.
      </>
    );
  }
  return (
    <div className="space-y-1">
      {note && (
        <p className="flex items-center gap-1.5 text-xs font-medium text-warning">
          <FlaskConical className="size-3.5" /> {note}
        </p>
      )}
      <p className="flex gap-1.5 text-xs leading-relaxed text-muted-foreground">
        <Info className="mt-0.5 size-3.5 shrink-0" />
        <span>{text}</span>
      </p>
    </div>
  );
}
