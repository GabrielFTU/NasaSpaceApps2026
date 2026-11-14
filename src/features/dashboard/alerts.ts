import type { DailyClimate, SoilMoistureResult, VegetationResult } from "@/types";
import { lastNDays, sum } from "./climateStats";
import { fmt, formatDate } from "@/lib/format";

export type AlertLevel = "atencao" | "alerta";
export type RuleStatus = "ativo" | "inativo" | "sem_dados";

export interface AlertEvaluation {
  id: string;
  title: string;
  criterion: string;
  variable: string;
  status: RuleStatus;
  level?: AlertLevel;
  detail?: string;
}

type Rule = (climate: DailyClimate[], vegetation: VegetationResult, soil: SoilMoistureResult) => AlertEvaluation;

const rules: Rule[] = [
  (c) => {
    const w = lastNDays(c, 30);
    const total = sum(w.map((r) => r.precip));
    const base = {
      id: "deficit",
      title: "Pouca chuva acumulada",
      criterion: "Precipitação acumulada nos últimos 30 dias abaixo de 50 mm (alerta abaixo de 25 mm).",
      variable: "PRECTOTCORR",
    };
    if (total === null || w.length < 25) return { ...base, status: "sem_dados" };
    if (total < 50)
      return { ...base, status: "ativo", level: total < 25 ? "alerta" : "atencao", detail: `${fmt.n0(total)} mm acumulados em 30 dias.` };
    return { ...base, status: "inativo", detail: `${fmt.n0(total)} mm acumulados em 30 dias.` };
  },
  (c) => {
    const w = lastNDays(c, 14);
    const base = {
      id: "chuva_intensa",
      title: "Chuva intensa concentrada",
      criterion: "Soma de 3 dias consecutivos igual ou superior a 80 mm nos últimos 14 dias.",
      variable: "PRECTOTCORR",
    };
    if (w.length < 3) return { ...base, status: "sem_dados" };
    let best = 0;
    let bestEnd = "";
    for (let i = 2; i < w.length; i++) {
      const s = (w[i].precip ?? 0) + (w[i - 1].precip ?? 0) + (w[i - 2].precip ?? 0);
      if (s > best) {
        best = s;
        bestEnd = w[i].date;
      }
    }
    if (best >= 80)
      return {
        ...base,
        status: "ativo",
        level: best >= 120 ? "alerta" : "atencao",
        detail: `${fmt.n0(best)} mm em 3 dias (até ${formatDate(bestEnd, { day: "2-digit", month: "short" })}). Atenção a erosão em solos arenosos.`,
      };
    return { ...base, status: "inativo", detail: `Maior soma em 3 dias: ${fmt.n0(best)} mm.` };
  },
  (c) => {
    const w = lastNDays(c, 14);
    const base = {
      id: "calor",
      title: "Calor intenso",
      criterion: "3 ou mais dias com temperatura máxima ≥ 34 °C nos últimos 14 dias.",
      variable: "T2M_MAX",
    };
    const valid = w.filter((r) => r.t2mMax !== null);
    if (valid.length < 7) return { ...base, status: "sem_dados" };
    const n = valid.filter((r) => r.t2mMax! >= 34).length;
    if (n >= 3) return { ...base, status: "ativo", level: n >= 6 ? "alerta" : "atencao", detail: `${n} dias com máxima ≥ 34 °C.` };
    return { ...base, status: "inativo", detail: `${n} dia(s) com máxima ≥ 34 °C.` };
  },
  (c) => {
    const w = lastNDays(c, 14);
    const base = {
      id: "geada",
      title: "Condição favorável a geada",
      criterion: "Temperatura mínima do ar a 2 m ≤ 3 °C em algum dia dos últimos 14 dias.",
      variable: "T2M_MIN",
    };
    const valid = w.filter((r) => r.t2mMin !== null);
    if (valid.length < 7) return { ...base, status: "sem_dados" };
    const min = Math.min(...valid.map((r) => r.t2mMin!));
    if (min <= 3) return { ...base, status: "ativo", level: min <= 0 ? "alerta" : "atencao", detail: `Mínima registrada: ${fmt.n1(min)} °C.` };
    return { ...base, status: "inativo", detail: `Menor mínima: ${fmt.n1(min)} °C.` };
  },
  (c) => {
    const w = lastNDays(c, 14);
    const base = {
      id: "ar_seco",
      title: "Ar seco",
      criterion: "3 ou mais dias com umidade relativa média diária < 50% nos últimos 14 dias.",
      variable: "RH2M",
    };
    const valid = w.filter((r) => r.rh !== null);
    if (valid.length < 7) return { ...base, status: "sem_dados" };
    const n = valid.filter((r) => r.rh! < 50).length;
    if (n >= 3) return { ...base, status: "ativo", level: "atencao", detail: `${n} dias com umidade média abaixo de 50%.` };
    return { ...base, status: "inativo", detail: `${n} dia(s) abaixo de 50%.` };
  },
  (_c, veg) => {
    const base = {
      id: "ndvi_queda",
      title: "Queda na cobertura vegetal",
      criterion: "NDVI caiu 0,15 ou mais entre as duas últimas composições válidas (16 dias).",
      variable: "NDVI (MODIS)",
    };
    if (veg.origin === "indisponivel") return { ...base, status: "sem_dados", detail: veg.reason };
    const valid = veg.records.filter((r) => r.ndvi !== null);
    if (valid.length < 2) return { ...base, status: "sem_dados" };
    const [prev, last] = valid.slice(-2);
    const drop = prev.ndvi! - last.ndvi!;
    const detail = `${fmt.n2(prev.ndvi!)} → ${fmt.n2(last.ndvi!)} (composição de ${formatDate(last.date)}).`;
    if (drop >= 0.15)
      return { ...base, status: "ativo", level: "atencao", detail: `${detail} Pode indicar colheita, estresse ou falha — confira em campo.` };
    return { ...base, status: "inativo", detail };
  },
  (_c, _v, soil) => {
    const base = {
      id: "solo_seco",
      title: "Solo seco",
      criterion: "Umidade superficial do SMAP (0–5 cm) abaixo de 0,10 m³/m³ na última leitura.",
      variable: "SMAP",
    };
    if (soil.origin === "indisponivel") return { ...base, status: "sem_dados", detail: soil.reason };
    const last = [...soil.records].reverse().find((r) => r.surface !== null);
    if (!last) return { ...base, status: "sem_dados" };
    const detail = `${fmt.n2(last.surface!)} m³/m³ em ${formatDate(last.date)}.`;
    if (last.surface! < 0.1) return { ...base, status: "ativo", level: last.surface! < 0.07 ? "alerta" : "atencao", detail };
    return { ...base, status: "inativo", detail };
  },
];

export function evaluateAlerts(climate: DailyClimate[], vegetation: VegetationResult, soil: SoilMoistureResult): AlertEvaluation[] {
  return rules.map((r) => r(climate, vegetation, soil));
}
