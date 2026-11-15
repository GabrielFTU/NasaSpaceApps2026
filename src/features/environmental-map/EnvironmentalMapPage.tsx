import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  Check,
  ChevronRight,
  Crosshair,
  Satellite,
  ZoomOut,
  Download,
  Eraser,
  FlaskConical,
  Layers,
  ListTree,
  MapPinned,
  Pencil,
  PenLine,
  Plus,
  Sprout,
  Trash2,
  Undo2,
  Upload,
  X,
  Map as MapIcon,
} from "lucide-react";
import type { Plot, PlotInput } from "@/types";
import { useAppStore, useSelectedProperty } from "@/app/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/form";
import { Callout } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared";
import { toast } from "@/components/ui/toast";
import type { BaseLayer } from "@/components/maps";
import { cn, round } from "@/lib/utils";
import { fmt, formatDate, parseISODate, toISODate } from "@/lib/format";
import { polygonAreaHa, polygonCenter, polygonPerimeterM } from "@/lib/geo";
import { downloadJson, parsePolygons, plotsToFeatureCollection } from "@/lib/geojson";
import { layerById, type LayerId } from "@/services/environment/catalog";
import { MapView, type ActiveRaster } from "./components/MapView";
import { CHIPS, chipFor } from "./components/LayerBar";
import { ActiveLayerCard, colorAt, MapLegend, useLayerScale } from "./components/ActiveLayerCard";
import { Dropdown } from "@/components/ui/dropdown";
import type { LegendScale } from "@/services/environment/colormap";
import { InsightsDock } from "./components/InsightsDock";
import { PlotFormDialog } from "./components/PlotFormDialog";
import { useAreaEnvironment, useEnvSummary, useLayerDates, type AreaTarget, type EnvSummary } from "./hooks";
import { availableEnd, PERIOD_PRESETS, presetPeriod, safraLabel, validatePeriod, type Period, type PeriodPreset } from "./period";

type DrawState = { points: [number, number][]; editingId: string | null };

