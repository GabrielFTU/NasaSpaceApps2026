/**
 * Catálogo de camadas do Mapa Ambiental.
 *
 * Cada camada declara fonte, produto, resolução espacial/temporal e limitações. A interface só lê
 * este catálogo — trocar a origem (ex.: tiles servidos pela API ASP.NET Core a partir de COGs no
 * PostGIS raster) significa mudar `render` aqui, sem tocar nos componentes.
 *
 * Regras de honestidade:
 *  - Camadas "gibs" exibem a IMAGEM oficial publicada pela NASA (paleta oficial, legenda oficial).
 *    Não são recoloridas, interpoladas nem simuladas.
 *  - Camadas "computed" são calculadas no navegador a partir de dados reais e dizem o método.
 *  - Camadas "user" mostram o que o usuário informou, identificado como tal.
 *  - Camadas "planned" ainda não têm integração e aparecem como indisponíveis.
 */

import type { UnitConversion } from "./colormap";

export type LayerGroup = "clima" | "agua" | "vegetacao" | "relevo" | "solo";

export type LayerId = "precip" | "smap_surface" | "smap_root" | "temp" | "rh" | "ndvi" | "elevation" | "slope" | "soil" | "pedology" | "ndvi_hls";

export type TemporalKind = "daily" | "16day" | "monthly" | "static";

export type LayerRender =
  | {
      kind: "gibs";
      /** Identificador da camada no GIBS (WMS/WMTS). */
      layer: string;
      /** TileMatrixSet usado na consulta de datas disponíveis (DescribeDomains). */
      tms: string;
      legendUrl: string;
      /**
       * Quando a legenda oficial usa unidade inadequada, o app desenha a régua a partir da
       * paleta oficial (`colormap`) convertendo a unidade. As cores do mapa não mudam.
       */
      legendFrom?: { colormap: string; conversion: UnitConversion };
      /**
       * Leitura do valor sob o mouse: pixel da imagem GIBS convertido pela paleta oficial.
       * `halfDeg` = meia-janela consultada (≈ resolução do produto).
       */
      probe?: { colormap: string; conversion?: UnitConversion; unit: string; decimals: number; halfDeg: number; precision: string };
    }
  | { kind: "computed"; method: "slope" }
  | { kind: "user"; method: "soil" }
  | { kind: "planned"; reason: string };

export interface EnvLayer {
  id: LayerId;
  label: string;
  short: string;
  group: LayerGroup;
  source: string;
  product: string;
  sourceUrl: string;
  spatialResolution: string;
  temporal: TemporalKind;
  temporalLabel: string;
  /** Quanto tempo depois o dado costuma ser publicado. */
  latency?: string;
  render: LayerRender;
  defaultOpacity: number;
  /** Ordem de desenho (maior = por cima). */
  z: number;
  limitations: string;
}

const GIBS_LEGEND = "https://gibs.earthdata.nasa.gov/legends";

export const LAYER_GROUPS: Record<LayerGroup, string> = {
  clima: "Clima",
  agua: "Água no solo",
  vegetacao: "Vegetação",
  relevo: "Relevo",
  solo: "Solo",
};

