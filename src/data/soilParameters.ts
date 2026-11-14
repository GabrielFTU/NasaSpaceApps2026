import type { PriorityKey, SoilParamKey } from "@/types";

/**
 * Catálogo dos indicadores laboratoriais aceitos no cadastro completo de solo.
 *
 * - `units[0]` é a unidade canônica; as demais têm o fator que converte para ela
 *   (valor_canônico = valor × factor). O Semeia só compara valores depois de reconhecer
 *   a unidade (RF-SOLO-05).
 * - `range` é a faixa PLAUSÍVEL na unidade canônica — serve para pegar erro de digitação ou
 *   de unidade, não para classificar o solo.
 * - `methods`: quando o resultado depende do método (pH, fósforo), ele é obrigatório.
 * - `why`: explicação mostrada ao usuário sobre como o dado melhora a avaliação (RF-SOLO-09).
 */

export type SoilSection = "fisica" | "agua" | "fertilidade" | "outros";

export interface SoilParamDef {
  key: SoilParamKey;
  label: string;
  short?: string;
  section: SoilSection;
  units: { unit: string; factor: number }[];
  methods?: string[];
  methodRequired?: boolean;
  range: [number, number];
  decimals: number;
  why: string;
  /** Critérios da comparação que o dado alimenta hoje no motor (vazio = só registro). */
  criteria: PriorityKey[];
}

export const SOIL_SECTION_LABEL: Record<SoilSection, { title: string; description: string }> = {
  fisica: { title: "Física do solo", description: "Granulometria, densidade e profundidade" },
  agua: { title: "Água no solo", description: "Capacidade de campo, ponto de murcha e infiltração" },
  fertilidade: { title: "Fertilidade química", description: "pH, macronutrientes, acidez e CTC" },
  outros: { title: "Outros indicadores", description: "Enxofre, micronutrientes e condutividade elétrica" },
};

const PCT = [
  { unit: "%", factor: 1 },
  { unit: "g/kg", factor: 0.1 },
];
const CMOLC = [
  { unit: "cmolc/dm³", factor: 1 },
  { unit: "mmolc/dm³", factor: 0.1 },
];
const MG_DM3 = [{ unit: "mg/dm³", factor: 1 }];