export function EnvironmentalMapPage() {
  const property = useSelectedProperty();
  const allPlots = useAppStore((s) => s.plots);
  const addPlot = useAppStore((s) => s.addPlot);
  const updatePlot = useAppStore((s) => s.updatePlot);
  const deletePlot = useAppStore((s) => s.deletePlot);
  const powerMode = useAppStore((s) => s.settings.powerMode);

  const plots = useMemo(() => allPlots.filter((p) => p.propertyId === property?.id), [allPlots, property?.id]);
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(plots[0]?.id ?? null);
  const selectedPlot = plots.find((p) => p.id === selectedPlotId) ?? null;

  useEffect(() => {
    setSelectedPlotId((cur) => (plots.some((p) => p.id === cur) ? cur : (plots[0]?.id ?? null)));
  }, [property?.id]);

  const [activeId, setActiveId] = useState<LayerId | null>("ndvi");
  const [opacities, setOpacities] = useState<Partial<Record<LayerId, number>>>({});
  const [base, setBase] = useState<BaseLayer>("satelite");
  const [period, setPeriod] = useState<Period>(() => presetPeriod("90d"));
  const [mapDate, setMapDate] = useState(period.end);
  const [draw, setDraw] = useState<DrawState | null>(null);
  const [dialog, setDialog] = useState<{ boundary: [number, number][]; plot?: Plot } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Plot | null>(null);
  const [plotsOpen, setPlotsOpen] = useState(false);
  const [zoom, setZoom] = useState(15);
  const [tileErrors, setTileErrors] = useState<Set<string>>(new Set());
  const [mapKey, setMapKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => setMapDate(period.end), [period.end]);
  useEffect(() => setTileErrors(new Set()), [mapDate, activeId]);

  const active = activeId ? layerById(activeId) : null;
  const chip = chipFor(activeId);
  const opacity = active ? (opacities[active.id] ?? active.defaultOpacity) : 1;
  const activeList = useMemo(() => (active ? [active] : []), [active]);
  const layerDates = useLayerDates(activeList, mapDate);
  const activeDate = active ? layerDates[active.id] : undefined;
  const shownDate = activeDate?.status === "ready" ? activeDate.data.date : null;
  // pixel grosso visto de perto = cor chapada: em vez da imagem, mostramos o valor sobre a área
  const coarse = !!active?.detailZoom && zoom > active.detailZoom;
  const rasters: ActiveRaster[] = useMemo(
    () => (active && !coarse && (active.render.kind === "gibs" || active.render.kind === "computed") ? [{ layer: active, opacity, date: shownDate }] : []),
    [active, coarse, opacity, shownDate],
  );
  const scale = useLayerScale(active);
  const [view, setView] = useState<{ n: number; kind: "region" | "area"; zoom?: number } | null>(null);
  const requestView = (kind: "region" | "area") => setView((v) => ({ n: (v?.n ?? 0) + 1, kind, zoom: active?.detailZoom ? active.detailZoom - 2 : 7 }));
  const soilOpacity = activeId === "soil" ? opacity : null;

  const onOpacity = useCallback((v: number) => activeId && setOpacities((s) => ({ ...s, [activeId]: v })), [activeId]);
  const onDrawChange = useCallback((points: [number, number][]) => setDraw((d) => (d ? { ...d, points } : d)), []);
  const onTileError = useCallback((id: string) => setTileErrors((s) => (s.has(id) ? s : new Set(s).add(id))), []);
  const finishRef = useRef<() => void>(() => {});
  const onDrawClose = useCallback(() => finishRef.current(), []);

  const target: AreaTarget | null = useMemo(() => {
    if (!property) return null;
    if (selectedPlot) {
      const [lat, lon] = polygonCenter(selectedPlot.boundary);
      return { lat, lon, boundary: selectedPlot.boundary, key: selectedPlot.id };
    }
    return { lat: property.latitude, lon: property.longitude, boundary: property.boundary, key: property.id };
  }, [property, selectedPlot]);
  const env = useAreaEnvironment(target, period);
  const summary = useEnvSummary(env, period);

  const focus = useMemo(
    () => ({
      key: `${property?.id}:${selectedPlot?.id ?? "all"}:${selectedPlot?.updatedAt ?? ""}`,
      points: selectedPlot?.boundary ?? property?.boundary ?? [],
      center: [property?.latitude ?? -15, property?.longitude ?? -50] as [number, number],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [property?.id, selectedPlot?.id, selectedPlot?.updatedAt],
  );
  const texture = useMemo(
    () =>
      selectedPlot?.soilTexture
        ? { value: selectedPlot.soilTexture as string, source: "talhão" as const }
        : { value: (property?.soil.texture ?? "") as string, source: "propriedade" as const },
    [selectedPlot?.soilTexture, property?.soil.texture],
  );

  if (!property) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<MapPinned />}
          title="Cadastre uma propriedade"
          description="Cadastre uma área para ver o mapa."
          action={
            <Link to="/propriedades/nova" className="text-sm font-medium text-primary hover:underline">
              Cadastrar propriedade →
            </Link>
          }
        />
      </div>
    );
  }

  const startDraw = (plot?: Plot) => {
    setDraw({ points: plot ? [...plot.boundary] : [], editingId: plot?.id ?? null });
    if (plot) setSelectedPlotId(plot.id);
    setPlotsOpen(false);
  };
  const finishDraw = () => {
    if (!draw || draw.points.length < 3) return;
    setDialog({ boundary: draw.points, plot: draw.editingId ? plots.find((p) => p.id === draw.editingId) : undefined });
  };
  finishRef.current = finishDraw;

  const savePlot = (input: PlotInput) => {
    if (dialog?.plot) {
      updatePlot(dialog.plot.id, { ...input, demo: input.boundary === dialog.plot.boundary ? dialog.plot.demo : false });
      toast.success("Talhão atualizado", input.name);
    } else {
      const p = addPlot(input);
      setSelectedPlotId(p.id);
      toast.success("Talhão salvo", `${input.name} · ${fmt.n2(input.areaHa)} ha`);
    }
    setDialog(null);
    setDraw(null);
  };

  const importGeoJson = async (file: File) => {
    try {
      const { polygons, warnings } = parsePolygons(JSON.parse(await file.text()));
      if (!polygons.length) return toast.error("Nenhum polígono encontrado", warnings[0] ?? "O arquivo não contém geometrias do tipo Polygon.");
      let last: Plot | null = null;
      for (const pg of polygons) last = addPlot({ propertyId: property.id, name: pg.name, boundary: pg.boundary, areaHa: round(polygonAreaHa(pg.boundary), 2) });
      if (last) setSelectedPlotId(last.id);
      toast.success(`${polygons.length} talhão(ões) importado(s)`, warnings.length ? warnings.join(" ") : "Confira os nomes e a textura do solo de cada um.");
    } catch {
      toast.error("Arquivo inválido", "Use um GeoJSON (.geojson/.json) em WGS84 (EPSG:4326).");
    }
  };
  const exportGeoJson = () => {
    const slug = property.name.normalize("NFD").replace(/[^\w]+/g, "-").toLowerCase();
    downloadJson(plotsToFeatureCollection(plots), `talhoes-${slug}.geojson`);
  };

  const stepDate = (dir: -1 | 1) => {
    const d = parseISODate(mapDate);
    const freq = active?.temporal ?? "daily";
    if (freq === "monthly") d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir * (freq === "16day" ? 16 : 1));
    const iso = toISODate(d);
    setMapDate(iso > availableEnd() ? availableEnd() : iso);
  };

  const drawArea = draw && draw.points.length >= 3 ? polygonAreaHa(draw.points) : 0;

  const chipKey = chip?.key ?? "";
  const selectChip = (key: string) => setActiveId(key ? (CHIPS.find((c) => c.key === key)?.layers[0] ?? null) : null);
  const areaHa = selectedPlot ? selectedPlot.areaHa : property.boundary ? property.areaHa : null;
  const hasBoundary = !!target?.boundary && target.boundary.length >= 3;
  const areaTint = coarse && active ? tintFor(active.id, summary, scale) : null;

  return (
    <div className="lg:h-full lg:overflow-y-auto">
      <div className="mx-auto flex max-w-[1560px] flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        {/* Filtros: uma barra só, rótulo discreto + valor */}
        <div className="flex flex-col divide-y divide-border rounded-lg border border-border bg-surface md:flex-row md:items-stretch md:divide-x md:divide-y-0">
          <FilterField label="Camada">
            <Dropdown
              aria-label="Camada do mapa"
              value={chipKey}
              onChange={selectChip}
              className={TRIGGER}
              menuClassName="w-64"
              options={[
                ...CHIPS.map((c) => ({ value: c.key, label: c.key === "ndvi" ? "Vegetação (NDVI)" : c.label, icon: <c.icon /> })),
                { value: "", label: "Somente o mapa", icon: <MapIcon /> },
              ]}
            />
          </FilterField>

          <FilterField label="Área">
            <Dropdown
              aria-label="Área de análise"
              value={selectedPlotId ?? ""}
              onChange={(v) => setSelectedPlotId(v || null)}
              className={TRIGGER}
              menuClassName="w-64"
              options={[
                { value: "", label: "Propriedade inteira", hint: property.boundary ? `${fmt.n2(property.areaHa)} ha` : undefined },
                ...plots.map((p) => ({
                  value: p.id,
                  label: p.name,
                  hint: [`${fmt.n2(p.areaHa)} ha`, p.currentCrop, p.demo ? "exemplo" : null].filter(Boolean).join(" · "),
                })),
              ]}
            >
              {selectedPlot?.name ?? "Propriedade inteira"}
              {areaHa !== null && <span className="tabular ml-2 font-normal text-subtle-foreground">{fmt.n2(areaHa)} ha</span>}
            </Dropdown>
          </FilterField>

          <FilterField label="Período">
            <PeriodSelect period={period} onPeriod={setPeriod} />
          </FilterField>

          <div className="flex items-center gap-1 px-2 py-1.5 md:py-0">
            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => setPlotsOpen(true)}>
              <ListTree /> Talhões
            </Button>
            <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground" onClick={() => startDraw()}>
              <PenLine /> Desenhar
            </Button>
          </div>
        </div>

        {/* Mapa + camada */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
      <div className="relative h-[58vh] min-h-[380px] overflow-hidden rounded-lg border border-border shadow-card lg:h-[480px]">
        <MapErrorBoundary onReset={() => setMapKey((k) => k + 1)}>
          <MapView
            key={mapKey}
            base={base}
            property={property}
            plots={plots}
            selectedPlotId={selectedPlotId}
            onSelectPlot={setSelectedPlotId}
            rasters={rasters}
            soilOpacity={soilOpacity}
            draw={draw}
            onDrawChange={onDrawChange}
            onDrawClose={onDrawClose}
            focus={focus}
            onZoom={setZoom}
            onTileError={onTileError}
            areaTint={areaTint}
            view={view}
          />
        </MapErrorBoundary>

        {draw ? (
          /* Ferramenta de desenho: substitui os controles do topo */
          <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex justify-center">
            <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg glass border px-3 py-2 ">
              <div className="mr-1 text-[13px]">
                <p className="font-semibold">{draw.editingId ? "Editando contorno" : "Novo talhão"}</p>
                <p className="tabular text-muted-foreground">
                  {draw.points.length < 3
                    ? `Clique nos cantos do talhão · ${draw.points.length} de 3 pontos`
                    : `${fmt.n2(drawArea)} ha · ${draw.points.length} pontos · ${fmt.n0(polygonPerimeterM(draw.points))} m`}
                </p>
              </div>
              <Button size="sm" variant="outline" onClick={() => setDraw({ ...draw, points: draw.points.slice(0, -1) })} disabled={!draw.points.length}>
                <Undo2 /> Desfazer
              </Button>
              <Button size="sm" variant="outline" onClick={() => setDraw({ ...draw, points: [] })} disabled={!draw.points.length}>
                <Eraser /> Limpar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setDraw(null)}>
                <X /> Cancelar
              </Button>
              <Button size="sm" onClick={finishDraw} disabled={draw.points.length < 3}>
                <Check /> Concluir
              </Button>
            </div>
          </div>
        ) : (
          <>
            {/* Mapa-base */}
            <div className="absolute bottom-3 left-3 z-[500]">
              <Dropdown
                aria-label="Mapa-base"
                value={base}
                onChange={setBase}
                side="top"
                className="rounded-md bg-white/95 px-3 py-1.5 text-[13px] font-semibold shadow-card"
                menuClassName="w-40"
                options={[
                  { value: "satelite", label: "Satélite", icon: <Satellite /> },
                  { value: "mapa", label: "Mapa", icon: <MapIcon /> },
                ]}
              >
                <span className="flex items-center gap-1.5">
                  <Layers className="size-4" /> {base === "satelite" ? "Satélite" : "Mapa"}
                </span>
              </Dropdown>
            </div>

            {/* Escala: produtos de pixel grosso */}
            {active?.detailZoom && (
              <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex justify-center">
                <div className="animate-in pointer-events-auto flex items-center gap-1 rounded-full bg-white/95 py-1 pl-3.5 pr-1 text-xs shadow-card">
                  <span className="text-muted-foreground">
                    {coarse ? <>Valor médio da área · pixel NASA {active.pixel}</> : <>Visão regional · pixel {active.pixel}</>}
                  </span>
                  <button
                    type="button"
                    onClick={() => requestView(coarse ? "region" : "area")}
                    className="flex cursor-pointer items-center gap-1 rounded-full px-2.5 py-1 font-semibold text-primary transition-colors hover:bg-primary-soft"
                  >
                    {coarse ? (
                      <>
                        <ZoomOut className="size-3.5" /> Ver região
                      </>
                    ) : (
                      <>
                        <Crosshair className="size-3.5" /> Voltar à área
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
            {active && chip && (!coarse || areaTint?.opacity !== WHITE_TINT) && (
              <div className="pointer-events-none absolute bottom-3 right-3 z-[500]">
                <MapLegend layer={active} title={active.id === "ndvi" ? "Índice de vegetação (NDVI)" : chip.label} zoom={zoom} />
              </div>
            )}
          </>
        )}

        {plotsOpen && (
          <div className="absolute inset-y-0 left-0 z-[600] flex w-[min(340px,100%)] flex-col border-r border-border bg-surface shadow-lg">
            <div className="flex items-center justify-between border-b border-border px-4 py-3">
              <p className="text-sm font-semibold">Talhões · {property.name}</p>
              <Button variant="ghost" size="icon-sm" onClick={() => setPlotsOpen(false)} aria-label="Fechar">
                <X />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4">
              <PlotsPanel
                plots={plots}
                selectedId={selectedPlotId}
                onSelect={(id) => setSelectedPlotId(id)}
                onSelectProperty={() => setSelectedPlotId(null)}
                onDraw={() => startDraw()}
                onEditShape={startDraw}
                onEditInfo={(p) => setDialog({ boundary: p.boundary, plot: p })}
                onDelete={setConfirmDelete}
                onImport={() => fileRef.current?.click()}
                onExport={exportGeoJson}
              />
              <DataModeNote mode={powerMode} />
            </div>
          </div>
        )}
        <input
          ref={fileRef}
          type="file"
          accept=".geojson,.json,application/geo+json,application/json"
          hidden
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void importGeoJson(f);
            e.target.value = "";
          }}
        />
      </div>

          {active && chip ? (
            <ActiveLayerCard
              key={chip.key}
              layer={active}
              chip={chip}
              env={env}
              summary={summary}
              texture={texture.value}
              hasBoundary={hasBoundary}
              opacity={opacity}
              onOpacity={onOpacity}
              onVariant={setActiveId}
              date={activeDate}
              mapDate={mapDate}
              onMapDate={setMapDate}
              onStep={stepDate}
              tileError={tileErrors.has(active.id)}
            />
          ) : (
            <section className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-input bg-surface/60 p-6 text-center text-sm text-muted-foreground">
              <Layers className="size-5" />
              Escolha uma camada em “O que deseja visualizar?”.
            </section>
          )}
        </div>

        {/* Evolução + próxima safra */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <InsightsDock env={env} summary={summary} period={period} hasBoundary={hasBoundary} texture={texture} chipKey={chipKey} />
          <section className="flex flex-col rounded-lg border border-[#d6e8cf] bg-primary-soft/70 p-6">
            <div className="flex items-start gap-3">
              <Sprout className="mt-0.5 size-7 shrink-0 text-primary" />
              <h2 className="text-[19px] font-semibold leading-snug text-brand-dark">Planejamento da próxima safra</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-primary-soft-foreground/90">
              Use as condições ambientais da sua propriedade para explorar diferentes estratégias de rotação de culturas.
            </p>
            <Link
              to="/analise"
              className="mt-auto flex items-center justify-between rounded-md bg-brand-dark px-5 py-3 text-[15px] font-semibold text-white transition-colors hover:bg-primary max-lg:mt-5 lg:mt-6"
            >
              Comparar rotações <ChevronRight className="size-5" />
            </Link>
          </section>
        </div>
      </div>

      <PlotFormDialog
        open={!!dialog}
        onClose={() => setDialog(null)}
        property={property}
        plot={dialog?.plot}
        boundary={dialog?.boundary ?? []}
        existingNames={plots.map((p) => p.name)}
        onSave={savePlot}
      />
      <ConfirmDialog
        open={!!confirmDelete}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => {
          if (!confirmDelete) return;
          deletePlot(confirmDelete.id);
          if (selectedPlotId === confirmDelete.id) setSelectedPlotId(null);
          toast.info("Talhão excluído", confirmDelete.name);
        }}
        title="Excluir talhão?"
        description={`"${confirmDelete?.name}" e seu contorno serão removidos. Os dados ambientais não são afetados.`}
      />
    </div>
  );
}