export const LAYERS: EnvLayer[] = [
  {
    id: "precip",
    label: "Precipitação",
    short: "Chuva",
    group: "clima",
    source: "NASA GPM",
    product: "IMERG — taxa de precipitação (composição diária do GIBS)",
    sourceUrl: "https://gpm.nasa.gov/data/imerg",
    spatialResolution: "0,1° (≈ 11 km)",
    temporal: "daily",
    temporalLabel: "Diária",
    latency: "≈ 1 dia",
    render: { kind: "gibs", layer: "IMERG_Precipitation_Rate", tms: "2km", legendUrl: `${GIBS_LEGEND}/GPM_Precipitation_Rate_H.png` },
    defaultOpacity: 0.7,
    z: 40,
    limitations:
      "Estimativa por satélite (micro-ondas + infravermelho), não pluviômetro. Representa taxa de chuva, não o acumulado do período. Um pixel cobre ~120 km² — não distingue talhões.",
  },
  {
    id: "smap_surface",
    label: "Umidade do solo — superficial",
    short: "Umidade 0–5 cm",
    group: "agua",
    source: "NASA SMAP",
    product: "SMAP L4 — umidade analisada, camada 0–5 cm",
    sourceUrl: "https://smap.jpl.nasa.gov/",
    spatialResolution: "9 km",
    temporal: "daily",
    temporalLabel: "Diária",
    latency: "≈ 3–7 dias",
    render: { kind: "gibs", layer: "SMAP_L4_Analyzed_Surface_Soil_Moisture", tms: "2km", legendUrl: `${GIBS_LEGEND}/SMAP_Analyzed_Soil_Moisture_H.png` },
    defaultOpacity: 0.65,
    z: 30,
    limitations:
      "Produto L4 = observação de satélite assimilada em modelo. Pixel de 81 km²: valor regional, não medida do talhão. Não substitui sensor ou tradagem.",
  },
  {
    id: "smap_root",
    label: "Umidade do solo — zona das raízes",
    short: "Umidade 0–100 cm",
    group: "agua",
    source: "NASA SMAP",
    product: "SMAP L4 — umidade analisada, camada 0–100 cm",
    sourceUrl: "https://smap.jpl.nasa.gov/",
    spatialResolution: "9 km",
    temporal: "daily",
    temporalLabel: "Diária",
    latency: "≈ 3–7 dias",
    render: { kind: "gibs", layer: "SMAP_L4_Analyzed_Root_Zone_Soil_Moisture", tms: "2km", legendUrl: `${GIBS_LEGEND}/SMAP_Analyzed_Soil_Moisture_H.png` },
    defaultOpacity: 0.65,
    z: 31,
    limitations: "Camada radicular é estimada pelo modelo do L4 (o satélite só enxerga os primeiros centímetros). Pixel de 9 km.",
  },
  {
    id: "temp",
    label: "Temperatura do ar a 2 m",
    short: "Temperatura",
    group: "clima",
    source: "NASA GMAO",
    product: "MERRA-2 — temperatura média mensal a 2 m (mesma base meteorológica da NASA POWER)",
    sourceUrl: "https://gmao.gsfc.nasa.gov/reanalysis/MERRA-2/",
    spatialResolution: "0,5° × 0,625° (≈ 55 × 65 km)",
    temporal: "monthly",
    temporalLabel: "Mensal",
    latency: "≈ 1–3 meses",
    render: {
      kind: "gibs",
      layer: "MERRA2_2m_Air_Temperature_Monthly",
      tms: "2km",
      legendUrl: `${GIBS_LEGEND}/MERRA2_2m_Air_Temperature_Monthly_H.png`,
      // a paleta oficial é em Kelvin; a legenda do app mostra °C (K − 273,15)
      legendFrom: { colormap: "MERRA2_2m_Air_Temperature_Monthly", conversion: { from: "K", to: "°C" } },
      probe: {
        colormap: "MERRA2_2m_Air_Temperature_Monthly",
        conversion: { from: "K", to: "°C" },
        unit: "°C",
        decimals: 0,
        halfDeg: 0.05,
        precision: "±0,5 °C (faixas de 1 K da paleta)",
      },
    },
    defaultOpacity: 0.6,
    z: 20,
    limitations:
      "Reanálise (modelo + observações), não termômetro local. Uma célula cobre vários municípios; relevo e baixadas do talhão não aparecem. Os gráficos usam a série diária da NASA POWER no ponto.",
  },
  {
    id: "rh",
    label: "Umidade relativa do ar",
    short: "Umidade do ar",
    group: "clima",
    source: "NASA AIRS",
    product: "AIRS L3 — umidade relativa próxima à superfície, média mensal (passagem diurna)",
    sourceUrl: "https://airs.jpl.nasa.gov/",
    spatialResolution: "1° × 1° (≈ 110 km)",
    temporal: "monthly",
    temporalLabel: "Mensal",
    latency: "≈ 1–2 meses",
    render: { kind: "gibs", layer: "AIRS_L3_Surface_Relative_Humidity_Monthly_Day", tms: "2km", legendUrl: `${GIBS_LEGEND}/AIRS_Surface_Relative_Humidity_Monthly_Day_H.png` },
    defaultOpacity: 0.6,
    z: 21,
    limitations:
      "Sondagem por satélite no horário da passagem (~13h30), quando a umidade é mais baixa que a média diária. Célula de ~110 km. Os gráficos usam RH2M diária da NASA POWER.",
  },
  {
    id: "ndvi",
    label: "Índice de vegetação (NDVI)",
    short: "NDVI",
    group: "vegetacao",
    source: "NASA MODIS",
    product: "MOD13Q1 (Terra) — NDVI, composição de 16 dias",
    sourceUrl: "https://modis.gsfc.nasa.gov/data/dataprod/mod13.php",
    spatialResolution: "250 m",
    temporal: "16day",
    temporalLabel: "16 dias",
    latency: "≈ 2–4 semanas",
    render: { kind: "gibs", layer: "MODIS_Terra_L3_NDVI_16Day", tms: "250m", legendUrl: `${GIBS_LEGEND}/MODIS_L3_NDVI_H.png` },
    defaultOpacity: 0.75,
    z: 35,
    limitations:
      "Pixel de 6,25 ha: talhões pequenos misturam bordas, estradas e vizinhos. Nuvens deixam composições sem dado. Para 30 m, ver HLS (Landsat/Sentinel-2) — integração prevista.",
  },
  {
    id: "ndvi_hls",
    label: "NDVI 30 m (Landsat/Sentinel-2)",
    short: "NDVI 30 m",
    group: "vegetacao",
    source: "NASA HLS",
    product: "Harmonized Landsat Sentinel-2 (HLSL30/HLSS30)",
    sourceUrl: "https://hls.gsfc.nasa.gov/",
    spatialResolution: "30 m",
    temporal: "daily",
    temporalLabel: "2–3 dias (sem nuvens)",
    render: {
      kind: "planned",
      reason: "Requer conta Earthdata e processamento das bandas no servidor (API ASP.NET Core) — não há imagem pronta pública.",
    },
    defaultOpacity: 0.75,
    z: 36,
    limitations: "Integração futura.",
  },
  {
    id: "elevation",
    label: "Elevação",
    short: "Elevação",
    group: "relevo",
    source: "NASA SRTM",
    product: "SRTM — índice de cores de altitude (GIBS)",
    sourceUrl: "https://www.earthdata.nasa.gov/sensors/srtm",
    spatialResolution: "≈ 30 m (exibição GIBS em 31 m)",
    temporal: "static",
    temporalLabel: "Estático (missão de 2000)",
    render: { kind: "gibs", layer: "SRTM_Color_Index", tms: "31.25m", legendUrl: `${GIBS_LEGEND}/SRTM_Color_Index_H.png` },
    defaultOpacity: 0.55,
    z: 10,
    limitations: "Modelo de superfície: copas de árvores e construções somam altura. Erro vertical típico de ±5 a 10 m.",
  },
  {
    id: "slope",
    label: "Declividade",
    short: "Declividade",
    group: "relevo",
    source: "Calculada no Semeia",
    product: "Derivada do modelo de elevação Terrain Tiles (AWS Open Data; base SRTM no Brasil)",
    sourceUrl: "https://registry.opendata.aws/terrain-tiles/",
    spatialResolution: "≈ 30 m (dado de origem); cálculo em grade de ~18 m",
    temporal: "static",
    temporalLabel: "Estático",
    render: { kind: "computed", method: "slope" },
    defaultOpacity: 0.6,
    z: 12,
    limitations:
      "Método de Horn (janela 3×3) sobre a elevação; classes de relevo da Embrapa (%). Visível a partir do zoom 12. Ruído do SRTM pode criar declives falsos em áreas planas.",
  },
  {
    id: "soil",
    label: "Textura do solo (informada)",
    short: "Solo",
    group: "solo",
    source: "Usuário",
    product: "Textura informada por talhão ou, na falta, a declarada para a propriedade",
    sourceUrl: "",
    spatialResolution: "Talhão inteiro (um valor por polígono)",
    temporal: "static",
    temporalLabel: "Cadastro",
    render: { kind: "user", method: "soil" },
    defaultOpacity: 0.45,
    z: 50,
    limitations: "Reflete o cadastro, não uma medição espacial. Variações dentro do talhão não aparecem.",
  },
  {
    id: "pedology",
    label: "Mapa pedológico",
    short: "Pedologia",
    group: "solo",
    source: "IBGE / Embrapa Solos",
    product: "Mapa de solos do Brasil (1:250.000 / 1:5.000.000)",
    sourceUrl: "https://www.embrapa.br/solos/sibcs",
    spatialResolution: "1:250.000 (unidades de mapeamento de vários km²)",
    temporal: "static",
    temporalLabel: "Estático",
    render: { kind: "planned", reason: "Integração prevista via PostGIS (vetores do IBGE/Embrapa importados no servidor)." },
    defaultOpacity: 0.5,
    z: 5,
    limitations: "Escala regional — não substitui a análise de solo do talhão.",
  },
];

