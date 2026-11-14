import { Component, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Download, Eraser, FlaskConical, MapPinned, Pencil, PenLine, Plus, Satellite, Trash2, Undo2, Upload, X, Map as MapIcon } from "lucide-react";
import type { Plot, PlotInput } from "@/types";
import { useAppStore, useSelectedProperty } from "@/app/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select } from "@/components/ui/form";
import { Callout, Segmented } from "@/components/ui/misc";
import { ConfirmDialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/shared";
import { toast } from "@/components/ui/toast";
import type { BaseLayer } from "@/components/maps";
import { cn, round } from "@/lib/utils";
import { fmt, parseISODate, toISODate } from "@/lib/format";
import { polygonAreaHa, polygonCenter, polygonPerimeterM } from "@/lib/geo";
import { downloadJson, parsePolygons, plotsToFeatureCollection } from "@/lib/geojson";
import { layerById, type LayerId } from "@/services/environment/catalog";
import { MapView, type ActiveRaster } from "./components/MapView";
import { LayerBar, chipFor } from "./components/LayerBar";
import { ActiveLayerCard } from "./components/ActiveLayerCard";
import { InsightsDock } from "./components/InsightsDock";
import { PlotFormDialog } from "./components/PlotFormDialog";
import { useAreaEnvironment, useLayerDates, type AreaTarget } from "./hooks";
import { availableEnd, presetPeriod, type Period } from "./period";

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
  const [dockOpen, setDockOpen] = useState(true);
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
  const rasters: ActiveRaster[] = useMemo(
    () => (active && (active.render.kind === "gibs" || active.render.kind === "computed") ? [{ layer: active, opacity, date: shownDate }] : []),
    [active, opacity, shownDate],
  );
  const soilOpacity = activeId === "soil" ? opacity : null;

  const onOpacity = useCallback((v: number) => activeId && setOpacities((s) => ({ ...s, [activeId]: v })), [activeId]);
  const onDrawChange = useCallback((points: [number, number][]) => setDraw((d) => (d ? { ...d, points } : d)), []);
  const onTileError = useCallback((id: string) => setTileErrors((s) => (s.has(id) ? s : new Set(s).add(id))), []);
  const finishRef = useRef<() => void>(() => {});
  const onDrawClose = useCallback(() => finishRef.current(), []);
  const toggleDock = useCallback(() => setDockOpen((v) => !v), []);

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

  return (
    <div className="flex flex-col lg:h-full">
      <div className="relative h-[68vh] min-h-[380px] lg:h-auto lg:min-h-0 lg:flex-1">
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

        {draw ? (
          /* Ferramenta de desenho: substitui os controles do topo */
          <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex justify-center">
            <div className="pointer-events-auto flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface/95 px-3 py-2 shadow-md backdrop-blur">
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
          <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex flex-wrap items-start gap-2">
            {/* Talhão */}
            <div className="pointer-events-auto flex items-center gap-1 rounded-lg bg-surface/95 p-1 shadow-md backdrop-blur">
              <Select
                aria-label="Talhão"
                value={selectedPlotId ?? ""}
                onChange={(e) => setSelectedPlotId(e.target.value || null)}
                className="h-9 w-[190px] border-0 bg-transparent text-[13px] font-medium"
              >
                <option value="">Propriedade inteira</option>
                {plots.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.demo ? " (exemplo)" : ""}
                  </option>
                ))}
              </Select>
              <Button size="sm" variant="ghost" onClick={() => setPlotsOpen(true)} title="Gerenciar talhões">
                <MapIcon /> Talhões
              </Button>
              <Button size="sm" onClick={() => startDraw()} title="Desenhar novo talhão">
                <PenLine /> <span className="hidden sm:inline">Desenhar</span>
              </Button>
            </div>

            {/* Camadas */}
            <div className="pointer-events-auto order-last w-full min-w-0 sm:order-none sm:w-auto sm:flex-1">
              <LayerBar active={activeId} onSelect={setActiveId} />
            </div>

            {/* Mapa-base */}
            <div className="pointer-events-auto ml-auto rounded-lg bg-surface/95 p-1 shadow-md backdrop-blur">
              <Segmented
                aria-label="Mapa-base"
                value={base}
                onChange={setBase}
                className="border-0 bg-transparent"
                options={[
                  { value: "satelite", label: "Satélite" },
                  { value: "mapa", label: "Mapa" },
                ]}
              />
            </div>
          </div>
        )}

        {active && chip && !draw && (
          <div className="pointer-events-none absolute bottom-4 left-3 z-[500]">
            <ActiveLayerCard
              key={chip.key}
              layer={active}
              chip={chip}
              opacity={opacity}
              onOpacity={onOpacity}
              onVariant={setActiveId}
              date={activeDate}
              mapDate={mapDate}
              onMapDate={setMapDate}
              onStep={stepDate}
              zoom={zoom}
              tileError={tileErrors.has(active.id)}
            />
          </div>
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

      <div className={cn("lg:shrink-0", dockOpen && "lg:h-[27vh] lg:min-h-[250px]")}>
        <InsightsDock
          env={env}
          period={period}
          onPeriod={setPeriod}
          areaName={selectedPlot ? selectedPlot.name : `${property.name} (inteira)`}
          areaHa={selectedPlot ? selectedPlot.areaHa : property.boundary ? property.areaHa : null}
          isDemo={!!selectedPlot?.demo}
          hasBoundary={!!target?.boundary && target.boundary.length >= 3}
          texture={texture}
          open={dockOpen}
          onToggle={toggleDock}
        />
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
  return mode === "mock" ? (
    <Callout tone="warning" icon={<FlaskConical />} className="mt-4">
      <strong>Modo demonstração:</strong> indicadores e gráficos usam séries simuladas. As imagens do mapa continuam reais (NASA).{" "}
      <Link to="/configuracoes?secao=fontes" className="font-medium underline">
        Alterar
      </Link>
    </Callout>
  ) : (
    <Callout tone="info" icon={<Satellite />} className="mt-4">
      Dados consultados na NASA. Quando uma fonte não responde, o valor aparece como <strong>Simulado</strong> ou <strong>Indisponível</strong>.
    </Callout>
  );
}
