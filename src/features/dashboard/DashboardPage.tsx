import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, ChevronRight, CloudRain, Droplet, Layers, Leaf, MapPinned, Pencil, Play, Plus, Ruler, Sprout, Target, Thermometer } from "lucide-react";
import { useAppStore, useSelectedProperty } from "@/app/store";
import { DataOriginBadge, EmptyState, ErrorState } from "@/components/shared";
import { ZARC_ORIGIN_TITLE, ZarcSourceNote } from "@/features/zarc/ZarcCalendar";
import { ZarcExplorer } from "@/features/zarc/ZarcExplorer";
import { useZarc } from "@/features/zarc/useZarc";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { PropertyMap } from "@/components/maps";
import { fmt } from "@/lib/format";
import { SOIL_TEXTURE_LABEL, PRIORITY_LABEL, cropName } from "@/data/crops";
import type { PriorityKey } from "@/types";
import { useEnvironmentalData } from "./useEnvironmentalData";
import { lastNDays, mean, sum } from "./climateStats";
import { KpiTile } from "./components/KpiTile";
import { ScenarioSummary } from "@/features/rotations/components/ScenarioSummary";

const C = { temp: "#eb6834", rain: "#2a78d6", rh: "#1baf7a", ndvi: "#5aa300" };

function topPriorities(p: Record<PriorityKey, number>): PriorityKey[] {
  const max = Math.max(...Object.values(p));
  return (Object.keys(p) as PriorityKey[]).filter((k) => p[k] === max && max > 0);
}