export const layerById = (id: LayerId) => LAYERS.find((l) => l.id === id)!;

/* ---------- Classes de declividade (Embrapa, 1979/SiBCS) ---------- */

export const SLOPE_CLASSES = [
  { max: 3, label: "Plano", range: "0–3%", color: "#1a9850" },
  { max: 8, label: "Suave ondulado", range: "3–8%", color: "#91cf60" },
  { max: 20, label: "Ondulado", range: "8–20%", color: "#fee08b" },
  { max: 45, label: "Forte ondulado", range: "20–45%", color: "#fc8d59" },
  { max: 75, label: "Montanhoso", range: "45–75%", color: "#d73027" },
  { max: Infinity, label: "Escarpado", range: "> 75%", color: "#7f0000" },
] as const;

export function slopeClassIndex(pct: number) {
  return SLOPE_CLASSES.findIndex((c) => pct < c.max);
}

/* ---------- Texturas (camada de solo) ---------- */

export const TEXTURE_STYLE: Record<string, { label: string; color: string }> = {
  arenosa: { label: "Arenosa", color: "#e9c46a" },
  media: { label: "Média", color: "#d4a373" },
  argilosa: { label: "Argilosa", color: "#a0522d" },
  muito_argilosa: { label: "Muito argilosa", color: "#6b2d14" },
};