/* ---------- Filtros ---------- */

function FilterField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-3 px-4 py-3 md:flex-1">
      <span className="w-16 shrink-0 text-[13px] text-muted-foreground md:w-auto">{label}</span>
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}

/** Gatilho dos dropdowns da barra de filtros: valor em destaque, sem borda. */
const TRIGGER = "py-0.5 text-[14px] font-semibold text-foreground";

/** Sentinela: área só com o valor (sem paleta para colorir). */
const WHITE_TINT = 0.12;

/** Valor médio do período pintado sobre a área quando o pixel da NASA é maior que a tela. */
function tintFor(id: LayerId, s: EnvSummary, scale: LegendScale | null): { color: string; label: string; opacity: number } | null {
  const { ci, si } = s;
  if (id === "temp") {
    if (ci?.meanTemp == null) return null;
    const c = scale ? colorAt(scale, ci.meanTemp) : null;
    return { color: c ?? "#ffffff", label: `${fmt.n1(ci.meanTemp)} °C`, opacity: c ? 0.6 : WHITE_TINT };
  }
  if (id === "rh") return ci?.meanRh == null ? null : { color: "#ffffff", label: `${fmt.n0(ci.meanRh)}%`, opacity: WHITE_TINT };
  if (id === "precip") return ci?.totalPrecip == null ? null : { color: "#ffffff", label: `${fmt.n0(ci.totalPrecip)} mm`, opacity: WHITE_TINT };
  if (id === "smap_surface" || id === "smap_root") {
    const v = id === "smap_root" ? si?.last?.rootZone : si?.last?.surface;
    return v == null ? null : { color: "#ffffff", label: `${fmt.n2(v)} m³/m³`, opacity: WHITE_TINT };
  }
  return null;
}