export const SOIL_PARAMS: SoilParamDef[] = [
  /* ------------------------------- Física ------------------------------- */
  {
    key: "argila",
    label: "Argila",
    section: "fisica",
    units: PCT,
    range: [0, 100],
    decimals: 0,
    why: "Define a textura medida (em vez da declarada) e, com ela, a classe de solo usada no ZARC e a tolerância de cada cultura.",
    criteria: ["agua", "produtividade"],
  },
  {
    key: "areia",
    label: "Areia",
    section: "fisica",
    units: PCT,
    range: [0, 100],
    decimals: 0,
    why: "Junto com argila e silte, confirma a textura e ajuda a conferir se o laudo está consistente (as três frações somam 100%).",
    criteria: [],
  },
  {
    key: "silte",
    label: "Silte",
    section: "fisica",
    units: PCT,
    range: [0, 100],
    decimals: 0,
    why: "Completa a granulometria; solos siltosos tendem a formar crosta e a sofrer mais erosão.",
    criteria: [],
  },
  {
    key: "densidade",
    label: "Densidade do solo",
    section: "fisica",
    units: [
      { unit: "g/cm³", factor: 1 },
      { unit: "kg/dm³", factor: 1 },
    ],
    range: [0.8, 2.0],
    decimals: 2,
    why: "Densidade alta indica compactação, que limita a infiltração de água e o crescimento das raízes.",
    criteria: [],
  },
  {
    key: "profundidade_efetiva",
    label: "Profundidade efetiva",
    section: "fisica",
    units: [
      { unit: "cm", factor: 1 },
      { unit: "m", factor: 100 },
    ],
    range: [0, 400],
    decimals: 0,
    why: "Informar a profundidade efetiva do solo ajuda a avaliar possíveis limitações ao desenvolvimento das raízes e a calcular quanta água o perfil armazena.",
    criteria: ["agua", "produtividade"],
  },
  {
    key: "resistencia_penetracao",
    label: "Resistência à penetração",
    short: "RP",
    section: "fisica",
    units: [
      { unit: "MPa", factor: 1 },
      { unit: "kPa", factor: 0.001 },
    ],
    range: [0, 10],
    decimals: 1,
    why: "Mede a compactação de forma objetiva; valores acima de ~2 MPa costumam restringir raízes.",
    criteria: [],
  },

  /* -------------------------------- Água -------------------------------- */
  {
    key: "cc",
    label: "Capacidade de campo",
    short: "CC",
    section: "agua",
    units: [
      { unit: "cm³/cm³", factor: 1 },
      { unit: "% vol.", factor: 0.01 },
    ],
    range: [0.05, 0.7],
    decimals: 2,
    why: "Com o ponto de murcha e a profundidade efetiva, permite calcular a água disponível no perfil — substitui a estimativa pela textura.",
    criteria: ["agua"],
  },
  {
    key: "pmp",
    label: "Ponto de murcha permanente",
    short: "PMP",
    section: "agua",
    units: [
      { unit: "cm³/cm³", factor: 1 },
      { unit: "% vol.", factor: 0.01 },
    ],
    range: [0.01, 0.5],
    decimals: 2,
    why: "Limite inferior da água que as plantas conseguem extrair; necessário para calcular a água disponível.",
    criteria: ["agua"],
  },
  {
    key: "infiltracao",
    label: "Taxa de infiltração",
    section: "agua",
    units: [
      { unit: "mm/h", factor: 1 },
      { unit: "cm/h", factor: 10 },
    ],
    range: [0, 1000],
    decimals: 0,
    why: "Infiltração baixa aumenta o escoamento e o risco de erosão em chuvas intensas.",
    criteria: [],
  },

  /* ----------------------------- Fertilidade ----------------------------- */
  {
    key: "ph",
    label: "pH",
    section: "fertilidade",
    units: [{ unit: "—", factor: 1 }],
    methods: ["CaCl₂", "Água", "SMP"],
    methodRequired: true,
    range: [3, 9],
    decimals: 1,
    why: "Indica a acidez. O método muda o valor (em CaCl₂ costuma ser ~0,6 menor que em água), por isso precisa ser informado.",
    criteria: ["produtividade"],
  },
  {
    key: "materia_organica",
    label: "Matéria orgânica",
    short: "M.O.",
    section: "fertilidade",
    units: [
      { unit: "%", factor: 1 },
      { unit: "g/kg", factor: 0.1 },
      { unit: "dag/kg", factor: 1 },
    ],
    range: [0, 20],
    decimals: 1,
    why: "Relaciona-se com a retenção de água e nutrientes e com a estrutura do solo.",
    criteria: [],
  },
  {
    key: "p",
    label: "Fósforo",
    short: "P",
    section: "fertilidade",
    units: MG_DM3,
    methods: ["Mehlich-1", "Resina"],
    methodRequired: true,
    range: [0, 500],
    decimals: 1,
    why: "Nutriente que mais limita a produção em solos tropicais. Mehlich-1 e resina não são comparáveis entre si.",
    criteria: [],
  },
  {
    key: "k",
    label: "Potássio",
    short: "K",
    section: "fertilidade",
    units: [
      { unit: "mg/dm³", factor: 1 },
      { unit: "cmolc/dm³", factor: 391 },
      { unit: "mmolc/dm³", factor: 39.1 },
    ],
    range: [0, 1500],
    decimals: 0,
    why: "Os laudos trazem K em mg/dm³ ou cmolc/dm³ — o Semeia converte (1 cmolc/dm³ = 391 mg/dm³) antes de comparar.",
    criteria: [],
  },
  { key: "ca", label: "Cálcio", short: "Ca", section: "fertilidade", units: CMOLC, range: [0, 30], decimals: 2, why: "Base trocável; entra no cálculo da soma de bases e da saturação por bases (V%).", criteria: [] },
  { key: "mg", label: "Magnésio", short: "Mg", section: "fertilidade", units: CMOLC, range: [0, 10], decimals: 2, why: "Base trocável; entra no cálculo da soma de bases e da saturação por bases (V%).", criteria: [] },
  {
    key: "al",
    label: "Alumínio trocável",
    short: "Al",
    section: "fertilidade",
    units: CMOLC,
    range: [0, 10],
    decimals: 2,
    why: "Alumínio tóxico; em camadas abaixo de 20 cm restringe o aprofundamento das raízes.",
    criteria: ["produtividade"],
  },
  { key: "h_al", label: "Acidez potencial", short: "H+Al", section: "fertilidade", units: CMOLC, range: [0, 30], decimals: 2, why: "Necessária para calcular a CTC e a saturação por bases.", criteria: [] },
  { key: "ctc", label: "CTC (pH 7)", short: "CTC", section: "fertilidade", units: CMOLC, range: [0, 60], decimals: 2, why: "Capacidade do solo de reter nutrientes; solos arenosos costumam ter CTC baixa.", criteria: [] },
  {
    key: "v",
    label: "Saturação por bases",
    short: "V%",
    section: "fertilidade",
    units: [{ unit: "%", factor: 1 }],
    range: [0, 100],
    decimals: 0,
    why: "Base para a recomendação de calagem; V% baixa indica solo ácido e pouco fértil.",
    criteria: [],
  },
  {
    key: "m",
    label: "Saturação por alumínio",
    short: "m%",
    section: "fertilidade",
    units: [{ unit: "%", factor: 1 }],
    range: [0, 100],
    decimals: 0,
    why: "Saturação por alumínio alta (acima de ~20%) restringe o desenvolvimento das raízes das culturas sensíveis à acidez.",
    criteria: ["produtividade"],
  },

  /* ------------------------------- Outros ------------------------------- */
  { key: "s", label: "Enxofre", short: "S", section: "outros", units: MG_DM3, range: [0, 200], decimals: 1, why: "Importante para leguminosas e oleaginosas, como soja e canola.", criteria: [] },
  { key: "b", label: "Boro", short: "B", section: "outros", units: MG_DM3, range: [0, 20], decimals: 2, why: "Micronutriente crítico para algodão, girassol e hortaliças.", criteria: [] },
  { key: "cu", label: "Cobre", short: "Cu", section: "outros", units: MG_DM3, range: [0, 50], decimals: 2, why: "Micronutriente; deficiência comum em solos arenosos e orgânicos.", criteria: [] },
  { key: "fe", label: "Ferro", short: "Fe", section: "outros", units: MG_DM3, range: [0, 500], decimals: 1, why: "Micronutriente; raramente limitante em solos tropicais ácidos.", criteria: [] },
  { key: "mn", label: "Manganês", short: "Mn", section: "outros", units: MG_DM3, range: [0, 300], decimals: 1, why: "Micronutriente; pode faltar após calagem excessiva.", criteria: [] },
  { key: "zn", label: "Zinco", short: "Zn", section: "outros", units: MG_DM3, range: [0, 100], decimals: 2, why: "Micronutriente frequentemente deficiente para milho.", criteria: [] },
  {
    key: "ce",
    label: "Condutividade elétrica",
    short: "CE",
    section: "outros",
    units: [
      { unit: "dS/m", factor: 1 },
      { unit: "mS/cm", factor: 1 },
    ],
    range: [0, 20],
    decimals: 2,
    why: "Indica salinidade — relevante em áreas irrigadas e no Semiárido.",
    criteria: [],
  },
];

