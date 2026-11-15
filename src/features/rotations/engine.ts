import type {
  AnalysisInput,
  ClimateSummary,
  Compatibility,
  Crop,
  PriorityKey,
  RuleHit,
  ScenarioResult,
  SlotEvaluation,
  ZarcResult,
} from "@/types";
import { CROP_MAP, FALLOW_ID, CROPS, cropName } from "@/data/crops";
import { clamp, round } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { ZARC_CROPS, windowLabel, zarcKey } from "@/services/zarc";
import { scenarioEconomics, sequenceDifficulty, type Difficulty, type EconOverrides } from "./economics";

/**
 * MOTOR DE REGRAS DEMONSTRATIVO — rotações de culturas
 *
 * Gera e compara sequências de 2 anos (Verão 1, Inverno 1, Verão 2, Inverno 2).
 * Todos os indicadores (0–100) são ÍNDICES SIMULADOS calculados por regras simples e
 * explícitas, listadas em cada cenário. Eles NÃO estimam produtividade, renda ou ganho
 * percentual e NÃO constituem recomendação agronômica validada.
 */

export const ENGINE_VERSION = "regras-demo-0.3-solo";
export const SLOT_LABELS = ["Verão 1", "Inverno 1", "Verão 2", "Inverno 2"] as const;

type Sequence = [string, string, string, string];

const isSummerSlot = (i: number) => i % 2 === 0;
/** Espécies de raiz agressiva, úteis em camadas compactadas. */
const DEEP_ROOTS = ["braquiaria", "nabo", "milho_braquiaria"];
const crop = (id: string): Crop | null => (id === FALLOW_ID ? null : (CROP_MAP[id] ?? null));

/* ---------------------------------------------------------------- */
/* Avaliação por posição                                             */
/* ---------------------------------------------------------------- */

function seasonPrecip(i: number, seq: Sequence, c: ClimateSummary) {
  const cr = crop(seq[i]);
  if (cr?.annual) return c.annualPrecipMm;
  return isSummerSlot(i) ? c.summerPrecipMm : c.winterPrecipMm;
}

/** Pontuação hídrica de uma posição (0–100) pela razão chuva da estação / necessidade de referência. */
function waterSlotScore(ratio: number) {
  if (ratio >= 1.2) return 100;
  if (ratio >= 1.0) return 85;
  if (ratio >= 0.8) return 65;
  if (ratio >= 0.6) return 45;
  return 25;
}

/**
 * Restrição do ZARC para a posição. Só culturas comerciais com zoneamento oficial são penalizadas:
 * fora da janela do ZARC não há Proagro nem seguro rural subvencionado.
 */
function zarcCheck(cr: Crop, i: number, zarc: ZarcResult | undefined): { zarc?: SlotEvaluation["zarc"]; note?: string; issues: number } {
  if (!zarc || zarc.origin !== "real") return { issues: 0 };
  const key = zarcKey(cr.id, cr.annual ? "anual" : isSummerSlot(i) ? "verao" : "inverno");
  if (!ZARC_CROPS[key]) return { issues: 0 };
  const e = zarc.entries[key];
  const where = `${zarc.municipio}/${zarc.uf}`;
  if (!e?.zoned) {
    if (cr.role !== "comercial") return { issues: 0 };
    // fora do ZARC = sem Proagro/seguro: vale duas restrições (compatibilidade baixa direto)
    return {
      issues: 2,
      zarc: { zoned: false, minRisk: null, windows: "" },
      note: `ZARC ${zarc.safra}: ${ZARC_CROPS[key].name} sem indicação de plantio em ${where} para o solo informado — sem acesso a Proagro e seguro subvencionado.`,
    };
  }
  const windows = e.windows.map((w) => `${windowLabel(w.startDec, w.endDec)} (${w.risk}%)`).join("; ");
  const only40 = e.minRisk === 40;
  return {
    issues: only40 && cr.role === "comercial" ? 1 : 0,
    zarc: { zoned: true, minRisk: e.minRisk, windows },
    note: only40
      ? `ZARC ${zarc.safra}: só há janelas com risco de 40% em ${where} — ${windows}.`
      : `ZARC ${zarc.safra}: plantio indicado em ${windows}.`,
  };
}

/* Limiares das regras que usam o cadastro completo de solo (demonstrativos, a validar). */
const SHALLOW_CM = 50;
const HIGH_M_PCT = 20;
const LOW_V_PCT = 50;
const AD_LOW_MM = 40;
const AD_MID_MM = 70;

