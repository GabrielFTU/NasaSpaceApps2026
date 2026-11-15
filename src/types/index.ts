/* ---------- Propriedades ---------- */

export type SoilTexture = "arenosa" | "media" | "argilosa" | "muito_argilosa";
export type Drainage = "boa" | "moderada" | "ruim";

export interface SoilProfile {
  texture: SoilTexture;
  /** pH em água; null quando não informado. */
  ph: number | null;
  /** Matéria orgânica em %; null quando não informado. */
  organicMatter: number | null;
  drainage: Drainage;
  compaction: boolean;
  erosionHistory: boolean;
  notes?: string;
}

export interface Property {
  id: string;
  name: string;
  city: string;
  state: string;
  latitude: number;
  longitude: number;
  /** Contorno desenhado no mapa: lista de [lat, lon]. Quando existe, a área é calculada a partir dele. */
  boundary?: [number, number][];
  areaHa: number;
  /** Perfil declarado (cadastro simples). Continua existindo no cadastro completo, como base e fallback. */
  soil: SoilProfile;
  /** Nível de cadastro exibido no formulário. Alternar não apaga dados de nenhum dos dois níveis (RF-SOLO-01). */
  soilMode?: "simples" | "completo";
  createdAt: string;
  updatedAt: string;
}

/* ---------- Análises laboratoriais de solo (cadastro completo) ---------- */

/** Parâmetros laboratoriais suportados — ver catálogo em src/data/soilParameters.ts. */
export type SoilParamKey =
  | "areia"
  | "silte"
  | "argila"
  | "densidade"
  | "profundidade_efetiva"
  | "resistencia_penetracao"
  | "cc"
  | "pmp"
  | "infiltracao"
  | "ph"
  | "materia_organica"
  | "p"
  | "k"
  | "ca"
  | "mg"
  | "al"
  | "h_al"
  | "ctc"
  | "v"
  | "m"
  | "s"
  | "b"
  | "cu"
  | "fe"
  | "mn"
  | "zn"
  | "ce";

/** De onde veio o valor (RF-SOLO-06). "exemplo" = valor ilustrativo da interface, nunca de um laudo. */
export type MeasurementOrigin = "manual" | "laudo" | "exemplo";

/** Um resultado laboratorial: sempre com a unidade e o método em que foi informado (RF-SOLO-05). */
export interface SoilMeasurement {
  parameter: SoilParamKey;
  value: number;
  unit: string;
  method?: string;
  origin: MeasurementOrigin;
  /** Conferido pelo usuário contra o laudo (RF-SOLO-06/07). */
  verified: boolean;
}

export interface SoilAttachment {
  /** Chave do arquivo no IndexedDB do navegador (src/lib/fileStore.ts). */
  fileId: string;
  name: string;
  type: string;
  size: number;
}

