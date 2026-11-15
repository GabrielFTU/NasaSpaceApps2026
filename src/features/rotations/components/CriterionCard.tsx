import { useState } from "react";
import { ChevronDown, RotateCcw } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { CROP_MAP, FALLOW_ID, PRIORITY_LABEL, cropName } from "@/data/crops";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import type { Compatibility, PriorityKey, ScenarioResult } from "@/types";
import { SLOT_LABELS, slotOptions, type Candidate, type Sequence } from "../engine";
import { CROP_DIFFICULTY, DIFFICULTY_LABEL, instabilityLevel, type Difficulty } from "../economics";
import { SCENARIO_COLOR } from "./ScenarioSummary";

const brl = (v: number) => `${v < 0 ? "−" : ""}R$ ${fmt.n0(Math.abs(Math.round(v)))}`;
const brlCompact = (v: number) => {
  const a = Math.abs(v);
  const s = a >= 1e6 ? `${fmt.n1(a / 1e6)} mi` : a >= 1e3 ? `${fmt.n0(a / 1e3)} mil` : fmt.n0(a);
  return `${v < 0 ? "−" : ""}R$ ${s}`;
};

const COMPAT_DOT: Record<Compatibility, string> = { alta: "bg-success", media: "bg-[#d99a00]", baixa: "bg-danger" };
const COMPAT_LABEL: Record<Compatibility, string> = { alta: "Compatibilidade alta", media: "Compatibilidade média", baixa: "Compatibilidade baixa" };
const TONE = { good: "text-success", mid: "text-warning", bad: "text-danger" } as const;
const BAR = { good: "bg-success", mid: "bg-[#d99a00]", bad: "bg-danger" } as const;
const SHORT: Record<PriorityKey, string> = { conservacao: "Solo", agua: "Água", produtividade: "Produtiv.", diversificacao: "Diversid." };

interface Props {
  scenario: ScenarioResult;
  /** Lucro/ha/ano da rotação atual, para mostrar a diferença. */
  baseline?: number;
  areaHa: number;
  edited: boolean;
  onReplace: (slot: number, cropId: string) => void;
  onReset: () => void;
  /** Ranking do critério (o card mostra as que não estão em uso). */
  alternatives?: Candidate[];
  onPick?: (seq: Sequence) => void;
  /** Rotação apontada como sugestão entre os critérios. */
  recommended?: boolean;
}

// por extenso: "V1/I1" era um código que o agricultor precisava decifrar
const SLOT_SHORT = ["Verão 1", "Inverno 1", "Verão 2", "Inverno 2"];
const DIFF_TONE: Record<Difficulty, string> = { 1: "text-success", 2: "text-warning", 3: "text-danger" };
/** "Soja → Milho · Soja → Trigo" (ano 1 · ano 2), sem repetir anual. */
const shortSeq = (seq: string[]) =>
  [seq.slice(0, 2), seq.slice(2, 4)]
    .map(([a, b]) => (a === b ? cropName(a) : `${cropName(a)} → ${b === FALLOW_ID ? "pousio" : cropName(b)}`))
    .join(" · ");

