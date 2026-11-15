import type { Crop, SlotEvaluation } from "@/types";
import { CROP_MAP, FALLOW_ID } from "@/data/crops";

/**
 * ECONOMIA DA ROTAÇÃO — valores de REFERÊNCIA demonstrativos.
 *
 * Ordem de grandeza para o Paraná, safra 2025/26 (sequeiro, manejo médio). Não são cotação nem
 * custo da propriedade: a pessoa pode (e deve) trocar pelos seus números na tela de comparação.
 *
 *  - yield: produtividade esperada na unidade `unit`
 *  - price: R$ por unidade
 *  - cost:  custo operacional (R$/ha) — sementes, fertilizantes, defensivos, operações
 *  - cv:    variação típica da receita entre anos (0,20 = ±20%), usada na instabilidade
 */
export type EconUnit = "sc" | "t" | "@";
export interface CropEconomics {
  unit: EconUnit;
  yield: number;
  price: number;
  cost: number;
  cv: number;
}

export const UNIT_LABEL: Record<EconUnit, string> = { sc: "sc/ha", t: "t/ha", "@": "@/ha" };

const e = (unit: EconUnit, y: number, price: number, cost: number, cv: number): CropEconomics => ({ unit, yield: y, price, cost, cv });
const cover = (cost: number): CropEconomics => ({ unit: "sc", yield: 0, price: 0, cost, cv: 0 });

/** Chave `id` vale para qualquer estação; `id:inverno` sobrepõe na 2ª safra/inverno. */
export const REFERENCE_ECONOMICS: Record<string, CropEconomics> = {
  // preços de soja, milho, trigo, algodão, arroz e mandioca são substituídos pela cotação do CEPEA quando disponível
  soja: e("sc", 60, 150, 4800, 0.18),
  milho: e("sc", 160, 65, 6200, 0.18),
  "milho:inverno": e("sc", 95, 62, 3900, 0.3),
  milho_braquiaria: e("sc", 150, 65, 6400, 0.18),
  "milho_braquiaria:inverno": e("sc", 90, 62, 4100, 0.3),
  trigo: e("sc", 50, 90, 3600, 0.3),
  feijao: e("sc", 35, 220, 5200, 0.35),
  "feijao:inverno": e("sc", 28, 220, 4500, 0.4),
  feijao_caupi: e("sc", 20, 200, 2600, 0.35),
  sorgo: e("sc", 70, 48, 2600, 0.25),
  "sorgo:inverno": e("sc", 60, 48, 2400, 0.3),
  arroz: e("sc", 60, 80, 4200, 0.3), // sc de 50 kg (≈ 3 t/ha)
  aveia_branca: e("sc", 45, 55, 2600, 0.3),
  cevada: e("sc", 55, 75, 3500, 0.3),
  cevada_cervejeira: e("sc", 55, 85, 3700, 0.3),
  triticale: e("sc", 50, 55, 2600, 0.3),
  centeio: e("sc", 35, 60, 2200, 0.3),
  grao_de_bico: e("sc", 30, 260, 4500, 0.4),
  girassol: e("sc", 35, 90, 2800, 0.3),
  amendoim: e("sc", 70, 110, 8500, 0.3),
  canola: e("sc", 28, 140, 2900, 0.4),
  mamona: e("sc", 25, 160, 2600, 0.4),
  gergelim: e("sc", 13, 330, 2400, 0.4),
  algodao: e("@", 120, 135, 12500, 0.25),
  melancia: e("t", 35, 900, 17000, 0.45),
  batata: e("t", 30, 1800, 42000, 0.45),
  cebola: e("t", 40, 1400, 38000, 0.5),
  sorgo_forrageiro: e("t", 40, 180, 5000, 0.25),
  mandioca: e("t", 25, 610, 9000, 0.35),
  // plantas de cobertura: só custo (semente + semeadura + manejo); não geram receita direta
  aveia_preta: cover(450),
  milheto: cover(400),
  braquiaria: cover(300),
  crotalaria: cover(600),
  nabo: cover(380),
};

export type EconOverrides = Record<string, Partial<CropEconomics>>;

/* ---------- Dificuldade de manejo ---------- */

/** 1 = fácil (estrutura comum de grãos) · 2 = médio · 3 = difícil (máquina, mão de obra ou mercado específicos). */
export type Difficulty = 1 | 2 | 3;
export const DIFFICULTY_LABEL: Record<Difficulty, string> = { 1: "Fácil", 2: "Médio", 3: "Difícil" };