export function DashboardPage() {
  const property = useSelectedProperty();
  const analyses = useAppStore((s) => s.analyses);
  const data = useEnvironmentalData(property);
  const zarc = useZarc(property);
  const navigate = useNavigate();
  const [howOpen, setHowOpen] = useState(false);

  const kpis = useMemo(() => {
    if (data.status !== "ready") return null;
    const recs = data.climate.records;
    const end = data.climate.lastAvailableDate;
    const cur = lastNDays(recs, 30, end);
    const prev = lastNDays(recs, 60, end).slice(0, -30);
    const ndvi = data.vegetation.origin !== "indisponivel" ? data.vegetation.records.filter((r) => r.ndvi !== null) : [];
    const last = ndvi.at(-1)?.ndvi ?? null;
    const prevN = ndvi.at(-2)?.ndvi ?? null;
    const soil = data.soil.origin !== "indisponivel" ? data.soil.records.filter((r) => r.surface !== null) : [];
    return {
      soil: soil.at(-1)?.surface ?? null,
      soilPrev: soil.length > 7 ? soil.at(-8)!.surface : null,
      sparkSoil: soil.map((r) => ({ v: r.surface })),
      temp: mean(cur.map((r) => r.t2m)),
      tempPrev: mean(prev.map((r) => r.t2m)),
      rain: sum(cur.map((r) => r.precip)),
      rainPrev: sum(prev.map((r) => r.precip)),
      rh: mean(cur.map((r) => r.rh)),
      rhPrev: mean(prev.map((r) => r.rh)),
      ndvi: last,
      ndviPrev: prevN,
      sparkTemp: cur.map((r) => ({ v: r.t2m })),
      sparkRain: cur.map((r) => ({ v: r.precip })),
      sparkRh: cur.map((r) => ({ v: r.rh })),
      sparkNdvi: ndvi.slice(-12).map((r) => ({ v: r.ndvi })),
    };
  }, [data]);

  if (!property) {
    return (
      <EmptyState
        icon={<MapPinned />}
        title="Cadastre sua primeira propriedade"
        description="Desenhe a área no mapa de satélite para começar a acompanhar clima e vegetação."
        action={
          <Link to="/propriedades/nova" className={buttonVariants()}>
            <Plus /> Cadastrar propriedade
          </Link>
        }
      />
    );
  }

  const latest = analyses.find((a) => a.propertyId === property.id);
  const origin = data.status === "ready" ? data.climate.origin : undefined;
  const loading = data.status === "loading" || data.status === "idle";
  const delta = (a: number | null | undefined, b: number | null | undefined, f: (v: number) => string, unit: string) =>
    a == null || b == null ? null : { value: a - b, text: `${a - b > 0 ? "+" : ""}${f(a - b)}${unit}` };
  const pctDelta = (a: number | null | undefined, b: number | null | undefined) =>
    a == null || b == null || b === 0 ? null : { value: a - b, text: `${a - b > 0 ? "+" : ""}${fmt.n0(((a - b) / b) * 100)}%` };

  return (
    <div className="flex flex-col gap-5">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-xl border border-border bg-white shadow-card">
        <div className="absolute inset-y-0 right-0 hidden w-[58%] md:block">
          <PropertyMap lat={property.latitude} lon={property.longitude} boundary={property.boundary} interactive={false} className="h-full rounded-none" />
          <div className="pointer-events-none absolute inset-0 z-[400] bg-gradient-to-r from-white via-white/30 to-transparent" />
        </div>
        <div className="relative z-[401] flex flex-col gap-4 p-6 sm:p-8 md:max-w-[52%]">
          <p className="text-[13px] font-bold uppercase tracking-wider text-primary">Bem-vindo ao Semeia</p>
          <h2 className="text-3xl font-bold leading-[1.1] tracking-tight text-brand-dark sm:text-4xl">Planeje rotações mais resilientes</h2>
          <p className="max-w-md text-[15px] text-muted-foreground">
            Dados da NASA + seu solo = a melhor rotação para a sua área.
          </p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link to={`/analise?propriedade=${property.id}`} className={buttonVariants({ size: "lg" })}>
              <Plus /> Nova análise
            </Link>
            <Button variant="outline-primary" size="lg" onClick={() => setHowOpen(true)}>
              <Play /> Ver como funciona
            </Button>
          </div>
        </div>
        <div className="md:hidden">
          <PropertyMap lat={property.latitude} lon={property.longitude} boundary={property.boundary} interactive={false} className="h-44 rounded-none" />
        </div>
      </section>

      {/* Indicadores */}
      {data.status === "error" ? (
        <ErrorState message={data.error} onRetry={data.reload} />
      ) : (
        <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4" aria-label="Indicadores dos últimos 30 dias">
          <KpiTile
            label="Temperatura média"
            icon={<Thermometer />}
            color={C.temp}
            value={kpis?.temp == null ? "—" : fmt.n1(kpis.temp)}
            unit="°C"
            delta={delta(kpis?.temp, kpis?.tempPrev, fmt.n1, " °C")}
            caption="30 dias"
            spark={kpis?.sparkTemp}
            origin={origin}
            loading={loading}
          />
          <KpiTile
            label="Chuva acumulada"
            icon={<CloudRain />}
            color={C.rain}
            value={kpis?.rain == null ? "—" : fmt.n0(kpis.rain)}
            unit="mm"
            delta={pctDelta(kpis?.rain, kpis?.rainPrev)}
            caption="30 dias"
            spark={kpis?.sparkRain}
            sparkKind="bar"
            origin={origin}
            loading={loading}
          />
          <KpiTile
            label="Umidade do solo"
            icon={<Droplet />}
            color={C.rain}
            value={kpis?.soil == null ? "—" : fmt.n2(kpis.soil)}
            unit="m³/m³"
            delta={delta(kpis?.soil, kpis?.soilPrev, fmt.n2, "")}
            caption="SMAP · 2 semanas"
            spark={kpis?.sparkSoil}
            origin={data.status === "ready" ? data.soil.origin : undefined}
            loading={loading}
          />
          <KpiTile
            label="Cobertura vegetal (NDVI)"
            icon={<Leaf />}
            color={C.ndvi}
            value={kpis?.ndvi == null ? "—" : fmt.n2(kpis.ndvi)}
            unit=""
            delta={delta(kpis?.ndvi, kpis?.ndviPrev, fmt.n2, "")}
            caption="MODIS · 6 meses"
            spark={kpis?.sparkNdvi}
            origin={data.status === "ready" ? data.vegetation.origin : undefined}
            loading={loading}
          />
        </section>
      )}

      {/* ZARC */}
      <Card className="min-w-0 p-5">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">Janelas de plantio · ZARC</h2>
            <p className="text-[13px] text-muted-foreground">
              Zoneamento oficial do MAPA para {property.city}/{property.state} — plantar na janela garante acesso ao Proagro e ao seguro rural subvencionado.
            </p>
          </div>
          {zarc && <DataOriginBadge origin={zarc.origin} title={ZARC_ORIGIN_TITLE} />}
        </div>
        {zarc ? (
          <>
            <ZarcExplorer property={property} zarc={zarc} />
            <div className="mt-3">
              <ZarcSourceNote zarc={zarc} />
            </div>
          </>
        ) : (
          <div className="h-40 animate-pulse rounded-md bg-muted" aria-label="Carregando ZARC" />
        )}
      </Card>

      <section className="grid grid-cols-1 gap-5 lg:grid-cols-[360px_1fr]">
        {/* Minha propriedade */}
        <Card className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-semibold tracking-tight">Minha propriedade</h2>
            <Link to={`/propriedades/${property.id}/editar`} className={buttonVariants({ variant: "outline", size: "sm" })}>
              <Pencil /> Editar
            </Link>
          </div>
          <Link to="/propriedades" className="group mb-3 flex items-center gap-3 rounded-lg p-1 hover:bg-muted">
            <div className="h-20 w-28 shrink-0 overflow-hidden rounded-md">
              <PropertyMap lat={property.latitude} lon={property.longitude} boundary={property.boundary} interactive={false} className="h-full rounded-none" />
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold">{property.name}</p>
              <p className="text-sm text-muted-foreground">
                {property.city}, {property.state}
              </p>
            </div>
            <ChevronRight className="size-5 text-muted-foreground group-hover:text-foreground" />
          </Link>
          <dl className="divide-y divide-border text-sm">
            <Row icon={<Ruler />} label="Área total" value={`${fmt.n1(property.areaHa)} ha`} />
            <Row
              icon={<Sprout />}
              label="Rotação atual"
              value={latest ? `${cropName(latest.input.currentRotation.verao)} → ${cropName(latest.input.currentRotation.inverno)}` : "Não informada"}
            />
            <Row icon={<Layers />} label="Tipo de solo" value={SOIL_TEXTURE_LABEL[property.soil.texture]} />
            <Row
              icon={<Target />}
              label="Prioridade principal"
              value={
                latest ? (
                  <span className="rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-soft-foreground">
                    {PRIORITY_LABEL[topPriorities(latest.input.priorities)[0] ?? "conservacao"]}
                  </span>
                ) : (
                  "—"
                )
              }
            />
          </dl>
        </Card>

        {/* Comparativo */}
        <Card className="min-w-0 p-5">
          <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-semibold tracking-tight">Comparativo de estratégias de rotação</h2>
              <p className="text-[13px] text-muted-foreground">
                {latest ? "Última análise · índices simulados" : "Solo, clima e suas prioridades."}
              </p>
            </div>
            {latest && (
              <Link to={`/analise/${latest.id}`} className={buttonVariants({ variant: "outline-primary", size: "sm" })}>
                Ver análise completa <ArrowRight />
              </Link>
            )}
          </div>
          {latest ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {latest.scenarios.map((s) => {
                const best = Math.max(...latest.scenarios.map((x) => x.overall));
                return (
                  <ScenarioSummary
                    key={s.key}
                    scenario={s}
                    compact
                    highlight={s.key !== "atual" && s.overall === best}
                    topPriorities={topPriorities(latest.input.priorities)}
                  />
                );
              })}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-input px-6 py-10 text-center">
              <Sprout className="mb-2 size-8 text-primary" />
              <p className="font-semibold">Nenhuma análise ainda</p>
              <p className="mt-1 text-sm text-muted-foreground">Leva menos de 2 minutos.</p>
              <Button className="mt-4" onClick={() => navigate(`/analise?propriedade=${property.id}`)}>
                Começar análise
              </Button>
            </div>
          )}
        </Card>
      </section>

      <Dialog
        open={howOpen}
        onClose={() => setHowOpen(false)}
        title="Como o Semeia funciona"
        footer={
          <Button
            onClick={() => {
              setHowOpen(false);
              navigate(`/analise?propriedade=${property.id}`);
            }}
          >
            Fazer uma análise
          </Button>
        }
      >
        <ol className="flex flex-col gap-3 text-sm">
          {[
            ["Desenhe sua área", "Clique nos cantos no mapa de satélite."],
            ["Acompanhe", "Clima, umidade do solo e vegetação da NASA."],
            ["Compare", "Sua rotação atual contra duas alternativas."],
          ].map(([t, d], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-[13px] font-bold text-white">{i + 1}</span>
              <span>
                <strong className="block">{t}</strong>
                <span className="text-muted-foreground">{d}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-4 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
          Índices simulados para comparar cenários — não substituem o agrônomo.
        </p>
      </Dialog>
    </div>
  );
}

function Row({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center gap-3 py-3">
      <span className="text-muted-foreground [&_svg]:size-[18px]">{icon}</span>
      <dt className="flex-1">{label}</dt>
      <dd className="text-right font-semibold">{value}</dd>
    </div>
  );
}
