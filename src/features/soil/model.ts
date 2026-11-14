import type {
  Property,
  SoilEvidence,
  SoilEvidenceValue,
  SoilMeasurement,
  SoilParamKey,
  SoilProfile,
  SoilSample,
  SoilTexture,
} from "@/types";
import { SOIL_PARAM_MAP, toCanonical } from "@/data/soilParameters";
import { fmt } from "@/lib/format";
import { round } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Validação (RF-SOLO-05)                                              */
/* ------------------------------------------------------------------ */

export interface SampleValidation {
  /** Chaves: "depth", "date", "plot" ou o parâmetro (ex.: "k"). */
  errors: Record<string, string>;
  /** Inconsistências entre valores — não bloqueiam, mas são mostradas. */
  warnings: string[];
}

const K_MG_PER_CMOLC = 391;

/** Valor de um parâmetro na unidade canônica; undefined quando ausente ou inválido. */
export function canonical(sample: Pick<SoilSample, "measurements">, key: SoilParamKey): number | undefined {
  const m = sample.measurements.find((x) => x.parameter === key);
  if (!m || !Number.isFinite(m.value)) return undefined;
  return toCanonical(key, m.value, m.unit) ?? undefined;
}

export function validateSample(s: SoilSample, today = new Date()): SampleValidation {
  const errors: Record<string, string> = {};
  const warnings: string[] = [];

  if (!s.plot.trim()) errors.plot = "Identifique o talhão (ex.: Talhão 1).";
  if (s.date && new Date(`${s.date}T00:00:00`) > today) errors.date = "A data da coleta não pode estar no futuro.";
  if (s.depthTopCm === null || s.depthBottomCm === null) errors.depth = "Informe a profundidade inicial e final da amostra.";
  else if (s.depthTopCm < 0 || s.depthBottomCm > 400) errors.depth = "Profundidade entre 0 e 400 cm.";
  else if (s.depthBottomCm <= s.depthTopCm) errors.depth = "A profundidade final deve ser maior que a inicial.";

  for (const m of s.measurements) {
    const def = SOIL_PARAM_MAP[m.parameter];
    if (!Number.isFinite(m.value)) {
      errors[m.parameter] = "Valor numérico inválido.";
      continue;
    }
    const c = toCanonical(m.parameter, m.value, m.unit);
    if (c === null) {
      errors[m.parameter] = `Unidade "${m.unit}" não reconhecida para ${def.label}.`;
      continue;
    }
    if (c < def.range[0] || c > def.range[1]) {
      const u = def.units[0].unit === "—" ? "" : ` ${def.units[0].unit}`;
      const n = (x: number) => x.toLocaleString("pt-BR");
      errors[m.parameter] = `Fora da faixa plausível (${n(def.range[0])}–${n(def.range[1])}${u}). Confira o valor e a unidade.`;
      continue;
    }
    if (def.methodRequired && !m.method) errors[m.parameter] = "Informe o método de análise — sem ele o valor não é comparável.";
  }

  // consistência entre parâmetros
  const sand = canonical(s, "areia");
  const silt = canonical(s, "silte");
  const clay = canonical(s, "argila");
  if (sand !== undefined && silt !== undefined && clay !== undefined) {
    const total = sand + silt + clay;
    if (Math.abs(total - 100) > 3) warnings.push(`Areia + silte + argila somam ${fmt.n0(total)}% (esperado ≈ 100%).`);
  }
  const cc = canonical(s, "cc");
  const pmp = canonical(s, "pmp");
  if (cc !== undefined && pmp !== undefined && pmp >= cc) errors.pmp = "O ponto de murcha deve ser menor que a capacidade de campo.";

  const sb = sumOfBases(s);
  const hal = canonical(s, "h_al");
  const ctc = canonical(s, "ctc");
  if (sb !== undefined && hal !== undefined && ctc !== undefined && ctc > 0) {
    const calc = sb + hal;
    if (Math.abs(calc - ctc) / ctc > 0.1) warnings.push(`CTC informada (${fmt.n2(ctc)}) difere de Ca+Mg+K+H+Al (${fmt.n2(calc)} cmolc/dm³). Confira as unidades.`);
  }
  const v = canonical(s, "v");
  const vCalc = baseSaturation(s);
  if (v !== undefined && vCalc !== undefined && Math.abs(v - vCalc) > 5) warnings.push(`V% informada (${fmt.n0(v)}%) difere da calculada (${fmt.n0(vCalc)}%).`);

  return { errors, warnings };
}

/** Soma de bases (Ca + Mg + K) em cmolc/dm³; K convertido de mg/dm³. */
function sumOfBases(s: Pick<SoilSample, "measurements">): number | undefined {
  const ca = canonical(s, "ca");
  const mg = canonical(s, "mg");
  const k = canonical(s, "k");
  if (ca === undefined || mg === undefined || k === undefined) return undefined;
  return ca + mg + k / K_MG_PER_CMOLC;
}

