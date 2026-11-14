import { useEffect } from "react";
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Tooltip, useMap, useMapEvents, WMSTileLayer } from "react-leaflet";
import L from "leaflet";
import type { Plot, Property } from "@/types";
import { BaseTiles, MAX_ZOOM, type BaseLayer } from "@/components/maps";
import { GIBS_WMS_3857 } from "@/services/environment/gibsTime";
import { TEXTURE_STYLE, type EnvLayer } from "@/services/environment/catalog";
import { renderSlopeTile, TERRAIN_SOURCE } from "@/services/environment/terrain";

export interface ActiveRaster {
  layer: EnvLayer;
  opacity: number;
  /** Data publicada a exibir (camadas temporais). null = sem dado → camada não é desenhada. */
  date: string | null;
}

interface MapViewProps {
  base: BaseLayer;
  property: Property;
  plots: Plot[];
  selectedPlotId: string | null;
  onSelectPlot: (id: string) => void;
  rasters: ActiveRaster[];
  /** Opacidade da camada de solo informada; null = desligada. */
  soilOpacity: number | null;
  draw: { points: [number, number][]; editingId: string | null } | null;
  onDrawChange: (pts: [number, number][]) => void;
  onDrawClose: () => void;
  /** Muda quando o enquadramento deve ser refeito. */
  focus: { key: string; points: [number, number][]; center: [number, number] };
  onTileError?: (layerId: string) => void;
}

const vertexIcon = L.divIcon({ className: "semeia-vertex", iconSize: [14, 14], iconAnchor: [7, 7] });
const firstVertexIcon = L.divIcon({ className: "semeia-vertex semeia-vertex-first", iconSize: [16, 16], iconAnchor: [8, 8] });

export function MapView(props: MapViewProps) {
  const { base, property, plots, selectedPlotId, onSelectPlot, rasters, soilOpacity, draw, focus } = props;
  return (
    <MapContainer maxZoom={MAX_ZOOM} center={focus.center} zoom={15} className="envmap isolate h-full w-full !rounded-none" zoomControl>
      <BaseTiles layer={base} labels={base === "satelite"} />
      <Fit focus={focus} />
      <AutoResize />
      <DrawMode active={!!draw} />

      {rasters.map(({ layer, opacity, date }) => {
        if (layer.render.kind === "computed") return <SlopeLayer key={layer.id} opacity={opacity} zIndex={layer.z} />;
        if (layer.render.kind !== "gibs") return null;
        if (layer.temporal !== "static" && !date) return null;
        const params = {
          layers: layer.render.layer,
          format: "image/png",
          transparent: true,
          version: "1.3.0",
          ...(date ? { time: date } : {}),
        } as L.WMSParams;
        return (
          <WMSTileLayer
            key={`${layer.id}:${date ?? "static"}`}
            url={GIBS_WMS_3857}
            params={params}
            opacity={opacity}
            zIndex={layer.z}
            attribution='Imagens <a href="https://earthdata.nasa.gov/gibs">NASA GIBS</a>'
            eventHandlers={{ tileerror: () => props.onTileError?.(layer.id) }}
          />
        );
      })}

      {/* Limite da propriedade */}
      {property.boundary && property.boundary.length >= 3 ? (
        <Polygon positions={property.boundary} interactive={false} pathOptions={{ color: "#ffffff", weight: 1.5, dashArray: "6 5", fill: false, opacity: 0.9 }} />
      ) : (
        <CircleMarker center={[property.latitude, property.longitude]} radius={6} interactive={false} pathOptions={{ color: "#fff", weight: 2, fillColor: "#1d6f2c", fillOpacity: 1 }} />
      )}

      {/* Talhões */}
      {plots.map((p) => {
        if (draw?.editingId === p.id) return null;
        const selected = p.id === selectedPlotId;
        const texture = p.soilTexture ?? property.soil.texture;
        const soilFill = soilOpacity !== null ? TEXTURE_STYLE[texture]?.color : undefined;
        return (
          <Polygon
            key={p.id}
            positions={p.boundary}
            eventHandlers={{ click: () => !draw && onSelectPlot(p.id) }}
            pathOptions={{
              color: selected ? "#ffd60a" : "#ffffff",
              weight: selected ? 3.5 : 1.8,
              fillColor: soilFill ?? (selected ? "#ffd60a" : "#ffffff"),
              fillOpacity: soilFill ? (soilOpacity ?? 0.45) : selected ? 0.08 : 0.04,
            }}
          >
            <Tooltip key={selected ? "sel" : "idle"} sticky={!selected} permanent={selected} direction="center" className="envmap-label">
              {p.name}
            </Tooltip>
          </Polygon>
        );
      })}

      {draw && <DrawLayer points={draw.points} onChange={props.onDrawChange} onClose={props.onDrawClose} />}
    </MapContainer>
  );
}

function Fit({ focus }: { focus: MapViewProps["focus"] }) {
  const map = useMap();
  useEffect(() => {
    if (focus.points.length >= 3) map.fitBounds(L.latLngBounds(focus.points), { padding: [40, 40], maxZoom: 16 });
    else map.setView(focus.center, 14);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus.key]);
  return null;
}

/** O mapa muda de tamanho quando o painel inferior abre/fecha. */
function AutoResize() {
  const map = useMap();
  useEffect(() => {
    const ro = new ResizeObserver(() => map.invalidateSize());
    ro.observe(map.getContainer());
    return () => ro.disconnect();
  }, [map]);
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

/** Declividade calculada no navegador a partir dos Terrain Tiles (ver services/environment/terrain.ts). */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map]);
  useEffect(() => {
    map.eachLayer((l) => l instanceof SlopeGridLayer && l.setOpacity(opacity));
  }, [opacity, map]);
  return null;
}
