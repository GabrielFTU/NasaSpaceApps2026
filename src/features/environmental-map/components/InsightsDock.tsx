import { memo, useEffect, useState, type ReactNode } from "react";
import { BarChart3, CircleSlash, CloudFog, Droplet, Droplets, FlaskConical, Loader2, Mountain, Thermometer, TrendingUp } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Dropdown } from "@/components/ui/dropdown";
import { cn } from "@/lib/utils";
import { fmt, formatDate } from "@/lib/format";
import { SLOPE_CLASSES, TEXTURE_STYLE } from "@/services/environment/catalog";
import type { AreaEnv, EnvSummary, Load } from "../hooks";
import { periodDays, type Period } from "../period";
import { granularityFor, HumidityChart, NdviChart, RainTempChart, SlopeClassChart, SoilMoistureChart } from "./EnvCharts";

type Tab = "ndvi" | "clima" | "ur" | "solo" | "relevo";

const TABS: { value: Tab; label: string; title: string; sub: string }[] = [
  { value: "ndvi", label: "Vegetação", title: "Evolução da vegetação", sub: "Variação do NDVI na área" },
  { value: "clima", label: "Chuva e temperatura", title: "Chuva e temperatura", sub: "Totais e médias do período" },
  { value: "ur", label: "Umidade do ar", title: "Umidade do ar", sub: "Média diária no período" },
  { value: "solo", label: "Umidade do solo", title: "Umidade do solo", sub: "Superfície e zona das raízes" },
  { value: "relevo", label: "Relevo", title: "Relevo", sub: "Área por classe de declividade" },
];

/** Gráfico que acompanha a camada escolhida no mapa. */
const TAB_FOR_CHIP: Record<string, Tab> = { ndvi: "ndvi", precip: "clima", temp: "clima", rh: "ur", soilwater: "solo", elevation: "relevo", slope: "relevo", soil: "relevo" };

interface Props {
  env: AreaEnv;
  summary: EnvSummary;
  period: Period;
  hasBoundary: boolean;
  texture: { value: string; source: "talhão" | "propriedade" };
  chipKey?: string;
}

const v = (x: number | null | undefined, f = fmt.n1) => (x === null || x === undefined ? "—" : f(x));

