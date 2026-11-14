import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Eraser,
  FlaskConical,
  Layers,
  MapPinned,
  Pencil,
  PenLine,
  Plus,
  Satellite,
  Trash2,
  Undo2,
  Upload,
  X,
  Check,
  Map as MapIcon,
} from "lucide-react";
import type { Plot, PlotInput } from "@/types";
import { useAppStore, useSelectedProperty } from "@/app/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input, Select } from "@/components/ui/form";
import { Callout, Segmented } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared";
import { toast } from "@/components/ui/toast";
import type { BaseLayer } from "@/components/maps";
import { cn } from "@/lib/utils";
import { fmt, parseISODate, toISODate } from "@/lib/format";
import { polygonAreaHa, polygonCenter, polygonPerimeterM } from "@/lib/geo";
import { round } from "@/lib/utils";
import { downloadJson, parsePolygons, plotsToFeatureCollection } from "@/lib/geojson";
import { LAYERS, layerById, type LayerId } from "@/services/environment/catalog";
import { MapView, type ActiveRaster } from "./components/MapView";
import { LayerPanel, type LayerState } from "./components/LayerPanel";
import { MapLegend } from "./components/MapLegend";
import { InsightsDock } from "./components/InsightsDock";
import { PlotFormDialog } from "./components/PlotFormDialog";
import { useAreaEnvironment, useLayerDates, type AreaTarget } from "./hooks";
import { availableEnd, PERIOD_PRESETS, presetPeriod, safraLabel, validatePeriod, type Period, type PeriodPreset } from "./period";

type DrawState = { points: [number, number][]; editingId: string | null };

