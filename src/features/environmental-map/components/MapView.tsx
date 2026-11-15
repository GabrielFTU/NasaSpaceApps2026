import { memo, useEffect, useMemo, useRef, useState } from "react";
import { formatDate } from "@/lib/format";
import { probeValue } from "@/services/environment/probe";
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Tooltip, useMap, useMapEvents, WMSTileLayer, ZoomControl } from "react-leaflet";
import L from "leaflet";
import type { Plot, Property } from "@/types";
import { BaseTiles, MAX_ZOOM, type BaseLayer } from "@/components/maps";
import { GIBS_WMS_3857 } from "@/services/environment/gibsTime";
import { TEXTURE_STYLE, type EnvLayer } from "@/services/environment/catalog";
import { renderSlopeTile, TERRAIN_SOURCE } from "@/services/environment/terrain";

export interface ActiveRaster {
  layer: EnvLayer;
  opacity: number;
  date: string | null;
}

interface MapViewProps {
  base: BaseLayer;
  property: Property;
  plots: Plot[];
  selectedPlotId: string | null;
  onSelectPlot: (id: string) => void;
  rasters: ActiveRaster[];
  soilOpacity: number | null;
  draw: { points: [number, number][]; editingId: string | null } | null;
  onDrawChange: (pts: [number, number][]) => void;
  onDrawClose: () => void;
  focus: { key: string; points: [number, number][]; center: [number, number] };
  onTileError?: (layerId: string) => void;
  onZoom?: (z: number) => void;
  /** Pinta a área analisada com a cor do valor (camadas de pixel grosso vistas de perto). */
  areaTint?: { color: string; label: string; opacity: number } | null;
  /** Pedido de enquadramento: `region` afasta até `zoom`; `area` volta ao contorno. */
  view?: { n: number; kind: "region" | "area"; zoom?: number } | null;
}

const vertexIcon = L.divIcon({ className: "semeia-vertex", iconSize: [14, 14], iconAnchor: [7, 7] });
const firstVertexIcon = L.divIcon({ className: "semeia-vertex semeia-vertex-first", iconSize: [16, 16], iconAnchor: [8, 8] });


export const MapView = memo(function MapView(props: MapViewProps) {
  const { base, property, plots, selectedPlotId, onSelectPlot, rasters, soilOpacity, draw, focus } = props;
  const drawing = !!draw;
  return (
    <MapContainer maxZoom={MAX_ZOOM} center={focus.center} zoom={15} className="envmap isolate h-full w-full !rounded-none" zoomControl={false}>
      <ZoomControl position="topleft" />
      <BaseTiles layer={base} labels={base === "satelite"} />
      <Fit focus={focus} />
      <ViewRequest view={props.view ?? null} focus={focus} />
      <AutoResize />
      {props.areaTint && !drawing && focus.points.length >= 3 && (
        <Polygon
          key={`tint-${focus.key}-${props.areaTint.color}`}
          positions={focus.points}
          interactive={false}
          pathOptions={{ color: "#ffffff", weight: 2, fillColor: props.areaTint.color, fillOpacity: props.areaTint.opacity }}
        >
          <Tooltip permanent direction="center" className="envmap-value">
            {props.areaTint.label}
          </Tooltip>
        </Polygon>
      )}
      <DrawMode active={drawing} />
      {props.onZoom && <ZoomWatcher onZoom={props.onZoom} />}
      {!drawing &&
        rasters.map(({ layer, date }) =>
          layer.render.kind === "gibs" && layer.render.probe && date ? <HoverProbe key={`probe-${layer.id}`} layer={layer} date={date} /> : null,
        )}

      {rasters.map(({ layer, opacity, date }) => {
        if (layer.render.kind === "computed") return <SlopeLayer key={layer.id} opacity={opacity} zIndex={layer.z} />;
        if (layer.render.kind !== "gibs") return null;
        if (layer.temporal !== "static" && !date) return null;
        return <GibsLayer key={layer.id} layerId={layer.id} gibsName={layer.render.layer} date={date} opacity={opacity} zIndex={layer.z} onTileError={props.onTileError} />;
      })}

      {/* Limite da propriedade */}
      {property.boundary && property.boundary.length >= 3 ? (
        <Polygon positions={property.boundary} interactive={false} pathOptions={PROPERTY_STYLE} />
      ) : (
        <CircleMarker center={[property.latitude, property.longitude]} radius={6} interactive={false} pathOptions={PIN_STYLE} />
      )}

      {/* Talhões */}
      {plots.map((p) =>
        draw?.editingId === p.id ? null : (
          <PlotShape
            key={p.id}
            plot={p}
            selected={p.id === selectedPlotId}
            soilColor={soilOpacity !== null ? TEXTURE_STYLE[p.soilTexture ?? property.soil.texture]?.color : undefined}
            soilOpacity={soilOpacity}
            drawing={drawing}
            onSelect={onSelectPlot}
          />
        ),
      )}

      {draw && <DrawLayer points={draw.points} onChange={props.onDrawChange} onClose={props.onDrawClose} />}
    </MapContainer>
  );
});