function baseSaturation(s: Pick<SoilSample, "measurements">): number | undefined {
  const sb = sumOfBases(s);
  const hal = canonical(s, "h_al");
  if (sb === undefined || hal === undefined || sb + hal <= 0) return undefined;
  return (100 * sb) / (sb + hal);
}

function aluminumSaturation(s: Pick<SoilSample, "measurements">): number | undefined {
  const sb = sumOfBases(s);
  const al = canonical(s, "al");
  if (sb === undefined || al === undefined || sb + al <= 0) return undefined;
  return (100 * al) / (sb + al);
}

/* ------------------------------------------------------------------ */
/* Derivação do que o motor usa (RF-SOLO-06/08/09)                     */
/* ------------------------------------------------------------------ */

/** Classes texturais simplificadas (Embrapa) a partir do teor de argila. */
export function textureFromClay(clayPct: number): SoilTexture {
  if (clayPct < 15) return "arenosa";
  if (clayPct < 35) return "media";
  if (clayPct < 60) return "argilosa";
  return "muito_argilosa";
}

/** Profundidade de referência da zona radicular de culturas anuais para o cálculo da água disponível. */
export const ROOT_ZONE_CM = 50;
/** Aproximação usual: pH em água ≈ pH em CaCl₂ + 0,6. */
export const PH_CACL2_TO_WATER = 0.6;

export const depthLabel = (s: Pick<SoilSample, "depthTopCm" | "depthBottomCm">) =>
  s.depthTopCm === null || s.depthBottomCm === null ? "profundidade n/i" : `${s.depthTopCm}–${s.depthBottomCm} cm`;

const measured = (value: number, unit: string, note?: string): SoilEvidenceValue => ({ value, unit, source: "medido", ...(note && { note }) });
const estimated = (value: number, unit: string, note: string): SoilEvidenceValue => ({ value, unit, source: "estimado", note });

/** Dados que, ausentes, mais limitam a avaliação — na ordem em que vale a pena pedir. */
const KEY_PARAMS: SoilParamKey[] = ["argila", "ph", "profundidade_efetiva", "cc", "pmp", "m", "v", "materia_organica"];

/**
 * Junta o cadastro simples e as amostras CONFIRMADAS da propriedade no que o motor usa.
 *
 * Usa a coleta mais recente (talhão + data); dentro dela, a camada mais superficial para
 * textura, pH, M.O. e V%, e todas as camadas para alumínio, profundidade efetiva e água.
 * Nada é inventado: valores ausentes ficam ausentes e entram na lista `missing`.
 */
