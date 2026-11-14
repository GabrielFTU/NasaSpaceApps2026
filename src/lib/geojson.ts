import type { Plot } from "@/types";

/**
 * Conversão entre talhões do Semeia e GeoJSON (RFC 7946).
 *
 * Internamente os pontos são [lat, lon] (convenção do Leaflet). GeoJSON e PostGIS usam [lon, lat]
 * e anéis fechados (último vértice = primeiro). Esta é a fronteira única de conversão — o mesmo
 * formato será trocado com a API ASP.NET Core (ST_AsGeoJSON / ST_GeomFromGeoJSON, SRID 4326).
 */

export interface PolygonGeometry {
  type: "Polygon";
  coordinates: [number, number][][];
}

export interface PlotFeature {
  type: "Feature";
  id?: string;
  geometry: PolygonGeometry;
  properties: { name: string; areaHa?: number; currentCrop?: string; soilTexture?: string; notes?: string; demo?: boolean; propertyId?: string };
}

export interface PlotFeatureCollection {
  type: "FeatureCollection";
  features: PlotFeature[];
}

export function plotToFeature(p: Plot): PlotFeature {
  const ring = p.boundary.map(([lat, lon]) => [round6(lon), round6(lat)] as [number, number]);
  ring.push(ring[0]);
  return {
    type: "Feature",
    id: p.id,
    geometry: { type: "Polygon", coordinates: [ring] },
    properties: {
      name: p.name,
      areaHa: p.areaHa,
      currentCrop: p.currentCrop,
      soilTexture: p.soilTexture,
      notes: p.notes,
      demo: p.demo,
      propertyId: p.propertyId,
    },
  };
}

export function plotsToFeatureCollection(plots: Plot[]): PlotFeatureCollection {
  return { type: "FeatureCollection", features: plots.map(plotToFeature) };
}

const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

export interface ImportedPolygon {
  name: string;
  boundary: [number, number][];
}

/**
 * Lê polígonos de um GeoJSON (Feature, FeatureCollection, Polygon ou MultiPolygon).
 * Usa apenas o anel externo; furos são ignorados (avisado em `warnings`).
 */
export function parsePolygons(json: unknown): { polygons: ImportedPolygon[]; warnings: string[] } {
  const polygons: ImportedPolygon[] = [];
  const warnings: string[] = [];
  const visit = (geom: any, name: string) => {
    if (!geom || typeof geom !== "object") return;
    if (geom.type === "Polygon") addRing(geom.coordinates, name);
    else if (geom.type === "MultiPolygon") (geom.coordinates as unknown[]).forEach((c, i) => addRing(c, `${name} (${i + 1})`));
    else if (geom.type === "GeometryCollection") (geom.geometries ?? []).forEach((g: unknown) => visit(g, name));
    else warnings.push(`Geometria do tipo "${geom.type}" ignorada — só polígonos viram talhões.`);
  };
  const addRing = (coords: any, name: string) => {
    if (!Array.isArray(coords) || !Array.isArray(coords[0])) return;
    if (coords.length > 1) warnings.push(`"${name}": furos internos do polígono foram ignorados.`);
    const ring = (coords[0] as any[]).filter((c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]));
    const pts = ring.map((c) => [Number(c[1]), Number(c[0])] as [number, number]);
    if (pts.length > 1 && pts[0][0] === pts.at(-1)![0] && pts[0][1] === pts.at(-1)![1]) pts.pop();
    if (pts.length < 3) return void warnings.push(`"${name}": menos de 3 vértices, ignorado.`);
    if (pts.some(([lat, lon]) => Math.abs(lat) > 90 || Math.abs(lon) > 180))
      return void warnings.push(`"${name}": coordenadas fora de WGS84 (lat/lon em graus). Reprojete para EPSG:4326.`);
    polygons.push({ name, boundary: pts });
  };

  const root = json as any;
  if (root?.type === "FeatureCollection") {
    (root.features ?? []).forEach((f: any, i: number) => visit(f?.geometry, String(f?.properties?.name ?? f?.properties?.nome ?? `Talhão importado ${i + 1}`)));
  } else if (root?.type === "Feature") {
    visit(root.geometry, String(root.properties?.name ?? root.properties?.nome ?? "Talhão importado"));
  } else {
    visit(root, "Talhão importado");
  }
  return { polygons, warnings };
}

export function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/geo+json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