const PROPERTY_STYLE: L.PathOptions = { color: "#ffffff", weight: 1.5, dashArray: "6 5", fill: false, opacity: 0.9 };
const PIN_STYLE: L.PathOptions = { color: "#fff", weight: 2, fillColor: "#1d6f2c", fillOpacity: 1 };

const GibsLayer = memo(function GibsLayer({
  layerId,
  gibsName,
  date,
  opacity,
  zIndex,
  onTileError,
}: {
  layerId: string;
  gibsName: string;
  date: string | null;
  opacity: number;
  zIndex: number;
  onTileError?: (id: string) => void;
}) {
  const params = useMemo(
    () => ({ layers: gibsName, format: "image/png", transparent: true, version: "1.3.0", ...(date ? { time: date } : {}) }) as L.WMSParams,
    [gibsName, date],
  );
  const errRef = useRef(onTileError);
  errRef.current = onTileError;
  const handlers = useMemo(() => ({ tileerror: () => errRef.current?.(layerId) }), [layerId]);
  return (
    <WMSTileLayer
      url={GIBS_WMS_3857}
      params={params}
      opacity={opacity}
      zIndex={zIndex}
      attribution='Imagens <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>'
      eventHandlers={handlers}
    />
  );
});

const PlotShape = memo(function PlotShape({
  plot,
  selected,
  soilColor,
  soilOpacity,
  drawing,
  onSelect,
}: {
  plot: Plot;
  selected: boolean;
  soilColor?: string;
  soilOpacity: number | null;
  drawing: boolean;
  onSelect: (id: string) => void;
}) {
  const pathOptions = useMemo<L.PathOptions>(
    () => ({
      color: selected ? "#ffd60a" : "#ffffff",
      weight: selected ? 3.5 : 1.8,
      fillColor: soilColor ?? (selected ? "#ffd60a" : "#ffffff"),
      fillOpacity: soilColor ? (soilOpacity ?? 0.45) : selected ? 0.08 : 0.04,
    }),
    [selected, soilColor, soilOpacity],
  );
  const drawingRef = useRef(drawing);
  drawingRef.current = drawing;
  const handlers = useMemo(() => ({ click: () => !drawingRef.current && onSelect(plot.id) }), [onSelect, plot.id]);
  return (
    <Polygon positions={plot.boundary} eventHandlers={handlers} pathOptions={pathOptions}>
      <Tooltip key={selected ? "sel" : "idle"} sticky={!selected} permanent={selected} direction="center" className="envmap-label">
        {plot.name}
      </Tooltip>
    </Polygon>
  );
});

function Fit({ focus }: { focus: MapViewProps["focus"] }) {
  const map = useMap();
  useEffect(() => {
    map.stop();
    if (focus.points.length >= 3) map.fitBounds(L.latLngBounds(focus.points), { padding: [40, 40], maxZoom: 16 });
    else map.setView(focus.center, 14);
  }, [focus.key]);
  return null;
}

function ViewRequest({ view, focus }: { view: MapViewProps["view"]; focus: MapViewProps["focus"] }) {
  const map = useMap();
  useEffect(() => {
    if (!view) return;
    const center = focus.points.length >= 3 ? L.latLngBounds(focus.points).getCenter() : L.latLng(focus.center);
    if (view.kind === "region") map.flyTo(center, view.zoom ?? 7, { duration: 0.8 });
    else if (focus.points.length >= 3) map.flyToBounds(L.latLngBounds(focus.points), { padding: [40, 40], maxZoom: 16, duration: 0.8 });
    else map.flyTo(center, 14, { duration: 0.8 });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view?.n]);
  return null;
}

function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
  return null;
}

/**
 * Valor da camada sob o mouse (ou toque). Espera o mouse parar ~250 ms antes de consultar a NASA
 * e descarta respostas de posições antigas.
 */