export function CriterionCard({ scenario: s, baseline, areaHa, edited, onReplace, onReset, alternatives, onPick, recommended }: Props) {
  const [open, setOpen] = useState(false);
  const m = s.economics!;
  const lvl = instabilityLevel(m.instability);
  const delta = baseline === undefined ? null : m.netPerYear - baseline;
  const color = SCENARIO_COLOR[s.key];
  const isCurrent = s.key === "atual";

  return (
    <article
      className={cn(
        "relative flex flex-col rounded-lg border bg-surface p-5",
        isCurrent ? "border-dashed border-input" : recommended ? "border-primary shadow-card ring-1 ring-primary" : "border-border shadow-card",
      )}
    >
      {recommended && (
        <span className="absolute -top-2.5 left-5 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary-foreground">
          Sugestão
        </span>
      )}
      {/* Critério */}
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-[13px] font-semibold">
            <span className="size-2 rounded-full" style={{ background: color }} />
            {s.label}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">{s.focus}</p>
        </div>
        {edited && (
          <button
            type="button"
            onClick={onReset}
            title="Voltar à sugestão do motor"
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="size-3" /> Editada
          </button>
        )}
      </header>

      {/* Dinheiro */}
      <div className="mt-5">
        <p className="text-[11px] font-medium uppercase tracking-wide text-subtle-foreground">Lucro estimado</p>
        <p className="tabular mt-1 font-display text-[30px] font-bold leading-none tracking-tight">
          {brl(m.netPerYear)}
          <span className="ml-1 text-sm font-medium text-muted-foreground">/ha·ano</span>
        </p>
        <p className="tabular mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
          <span>{brlCompact(m.netPerYear * areaHa)}/ano na área</span>
          {delta !== null && Math.round(delta) !== 0 && (
            <span className={cn("font-semibold", delta > 0 ? "text-success" : "text-danger")}>
              {delta > 0 ? "+" : "−"}
              {brl(Math.abs(delta)).replace("−", "")} vs atual
            </span>
          )}
        </p>
      </div>

      {/* Risco e manejo */}
      <div className="mt-4 grid grid-cols-3 gap-3 border-y border-border py-3">
        <div>
          <p className="text-[11px] text-muted-foreground">Instabilidade</p>
          <p className={cn("text-sm font-semibold", TONE[lvl.tone])}>
            {lvl.label} <span className="tabular text-[11px] font-normal text-muted-foreground">{m.instability}</span>
          </p>
          <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
            <div className={cn("h-full rounded-full", BAR[lvl.tone])} style={{ width: `${m.instability}%` }} />
          </div>
        </div>
        <div title="Lucro por ha num ano ruim — cerca de 1 em cada 10 anos">
          <p className="text-[11px] text-muted-foreground">Ano ruim</p>
          <p className={cn("tabular text-sm font-semibold", m.badYearNet < 0 && "text-danger")}>{brl(m.badYearNet)}</p>
          <p className="text-[11px] text-subtle-foreground">/ha · 1 em 10</p>
        </div>
        <div title={m.difficulty.cropId ? `${cropName(m.difficulty.cropId)}: ${m.difficulty.why}` : "Só culturas de estrutura comum"}>
          <p className="text-[11px] text-muted-foreground">Manejo</p>
          <p className={cn("text-sm font-semibold", DIFF_TONE[m.difficulty.level])}>{DIFFICULTY_LABEL[m.difficulty.level]}</p>
          <p className="truncate text-[11px] text-subtle-foreground">{m.difficulty.cropId ? cropName(m.difficulty.cropId) : "estrutura comum"}</p>
        </div>
      </div>

      {/* Sequência editável */}
      <ol className="mt-2 flex flex-col">
        {s.sequence.map((id, i) => {
          const slot = s.slots[i];
          const e = m.slots[i];
          const c = CROP_MAP[id];
          if (e.skipped)
            return (
              <li key={i} className="flex h-9 items-center gap-2 pl-[60px] text-xs text-subtle-foreground">
                ↳ {cropName(id)} continua
              </li>
            );
          const zarcFlag = slot.zarc && (!slot.zarc.zoned ? "fora do ZARC" : (slot.zarc.minRisk ?? 0) >= 30 ? `risco ${slot.zarc.minRisk}%` : null);
          return (
            <li key={i} className="flex h-9 items-center gap-2">
              <span className="w-[52px] shrink-0 text-[11px] font-medium leading-tight text-subtle-foreground" title={SLOT_LABELS[i]}>
                {SLOT_SHORT[i]}
              </span>
              <span
                className={cn("size-1.5 shrink-0 rounded-full", c ? COMPAT_DOT[slot.compatibility] : "bg-input")}
                title={c ? `${COMPAT_LABEL[slot.compatibility]}${slot.zarc?.zoned ? ` · ZARC ${slot.zarc.minRisk}%` : ""}` : "Sem cultivo"}
              />
              <div className="min-w-0 flex-1">
                <Dropdown
                  aria-label={`Cultura — ${SLOT_LABELS[i]}`}
                  value={id}
                  onChange={(v) => onReplace(i, v)}
                  menuClassName="w-56"
                  className="rounded-md px-1.5 py-1 text-[13px] font-medium transition-colors hover:bg-muted"
                  options={slotOptions(i).map((o) => ({
                    value: o,
                    label: o === FALLOW_ID ? "Pousio" : cropName(o),
                    hint:
                      o === FALLOW_ID
                        ? "sem cultivo"
                        : [CROP_MAP[o]?.role === "cobertura" ? "cobertura · só custo" : null, CROP_DIFFICULTY[o] ? `manejo ${DIFFICULTY_LABEL[CROP_DIFFICULTY[o].level].toLowerCase()}` : null]
                            .filter(Boolean)
                            .join(" · ") || undefined,
                  }))}
                >
                  {id === FALLOW_ID ? "Pousio" : cropName(id)}
                  {zarcFlag && (
                    <span className={cn("ml-1.5 text-[11px] font-normal", slot.zarc?.zoned ? "text-warning" : "text-danger")} title={slot.zarc?.windows || "sem Proagro/seguro"}>
                      {zarcFlag}
                    </span>
                  )}
                </Dropdown>
              </div>
              <span
                className={cn("tabular w-[68px] shrink-0 text-right text-xs", e.net < 0 ? "text-muted-foreground" : "font-medium")}
                title={e.econ ? `Receita ${brl(e.revenue)} − custo ${brl(e.cost)}${e.why.length ? ` · ${e.why.join(", ")}` : ""}` : undefined}
              >
                {e.econ ? brl(e.net) : "—"}
              </span>
            </li>
          );
        })}
      </ol>

      {/* Outras opções do mesmo critério */}
      {alternatives && alternatives.filter((a) => a.seq.join() !== s.sequence.join()).length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="mb-1 flex justify-between gap-2 text-[11px] text-muted-foreground">
            Outras opções <span>lucro/ha · instabilidade</span>
          </p>
          <ul>
            {alternatives
              .filter((a) => a.seq.join() !== s.sequence.join())
              .slice(0, 3)
              .map((a) => (
                <li key={a.seq.join()}>
                  <button
                    type="button"
                    onClick={() => onPick?.(a.seq)}
                    title="Usar esta rotação no cartão"
                    className="flex w-full cursor-pointer items-start gap-2 rounded-md px-1.5 py-1 text-left text-xs leading-snug transition-colors hover:bg-muted"
                  >
                    <span className="min-w-0 flex-1 break-words">{shortSeq(a.seq)}</span>
                    <span className="tabular shrink-0 font-medium">{brlCompact(a.net)}</span>
                    <span className={cn("tabular w-6 shrink-0 text-right text-[11px]", TONE[instabilityLevel(a.inst).tone])} title={`Instabilidade ${instabilityLevel(a.inst).label.toLowerCase()} (${a.inst} de 100)`}>
                      {a.inst}
                    </span>
                  </button>
                </li>
              ))}
          </ul>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-3 flex cursor-pointer items-center gap-1 self-start text-xs font-medium text-muted-foreground hover:text-foreground"
      >
        Detalhes técnicos <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </button>

      {open && <Details s={s} />}
    </article>
  );
}

/** Detalhes técnicos em formato curto: números e etiquetas, sem parágrafos. */
function Details({ s }: { s: ScenarioResult }) {
  const [rules, setRules] = useState(false);
  return (
    <div className="animate-in mt-3 space-y-4 text-xs">
      {/* índices agronômicos */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2">
        {(Object.keys(PRIORITY_LABEL) as PriorityKey[]).map((k) => (
          <div key={k}>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{SHORT[k]}</span>
              <span className="tabular font-semibold">{s.indicators[k]}</span>
            </div>
            <div className="mt-1 h-1 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-foreground/70" style={{ width: `${s.indicators[k]}%` }} />
            </div>
          </div>
        ))}
      </div>

      {/* água e janela por posição */}
      <table className="w-full">
        <thead>
          <tr className="text-left text-[10px] uppercase tracking-wide text-subtle-foreground">
            <th className="pb-1 font-medium">Posição</th>
            <th className="pb-1 text-right font-medium">Chuva / precisa</th>
            <th className="pb-1 text-right font-medium">Rend.</th>
          </tr>
        </thead>
        <tbody>
          {s.slots.map((sl, i) => {
            const e = s.economics?.slots[i];
            if (!sl.waterNeedMm || e?.skipped) return null;
            const ok = sl.seasonPrecipMm >= (sl.waterNeedMm[0] + sl.waterNeedMm[1]) / 2 * 0.8;
            return (
              <tr key={i} className="border-t border-border">
                <td className="py-1.5">{cropName(sl.cropId)}</td>
                <td className={cn("tabular py-1.5 text-right", !ok && "text-danger")}>
                  {fmt.n0(sl.seasonPrecipMm)} / {sl.waterNeedMm[0]}–{sl.waterNeedMm[1]} mm
                </td>
                <td className="tabular py-1.5 text-right text-muted-foreground" title={e?.why.join(", ")}>
                  {e?.econ?.yield ? `${e.factor >= 1 ? "+" : "−"}${fmt.n0(Math.abs(e.factor - 1) * 100)}%` : "—"}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* pontos fortes e de atenção */}
      {(s.benefits.length > 0 || s.limitations.length > 0) && (
        <div className="flex flex-wrap gap-1.5">
          {s.benefits.map((b) => (
            <span key={b} className="rounded-full bg-primary-soft px-2 py-0.5 text-[11px] text-primary-soft-foreground">
              {b}
            </span>
          ))}
          {s.limitations.map((l) => (
            <span key={l} className="rounded-full bg-warning-soft px-2 py-0.5 text-[11px] text-warning">
              {l}
            </span>
          ))}
        </div>
      )}

      <button type="button" onClick={() => setRules((v) => !v)} className="cursor-pointer text-[11px] text-muted-foreground underline-offset-2 hover:underline">
        {rules ? "Ocultar cálculo dos índices" : "Ver cálculo dos índices"}
      </button>
      {rules && (
        <div className="grid gap-3">
          {(Object.keys(PRIORITY_LABEL) as PriorityKey[]).map((k) => (
            <div key={k}>
              <p className="mb-1 font-medium">
                {SHORT[k]} <span className="tabular text-muted-foreground">= {s.indicators[k]}</span>
              </p>
              <ul className="space-y-0.5">
                {s.rules
                  .filter((r) => r.indicator === k && r.points !== 0)
                  .map((r) => (
                    <li key={r.description} className="flex justify-between gap-3 text-[11px]">
                      <span className="truncate text-muted-foreground" title={r.description}>
                        {r.description}
                      </span>
                      <span className={cn("tabular shrink-0", r.points < 0 && "text-danger")}>{k === "agua" ? r.points : r.points > 0 ? `+${r.points}` : r.points}</span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