function PeriodSelect({ period, onPeriod }: { period: Period; onPeriod: (p: Period) => void }) {
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
  const label = (o: (typeof PERIOD_PRESETS)[number]) =>
    o.value === "safra" ? `Safra ${safraLabel(presetPeriod("safra"))}` : o.value === "custom" ? "Personalizado" : `Últimos ${o.label}`;
  const hint = (o: (typeof PERIOD_PRESETS)[number]) => {
    if (o.value === "custom") return "Escolha início e fim";
    const p = presetPeriod(o.value);
    return `${formatDate(p.start, { day: "2-digit", month: "short" })} – ${formatDate(p.end, { day: "2-digit", month: "short", year: "numeric" })}`;
  };
  return (
    <>
      <Dropdown
        aria-label="Período"
        value={period.preset}
        onChange={pick}
        className={TRIGGER}
        menuClassName="w-64"
        align="end"
        options={PERIOD_PRESETS.map((o) => ({ value: o.value, label: label(o), hint: hint(o) }))}
      />
      {period.preset === "custom" && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <Input type="date" aria-label="Início" className="h-7 px-2 text-xs" value={custom.start} min="1981-01-01" max={availableEnd()} aria-invalid={!!error} onChange={(e) => apply({ ...custom, start: e.target.value })} />
          <span className="text-xs text-muted-foreground">até</span>
          <Input type="date" aria-label="Fim" className="h-7 px-2 text-xs" value={custom.end} min="1981-01-01" max={availableEnd()} aria-invalid={!!error} onChange={(e) => apply({ ...custom, end: e.target.value })} />
        </div>
      )}
      {error && <p className="mt-1 text-xs text-danger">{error}</p>}
    </>
  );
}