function HoverProbe({ layer, date }: { layer: EnvLayer; date: string }) {
  const [tip, setTip] = useState<{ x: number; y: number; lat: number; lon: number; value?: number | null; loading: boolean; error?: boolean } | null>(null);
  const timer = useRef<number | undefined>(undefined);
  const seq = useRef(0);
  const render = layer.render.kind === "gibs" ? layer.render : null;
  const probe = render?.probe;

  const query = (lat: number, lon: number, x: number, y: number) => {
    if (!render || !probe) return;
    const id = ++seq.current;
    setTip({ x, y, lat, lon, loading: true });
    probeValue({ layer: render.layer, colormap: probe.colormap, conversion: probe.conversion, date, lat, lon, halfDeg: probe.halfDeg })
      .then((value) => id === seq.current && setTip((t) => (t ? { ...t, value, loading: false } : t)))
      .catch(() => id === seq.current && setTip((t) => (t ? { ...t, loading: false, error: true } : t)));
  };

  useMapEvents({
    mousemove: (e) => {
      const { x, y } = e.containerPoint;
      setTip((t) => (t ? { ...t, x, y } : t));
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => query(e.latlng.lat, e.latlng.lng, x, y), 250);
    },
    // toque em celular: mostra o valor do ponto tocado
    click: (e) => query(e.latlng.lat, e.latlng.lng, e.containerPoint.x, e.containerPoint.y),
    mouseout: () => {
      window.clearTimeout(timer.current);
      seq.current++;
      setTip(null);
    },
    movestart: () => setTip(null),
  });
  useEffect(() => () => window.clearTimeout(timer.current), []);
  useEffect(() => setTip(null), [date]);

  if (!tip || !probe) return null;
  const monthly = layer.temporal === "monthly";
  const when = monthly ? formatDate(date, { month: "long", year: "numeric" }) : formatDate(date);
  return (
    <div
      className="pointer-events-none absolute z-[700] w-max max-w-60 rounded-md glass border px-2.5 py-1.5 text-xs "
      style={{ left: tip.x, top: tip.y - 14, transform: "translate(-50%, -100%)" }}
      role="status"
    >
      {tip.loading ? (
        <span className="text-muted-foreground">Lendo {layer.short.toLowerCase()}…</span>
      ) : tip.error ? (
        <span className="text-danger">Não foi possível consultar agora.</span>
      ) : tip.value === null || tip.value === undefined ? (
        <span className="text-muted-foreground">Sem dado neste ponto.</span>
      ) : (
        <>
          <p className="tabular text-base font-semibold leading-tight">
            ≈ {tip.value.toLocaleString("pt-BR", { maximumFractionDigits: probe.decimals })} {probe.unit}
          </p>
          <p className="text-muted-foreground">
            {monthly ? "Média de " : ""}
            {when} · área de {layer.spatialResolution.split(" (")[1]?.replace(")", "") ?? layer.spatialResolution}
          </p>
        </>
      )}
    </div>
  );
}

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  useEffect(() => onZoom(map.getZoom()), [map, onZoom]);
  return null;
}

function DrawMode({ active }: { active: boolean }) {
  const map = useMap();
  useEffect(() => {
    const el = map.getContainer();
    el.classList.toggle("picker", active);
    if (active) map.doubleClickZoom.disable();
    else map.doubleClickZoom.enable();
  }, [active, map]);
  return null;
}

function DrawLayer({ points, onChange, onClose }: { points: [number, number][]; onChange: (p: [number, number][]) => void; onClose: () => void }) {
  useMapEvents({ click: (e) => onChange([...points, [e.latlng.lat, e.latlng.lng]]) });
  return (
    <>
      {points.length >= 3 && <Polygon positions={points} interactive={false} pathOptions={{ color: "#ffd60a", weight: 3, fillColor: "#ffd60a", fillOpacity: 0.15 }} />}
      {points.length === 2 && <Polyline positions={points} interactive={false} pathOptions={{ color: "#ffd60a", weight: 3, dashArray: "6 6" }} />}
      {points.map((p, i) => (
        <Marker
          key={i}
          position={p}
          icon={i === 0 ? firstVertexIcon : vertexIcon}
          draggable
          title={i === 0 && points.length >= 3 ? "Clique para fechar o contorno" : `Vértice ${i + 1} — arraste para ajustar`}
          eventHandlers={{
            click: () => i === 0 && points.length >= 3 && onClose(),
            drag: (e) => {
              const ll = (e.target as L.Marker).getLatLng();
              onChange(points.map((q, j) => (j === i ? [ll.lat, ll.lng] : q)));
            },
          }}
        />
      ))}
    </>
  );
}

class SlopeGridLayer extends L.GridLayer {
  createTile(coords: L.Coords, done: L.DoneCallback) {
    const canvas = document.createElement("canvas");
    renderSlopeTile(canvas, coords.z, coords.x, coords.y)
      .then(() => done(undefined, canvas))
      .catch((e: Error) => done(e, canvas));
    return canvas;
  }
}

function SlopeLayer({ opacity, zIndex }: { opacity: number; zIndex: number }) {
  const map = useMap();
  useEffect(() => {
    const layer = new SlopeGridLayer({
      minZoom: 12,
      maxZoom: MAX_ZOOM,
      maxNativeZoom: TERRAIN_SOURCE.zoom,
      zIndex,
      opacity,
      attribution: '<a href="https://registry.opendata.aws/terrain-tiles/">Terrain Tiles</a> (SRTM)',
    });
    layer.addTo(map);
    return () => void layer.remove();
  }, [map]);
  useEffect(() => {
    map.eachLayer((l) => l instanceof SlopeGridLayer && l.setOpacity(opacity));
  }, [opacity, map]);
  return null;
}