export const CROP_DIFFICULTY: Record<string, { level: Difficulty; why: string }> = {
  soja: { level: 1, why: "estrutura comum de grãos" },
  milho: { level: 1, why: "estrutura comum de grãos" },
  milho_braquiaria: { level: 2, why: "consórcio exige regulagem de semeadura" },
  trigo: { level: 2, why: "doenças e colheita no ponto certo" },
  feijao: { level: 2, why: "colheita sensível a chuva" },
  feijao_caupi: { level: 2, why: "mercado regional" },
  sorgo: { level: 1, why: "rústico, estrutura de grãos" },
  arroz: { level: 2, why: "manejo de plantas daninhas" },
  aveia_branca: { level: 1, why: "estrutura de grãos" },
  cevada: { level: 2, why: "padrão de qualidade" },
  cevada_cervejeira: { level: 3, why: "contrato e padrão de maltaria" },
  triticale: { level: 1, why: "rústico" },
  centeio: { level: 1, why: "rústico" },
  grao_de_bico: { level: 3, why: "pouca assistência e mercado restrito" },
  girassol: { level: 2, why: "plataforma de colheita adaptada" },
  amendoim: { level: 3, why: "arrancador e secagem específicos" },
  canola: { level: 3, why: "colheita delicada (debulha natural)" },
  mamona: { level: 2, why: "mercado restrito" },
  gergelim: { level: 3, why: "colheita delicada e mercado restrito" },
  algodao: { level: 3, why: "máquinas específicas e alto custo" },
  melancia: { level: 3, why: "mão de obra e venda in natura" },
  batata: { level: 3, why: "mão de obra, irrigação e alto custo" },
  cebola: { level: 3, why: "mão de obra intensiva" },
  sorgo_forrageiro: { level: 2, why: "ensilagem" },
  mandioca: { level: 2, why: "colheita mecanizada específica" },
};

/** Dificuldade da sequência = a da cultura mais exigente. */
export function sequenceDifficulty(seq: string[]): { level: Difficulty; cropId: string | null; why: string } {
  let best: { level: Difficulty; cropId: string | null; why: string } = { level: 1, cropId: null, why: "estrutura comum" };
  for (const id of seq) {
    const d = CROP_DIFFICULTY[id];
    if (d && d.level > best.level) best = { level: d.level, cropId: id, why: d.why };
  }
  return best;
}

const isSummer = (i: number) => i % 2 === 0;
export const econKey = (id: string, slot: number) => (!isSummer(slot) && REFERENCE_ECONOMICS[`${id}:inverno`] ? `${id}:inverno` : id);

export function econFor(id: string, slot: number, overrides?: EconOverrides): CropEconomics | null {
  if (id === FALLOW_ID) return null;
  const k = econKey(id, slot);
  const ref = REFERENCE_ECONOMICS[k];
  if (!ref) return null;
  return { ...ref, ...overrides?.[k] };
}

/* ---------- Efeitos de rotação sobre a produtividade (regras explícitas) ---------- */

const COMPAT_YIELD = { alta: 1, media: 0.9, baixa: 0.75 } as const;
const isGrass = (c: Crop | null) => c?.family === "gramínea";

function yieldFactor(i: number, seq: string[], slot: SlotEvaluation): { factor: number; why: string[] } {
  const cur = CROP_MAP[seq[i]];
  const prev = i > 0 ? CROP_MAP[seq[i - 1]] : null;
  const why: string[] = [];
  let f = COMPAT_YIELD[slot.compatibility];
  if (slot.compatibility !== "alta") why.push(`compatibilidade ${slot.compatibility} (${slot.compatibility === "media" ? "−10%" : "−25%"})`);
  if (prev?.fixesNitrogen && isGrass(cur) && cur.role === "comercial") {
    f *= 1.05;
    why.push("após leguminosa (+5%)");
  } else if (prev?.role === "cobertura" && cur?.role === "comercial") {
    f *= 1.03;
    why.push("após cobertura (+3%)");
  }
  if (i === 2 && seq[0] === seq[2] && cur && !cur.annual) {
    f *= 0.95;
    why.push("mesma cultura no verão anterior (−5%)");
  }
  return { factor: f, why };
}

/* ---------- Instabilidade (risco de a receita não vir como esperado) ---------- */

const ZARC_RISK_ADD: Record<number, number> = { 20: 0, 30: 0.05, 40: 0.1 };

function slotRisk(cv: number, slot: SlotEvaluation) {
  let r = cv;
  if (slot.zarc) r += slot.zarc.zoned ? (ZARC_RISK_ADD[slot.zarc.minRisk ?? 40] ?? 0.1) : 0.2;
  else r += 0.05; // sem informação do ZARC
  if (slot.compatibility === "media") r += 0.05;
  if (slot.compatibility === "baixa") r += 0.12;
  if (slot.waterNeedMm && slot.seasonPrecipMm / ((slot.waterNeedMm[0] + slot.waterNeedMm[1]) / 2) < 0.8) r += 0.08;
  return r;
}

