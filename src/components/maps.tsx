import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Marker, Polygon, Polyline, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from "react-leaflet";
import L, { type LatLngBoundsExpression } from "leaflet";
import { Eraser, Layers, Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { polygonAreaHa, polygonPerimeterM } from "@/lib/geo";


const ESRI_IMAGERY = "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}";
const ESRI_LABELS = "https://server.arcgisonline.com/ArcGIS/rest/services/Reference/World_Boundaries_and_Places/MapServer/tile/{z}/{y}/{x}";
const ESRI_ATTR = "Imagens &copy; Esri, Maxar, Earthstar Geographics";
const OSM_URL = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
const OSM_ATTR = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';

export type BaseLayer = "satelite" | "mapa";

export const MAX_ZOOM = 19;
const SATELLITE_NATIVE_ZOOM = 17;

export function BaseTiles({ layer, labels = true }: { layer: BaseLayer; labels?: boolean }) {
  if (layer === "mapa") return <TileLayer key="osm" url={OSM_URL} attribution={OSM_ATTR} maxZoom={MAX_ZOOM} maxNativeZoom={19} />;
  return (
    <>
      <TileLayer key="esri" url={ESRI_IMAGERY} attribution={ESRI_ATTR} maxZoom={MAX_ZOOM} maxNativeZoom={SATELLITE_NATIVE_ZOOM} />
      {labels && <TileLayer key="esri-labels" url={ESRI_LABELS} maxZoom={MAX_ZOOM} maxNativeZoom={SATELLITE_NATIVE_ZOOM} />}
    </>
  );
}

const AREA_STYLE = { color: "#ffffff", weight: 2.5, fillColor: "#7cc300", fillOpacity: 0.22 };
const PIN = { color: "#ffffff", weight: 2, fillColor: "#1d6f2c", fillOpacity: 1 };

function FitTo({ points, center, zoom }: { points?: [number, number][]; center: [number, number]; zoom: number }) {
  const map = useMap();
  const key = points?.map((p) => p.join()).join("|") ?? center.join();
  useEffect(() => {
    if (points && points.length >= 3) map.fitBounds(L.latLngBounds(points), { padding: [24, 24], maxZoom: 17 });
    else map.setView(center, zoom);
  }, [key]);
  return null;
}


interface PropertyMapProps {
  lat: number;
  lon: number;
  boundary?: [number, number][];
  label?: string;
  className?: string;
  interactive?: boolean;
  labels?: boolean;
}

export function PropertyMap({ lat, lon, boundary, label, className, interactive = true, labels = false }: PropertyMapProps) {
  return (
    <MapContainer maxZoom={MAX_ZOOM}
      center={[lat, lon]}
      zoom={15}
      zoomControl={interactive}
      dragging={interactive}
      scrollWheelZoom={false}
      doubleClickZoom={interactive}
      touchZoom={interactive}
      keyboard={interactive}
      attributionControl={interactive}
      className={cn("isolate h-56 w-full", className)}
    >
      <BaseTiles layer="satelite" labels={labels} />
      {boundary && boundary.length >= 3 ? (
        <Polygon positions={boundary} pathOptions={AREA_STYLE}>
          {label && interactive && <Tooltip sticky>{label}</Tooltip>}
        </Polygon>
      ) : (
        <CircleMarker center={[lat, lon]} radius={7} pathOptions={PIN} />
      )}
      <FitTo points={boundary} center={[lat, lon]} zoom={15} />
    </MapContainer>
  );
}


export function GridCellMap({ lat, lon, cellSizeDeg, className }: { lat: number; lon: number; cellSizeDeg: { lat: number; lon: number }; className?: string }) {
  const cLat = Math.round(lat / cellSizeDeg.lat) * cellSizeDeg.lat;
  const cLon = Math.round(lon / cellSizeDeg.lon) * cellSizeDeg.lon;
  const bounds: LatLngBoundsExpression = [
    [cLat - cellSizeDeg.lat / 2, cLon - cellSizeDeg.lon / 2],
    [cLat + cellSizeDeg.lat / 2, cLon + cellSizeDeg.lon / 2],
  ];
  return (
    <MapContainer maxZoom={MAX_ZOOM} center={[lat, lon]} zoom={8} scrollWheelZoom={false} className={cn("isolate h-56 w-full", className)}>
      <BaseTiles layer="mapa" />
      <Rectangle bounds={bounds} pathOptions={{ color: "#1d6f2c", weight: 1.5, dashArray: "4 4", fillOpacity: 0.06 }} />
      <CircleMarker center={[lat, lon]} radius={6} pathOptions={PIN} />
    </MapContainer>
  );
}


const vertexIcon = L.divIcon({ className: "semeia-vertex", iconSize: [14, 14], iconAnchor: [7, 7] });
const firstVertexIcon = L.divIcon({ className: "semeia-vertex semeia-vertex-first", iconSize: [16, 16], iconAnchor: [8, 8] });

function ClickToAdd({ onAdd }: { onAdd: (p: [number, number]) => void }) {
  useMapEvents({ click: (e) => onAdd([e.latlng.lat, e.latlng.lng]) });
  return null;
}

function FlyTo({ target }: { target: [number, number] | null }) {
  const map = useMap();
  useEffect(() => {
    if (target) map.flyTo(target, 15, { duration: 0.8 });
  }, [target, map]);
  return null;
}

interface AreaDrawerProps {
  points: [number, number][];
  onChange: (pts: [number, number][]) => void;
  initialCenter: [number, number];
  flyTarget?: [number, number] | null;
  className?: string;
}

export function AreaDrawer({ points, onChange, initialCenter, flyTarget = null, className }: AreaDrawerProps) {
  const [layer, setLayer] = useState<BaseLayer>("satelite");
  // posição inicial congelada: novos cliques não devem reposicionar o mapa
  const [initialPoints] = useState(points);
  const [startCenter] = useState(initialCenter);
  const area = useMemo(() => polygonAreaHa(points), [points]);
  const perimeter = useMemo(() => (points.length >= 3 ? polygonPerimeterM(points) : 0), [points]);

  return (
    <div className={cn("relative overflow-hidden rounded-lg border border-border", className)}>
      <MapContainer maxZoom={MAX_ZOOM} center={startCenter} zoom={15} className="picker isolate h-[420px] w-full rounded-none lg:h-[560px]" doubleClickZoom={false}>
        <BaseTiles layer={layer} />
        <ClickToAdd onAdd={(p) => onChange([...points, p])} />
        <FitTo points={initialPoints} center={startCenter} zoom={15} />
        <FlyTo target={flyTarget} />
        {points.length >= 3 && <Polygon positions={points} pathOptions={AREA_STYLE} />}
        {points.length === 2 && <Polyline positions={points} pathOptions={{ color: "#fff", weight: 2.5, dashArray: "6 6" }} />}
        {points.map((p, i) => (
          <Marker
            key={i}
            position={p}
            icon={i === 0 ? firstVertexIcon : vertexIcon}
            draggable
            eventHandlers={{
              drag: (e) => {
                const ll = (e.target as L.Marker).getLatLng();
                onChange(points.map((q, j) => (j === i ? [ll.lat, ll.lng] : q)));
              },
            }}
          />
        ))}
      </MapContainer>

      {/* Controles sobre o mapa */}
      <div className="pointer-events-none absolute inset-x-3 top-3 z-[500] flex items-start justify-between gap-2">
        <div className="pointer-events-auto rounded-md bg-white/95 px-3 py-2 shadow-md backdrop-blur">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Área desenhada</p>
          <p className="text-xl font-semibold leading-tight text-foreground">
            {points.length >= 3 ? `${fmt.n2(area)} ha` : "—"}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {points.length >= 3 ? `${points.length} pontos · perímetro ${fmt.n0(perimeter)} m` : `${points.length} de 3 pontos mínimos`}
          </p>
        </div>
        <div className="pointer-events-auto flex flex-col gap-1.5">
          <MapButton onClick={() => setLayer(layer === "satelite" ? "mapa" : "satelite")} label={layer === "satelite" ? "Ver mapa" : "Ver satélite"}>
            <Layers />
          </MapButton>
          <MapButton onClick={() => onChange(points.slice(0, -1))} disabled={!points.length} label="Desfazer ponto">
            <Undo2 />
          </MapButton>
          <MapButton onClick={() => onChange([])} disabled={!points.length} label="Limpar">
            <Eraser />
          </MapButton>
        </div>
      </div>
      {points.length < 3 && (
        <div className="pointer-events-none absolute inset-x-0 bottom-6 z-[500] flex justify-center px-3">
          <p className="rounded-full bg-[#0b3d10]/85 px-4 py-1.5 text-center text-[13px] font-medium text-white shadow">
            Clique nos cantos da sua área para desenhar o contorno
          </p>
        </div>
      )}
    </div>
  );
}

function MapButton({ onClick, disabled, label, children }: { onClick: () => void; disabled?: boolean; label: string; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      className="flex h-8 cursor-pointer items-center gap-1.5 rounded-md bg-white/95 px-2.5 text-[13px] font-medium text-foreground shadow-md backdrop-blur hover:bg-white disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:size-4"
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}
