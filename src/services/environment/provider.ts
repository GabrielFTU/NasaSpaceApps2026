import type { ClimateSeries, Plot, PlotInput, PowerMode, SoilMoistureResult, VegetationResult } from "@/types";
import type { PlotFeatureCollection } from "@/lib/geojson";
import { getDailyClimateRange, getSoilMoistureRange, getVegetationRange } from "@/services/nasa";
import { computeTerrainStats, type TerrainStats } from "./terrain";

/**
 * Contratos de dados do Mapa Ambiental — pontos de troca para o backend.
 *
 * Hoje: `browserEnvironmentProvider` consulta NASA POWER / GIBS / Terrain Tiles direto do navegador,
 * amostrando o pixel no CENTRO do talhão (valor do pixel, não média do talhão).
 *
 * Previsto (ASP.NET Core + PostgreSQL/PostGIS):
 *   GET  /api/properties/{id}/plots                       → PlotFeatureCollection (SRID 4326)
 *   POST /api/properties/{id}/plots                       ← Feature  (ST_GeomFromGeoJSON, ST_MakeValid)
 *   PUT  /api/plots/{plotId} | DELETE /api/plots/{plotId}
 *   GET  /api/plots/{plotId}/climate?start=&end=          → ClimateSeries (POWER em cache no servidor)
 *   GET  /api/plots/{plotId}/soil-moisture?start=&end=    → SoilMoistureResult (SMAP L4 HDF5, valor real)
 *   GET  /api/plots/{plotId}/vegetation?start=&end=       → VegetationResult (MOD13Q1/HLS — média zonal real)
 *   GET  /api/plots/{plotId}/terrain                      → TerrainStats (ST_SummaryStats sobre raster SRTM)
 *
 * Esquema sugerido:
 *   CREATE TABLE plots (
 *     id uuid PRIMARY KEY, property_id uuid NOT NULL REFERENCES properties(id) ON DELETE CASCADE,
 *     name text NOT NULL, current_crop text, soil_texture text, notes text, is_demo boolean DEFAULT false,
 *     geom geometry(Polygon, 4326) NOT NULL CHECK (ST_IsValid(geom)),
 *     area_ha numeric GENERATED ALWAYS AS (ST_Area(geom::geography) / 10000) STORED,
 *     created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now());
 *   CREATE INDEX plots_geom_gix ON plots USING gist (geom);
 *
 * No servidor, estatísticas zonais devem ler os VALORES dos produtos (NetCDF/HDF5/COG), não as
 * imagens coloridas do GIBS — o que permite média ponderada pela área do pixel dentro do talhão.
 */

export interface EnvironmentProvider {
  getClimate(lat: number, lon: number, start: string, end: string, mode: PowerMode): Promise<ClimateSeries>;
  getSoilMoisture(lat: number, lon: number, start: string, end: string, mode: PowerMode): Promise<SoilMoistureResult>;
  getVegetation(lat: number, lon: number, start: string, end: string, mode: PowerMode): Promise<VegetationResult>;
  getTerrain(boundary: [number, number][]): Promise<TerrainStats>;
}

export const browserEnvironmentProvider: EnvironmentProvider = {
  getClimate: getDailyClimateRange,
  getSoilMoisture: getSoilMoistureRange,
  getVegetation: getVegetationRange,
  getTerrain: computeTerrainStats,
};

/** Repositório de talhões. A implementação atual é o store local (zustand + localStorage). */
export interface PlotRepository {
  list(propertyId: string): Promise<PlotFeatureCollection>;
  create(input: PlotInput): Promise<Plot>;
  update(id: string, patch: Partial<PlotInput>): Promise<void>;
  remove(id: string): Promise<void>;
}