/** Memoizado: zoom, opacidade e demais ajustes do mapa não redesenham gráficos. */
export const InsightsDock = memo(function InsightsDock({ env, summary, period, hasBoundary, texture, chipKey }: Props) {
  const [tab, setTab] = useState<Tab>(TAB_FOR_CHIP[chipKey ?? ""] ?? "ndvi");
  useEffect(() => {
    if (chipKey && TAB_FOR_CHIP[chipKey]) setTab(TAB_FOR_CHIP[chipKey]);
  }, [chipKey]);

  const { climate, soil, vegetation, terrain } = env;
  const { ci, si, t, anySimulated } = summary;
  const gran = granularityFor(periodDays(period));
  const { start, end } = period;
  const meta = TABS.find((x) => x.value === tab)!;

  return (
    <section className="grid gap-6 rounded-lg border border-border bg-surface p-5 shadow-card lg:grid-cols-[minmax(0,1fr)_320px]" aria-label="Condições da área selecionada">
      {/* Gráfico */}
      <div className="flex min-w-0 flex-col">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="flex items-start gap-2.5">
            <TrendingUp className="mt-0.5 size-5 text-primary" />
            <div>
              <h2 className="text-[15px] font-semibold">{meta.title}</h2>
              <p className="text-xs text-muted-foreground">{meta.sub}</p>
            </div>
          </div>
          <Dropdown
            aria-label="Gráfico"
            value={tab}
            onChange={setTab}
            align="end"
            menuClassName="w-52"
            className="rounded-full px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            options={TABS.map((o) => ({ value: o.value, label: o.label }))}
          />
        </div>
        <div className="mt-3 h-[200px]">
          {(tab === "clima" || tab === "ur") && (
            <ChartState load={climate}>
              {(d) =>
                tab === "clima" ? <RainTempChart series={d} start={start} end={end} granularity={gran} /> : <HumidityChart series={d} start={start} end={end} granularity={gran} />
              }
            </ChartState>
          )}
          {tab === "solo" && <ChartState load={soil}>{(d) => (d.origin === "indisponivel" ? <Unavailable reason={d.reason} /> : <SoilMoistureChart result={d} />)}</ChartState>}
          {tab === "ndvi" && (
            <ChartState load={vegetation}>{(d) => (d.origin === "indisponivel" ? <Unavailable reason={d.reason} /> : <NdviChart result={d} start={start} end={end} />)}</ChartState>
          )}
          {tab === "relevo" &&
            (hasBoundary ? (
              <ChartState load={terrain}>{(d) => <SlopeClassChart stats={d} />}</ChartState>
            ) : (
              <Unavailable reason="Desenhe o contorno do talhão para calcular a declividade." />
            ))}
        </div>
      </div>

      {/* Outras condições */}
      <div className="flex min-w-0 flex-col lg:border-l lg:border-border lg:pl-6">
        <div className="mb-3 flex items-center gap-2">
          <BarChart3 className="size-[18px] text-primary" />
          <h3 className="text-sm font-semibold">
            Outras condições <span className="font-normal text-muted-foreground">(período)</span>
          </h3>
          {anySimulated && (
            <Badge variant="warning" className="ml-auto" title="Algum dado não veio da NASA e foi simulado">
              <FlaskConical /> Simulado
            </Badge>
          )}
        </div>
        <ul className="flex flex-col gap-2">
          <Row icon={<Droplet />} label="Chuva acumulada" load={climate} value={ci && `${v(ci.totalPrecip, fmt.n0)} mm`} hint={ci ? `${ci.rainyDays} dias com chuva` : undefined} />
          <Row icon={<Thermometer />} label="Temperatura média" load={climate} value={ci && `${v(ci.meanTemp)} °C`} hint={ci ? `${v(ci.minTemp)} a ${v(ci.maxTemp)} °C` : undefined} />
          <Row icon={<CloudFog />} label="Umidade do ar" load={climate} value={ci && `${v(ci.meanRh, fmt.n0)}%`} />
          <Row
            icon={<Droplets />}
            label="Umidade do solo"
            load={soil}
            unavailable={soil.status === "ready" && soil.data.origin === "indisponivel"}
            value={si ? (si.last ? <>{v(si.last.surface, fmt.n2)} m³/m³</> : "—") : null}
            hint={si?.last ? `superfície · ${formatDate(si.last.date, { day: "2-digit", month: "short" })}` : undefined}
          />
          <Row
            icon={<Mountain />}
            label="Declividade média"
            load={hasBoundary ? terrain : undefined}
            unavailable={!hasBoundary}
            value={t && `${v(t.slope.mean)}%`}
            hint={
              t
                ? `${SLOPE_CLASSES[t.slopeClasses.indexOf(Math.max(...t.slopeClasses))].label.toLowerCase()} · solo ${(TEXTURE_STYLE[texture.value]?.label ?? "—").toLowerCase()}`
                : undefined
            }
          />
        </ul>
      </div>
    </section>
  );
});

/* ---------- Peças ---------- */

function Row({ icon, label, load, value, hint, unavailable }: { icon: ReactNode; label: string; load?: Load<unknown>; value?: ReactNode; hint?: string; unavailable?: boolean }) {
  const stale = load?.status === "ready" && !!load.stale;
  return (
    <li className={cn("flex items-center gap-3 rounded-md bg-muted/70 px-3 py-2.5 transition-opacity", stale && "opacity-60")} title={hint}>
      <span className="text-primary [&_svg]:size-[18px]">{icon}</span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] text-muted-foreground">{label}</span>
        {hint && !unavailable && <span className="block truncate text-[11px] text-subtle-foreground">{hint}</span>}
      </span>
      {unavailable ? (
        <span className="text-xs text-subtle-foreground">—</span>
      ) : !load || load.status === "loading" || load.status === "idle" ? (
        <span className="h-5 w-16 animate-pulse rounded bg-muted" aria-label="Carregando" />
      ) : load.status === "error" ? (
        <span className="text-xs text-danger" title={load.error}>
          indisponível
        </span>
      ) : (
        <span className="tabular shrink-0 text-[15px] font-semibold">{value ?? "—"}</span>
      )}
    </li>
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
    <div className="flex h-full items-center justify-center gap-2 rounded-md bg-muted/50 text-sm text-muted-foreground">
      <Loader2 className="size-4 animate-spin" /> Carregando…
    </div>
  );
}

function Unavailable({ reason }: { reason: string }) {
  return (
    <div className="flex h-full items-center justify-center gap-2 rounded-md border border-dashed border-input px-4 text-center text-sm text-muted-foreground">
      <CircleSlash className="size-4 shrink-0" /> {reason}
    </div>
  );
}