/**
 * Retenção de água no solo. Com água disponível MEDIDA (CC, PMP e profundidade efetiva do laudo),
 * usa o valor calculado; sem ela, cai na regra pela textura (solo arenoso = baixa retenção).
 */
function waterRetentionPenalty(cr: Crop, input: AnalysisInput): { points: number; slotIssue?: string; rule?: string } {
  const ad = input.soilEvidence?.availableWaterMm;
  if (ad) {
    const low = ad.value < AD_LOW_MM;
    const mid = ad.value < AD_MID_MM;
    const points = low ? (cr.sandyTolerance === "baixa" ? -15 : cr.sandyTolerance === "media" ? -5 : 0) : mid && cr.sandyTolerance === "baixa" ? -5 : 0;
    return {
      points,
      slotIssue: low && cr.sandyTolerance === "baixa" ? `Água disponível de ${fmt.n0(ad.value)} mm na zona radicular (laudo) é baixa para esta cultura.` : undefined,
      rule: `Água disponível calculada do laudo: ${fmt.n0(ad.value)} mm — desconto para culturas com tolerância média/baixa (já incluído na média)`,
    };
  }
  if (input.soil.texture !== "arenosa") return { points: 0 };
  return {
    points: cr.sandyTolerance === "baixa" ? -15 : cr.sandyTolerance === "media" ? -5 : 0,
    slotIssue: cr.sandyTolerance === "baixa" ? "Baixa tolerância a solo arenoso (menor retenção de água)." : undefined,
    rule: "Solo arenoso: desconto para culturas com tolerância média/baixa (já incluído na média)",
  };
}

function evaluateSlot(i: number, seq: Sequence, input: AnalysisInput, climate: ClimateSummary, zarc?: ZarcResult): SlotEvaluation {
  const id = seq[i];
  const cr = crop(id);
  const precip = seasonPrecip(i, seq, climate);
  if (!cr) {
    return {
      slot: SLOT_LABELS[i],
      cropId: FALLOW_ID,
      waterNeedMm: null,
      seasonPrecipMm: precip,
      compatibility: "media",
      notes: ["Área sem cultivo: solo exposto à chuva e ao sol, sem produção de palhada."],
    };
  }

  const notes: string[] = [];
  let issues = 0;
  const mid = (cr.waterNeedMm[0] + cr.waterNeedMm[1]) / 2;
  const ratio = precip / mid;
  if (ratio < 0.8) {
    issues++;
    notes.push(`Chuva da estação (${fmt.n0(precip)} mm) abaixo da necessidade de referência (${cr.waterNeedMm[0]}–${cr.waterNeedMm[1]} mm).`);
  } else {
    notes.push(`Chuva da estação (${fmt.n0(precip)} mm) cobre a necessidade de referência (${cr.waterNeedMm[0]}–${cr.waterNeedMm[1]} mm) em volume total.`);
  }
  if (input.soil.ph !== null && (input.soil.ph < cr.phRange[0] - 0.2 || input.soil.ph > cr.phRange[1] + 0.2)) {
    issues++;
    const est = input.soilEvidence?.phWater?.source === "estimado" ? " (convertido de CaCl₂)" : "";
    notes.push(`pH em água${est} ${fmt.n1(input.soil.ph)} fora da faixa de referência (${fmt.n1(cr.phRange[0])}–${fmt.n1(cr.phRange[1])}); avaliar correção.`);
  }
  if (!isSummerSlot(i) && cr.frostSensitive && climate.frostRiskDays > 0 && !cr.annual) {
    issues++;
    notes.push(`Sensível a geada: ${climate.frostRiskDays} dia(s) com mínima ≤ 2 °C nos últimos 12 meses.`);
  }
  const wp = waterRetentionPenalty(cr, input);
  if (wp.slotIssue) {
    issues++;
    notes.push(wp.slotIssue);
  }
  const ev = input.soilEvidence;
  if (ev?.effectiveDepthCm && ev.effectiveDepthCm.value < SHALLOW_CM && cr.role === "comercial") {
    issues++;
    notes.push(`Profundidade efetiva de ${fmt.n0(ev.effectiveDepthCm.value)} cm (laudo) limita o desenvolvimento das raízes.`);
  }
  if (ev?.aluminumSaturation && ev.aluminumSaturation.value >= HIGH_M_PCT && cr.phRange[0] >= 5.5) {
    issues++;
    notes.push(`Saturação por alumínio de ${fmt.n0(ev.aluminumSaturation.value)}% (${ev.aluminumSaturation.depth}) — cultura sensível à acidez; avaliar calagem/gessagem.`);
  }
  if (input.soil.drainage === "ruim" && cr.family === "leguminosa") {
    issues++;
    notes.push("Drenagem ruim pode prejudicar leguminosas.");
  }
  const z = zarcCheck(cr, i, zarc);
  issues += z.issues;
  if (z.note) notes.push(z.note);

  const compatibility: Compatibility = issues === 0 ? "alta" : issues === 1 ? "media" : "baixa";
  return { slot: SLOT_LABELS[i], cropId: id, waterNeedMm: cr.waterNeedMm, seasonPrecipMm: precip, compatibility, notes, ...(z.zarc && { zarc: z.zarc }) };
}