export function EnvironmentalMapPage() {
  const property = useSelectedProperty();
  const properties = useAppStore((s) => s.properties);
  const selectProperty = useAppStore((s) => s.selectProperty);
  const allPlots = useAppStore((s) => s.plots);
  const addPlot = useAppStore((s) => s.addPlot);
  const updatePlot = useAppStore((s) => s.updatePlot);
  const deletePlot = useAppStore((s) => s.deletePlot);
  const powerMode = useAppStore((s) => s.settings.powerMode);

  const plots = useMemo(() => allPlots.filter((p) => p.propertyId === property?.id), [allPlots, property?.id]);
  const [selectedPlotId, setSelectedPlotId] = useState<string | null>(plots[0]?.id ?? null);
  const selectedPlot = plots.find((p) => p.id === selectedPlotId) ?? null;

  useEffect(() => {
    // troca de propriedade: seleciona o primeiro talhão dela
    setSelectedPlotId((cur) => (plots.some((p) => p.id === cur) ? cur : (plots[0]?.id ?? null)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [property?.id]);

  const [layers, setLayers] = useState<LayerState>({ ndvi: { on: true, opacity: layerById("ndvi").defaultOpacity } });
  const [base, setBase] = useState<BaseLayer>("satelite");
  const [period, setPeriod] = useState<Period>(() => presetPeriod("90d"));
  const [mapDate, setMapDate] = useState(period.end);
  const [draw, setDraw] = useState<DrawState | null>(null);
  const [dialog, setDialog] = useState<{ boundary: [number, number][]; plot?: Plot } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Plot | null>(null);
  const [dockOpen, setDockOpen] = useState(true);
  const [panelTab, setPanelTab] = useState<"camadas" | "talhoes">("camadas");
  const [zoom, setZoom] = useState(15);
  const [tileErrors, setTileErrors] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);
  const panelRef = useRef<HTMLElement>(null);

  useEffect(() => setMapDate(period.end), [period.end]);
  useEffect(() => setTileErrors(new Set()), [mapDate]);

  /* ---------- Camadas ativas ---------- */
  const activeLayers = useMemo(() => LAYERS.filter((l) => layers[l.id]?.on && l.render.kind !== "planned"), [layers]);
  const layerDates = useLayerDates(activeLayers, mapDate);
  // estável entre renderizações: o mapa só é atualizado quando camada, opacidade ou data exibida mudam
  const rasterSig = activeLayers
    .map((l) => {
      const d = layerDates[l.id];
      return `${l.id}:${layers[l.id]!.opacity}:${d?.status === "ready" ? d.data.date : ""}`;
    })
    .join("|");
  const rasters: ActiveRaster[] = useMemo(
    () =>
      activeLayers
        .filter((l) => l.render.kind === "gibs" || l.render.kind === "computed")
        .map((l) => {
          const d = layerDates[l.id];
          return { layer: l, opacity: layers[l.id]!.opacity, date: d?.status === "ready" ? d.data.date : null };
        }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [rasterSig],
  );
  const onDrawChange = useCallback((points: [number, number][]) => setDraw((d) => (d ? { ...d, points } : d)), []);
  const onTileError = useCallback((id: string) => setTileErrors((s) => (s.has(id) ? s : new Set(s).add(id))), []);
  const finishRef = useRef<() => void>(() => {});
  const onDrawClose = useCallback(() => finishRef.current(), []);
  const [mapKey, setMapKey] = useState(0);
  const toggleDock = useCallback(() => setDockOpen((v) => !v), []);
  const texture = useMemo(
    () =>
      selectedPlot?.soilTexture
        ? { value: selectedPlot.soilTexture as string, source: "talhão" as const }
        : { value: (property?.soil.texture ?? "") as string, source: "propriedade" as const },
    [selectedPlot?.soilTexture, property?.soil.texture],
  );
  const soilOpacity = layers.soil?.on ? layers.soil.opacity : null;
  // passo dos botões de data = frequência da camada temporal mais ao topo
  const primaryTemporal = [...activeLayers].sort((a, b) => b.z - a.z).find((l) => l.temporal !== "static")?.temporal ?? "daily";

  const toggleLayer = (id: LayerId, on: boolean) =>
    setLayers((s) => ({ ...s, [id]: { on, opacity: s[id]?.opacity ?? layerById(id).defaultOpacity } }));
  const setOpacity = (id: LayerId, opacity: number) => setLayers((s) => ({ ...s, [id]: { on: true, opacity } }));

  /* ---------- Área analisada ---------- */
  const target: AreaTarget | null = useMemo(() => {
    if (!property) return null;
    if (selectedPlot) {
      const [lat, lon] = polygonCenter(selectedPlot.boundary);
      return { lat, lon, boundary: selectedPlot.boundary, key: selectedPlot.id };
    }
    return { lat: property.latitude, lon: property.longitude, boundary: property.boundary, key: property.id };
  }, [property, selectedPlot]);

  const env = useAreaEnvironment(target, period);

  const focus = useMemo(
    () => ({
      key: `${property?.id}:${selectedPlot?.id ?? "all"}:${selectedPlot?.updatedAt ?? ""}`,
      points: selectedPlot?.boundary ?? property?.boundary ?? [],
      center: [property?.latitude ?? -15, property?.longitude ?? -50] as [number, number],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [property?.id, selectedPlot?.id, selectedPlot?.updatedAt],
  );

  if (!property) {
    return (
      <div className="p-6">
        <EmptyState
          icon={<MapPinned />}
          title="Cadastre uma propriedade"
          description="O Mapa Ambiental mostra os dados da propriedade e dos talhões cadastrados."
          action={
            <Link to="/propriedades/nova" className="text-sm font-medium text-primary hover:underline">
              Cadastrar propriedade →
            </Link>
          }
        />
      </div>
    );
  }

  /* ---------- Talhões ---------- */
  const startDraw = (plot?: Plot) => {
    setDraw({ points: plot ? [...plot.boundary] : [], editingId: plot?.id ?? null });
    if (plot) setSelectedPlotId(plot.id);
    setPanelTab("talhoes");
  };
  const finishDraw = () => {
    if (!draw || draw.points.length < 3) return;
    const plot = draw.editingId ? plots.find((p) => p.id === draw.editingId) : undefined;
    setDialog({ boundary: draw.points, plot });
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

  /* ---------- Data do mapa ---------- */
  const stepDate = (dir: -1 | 1) => {
    const d = parseISODate(mapDate);
    if (primaryTemporal === "monthly") d.setMonth(d.getMonth() + dir);
    else d.setDate(d.getDate() + dir * (primaryTemporal === "16day" ? 16 : 1));
    const iso = toISODate(d);
    setMapDate(iso > availableEnd() ? availableEnd() : iso);
  };


  const drawArea = draw && draw.points.length >= 3 ? polygonAreaHa(draw.points) : 0;

  return (
    <div className="flex flex-col lg:h-full lg:flex-row">
      {/* ---------- Painel lateral ---------- */}
      <aside
        ref={panelRef}
        id="painel-camadas"
        className="order-last flex w-full shrink-0 flex-col border-t border-border bg-background lg:order-first lg:w-[320px] lg:border-t-0 lg:border-r"
      >
        <div className="border-b border-border px-4 pt-3">
          <div role="tablist" className="flex gap-4 text-sm font-medium">
            {(
              [
                ["camadas", "Camadas", Layers],
                ["talhoes", `Talhões (${plots.length})`, MapIcon],
              ] as const
            ).map(([k, label, Icon]) => (
              <button
                key={k}
                role="tab"
                aria-selected={panelTab === k}
                onClick={() => setPanelTab(k)}
                className={cn(
                  "-mb-px flex cursor-pointer items-center gap-1.5 border-b-2 pb-2.5",
                  panelTab === k ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                <Icon className="size-4" /> {label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {panelTab === "camadas" ? (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[13px] font-medium">Mapa-base</span>
                <Segmented
                  aria-label="Mapa-base"
                  value={base}
                  onChange={setBase}
                  options={[
                    { value: "satelite", label: "Satélite" },
                    { value: "mapa", label: "Mapa" },
                  ]}
                />
              </div>
              <LayerPanel state={layers} onToggle={toggleLayer} onOpacity={setOpacity} />
              <DataModeNote mode={powerMode} />
            </div>
          ) : (
            <PlotsPanel
              plots={plots}
              selectedId={selectedPlotId}
              drawing={!!draw}
              onSelect={(id) => setSelectedPlotId(id)}
              onSelectProperty={() => setSelectedPlotId(null)}
              onDraw={() => startDraw()}
              onEditShape={startDraw}
              onEditInfo={(p) => setDialog({ boundary: p.boundary, plot: p })}
              onDelete={setConfirmDelete}
              onImport={() => fileRef.current?.click()}
              onExport={exportGeoJson}
            />
          )}
        </div>
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
      </aside>

      {/* ---------- Mapa + indicadores ---------- */}
      <section className="flex min-w-0 flex-1 flex-col lg:min-h-0">
        <Toolbar
          property={property}
          properties={properties}
          onProperty={selectProperty}
          plots={plots}
          selectedPlotId={selectedPlotId}
          onPlot={setSelectedPlotId}
          period={period}
          onPeriod={setPeriod}
          mapDate={mapDate}
          onMapDate={setMapDate}
          onStep={stepDate}
          stepLabel={primaryTemporal === "monthly" ? "mês" : primaryTemporal === "16day" ? "composição" : "dia"}
        />

        <div className="relative h-[62vh] min-h-[360px] lg:h-auto lg:min-h-[300px] lg:flex-1">
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
            />
          </MapErrorBoundary>

          {/* Ferramenta de desenho */}
          {draw ? (
            <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex justify-center">
              <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface/95 px-3 py-2 shadow-md backdrop-blur">
                <div className="mr-1 text-[13px]">
                  <p className="font-semibold">{draw.editingId ? "Editando contorno" : "Novo talhão"}</p>
                  <p className="tabular text-muted-foreground">
                    {draw.points.length < 3
                      ? `Clique no mapa nos cantos do talhão · ${draw.points.length}/3 pontos`
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
            <div className="pointer-events-none absolute right-3 top-3 z-[500] flex flex-col items-end gap-2">
              <Button size="sm" className="pointer-events-auto shadow-md" onClick={() => startDraw()}>
                <PenLine /> Desenhar talhão
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="pointer-events-auto shadow-md lg:hidden"
                onClick={() => {
                  setPanelTab("camadas");
                  panelRef.current?.scrollIntoView({ behavior: "smooth" });
                }}
              >
                <Layers /> Camadas
              </Button>
            </div>
          )}

          <div className="pointer-events-none absolute bottom-6 left-3 z-[500]">
            <MapLegend
              items={activeLayers.map((l) => ({ layer: l, date: layerDates[l.id] }))}
              zoom={zoom}
              tileErrors={tileErrors}
            />
          </div>
        </div>

        <div className={cn("lg:shrink-0", dockOpen && "lg:h-[360px]")}>
          <InsightsDock
            env={env}
            period={period}
            areaName={selectedPlot ? selectedPlot.name : `${property.name} (propriedade inteira)`}
            areaHa={selectedPlot ? selectedPlot.areaHa : property.boundary ? property.areaHa : null}
            isDemo={!!selectedPlot?.demo}
            hasBoundary={!!target?.boundary && target.boundary.length >= 3}
            texture={texture}
            property={property}
            open={dockOpen}
            onToggle={toggleDock}
          />
        </div>
      </section>

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

/**
 * Rede de segurança: se o mapa falhar ao renderizar, mostra um aviso e recria só o mapa —
 * o resto da tela (talhões, período, gráficos) continua funcionando, sem recarregar a página.
 */
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

/* ---------- Barra superior: seleção e período ---------- */

function Toolbar(props: {
  property: { id: string };
  properties: { id: string; name: string; city: string; state: string }[];
  onProperty: (id: string) => void;
  plots: Plot[];
  selectedPlotId: string | null;
  onPlot: (id: string | null) => void;
  period: Period;
  onPeriod: (p: Period) => void;
  mapDate: string;
  onMapDate: (d: string) => void;
  onStep: (dir: -1 | 1) => void;
  stepLabel: string;
}) {
  const { period } = props;
  const [custom, setCustom] = useState({ start: period.start, end: period.end });
  const error = period.preset === "custom" ? validatePeriod(custom.start, custom.end) : null;

  const pickPreset = (preset: PeriodPreset) => {
    if (preset === "custom") {
      setCustom({ start: period.start, end: period.end });
      props.onPeriod({ ...period, preset: "custom" });
    } else props.onPeriod(presetPeriod(preset));
  };
  const applyCustom = (next: { start: string; end: string }) => {
    setCustom(next);
    if (!validatePeriod(next.start, next.end)) props.onPeriod({ preset: "custom", ...next });
  };

  return (
    <div className="flex flex-wrap items-end gap-x-4 gap-y-2 border-b border-border bg-surface px-4 py-2.5">
      <label className="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
        Propriedade
        <Select value={props.property.id} onChange={(e) => props.onProperty(e.target.value)} className="h-8 text-[13px]">
          {props.properties.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name} — {p.city}/{p.state}
            </option>
          ))}
        </Select>
      </label>
      <label className="flex min-w-[160px] flex-col gap-1 text-xs text-muted-foreground">
        Talhão
        <Select value={props.selectedPlotId ?? ""} onChange={(e) => props.onPlot(e.target.value || null)} className="h-8 text-[13px]">
          <option value="">Propriedade inteira</option>
          {props.plots.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
              {p.demo ? " (exemplo)" : ""}
            </option>
          ))}
        </Select>
      </label>

      <div className="flex flex-col gap-1 text-xs text-muted-foreground">
        <span>
          Período dos gráficos
          {period.preset === "safra" && <span className="ml-1 text-foreground">· safra {safraLabel(period)}</span>}
        </span>
        <Segmented aria-label="Período" value={period.preset} onChange={pickPreset} options={PERIOD_PRESETS} />
      </div>

      {period.preset === "custom" && (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <span className={cn(error && "text-danger")}>{error ?? "De / até"}</span>
          <div className="flex items-center gap-1.5">
            <Input
              type="date"
              aria-label="Início do período"
              className="h-8 w-[140px] text-[13px]"
              value={custom.start}
              min="1981-01-01"
              max={availableEnd()}
              aria-invalid={!!error}
              onChange={(e) => applyCustom({ ...custom, start: e.target.value })}
            />
            <Input
              type="date"
              aria-label="Fim do período"
              className="h-8 w-[140px] text-[13px]"
              value={custom.end}
              min="1981-01-01"
              max={availableEnd()}
              aria-invalid={!!error}
              onChange={(e) => applyCustom({ ...custom, end: e.target.value })}
            />
          </div>
        </div>
      )}

      <div className="flex flex-col gap-1 text-xs text-muted-foreground lg:ml-auto">
        <span>Data da imagem no mapa</span>
        <div className="flex items-center gap-1">
          <Button variant="outline" size="icon-sm" onClick={() => props.onStep(-1)} aria-label={`Voltar um(a) ${props.stepLabel}`} title={`Voltar um(a) ${props.stepLabel}`}>
            <ChevronLeft />
          </Button>
          <Input
            type="date"
            aria-label="Data da imagem"
            className="h-8 w-[140px] text-[13px]"
            value={props.mapDate}
            min="2000-03-01"
            max={availableEnd()}
            onChange={(e) => e.target.value && props.onMapDate(e.target.value)}
          />
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => props.onStep(1)}
            disabled={props.mapDate >= availableEnd()}
            aria-label={`Avançar um(a) ${props.stepLabel}`}
            title={`Avançar um(a) ${props.stepLabel}`}
          >
            <ChevronRight />
          </Button>
        </div>
      </div>
    </div>
  );
}

/* ---------- Lista de talhões ---------- */

function PlotsPanel(props: {
  plots: Plot[];
  selectedId: string | null;
  drawing: boolean;
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
      <div className="grid grid-cols-2 gap-2">
        <Button size="sm" onClick={props.onDraw} disabled={props.drawing} className="col-span-2">
          <Plus /> Desenhar novo talhão
        </Button>
        <Button size="sm" variant="outline" onClick={props.onImport}>
          <Upload /> Importar GeoJSON
        </Button>
        <Button size="sm" variant="outline" onClick={props.onExport} disabled={!props.plots.length}>
          <Download /> Exportar
        </Button>
      </div>

      {props.plots.length === 0 ? (
        <p className="rounded-md border border-dashed border-input px-3 py-6 text-center text-[13px] text-muted-foreground">
          Nenhum talhão nesta propriedade. Desenhe no mapa ou importe um arquivo GeoJSON.
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
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => props.onEditShape(p)} disabled={props.drawing}>
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
      <p className="px-1 text-xs leading-relaxed text-muted-foreground">
        Geometria em WGS84 (EPSG:4326). O arquivo exportado é GeoJSON padrão — abre no QGIS, Google Earth Pro e será o formato de envio à API.
      </p>
    </div>
  );
}

function DataModeNote({ mode }: { mode: "mock" | "api" }) {
  return mode === "mock" ? (
    <Callout tone="warning" icon={<FlaskConical />}>
      <strong>Modo demonstração:</strong> indicadores e gráficos usam séries simuladas. As imagens do mapa continuam sendo reais (NASA GIBS).{" "}
      <Link to="/configuracoes?secao=fontes" className="font-medium underline">
        Alterar
      </Link>
    </Callout>
  ) : (
    <Callout tone="info" icon={<Satellite />}>
      Imagens e séries consultadas na NASA em tempo real. Se uma fonte não responder, o valor aparece como <strong>Simulado</strong> ou <strong>Indisponível</strong> — nunca
      como observação.
    </Callout>
  );
}
