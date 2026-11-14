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
import { CROP_MAP, FALLOW_ID, CROPS, cropName, PRIORITY_LABEL } from "@/data/crops";
import { clamp, round } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { ZARC_CROPS, windowLabel, zarcKey } from "@/services/zarc";

/**
 * MOTOR DE REGRAS DEMONSTRATIVO — rotações de culturas
 *
 * Gera e compara sequências de 2 anos (Verão 1, Inverno 1, Verão 2, Inverno 2).
 * Todos os indicadores (0–100) são ÍNDICES SIMULADOS calculados por regras simples e
 * explícitas, listadas em cada cenário. Eles NÃO estimam produtividade, renda ou ganho
 * percentual e NÃO constituem recomendação agronômica validada.
 */

export const ENGINE_VERSION = "regras-demo-0.2-zarc";
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
    notes.push(`pH informado (${fmt.n1(input.soil.ph)}) fora da faixa de referência (${fmt.n1(cr.phRange[0])}–${fmt.n1(cr.phRange[1])}); avaliar correção.`);
  }
  if (!isSummerSlot(i) && cr.frostSensitive && climate.frostRiskDays > 0 && !cr.annual) {
    issues++;
    notes.push(`Sensível a geada: ${climate.frostRiskDays} dia(s) com mínima ≤ 2 °C nos últimos 12 meses.`);
  }
  if (input.soil.texture === "arenosa" && cr.sandyTolerance === "baixa") {
    issues++;
    notes.push("Baixa tolerância a solo arenoso (menor retenção de água).");
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
    let s = waterSlotScore(seasonPrecip(i, seq, climate) / mid);
    if (sandy && cr.sandyTolerance === "baixa") s -= 15;
    if (sandy && cr.sandyTolerance === "media") s -= 5;
    waterScores.push(clamp(s, 0, 100));
  });
  const water = waterScores.length ? waterScores.reduce((a, b) => a + b, 0) / waterScores.length : 50;
  log.add("agua", "Média das posições: razão entre chuva observada na estação e necessidade hídrica de referência", round(water, 0));
  if (sandy) log.add("agua", "Solo arenoso: desconto para culturas com tolerância média/baixa (já incluído na média)", 0);

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

  if (!seq.includes(FALLOW_ID)) benefits.push("Solo permanece coberto nas quatro estações.");
  if (crops.some((c) => c?.role === "cobertura")) benefits.push("Inclui planta de cobertura, que aumenta a palhada sobre o solo.");
  if (crops.some((c) => c?.fixesNitrogen)) benefits.push("Inclui leguminosa, que pode contribuir com nitrogênio para a cultura seguinte.");
  if (new Set(seq.filter((s) => s !== FALLOW_ID)).size >= 3) benefits.push("Alterna três ou mais culturas, quebrando ciclos de pragas e doenças.");
  if (input.soil.compaction && seq.some((id) => DEEP_ROOTS.includes(id))) benefits.push("Usa espécies de raiz agressiva em área com sinais de compactação.");
  if (indicators.agua >= 80) benefits.push("Volume de chuva da última safra cobriu as necessidades de referência das culturas.");

  if (seq.includes(FALLOW_ID)) limitations.push("Pousio deixa o solo exposto à erosão e sem palhada.");
  if (seq[0] === seq[2] && crops[0] && !crops[0].annual) limitations.push(`${cropName(seq[0])} repetida no verão dos dois anos.`);
  if (crops.some((c) => c?.annual) && (input.soil.texture === "arenosa" || input.soil.erosionHistory))
    limitations.push("Mandioca expõe o solo no início do ciclo; exige práticas de contenção de erosão.");
  if (![1, 3].some((i) => crops[i]?.role === "comercial" && !crops[i]?.annual))
    limitations.push("Sem cultura comercial no inverno: a renda depende apenas da safra de verão.");
  slots
    .filter((s) => s.zarc && !s.zarc.zoned)
    .forEach((s) => limitations.push(`${s.slot} — ${cropName(s.cropId)}: fora do ZARC no município (sem Proagro e seguro subvencionado).`));
  slots
    .filter((s) => s.compatibility === "baixa")
    .forEach((s) => limitations.push(`${s.slot} — ${cropName(s.cropId)}: compatibilidade baixa com as condições informadas.`));
  if (indicators.agua < 60) limitations.push("Chuva observada abaixo da referência em parte das posições; maior risco de déficit hídrico.");

  return { benefits: [...new Set(benefits)], limitations: [...new Set(limitations)] };
}

/* ---------------------------------------------------------------- */
/* Geração de cenários                                               */
/* ---------------------------------------------------------------- */