export const SOIL_PARAM_MAP = Object.fromEntries(SOIL_PARAMS.map((p) => [p.key, p])) as Record<SoilParamKey, SoilParamDef>;

/** Converte para a unidade canônica do parâmetro; null se a unidade não for reconhecida. */
export function toCanonical(key: SoilParamKey, value: number, unit: string): number | null {
  const u = SOIL_PARAM_MAP[key].units.find((x) => x.unit === unit);
  return u ? value * u.factor : null;
}

export const canonicalUnit = (key: SoilParamKey) => SOIL_PARAM_MAP[key].units[0].unit;

/**
 * Valores ILUSTRATIVOS para demonstrar o formulário (solo arenoso do Arenito Caiuá, camada 0–20 cm).
 * Nunca representam um laudo real; entram com origem "exemplo".
 */
export const EXAMPLE_MEASUREMENTS: { parameter: SoilParamKey; value: number; unit: string; method?: string }[] = [
  { parameter: "argila", value: 12, unit: "%" },
  { parameter: "areia", value: 84, unit: "%" },
  { parameter: "silte", value: 4, unit: "%" },
  { parameter: "profundidade_efetiva", value: 150, unit: "cm" },
  { parameter: "cc", value: 0.14, unit: "cm³/cm³" },
  { parameter: "pmp", value: 0.06, unit: "cm³/cm³" },
  { parameter: "ph", value: 4.8, unit: "—", method: "CaCl₂" },
  { parameter: "materia_organica", value: 1.4, unit: "%" },
  { parameter: "p", value: 9, unit: "mg/dm³", method: "Mehlich-1" },
  { parameter: "k", value: 0.12, unit: "cmolc/dm³" },
  { parameter: "ca", value: 1.1, unit: "cmolc/dm³" },
  { parameter: "mg", value: 0.4, unit: "cmolc/dm³" },
  { parameter: "al", value: 0.3, unit: "cmolc/dm³" },
  { parameter: "h_al", value: 2.9, unit: "cmolc/dm³" },
  { parameter: "ctc", value: 4.5, unit: "cmolc/dm³" },
  { parameter: "v", value: 36, unit: "%" },
  { parameter: "m", value: 16, unit: "%" },
];