/* ---------------------------------------------------------------- */
/* Indicadores                                                       */
/* ---------------------------------------------------------------- */

class RuleLog {
  private map = new Map<string, RuleHit & { count: number }>();
  add(indicator: PriorityKey, description: string, points: number) {
    const k = `${indicator}|${description}`;
    const prev = this.map.get(k);
    if (prev) {
      prev.points += points;
      prev.count++;
    } else this.map.set(k, { indicator, description, points, count: 1 });
  }
  list(): RuleHit[] {
    return [...this.map.values()].map(({ count, ...h }) => ({
      ...h,
      points: round(h.points, 0),
      description: count > 1 ? `${h.description} (${count}×)` : h.description,
    }));
  }
}

function scoreSequence(seq: Sequence, input: AnalysisInput, climate: ClimateSummary, zarc?: ZarcResult) {
  const log = new RuleLog();
  const slots = seq.map((_, i) => evaluateSlot(i, seq, input, climate, zarc));
  const sandy = input.soil.texture === "arenosa";

  // --- Conservação do solo
  let cons = 40;
  log.add("conservacao", "Pontuação base", 40);
  const annualYearsCounted = new Set<number>();
  seq.forEach((id, i) => {
    const cr = crop(id);
    if (!cr) {
      cons -= 10;
      log.add("conservacao", "Pousio: solo descoberto", -10);
      return;
    }
    if (cr.annual) {
      const year = Math.floor(i / 2);
      if (annualYearsCounted.has(year)) return;
      annualYearsCounted.add(year);
      if (sandy || input.soil.erosionHistory) {
        cons -= 12;
        log.add("conservacao", "Mandioca em solo arenoso ou com erosão: solo exposto no início do ciclo", -12);
      }
      return;
    }
    const pts = cr.residue === "alta" ? 8 : cr.residue === "media" ? 4 : 0;
    if (pts) {
      cons += pts;
      log.add("conservacao", `Palhada ${cr.residue === "alta" ? "alta" : "média"} (${cr.name})`, pts);
    }
    if (cr.role === "cobertura") {
      cons += 4;
      log.add("conservacao", "Planta de cobertura protege o solo entre safras", 4);
    }
  });
  if (input.soil.compaction && seq.some((id) => DEEP_ROOTS.includes(id))) {
    cons += 8;
    log.add("conservacao", "Raízes de braquiária/nabo podem ajudar em camadas compactadas", 8);
  }
  if (input.soil.erosionHistory && !seq.includes(FALLOW_ID)) {
    cons += 5;
    log.add("conservacao", "Área com histórico de erosão mantida cultivada o ano todo", 5);
  }

  // --- Disponibilidade hídrica
  const waterScores: number[] = [];
  seq.forEach((id, i) => {
    const cr = crop(id);
    if (!cr) return;
    if (cr.annual && i % 2 === 1) return; // conta a anual uma vez por ano
    const mid = (cr.waterNeedMm[0] + cr.waterNeedMm[1]) / 2;
    const s = waterSlotScore(seasonPrecip(i, seq, climate) / mid) + waterRetentionPenalty(cr, input).points;
    waterScores.push(clamp(s, 0, 100));
  });
  const water = waterScores.length ? waterScores.reduce((a, b) => a + b, 0) / waterScores.length : 50;
  log.add("agua", "Média das posições: razão entre chuva observada na estação e necessidade hídrica de referência", round(water, 0));
  const firstCrop = seq.map(crop).find((c): c is Crop => c !== null);
  const retentionRule = firstCrop ? waterRetentionPenalty(firstCrop, input).rule : undefined;
  if (retentionRule) log.add("agua", retentionRule, 0);

  // --- Produtividade potencial (índice relativo)
  let prod = 50;
  log.add("produtividade", "Pontuação base", 50);
  slots.forEach((s, i) => {
    const cr = crop(s.cropId);
    if (!cr || cr.role !== "comercial") return;
    if (cr.annual && i % 2 === 1) return;
    const pts = s.compatibility === "alta" ? 8 : s.compatibility === "media" ? 3 : -6;
    prod += pts;
    log.add("produtividade", `Cultura comercial com compatibilidade ${s.compatibility}`, pts);
  });
  for (let i = 1; i < 4; i++) {
    const prev = crop(seq[i - 1]);
    const cur = crop(seq[i]);
    if (prev?.fixesNitrogen && cur?.family === "gramínea" && cur.role === "comercial") {
      prod += 6;
      log.add("produtividade", "Leguminosa antes de gramínea comercial (possível aporte de nitrogênio)", 6);
    }
    if (prev && cur && prev.id === cur.id && !prev.annual) {
      prod -= 6;
      log.add("produtividade", "Mesma cultura em posições consecutivas", -6);
    }
  }
  if (seq[0] === seq[2] && crop(seq[0]) && !crop(seq[0])!.annual) {
    prod -= 8;
    log.add("produtividade", "Mesma cultura de verão nos dois anos (favorece pragas e doenças)", -8);
  }

  // --- Diversificação
  const used = seq.filter((id) => id !== FALLOW_ID);
  const nCrops = new Set(used).size;
  const nFamilies = new Set(used.map((id) => CROP_MAP[id]?.family)).size;
  const div = nCrops * 15 + nFamilies * 10;
  log.add("diversificacao", `${nCrops} cultura(s) distinta(s) × 15`, nCrops * 15);
  log.add("diversificacao", `${nFamilies} família(s) botânica(s) × 10`, nFamilies * 10);

  const indicators: Record<PriorityKey, number> = {
    conservacao: round(clamp(cons, 0, 100), 0),
    agua: round(clamp(water, 0, 100), 0),
    produtividade: round(clamp(prod, 0, 100), 0),
    diversificacao: round(clamp(div, 0, 100), 0),
  };

  const w = input.priorities;
  const wSum = Object.values(w).reduce((a, b) => a + b, 0);
  const overall =
    wSum === 0
      ? (indicators.conservacao + indicators.agua + indicators.produtividade + indicators.diversificacao) / 4
      : (Object.keys(indicators) as PriorityKey[]).reduce((a, k) => a + indicators[k] * w[k], 0) / wSum;

  return { slots, indicators, overall: round(overall, 0), rules: log.list() };
}