function buildScenario(key: ScenarioResult["key"], label: string, focus: string, seq: Sequence, input: AnalysisInput, climate: ClimateSummary, zarc?: ZarcResult): ScenarioResult {
  const s = scoreSequence(seq, input, climate, zarc);
  const d = describe(seq, s.slots, s.indicators, input);
  return { key, label, focus, sequence: seq, ...s, ...d };
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

function topIndicator(ind: Record<PriorityKey, number>): string {
  const k = (Object.keys(ind) as PriorityKey[]).sort((a, b) => ind[b] - ind[a])[0];
  return PRIORITY_LABEL[k];
}

export function generateComparison(input: AnalysisInput, climate: ClimateSummary, zarc?: ZarcResult): ScenarioResult[] {
  const current: Sequence = [input.currentRotation.verao, input.currentRotation.inverno, input.currentRotation.verao, input.currentRotation.inverno];
  const currentScenario = buildScenario("atual", "Rotação atual", "Sequência praticada hoje", current, input, climate, zarc);

  const years = yearOptions(input);
  const candidates: { seq: Sequence; overall: number; tie: number }[] = [];
  for (const y1 of years) {
    for (const y2 of years) {
      const seq: Sequence = [y1[0], y1[1], y2[0], y2[1]];
      if (diffCount(seq, current) === 0) continue;
      const s = scoreSequence(seq, input, climate, zarc);
      // desempate determinístico: favorece mais culturas de interesse
      const tie = seq.filter((id) => input.interestCropIds.includes(id)).length;
      candidates.push({ seq, overall: s.overall, tie });
    }
  }
  candidates.sort((a, b) => b.overall - a.overall || b.tie - a.tie || a.seq.join().localeCompare(b.seq.join()));

  const a = candidates[0];
  // B precisa trazer um conjunto de culturas comerciais diferente da A (não apenas trocar posições)
  const commercialKey = (seq: Sequence) =>
    [...new Set(seq.filter((id) => crop(id)?.role === "comercial"))].sort().join(",");
  const b =
    (a && candidates.find((c) => commercialKey(c.seq) !== commercialKey(a.seq) && diffCount(c.seq, a.seq) >= 2)) ??
    candidates.find((c) => a && diffCount(c.seq, a.seq) >= 2) ??
    candidates[1];

  const result = [currentScenario];
  if (a) {
    const sa = buildScenario("a", "Alternativa A", "", a.seq, input, climate, zarc);
    sa.focus = `Maior índice ponderado pelas suas prioridades · destaque: ${topIndicator(sa.indicators).toLowerCase()}`;
    result.push(sa);
  }
  if (b) {
    const sb = buildScenario("b", "Alternativa B", "", b.seq, input, climate, zarc);
    sb.focus = `Melhor combinação com culturas comerciais diferentes da A · destaque: ${topIndicator(sb.indicators).toLowerCase()}`;
    result.push(sb);
  }
  return result;
}

/** Texto explicativo da metodologia, exibido na tela de comparação. */
export const METHOD_NOTES: { title: string; body: string }[] = [
  {
    title: "Conservação do solo",
    body: "Parte de 40 pontos. Soma pontos por palhada (alta +8, média +4) e por plantas de cobertura (+4); desconta pousio (−10) e mandioca em solo arenoso ou com erosão (−12). Bônus para espécies de raiz agressiva quando há compactação (+8) e para manter a área cultivada quando há histórico de erosão (+5).",
  },
  {
    title: "Disponibilidade hídrica",
    body: "Para cada posição, compara a chuva acumulada na estação nos últimos 12 meses (NASA POWER, PRECTOTCORR) com o ponto médio da necessidade hídrica de referência da cultura. Razão ≥ 1,2 → 100; 1,0–1,2 → 85; 0,8–1,0 → 65; 0,6–0,8 → 45; abaixo → 25. Solo arenoso desconta 5 a 15 pontos conforme a tolerância. Volume total não considera distribuição das chuvas, escoamento ou armazenamento no solo.",
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
    body: "Alta quando nenhuma restrição é encontrada; média com uma; baixa com duas ou mais. Restrições: chuva da estação abaixo de 80% da referência, pH fora da faixa de referência, risco de geada para culturas sensíveis no inverno, baixa tolerância a solo arenoso, drenagem ruim para leguminosas e situação no ZARC (abaixo).",
  },
  {
    title: "Zoneamento Agrícola de Risco Climático (ZARC)",
    body: "Dado oficial do MAPA (Tábua de Risco da safra vigente, sequeiro). Para cada cultura comercial com zoneamento, verifica se o município tem janela de plantio indicada para a classe de solo correspondente à textura informada (arenosa → AD1, média → AD3, argilosa → AD4, muito argilosa → AD6; aproximação). Sem janela indicada, a compatibilidade cai direto para baixa (fora do ZARC não há Proagro nem seguro subvencionado); só com janelas de risco de 40%, conta como uma restrição. Milho, feijão e sorgo no inverno usam o zoneamento de 2ª safra. Para soja, usa o menor nível de manejo (NM) publicado. Plantas de cobertura sem zoneamento não são penalizadas.",
  },
  {
    title: "Escolha das alternativas",
    body: "O motor combina a cultura de verão atual, as culturas de interesse e plantas de cobertura de inverno em todas as sequências de dois anos possíveis (com ao menos uma cultura comercial por ano). A Alternativa A tem o maior índice ponderado pelos pesos das suas prioridades; a B é a melhor combinação seguinte com um conjunto de culturas comerciais diferente da A (e ao menos duas posições distintas), para oferecer uma alternativa de fato diferente.",
  },
];