/** Uma amostra de solo: talhão + data + profundidade (RF-SOLO-04). */
export interface SoilSample {
  id: string;
  propertyId: string;
  plot: string;
  date: string | null; // YYYY-MM-DD
  lab: string;
  depthTopCm: number | null;
  depthBottomCm: number | null;
  measurements: SoilMeasurement[];
  attachment?: SoilAttachment;
  /** Só amostras confirmadas entram no motor de comparação (RF-SOLO-07). */
  status: "rascunho" | "confirmada";
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export type YieldUnit = "sc/ha" | "kg/ha" | "t/ha";

/** Histórico agrícola da propriedade (cadastro completo). */
export interface CropHistoryEntry {
  id: string;
  propertyId: string;
  plot: string;
  safra: string; // "2025/2026"
  season: Season;
  cropId: string;
  yieldValue: number | null;
  yieldUnit: YieldUnit;
  irrigated: boolean;
  fertilization: string;
  /** Calcário aplicado (t/ha); null = não informado. */
  limingTHa: number | null;
  coverAfter: string;
}

/** Valor efetivamente usado pelo motor, com rastreabilidade da origem. */
export interface SoilEvidenceValue {
  value: number;
  unit: string;
  /** medido = do laudo; estimado = convertido/calculado a partir do laudo; declarado = cadastro simples. */
  source: "medido" | "estimado" | "declarado";
  note?: string;
}

export type SoilDetailLevel = "basico" | "intermediario" | "detalhado";

/** O que o motor sabe sobre o solo e de onde veio cada informação. */
export interface SoilEvidence {
  level: SoilDetailLevel;
  sample?: { id: string; plot: string; date: string | null; lab: string; depth: string; illustrative: boolean; layers: number };
  texture: { value: SoilTexture; source: "medido" | "declarado"; note?: string };
  phWater?: SoilEvidenceValue;
  organicMatter?: SoilEvidenceValue;
  effectiveDepthCm?: SoilEvidenceValue;
  availableWaterMm?: SoilEvidenceValue;
  baseSaturation?: SoilEvidenceValue;
  /** Maior saturação por alumínio entre as camadas da amostra. */
  aluminumSaturation?: SoilEvidenceValue & { depth: string };
  /** Dados que melhorariam a avaliação (RF-SOLO-09). */
  missing: { parameter: SoilParamKey; why: string; criteria: PriorityKey[] }[];
}

export type PropertyInput = Omit<Property, "id" | "createdAt" | "updatedAt">;

/* ---------- Talhões (Mapa Ambiental) ---------- */

/**
 * Talhão: subdivisão da propriedade com geometria própria.
 * Geometria em WGS84 (EPSG:4326), anel externo sem repetir o primeiro vértice, pontos [lat, lon].
 * Na exportação/integração (GeoJSON, PostGIS) a ordem vira [lon, lat] — ver src/lib/geojson.ts.
 */
export interface Plot {
  id: string;
  propertyId: string;
  name: string;
  boundary: [number, number][];
  areaHa: number;
  /** Cultura atual informada pelo usuário (texto livre). */
  currentCrop?: string;
  /** Textura informada para o talhão; ausente = usa a declarada para a propriedade. */
  soilTexture?: SoilTexture;
  notes?: string;
  /** true = talhão de exemplo criado pelo Semeia (não é cadastro do usuário). */
  demo?: boolean;
  createdAt: string;
  updatedAt: string;
}

export type PlotInput = Omit<Plot, "id" | "createdAt" | "updatedAt">;

/* ---------- Dados ambientais ---------- */

/**
 * Origem de um valor exibido:
 * - real: obtido da API oficial (NASA POWER/MODIS)
 * - simulado: gerado pelos mocks documentados em services/nasa
 * - indisponivel: sem dado para o período/local
 */
export type DataOrigin = "real" | "simulado" | "indisponivel";

export interface DailyClimate {
  date: string; // YYYY-MM-DD
  t2m: number | null; // °C — média diária
  t2mMax: number | null; // °C
  t2mMin: number | null; // °C
  precip: number | null; // mm/dia — PRECTOTCORR
  rh: number | null; // % — RH2M
  radiation: number | null; // MJ/m²/dia — ALLSKY_SFC_SW_DWN
}

export interface ClimateSeries {
  origin: Exclude<DataOrigin, "indisponivel">;
  source: string;
  parameters: string[];
  latitude: number;
  longitude: number;
  /** Descrição da resolução espacial (célula de grade). */
  resolution: string;
  cellSizeDeg: { lat: number; lon: number };
  records: DailyClimate[];
  /** Último dia com dado disponível. */
  lastAvailableDate: string;
  fetchedAt: string;
  /** Preenchido quando a API real falhou e o app usou o mock. */
  note?: string;
}

export interface DailySoilMoisture {
  date: string;
  /** m³/m³ — camada superficial (0–5 cm). */
  surface: number | null;
  /** m³/m³ — zona das raízes (0–100 cm). */
  rootZone: number | null;
}

export type SoilMoistureResult =
  | {
      origin: "real" | "simulado";
      source: string;
      resolution: string;
      records: DailySoilMoisture[];
      lastAvailableDate: string;
      fetchedAt: string;
      note?: string;
    }
  | { origin: "indisponivel"; source: string; reason: string };

/** Composição de 16 dias do índice de vegetação (MODIS MOD13Q1). */
export interface NdviComposite {
  date: string; // início da composição
  /** −1 a 1. null = composição sem pixel válido (nuvem). */
  ndvi: number | null;
}

export type VegetationResult =
  | {
      origin: "real" | "simulado";
      source: string;
      resolution: string;
      records: NdviComposite[];
      lastAvailableDate: string;
      fetchedAt: string;
      note?: string;
    }
  | { origin: "indisponivel"; source: string; reason: string };

/* ---------- Culturas ---------- */

export type Season = "verao" | "inverno";
export type CropFamily =
  | "leguminosa"
  | "gramínea"
  | "crucífera"
  | "euforbiácea"
  | "malvácea"
  | "asterácea"
  | "pedaliácea"
  | "solanácea"
  | "amarilidácea"
  | "cucurbitácea";
export type CropGroup = "graos" | "oleaginosas" | "fibras" | "hortalicas" | "forrageiras" | "raizes" | "cobertura";
export type CropRole = "comercial" | "cobertura";

export interface Crop {
  id: string;
  name: string;
  family: CropFamily;
  role: CropRole;
  group: CropGroup;
  /** Nome da cultura na Tábua de Risco do ZARC para cada posição da rotação (ausente = sem zoneamento). */
  zarc?: Partial<Record<ZarcSeason, string>>;
  /** Estações em que a cultura pode ser posicionada no sistema. */
  seasons: Season[];
  /** Cultura de ciclo longo que ocupa verão + inverno do mesmo ano (ex.: mandioca). */
  annual?: boolean;
  /** Necessidade hídrica de referência por ciclo (mm). */
  waterNeedMm: [number, number];
  waterNeedSource: string;
  phRange: [number, number];
  /** Tolerância a solos arenosos (baixa retenção de água). */
  sandyTolerance: "alta" | "media" | "baixa";
  frostSensitive: boolean;
  /** Produção de palhada/resíduo. */
  residue: "alta" | "media" | "baixa";
  fixesNitrogen: boolean;
  description: string;
}

/* ---------- ZARC (Zoneamento Agrícola de Risco Climático — MAPA) ---------- */

/** Risco de perda indicado pelo ZARC (%), ou null quando o decêndio não é indicado para plantio. */
export type ZarcRisk = 20 | 30 | 40;

/** Estação da rotação à qual a janela do ZARC se refere ("anual" = ciclo longo, ex.: mandioca). */
export type ZarcSeason = Season | "anual";

export interface ZarcWindow {
  /** Decêndios 1–36 (1 = 1–10/jan … 36 = 21–31/dez). Uma janela pode cruzar a virada do ano. */
  startDec: number;
  endDec: number;
  /** Menor risco dentro da janela. */
  risk: ZarcRisk;
}

export interface ZarcCropSeason extends ZarcRiskProfile {
  cropId: string;
  season: ZarcSeason;
}

/** Cultura zoneada fora do catálogo de rotação (perenes, frutíferas, olerícolas…) — só consulta. */
export interface ZarcOtherCrop extends ZarcRiskProfile {
  /** Nome como publicado na Tábua de Risco. */
  name: string;
  /** Sistema usado: sequeiro quando existe; senão irrigado. */
  manejo: string;
}

export type ZarcOthersResult =
  | { origin: "real"; safra: string; uf: string; municipio: string; soilLabel: string; crops: ZarcOtherCrop[] }
  | { origin: "indisponivel"; source: string; reason: string };

export interface ZarcRiskProfile {
  /** false = cultura sem indicação de plantio no município para esta safra/solo. */
  zoned: boolean;
  /** 36 posições, uma por decêndio. */
  risks: (ZarcRisk | null)[];
  windows: ZarcWindow[];
  minRisk: ZarcRisk | null;
  /** Código e nome da classe de solo efetivamente usada (pode diferir da preferida quando ela não existe na tábua). */
  soilCode: number | null;
  cycles: string[];
  managementLevel: string | null;
  portaria: string | null;
}

export type ZarcResult =
  | {
      origin: "real";
      source: string;
      safra: string;
      generatedAt: string;
      uf: string;
      municipio: string;
      geocodigo: string;
      soilLabel: string;
      /** Chave `${cropId}:${season}`. Culturas sem zoneamento oficial (ex.: crotalária) ficam de fora. */
      entries: Record<string, ZarcCropSeason>;
    }
  | { origin: "indisponivel"; source: string; reason: string };

/* ---------- Análises ---------- */

export type PriorityKey = "conservacao" | "agua" | "produtividade" | "diversificacao";

export type Priorities = Record<PriorityKey, number>; // pesos 0–5

export interface AnalysisInput {
  propertyId: string;
  currentRotation: { verao: string; inverno: string }; // ids de cultura ou "pousio"
  interestCropIds: string[];
  soil: SoilProfile;
  /** Ausente em análises anteriores ao cadastro completo de solo. */
  soilEvidence?: SoilEvidence;
  priorities: Priorities;
}

export interface ClimateSummary {
  origin: DataOrigin;
  periodStart: string;
  periodEnd: string;
  summerPrecipMm: number; // out–mar
  winterPrecipMm: number; // abr–set
  annualPrecipMm: number;
  meanTemp: number;
  minTempObserved: number;
  frostRiskDays: number; // dias com T2M_MIN <= 2 °C
}

export type Compatibility = "alta" | "media" | "baixa";

export interface SlotEvaluation {
  slot: string; // "Verão 1", "Inverno 1"...
  cropId: string; // id de cultura ou "pousio"
  waterNeedMm: [number, number] | null;
  seasonPrecipMm: number;
  compatibility: Compatibility;
  notes: string[];
  /** Situação no ZARC; ausente quando a cultura não tem zoneamento ou não havia dado do ZARC. */
  zarc?: { zoned: boolean; minRisk: ZarcRisk | null; windows: string };
}

export interface RuleHit {
  indicator: PriorityKey;
  description: string;
  points: number;
}

export interface ScenarioResult {
  /** a/b: análises salvas antes dos critérios financeiros. */
  key: "atual" | "retorno" | "estavel" | "equilibrio" | "a" | "b";
  label: string;
  focus: string;
  sequence: string[]; // 4 posições (2 anos), ids de cultura ou "pousio"
  slots: SlotEvaluation[];
  indicators: Record<PriorityKey, number>; // 0–100, simulados
  overall: number; // média ponderada pelas prioridades
  benefits: string[];
  limitations: string[];
  rules: RuleHit[];
  /** Ausente em análises salvas antes dos critérios financeiros. */
  economics?: import("@/features/rotations/economics").ScenarioEconomics;
}

export interface Analysis {
  id: string;
  createdAt: string;
  propertyId: string;
  propertySnapshot: Pick<Property, "name" | "city" | "state" | "latitude" | "longitude" | "areaHa">;
  input: AnalysisInput;
  climate: ClimateSummary;
  /** Ausente em análises salvas antes da integração com o ZARC. */
  zarc?: ZarcResult;
  scenarios: ScenarioResult[];
  engineVersion: string;
  /** Análise da qual esta é um recálculo com dados de solo atualizados (RF-SOLO-08). */
  recalculatedFrom?: string;
}

/* ---------- Configurações ---------- */

export type PowerMode = "mock" | "api";

export interface UserProfile {
  name: string;
  email: string;
  organization: string;
  role: string;
}

export type PeriodKey = "7d" | "30d" | "90d" | "12m";

export interface Settings {
  profile: UserProfile;
  defaultPeriod: PeriodKey;
  showDataOriginBadges: boolean;
  powerMode: PowerMode;
  autoSync: boolean;
  lastSyncAt: string | null;
  /** Preços, produtividades e custos informados pela pessoa (sobrepõem a referência). */
  economics?: Record<string, Partial<{ unit: "sc" | "t" | "@"; yield: number; price: number; cost: number; cv: number }>>;
  /** Preço usado no retorno: cotação de hoje (CEPEA), projeção para a colheita ou referência. */
  priceBasis?: "hoje" | "colheita" | "referencia";
  /** Manejo mais difícil que a pessoa aceita na rotação (1 fácil · 2 médio · 3 difícil). */
  maxDifficulty?: 1 | 2 | 3;
}