/* ---------------------------------------------------------------- */
/* Benefícios e limitações (derivados das regras aplicadas)          */
/* ---------------------------------------------------------------- */

function describe(seq: Sequence, slots: SlotEvaluation[], indicators: Record<PriorityKey, number>, input: AnalysisInput) {
  const benefits: string[] = [];
  const limitations: string[] = [];
  const crops = seq.map(crop);

  // rótulos curtos e técnicos (aparecem como etiquetas no cartão)
  if (!seq.includes(FALLOW_ID)) benefits.push("Solo coberto o ano todo");
  if (crops.some((c) => c?.role === "cobertura")) benefits.push("Cobertura: + palhada");
  if (crops.some((c) => c?.fixesNitrogen)) benefits.push("Leguminosa: aporte de N");
  if (new Set(seq.filter((s) => s !== FALLOW_ID)).size >= 3) benefits.push("3+ culturas: quebra ciclo de pragas");
  if (input.soil.compaction && seq.some((id) => DEEP_ROOTS.includes(id))) benefits.push("Raiz agressiva x compactação");
  if (indicators.agua >= 80) benefits.push("Chuva ≥ necessidade");

  if (seq.includes(FALLOW_ID)) limitations.push("Pousio: solo exposto");
  if (seq[0] === seq[2] && crops[0] && !crops[0].annual) limitations.push(`${cropName(seq[0])} repetida no verão`);
  if (crops.some((c) => c?.annual) && (input.soil.texture === "arenosa" || input.soil.erosionHistory)) limitations.push("Mandioca: risco de erosão no início");
  if (![1, 3].some((i) => crops[i]?.role === "comercial" && !crops[i]?.annual)) limitations.push("Sem renda no inverno");
  slots.filter((s) => s.zarc && !s.zarc.zoned).forEach((s) => limitations.push(`${cropName(s.cropId)} fora do ZARC (sem seguro)`));
  slots.filter((s) => s.compatibility === "baixa").forEach((s) => limitations.push(`${cropName(s.cropId)}: compatibilidade baixa`));
  if (indicators.agua < 60) limitations.push("Risco de déficit hídrico");
  const v = input.soilEvidence?.baseSaturation;
  if (v && v.value < LOW_V_PCT) limitations.push(`V% ${fmt.n0(v.value)}: avaliar calagem`);

  return { benefits: [...new Set(benefits)], limitations: [...new Set(limitations)] };
}