export interface SlotEconomics {
  revenue: number;
  cost: number;
  net: number;
  /** Fator aplicado à produtividade de referência e motivos. */
  factor: number;
  why: string[];
  econ: CropEconomics | null;
  /** Posição que repete a cultura anual do mesmo ano (não conta de novo). */
  skipped?: boolean;
}

export interface ScenarioEconomics {
  /** Lucro operacional médio por hectare por ano (receita − custo). */
  netPerYear: number;
  revenuePerYear: number;
  costPerYear: number;
  /** Lucro por ha num ano ruim (≈ 1 em cada 10). */
  badYearNet: number;
  /** 0–100: quanto a receita pode oscilar. Menor = mais estável. */
  instability: number;
  slots: SlotEconomics[];
  difficulty: ReturnType<typeof sequenceDifficulty>;
}

/** 1,28 desvios ≈ o pior ano em cada 10 (supondo culturas sujeitas ao mesmo clima). */
const BAD_YEAR_Z = 1.28;

export function scenarioEconomics(seq: string[], slots: SlotEvaluation[], overrides?: EconOverrides): ScenarioEconomics {
  let revenue = 0;
  let cost = 0;
  let riskMoney = 0;
  const out: SlotEconomics[] = seq.map((id, i) => {
    const c = CROP_MAP[id];
    if (c?.annual && i % 2 === 1 && seq[i - 1] === id) return { revenue: 0, cost: 0, net: 0, factor: 1, why: [], econ: null, skipped: true };
    const econ = econFor(id, i, overrides);
    if (!econ) return { revenue: 0, cost: 0, net: 0, factor: 1, why: [], econ: null };
    const { factor, why } = econ.yield > 0 ? yieldFactor(i, seq, slots[i]) : { factor: 1, why: [] };
    const rev = econ.yield * factor * econ.price;
    revenue += rev;
    cost += econ.cost;
    riskMoney += rev * slotRisk(econ.cv, slots[i]);
    return { revenue: rev, cost: econ.cost, net: rev - econ.cost, factor, why, econ };
  });
  const riskShare = revenue > 0 ? riskMoney / revenue : 0;
  return {
    netPerYear: (revenue - cost) / 2,
    revenuePerYear: revenue / 2,
    costPerYear: cost / 2,
    badYearNet: (revenue - cost - BAD_YEAR_Z * riskMoney) / 2,
    instability: Math.round(Math.min(100, riskShare * 200)),
    slots: out,
    difficulty: sequenceDifficulty(seq),
  };
}

export function instabilityLevel(v: number): { label: string; tone: "good" | "mid" | "bad" } {
  if (v < 40) return { label: "Baixa", tone: "good" };
  if (v < 60) return { label: "Média", tone: "mid" };
  return { label: "Alta", tone: "bad" };
}

export const ECON_METHOD = [
  {
    title: "Retorno em dinheiro",
    body: "Para cada posição: produtividade de referência × fator da rotação × preço − custo operacional. O fator aplica a compatibilidade com o solo e o clima (média −10%, baixa −25%), +5% para gramínea comercial após leguminosa, +3% para cultura comercial após planta de cobertura e −5% para a mesma cultura de verão dois anos seguidos. Plantas de cobertura entram só como custo. O resultado é o lucro operacional médio por hectare por ano (não inclui arrendamento, depreciação nem impostos).",
  },
  {
    title: "Instabilidade",
    body: "Média, ponderada pela receita de cada cultura, de: variação típica da receita da cultura entre anos + risco do ZARC (janela com 20% de risco +0; 30% +5 pts; 40% +10 pts; fora do ZARC +20 pts; sem dado +5 pts) + compatibilidade (média +5, baixa +12) + chuva abaixo de 80% da necessidade (+8). Abaixo de 40 é baixa; 40–60 média; acima de 60 alta. “Ano ruim” = lucro esperado menos 1,28 vez essa oscilação (≈ o pior ano em cada dez).",
  },
  {
    title: "Escolha dos três critérios",
    body: "O motor testa todas as sequências de dois anos com a cultura de verão atual, as culturas de interesse e as plantas de cobertura, descartando as que exigem manejo acima do nível escolhido. Mais rentável = maior lucro por ha/ano. Mais estável = menor instabilidade entre as que dão lucro. Risco moderado = maior lucro entre as de instabilidade média (40–60); sem nenhuma nessa faixa, a mais próxima dela. Cada critério mostra a melhor opção e as seguintes do ranking.",
  },
  {
    title: "Dificuldade de manejo",
    body: "Cada cultura tem um nível: fácil (estrutura comum de grãos — soja, milho, sorgo, coberturas), médio (exige cuidado ou equipamento adaptado — trigo, feijão, girassol, consórcio milho + braquiária) ou difícil (máquinas, mão de obra ou mercado específicos — algodão, amendoim, batata, cebola, canola). A rotação herda o nível da cultura mais exigente.",
  },
];