class MapErrorBoundary extends Component<{ children: ReactNode; onReset: () => void }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  componentDidCatch(error: Error) {
    console.error("[Mapa ambiental] erro no mapa:", error);
  }
  reset = () => {
    this.setState({ error: null });
    this.props.onReset();
  };
  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="flex h-full flex-col items-center justify-center gap-3 bg-muted px-6 text-center">
        <p className="text-sm font-medium">O mapa encontrou um problema ao desenhar as camadas.</p>
        <p className="max-w-sm text-[13px] text-muted-foreground">Seus talhões e filtros foram mantidos.</p>
        <Button size="sm" onClick={this.reset}>
          Recarregar mapa
        </Button>
      </div>
    );
  }
}


function PlotsPanel(props: {
  plots: Plot[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onSelectProperty: () => void;
  onDraw: () => void;
  onEditShape: (p: Plot) => void;
  onEditInfo: (p: Plot) => void;
  onDelete: (p: Plot) => void;
  onImport: () => void;
  onExport: () => void;
}) {
  const total = props.plots.reduce((a, p) => a + p.areaHa, 0);
  return (
    <div className="flex flex-col gap-3">
      <Button size="sm" onClick={props.onDraw}>
        <Plus /> Desenhar novo talhão
      </Button>

      {props.plots.length === 0 ? (
        <p className="rounded-md border border-dashed border-input px-3 py-6 text-center text-[13px] text-muted-foreground">
          Nenhum talhão ainda. Desenhe no mapa ou importe um arquivo GeoJSON.
        </p>
      ) : (
        <>
          <p className="px-1 text-xs text-muted-foreground">
            {props.plots.length} talhão(ões) · <span className="tabular">{fmt.n2(total)} ha</span>
          </p>
          <ul className="flex flex-col gap-1.5">
            <li>
              <button
                type="button"
                onClick={props.onSelectProperty}
                className={cn(
                  "w-full cursor-pointer rounded-md border px-3 py-2 text-left text-sm",
                  props.selectedId === null ? "border-primary bg-primary-soft/60" : "border-border bg-surface hover:bg-muted/60",
                )}
              >
                Propriedade inteira
              </button>
            </li>
            {props.plots.map((p) => {
              const sel = p.id === props.selectedId;
              return (
                <li key={p.id} className={cn("rounded-md border", sel ? "border-primary bg-primary-soft/60" : "border-border bg-surface")}>
                  <button type="button" onClick={() => props.onSelect(p.id)} className="w-full cursor-pointer px-3 pt-2 text-left">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-medium">{p.name}</span>
                      {p.demo && (
                        <Badge variant="warning" title="Contorno fictício de demonstração">
                          <FlaskConical /> Exemplo
                        </Badge>
                      )}
                    </span>
                    <span className="tabular block text-xs text-muted-foreground">
                      {fmt.n2(p.areaHa)} ha{p.currentCrop ? ` · ${p.currentCrop}` : ""}
                    </span>
                  </button>
                  <div className="flex gap-0.5 px-1.5 pb-1.5 pt-1">
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => props.onEditInfo(p)}>
                      <Pencil /> Dados
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => props.onEditShape(p)}>
                      <PenLine /> Contorno
                    </Button>
                    <Button size="sm" variant="ghost" className="ml-auto h-7 px-2 text-xs text-danger hover:bg-danger-soft" onClick={() => props.onDelete(p)}>
                      <Trash2 /> Excluir
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}

      <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
        <Button size="sm" variant="outline" onClick={props.onImport}>
          <Upload /> Importar
        </Button>
        <Button size="sm" variant="outline" onClick={props.onExport} disabled={!props.plots.length}>
          <Download /> Exportar
        </Button>
      </div>
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">Arquivos GeoJSON (WGS84) — abrem no QGIS e no Google Earth Pro.</p>
    </div>
  );
}

function DataModeNote({ mode }: { mode: "mock" | "api" }) {
  if (mode !== "mock") return null;
  return (
    <Callout tone="warning" icon={<FlaskConical />} className="mt-4">
      <strong>Modo demonstração</strong> · indicadores simulados.{" "}
      <Link to="/configuracoes?secao=fontes" className="font-medium underline">
        Alterar
      </Link>
    </Callout>
  );
}