/* ---------------------------------------------------------------- */
/* Geração de cenários                                               */
/* ---------------------------------------------------------------- */

export function buildScenario(
  key: ScenarioResult["key"],
  label: string,
  focus: string,
  seq: Sequence,
  input: AnalysisInput,
  climate: ClimateSummary,
  zarc?: ZarcResult,
  econ?: EconOverrides,
): ScenarioResult {
  const s = scoreSequence(seq, input, climate, zarc);
  const d = describe(seq, s.slots, s.indicators, input);
  return { key, label, focus, sequence: seq, ...s, ...d, economics: scenarioEconomics(seq, s.slots, econ) };
}

export type { Sequence };

/** Culturas que podem ocupar uma posição (verão ou inverno), para a troca manual. */
export function slotOptions(slot: number): string[] {
  const season = isSummerSlot(slot) ? "verao" : "inverno";
  return [...CROPS.filter((c) => !c.annual && c.seasons.includes(season)).map((c) => c.id), FALLOW_ID];
}

/** Troca a cultura de uma posição, mantendo coerente a cultura anual (ocupa verão + inverno do ano). */
export function replaceSlot(seq: Sequence, slot: number, id: string): Sequence {
  const next = [...seq] as Sequence;
  const pair = slot % 2 === 0 ? slot + 1 : slot - 1;
  if (crop(id)?.annual) {
    next[slot] = id;
    next[pair] = id;
  } else {
    if (crop(next[slot])?.annual && next[pair] === next[slot]) next[pair] = FALLOW_ID;
    next[slot] = id;
  }
  return next;
}

function yearOptions(input: AnalysisInput): [string, string][] {
  const interest = input.interestCropIds.map((id) => CROP_MAP[id]).filter(Boolean);
  const summer = new Set<string>([input.currentRotation.verao]);
  const winter = new Set<string>([input.currentRotation.inverno, FALLOW_ID]);
  interest.forEach((c) => {
    if (c.annual) return;
    if (c.seasons.includes("verao")) summer.add(c.id);
    if (c.seasons.includes("inverno")) winter.add(c.id);
  });
  // plantas de cobertura de inverno sempre entram como opção
  CROPS.filter((c) => c.role === "cobertura" && c.seasons.includes("inverno")).forEach((c) => winter.add(c.id));
  summer.delete(FALLOW_ID);

  const opts: [string, string][] = [];
  summer.forEach((s) => winter.forEach((w) => opts.push([s, w])));
  interest.filter((c) => c.annual).forEach((c) => opts.push([c.id, c.id]));
  // cada ano precisa de ao menos uma cultura comercial
  return opts.filter(([s, w]) => crop(s)?.role === "comercial" || crop(w)?.role === "comercial");
}

const diffCount = (a: string[], b: string[]) => a.reduce((n, v, i) => n + (v !== b[i] ? 1 : 0), 0);

export type CriterionKey = "retorno" | "estavel" | "equilibrio";

export const CRITERIA: Record<CriterionKey, { label: string; focus: string }> = {
  retorno: { label: "Mais rentável", focus: "Maior lucro por hectare" },
  estavel: { label: "Mais estável", focus: "Renda mais previsível ano a ano" },
  equilibrio: { label: "Risco moderado", focus: "Bom lucro com oscilação média" },
};

export interface Candidate {
  seq: Sequence;
  net: number;
  inst: number;
  difficulty: Difficulty;
  overall: number;
  tie: number;
}