export function deriveSoilEvidence(property: Pick<Property, "id" | "soil">, samples: SoilSample[]): SoilEvidence {
  const confirmed = samples.filter((s) => s.propertyId === property.id && s.status === "confirmada");
  const declared = property.soil;

  if (!confirmed.length) {
    return {
      level: "basico",
      texture: { value: declared.texture, source: "declarado" },
      ...(declared.ph !== null && { phWater: { value: declared.ph, unit: "", source: "declarado" as const, note: "pH informado no cadastro simples (considerado em água)" } }),
      ...(declared.organicMatter !== null && { organicMatter: { value: declared.organicMatter, unit: "%", source: "declarado" as const } }),
      missing: KEY_PARAMS.map((k) => ({ parameter: k, why: SOIL_PARAM_MAP[k].why, criteria: SOIL_PARAM_MAP[k].criteria })),
    };
  }

  // coleta mais recente: data (sem data por último) e, no empate, última atualização
  const latest = [...confirmed].sort((a, b) => (b.date ?? "").localeCompare(a.date ?? "") || b.updatedAt.localeCompare(a.updatedAt))[0];
  const layers = confirmed
    .filter((s) => s.plot === latest.plot && s.date === latest.date)
    .sort((a, b) => (a.depthTopCm ?? 0) - (b.depthTopCm ?? 0));
  const top = layers[0];
  const firstIn = (key: SoilParamKey) => layers.map((l) => canonical(l, key)).find((v) => v !== undefined);

  const ev: SoilEvidence = {
    level: "basico",
    sample: {
      id: top.id,
      plot: top.plot,
      date: top.date,
      lab: top.lab,
      depth: layers.map(depthLabel).join(", "),
      illustrative: layers.some((l) => l.measurements.some((m) => m.origin === "exemplo")),
      layers: layers.length,
    },
    texture: { value: declared.texture, source: "declarado" },
    missing: [],
  };

  const clay = canonical(top, "argila");
  if (clay !== undefined) ev.texture = { value: textureFromClay(clay), source: "medido", note: `argila ${fmt.n0(clay)}% em ${depthLabel(top)}` };

  const phM = top.measurements.find((m) => m.parameter === "ph");
  if (phM?.method === "Água") ev.phWater = measured(phM.value, "", `pH em água, ${depthLabel(top)}`);
  else if (phM?.method === "CaCl₂")
    ev.phWater = estimated(round(phM.value + PH_CACL2_TO_WATER, 1), "", `convertido de pH CaCl₂ ${fmt.n1(phM.value)} (+${fmt.n1(PH_CACL2_TO_WATER)}, aproximação)`);
  else if (declared.ph !== null) ev.phWater = { value: declared.ph, unit: "", source: "declarado", note: phM ? "pH SMP não equivale a pH em água; usado o valor do cadastro simples" : undefined };

  const mo = canonical(top, "materia_organica");
  if (mo !== undefined) ev.organicMatter = measured(mo, "%");
  else if (declared.organicMatter !== null) ev.organicMatter = { value: declared.organicMatter, unit: "%", source: "declarado" };

  const depth = firstIn("profundidade_efetiva");
  if (depth !== undefined) ev.effectiveDepthCm = measured(depth, "cm");

  const cc = canonical(top, "cc");
  const pmp = canonical(top, "pmp");
  if (cc !== undefined && pmp !== undefined && depth !== undefined && cc > pmp) {
    const z = Math.min(depth, ROOT_ZONE_CM);
    ev.availableWaterMm = estimated(round((cc - pmp) * z * 10, 0), "mm", `(CC ${fmt.n2(cc)} − PMP ${fmt.n2(pmp)}) × ${z} cm de zona radicular`);
  }

  const v = canonical(top, "v");
  const vCalc = baseSaturation(top);
  if (v !== undefined) ev.baseSaturation = measured(v, "%");
  else if (vCalc !== undefined) ev.baseSaturation = estimated(round(vCalc, 0), "%", "calculada de Ca, Mg, K e H+Al");

  let worstM: (SoilEvidenceValue & { depth: string }) | undefined;
  for (const l of layers) {
    const m = canonical(l, "m");
    const mCalc = aluminumSaturation(l);
    const val = m ?? mCalc;
    if (val === undefined) continue;
    if (!worstM || val > worstM.value)
      worstM = { ...(m !== undefined ? measured(m, "%") : estimated(round(mCalc!, 0), "%", "calculada de Al, Ca, Mg e K")), depth: depthLabel(l) };
  }
  if (worstM) ev.aluminumSaturation = worstM;

  // o que ainda falta (RF-SOLO-09)
  const has: Partial<Record<SoilParamKey, boolean>> = {
    argila: clay !== undefined,
    ph: ev.phWater?.source !== "declarado" && !!ev.phWater,
    profundidade_efetiva: depth !== undefined,
    cc: cc !== undefined,
    pmp: pmp !== undefined,
    m: !!worstM,
    v: !!ev.baseSaturation,
    materia_organica: mo !== undefined,
  };
  ev.missing = KEY_PARAMS.filter((k) => !has[k]).map((k) => ({ parameter: k, why: SOIL_PARAM_MAP[k].why, criteria: SOIL_PARAM_MAP[k].criteria }));

  const textureAndPh = has.argila && has.ph;
  const physical = !!ev.availableWaterMm || has.profundidade_efetiva;
  const chemical = !!ev.baseSaturation || !!worstM;
  ev.level = textureAndPh && physical && chemical ? "detalhado" : textureAndPh || physical || chemical ? "intermediario" : "basico";
  return ev;
}

/** Perfil que o motor usa: o declarado, com textura, pH e M.O. substituídos pelo laudo quando houver. */
export function effectiveSoilProfile(declared: SoilProfile, ev: SoilEvidence): SoilProfile {
  return {
    ...declared,
    texture: ev.texture.value,
    ph: ev.phWater ? ev.phWater.value : declared.ph,
    organicMatter: ev.organicMatter ? ev.organicMatter.value : declared.organicMatter,
  };
}

export const LEVEL_LABEL: Record<SoilEvidence["level"], { title: string; text: string }> = {
  basico: { title: "Perfil básico", text: "Textura declarada. Análise exploratória, com mais incertezas." },
  intermediario: { title: "Perfil intermediário", text: "Parte dos dados vem de laudo; outros critérios ainda usam estimativas." },
  detalhado: {
    title: "Perfil detalhado",
    text: "Laudo com textura, fertilidade e dados hídricos. Avaliação mais específica, desde que os dados sejam representativos.",
  },
};

/* ------------------------------------------------------------------ */
/* Utilidades de formulário                                            */
/* ------------------------------------------------------------------ */

export function emptySample(propertyId: string, plot = "Talhão 1"): SoilSample {
  const now = new Date().toISOString();
  return {
    id: `soil_${Math.random().toString(36).slice(2, 10)}`,
    propertyId,
    plot,
    date: null,
    lab: "",
    depthTopCm: 0,
    depthBottomCm: 20,
    measurements: [],
    status: "rascunho",
    createdAt: now,
    updatedAt: now,
  };
}

export function upsertMeasurement(list: SoilMeasurement[], m: SoilMeasurement): SoilMeasurement[] {
  const i = list.findIndex((x) => x.parameter === m.parameter);
  if (i === -1) return [...list, m];
  const next = [...list];
  next[i] = m;
  return next;
}
