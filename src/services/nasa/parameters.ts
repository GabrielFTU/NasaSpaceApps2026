/**
 * Metadados dos parâmetros NASA usados pelo Semeia.
 * Mantidos separados para que a interface exiba nome, unidade e origem sem conhecer a API.
 */

export const POWER_PARAMETERS = {
  T2M: { label: "Temperatura média do ar a 2 m", unit: "°C" },
  T2M_MAX: { label: "Temperatura máxima a 2 m", unit: "°C" },
  T2M_MIN: { label: "Temperatura mínima a 2 m", unit: "°C" },
  PRECTOTCORR: { label: "Precipitação corrigida", unit: "mm/dia" },
  RH2M: { label: "Umidade relativa a 2 m", unit: "%" },
  ALLSKY_SFC_SW_DWN: { label: "Radiação solar incidente (céu real)", unit: "MJ/m²/dia" },
} as const;

export type PowerParameter = keyof typeof POWER_PARAMETERS;

export const POWER_SOURCE = {
  name: "NASA POWER",
  fullName: "Prediction Of Worldwide Energy Resources (LaRC)",
  url: "https://power.larc.nasa.gov/",
  community: "AG",
  resolution: "Meteorologia ≈ 0,5° × 0,625° (MERRA-2); radiação ≈ 1° × 1° (CERES)",
  cellSizeDeg: { lat: 0.5, lon: 0.625 },
  latencyDays: 3,
};

export const SMAP_SOURCE = {
  name: "NASA SMAP",
  fullName: "Soil Moisture Active Passive — L4",
  url: "https://smap.jpl.nasa.gov/",
  layers: {
    surface: "SMAP_L4_Analyzed_Surface_Soil_Moisture",
    rootZone: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture",
  },
  colormap: "SMAP_Analyzed_Soil_Moisture",
  resolution: "Grade de 9 km",
};

export const MODIS_SOURCE = {
  name: "NASA MODIS",
  fullName: "Moderate Resolution Imaging Spectroradiometer — NDVI",
  url: "https://modis.gsfc.nasa.gov/data/dataprod/mod13.php",
  layer: "MODIS_Terra_L3_NDVI_16Day",
  colormap: "MODIS_L3_NDVI",
  product: "MOD13Q1 — composições de 16 dias",
  resolution: "Pixel de 250 m",
};