/** Faixa de instabilidade considerada "moderada". */
const MODERATE: [number, number] = [40, 60];
const RANK_SIZE = 4;

/**
 * Ranking dos três critérios entre todas as sequências possíveis, só com culturas de manejo até
 * `maxDifficulty`. Cada lista vem da melhor para a pior (até 4 opções).
 */
export function rankCriteria(input: AnalysisInput, climate: ClimateSummary, zarc?: ZarcResult, econ?: EconOverrides, maxDifficulty: Difficulty = 3): Record<CriterionKey, Candidate[]> {
  const current: Sequence = [input.currentRotation.verao, input.currentRotation.inverno, input.currentRotation.verao, input.currentRotation.inverno];
  const years = yearOptions(input);
  const cands: Candidate[] = [];
  for (const y1 of years) {
    for (const y2 of years) {
      const seq: Sequence = [y1[0], y1[1], y2[0], y2[1]];
      if (diffCount(seq, current) === 0) continue;
      const difficulty = sequenceDifficulty(seq).level;
      if (difficulty > maxDifficulty) continue;
      const s = scoreSequence(seq, input, climate, zarc);
      const m = scenarioEconomics(seq, s.slots, econ);
      // desempate determinístico: favorece mais culturas de interesse
      const tie = seq.filter((id) => input.interestCropIds.includes(id)).length;
      cands.push({ seq, net: m.netPerYear, inst: m.instability, difficulty, overall: s.overall, tie });
    }
  }
  if (!cands.length) return { retorno: [], estavel: [], equilibrio: [] };

  /** Mesma rotação com os anos trocados (soja→milho · milho→milho = milho→milho · soja→milho). */
  const canon = (s: Sequence) => [`${s[0]}>${s[1]}`, `${s[2]}>${s[3]}`].sort().join("|");
  const fallows = (c: Candidate) => c.seq.filter((id) => id === FALLOW_ID).length;
  const byKey = (a: Candidate, b: Candidate) => a.difficulty - b.difficulty || b.overall - a.overall || b.tie - a.tie || a.seq.join().localeCompare(b.seq.join());
  /** Ordena e tira as versões espelhadas, ficando com a melhor de cada. */
  const ranked = (list: Candidate[], cmp: (a: Candidate, b: Candidate) => number) => {
    const seen = new Set<string>();
    return [...list].sort(cmp).filter((c) => {
      const k = canon(c.seq);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };

  const retorno = ranked(cands, (a, b) => b.net - a.net || byKey(a, b));
  const profitable = cands.filter((c) => c.net > 0);
  // empate na estabilidade: prefere quem não deixa o solo em pousio
  const estavel = ranked(profitable.length ? profitable : cands, (a, b) => a.inst - b.inst || fallows(a) - fallows(b) || b.net - a.net || byKey(a, b));
  const inBand = cands.filter((c) => c.inst >= MODERATE[0] && c.inst <= MODERATE[1]);
  const dist = (c: Candidate) => (c.inst < MODERATE[0] ? MODERATE[0] - c.inst : c.inst > MODERATE[1] ? c.inst - MODERATE[1] : 0);
  // o risco moderado não repete a 1ª opção dos outros critérios, quando houver alternativa
  const taken = new Set([canon(retorno[0].seq), canon(estavel[0].seq)]);
  const modPool = (inBand.length ? inBand : cands).filter((c) => !taken.has(canon(c.seq)));
  const equilibrio = ranked(modPool.length ? modPool : inBand.length ? inBand : cands, (a, b) => dist(a) - dist(b) || b.net - a.net || byKey(a, b));

  return { retorno: retorno.slice(0, RANK_SIZE), estavel: estavel.slice(0, RANK_SIZE), equilibrio: equilibrio.slice(0, RANK_SIZE) };
}

/**
 * Atual + o 1º de cada critério (mais rentável, mais estável, risco moderado).
 * `econ` = preços/produtividades/custos em uso.
 */
export function generateComparison(input: AnalysisInput, climate: ClimateSummary, zarc?: ZarcResult, econ?: EconOverrides, maxDifficulty: Difficulty = 3): ScenarioResult[] {
  const current: Sequence = [input.currentRotation.verao, input.currentRotation.inverno, input.currentRotation.verao, input.currentRotation.inverno];
  const currentScenario = buildScenario("atual", "Rotação atual", "O que é feito hoje", current, input, climate, zarc, econ);
  const rank = rankCriteria(input, climate, zarc, econ, maxDifficulty);
  return [
    currentScenario,
    ...(Object.keys(CRITERIA) as CriterionKey[])
      .filter((k) => rank[k][0])
      .map((k) => buildScenario(k, CRITERIA[k].label, CRITERIA[k].focus, rank[k][0].seq, input, climate, zarc, econ)),
  ];
}

/** Texto explicativo da metodologia, exibido na tela de comparação. */
export const METHOD_NOTES: { title: string; body: string }[] = [
  {
    title: "Conservação do solo",
    body: "Parte de 40 pontos. Soma pontos por palhada (alta +8, média +4) e por plantas de cobertura (+4); desconta pousio (−10) e mandioca em solo arenoso ou com erosão (−12). Bônus para espécies de raiz agressiva quando há compactação (+8) e para manter a área cultivada quando há histórico de erosão (+5).",
  },
  {
    title: "Disponibilidade hídrica",
    body: "Para cada posição, compara a chuva acumulada na estação nos últimos 12 meses (NASA POWER, PRECTOTCORR) com o ponto médio da necessidade hídrica de referência da cultura. Razão ≥ 1,2 → 100; 1,0–1,2 → 85; 0,8–1,0 → 65; 0,6–0,8 → 45; abaixo → 25. Retenção de água: com laudo (CC, PMP e profundidade efetiva), usa a água disponível calculada na zona radicular de até 50 cm — abaixo de 40 mm desconta 5 a 15 pontos conforme a tolerância da cultura; de 40 a 70 mm, 5 pontos para tolerância baixa. Sem laudo, solo arenoso desconta 5 a 15 pontos. Volume total não considera distribuição das chuvas, escoamento ou armazenamento no solo.",
  },
  {
    title: "Produtividade potencial (índice relativo)",
    body: "Parte de 50 pontos. Cada cultura comercial soma conforme a compatibilidade com as condições informadas (alta +8, média +3, baixa −6). Leguminosa antes de gramínea comercial +6; mesma cultura em posições seguidas −6; mesma cultura de verão nos dois anos −8. Não representa kg/ha nem ganho percentual.",
  },
  {
    title: "Diversificação",
    body: "15 pontos por cultura distinta e 10 por família botânica distinta na sequência de dois anos, limitado a 100.",
  },
  {
    title: "Compatibilidade por posição",
    body: "Alta quando nenhuma restrição é encontrada; média com uma; baixa com duas ou mais. Restrições: chuva da estação abaixo de 80% da referência, pH fora da faixa de referência, risco de geada para culturas sensíveis no inverno, baixa tolerância a solo arenoso (ou água disponível medida abaixo de 40 mm), drenagem ruim para leguminosas e situação no ZARC (abaixo).",
  },
  {
    title: "Dados de laudo (cadastro completo)",
    body: "Só amostras confirmadas entram no motor, usando a coleta mais recente. Argila medida define a textura (< 15% arenosa; 15–35% média; 35–60% argilosa; ≥ 60% muito argilosa). pH em CaCl₂ é convertido para água somando 0,6 (aproximação). Profundidade efetiva abaixo de 50 cm e saturação por alumínio ≥ 20% em qualquer camada (para culturas com pH de referência a partir de 5,5) contam como restrição. V% abaixo de 50% gera um alerta de calagem, sem pontuar. Limiares demonstrativos: mais dados tornam a avaliação mais específica, mas não comprovam maior precisão — isso exige validação agronômica.",
  },
  {
    title: "Zoneamento Agrícola de Risco Climático (ZARC)",
    body: "Dado oficial do MAPA (Tábua de Risco da safra vigente, sequeiro). Para cada cultura comercial com zoneamento, verifica se o município tem janela de plantio indicada para a classe de solo correspondente à textura informada (arenosa → AD1, média → AD3, argilosa → AD4, muito argilosa → AD6; aproximação). Sem janela indicada, a compatibilidade cai direto para baixa (fora do ZARC não há Proagro nem seguro subvencionado); só com janelas de risco de 40%, conta como uma restrição. Milho, feijão e sorgo no inverno usam o zoneamento de 2ª safra. Para soja, usa o menor nível de manejo (NM) publicado. Plantas de cobertura sem zoneamento não são penalizadas.",
  },
];
