import { parseISODate, toISODate } from "@/lib/format";
import { defaultWindow, PRODUCT_START } from "@/services/nasa";

export type PeriodPreset = "30d" | "90d" | "12m" | "safra" | "custom";

export interface Period {
  preset: PeriodPreset;
  start: string;
  end: string;
}

export const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "30d", label: "30 dias" },
  { value: "90d", label: "90 dias" },
  { value: "12m", label: "12 meses" },
  { value: "safra", label: "Safra" },
  { value: "custom", label: "Personalizado" },
];

/** Último dia com dado diário esperado (hoje − latência da NASA POWER). */
export const availableEnd = () => defaultWindow().end;

const minus = (iso: string, days: number) => {
  const d = parseISODate(iso);
  d.setDate(d.getDate() - days);
  return toISODate(d);
};

/** Ano-safra brasileiro de grãos: 1º de setembro a 31 de agosto. */
export function safraStart(endISO: string) {
  const d = parseISODate(endISO);
  const y = d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}-09-01`;
}

export function safraLabel(p: Period) {
  const y = Number(p.start.slice(0, 4));
  return `${String(y).slice(2)}/${String(y + 1).slice(2)}`;
}

export function presetPeriod(preset: Exclude<PeriodPreset, "custom">): Period {
  const end = availableEnd();
  const start =
    preset === "30d" ? minus(end, 29) : preset === "90d" ? minus(end, 89) : preset === "12m" ? minus(end, 364) : safraStart(end);
  return { preset, start, end };
}

export const MAX_SPAN_DAYS = 365 * 5;

export function validatePeriod(start: string, end: string): string | null {
  if (!start || !end) return "Informe início e fim.";
  if (start > end) return "O início deve ser anterior ao fim.";
  if (start < PRODUCT_START.power) return "A NASA POWER começa em 01/01/1981.";
  if (end > availableEnd()) return `Ainda não há dados depois de ${availableEnd().split("-").reverse().join("/")} (latência de publicação).`;
  const span = (parseISODate(end).getTime() - parseISODate(start).getTime()) / 86400000;
  if (span > MAX_SPAN_DAYS) return "Escolha no máximo 5 anos por consulta.";
  return null;
}

export const periodDays = (p: Period) => Math.round((parseISODate(p.end).getTime() - parseISODate(p.start).getTime()) / 86400000) + 1;
