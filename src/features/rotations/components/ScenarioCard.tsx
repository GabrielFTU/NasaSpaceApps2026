import { useState } from "react";
import { ChevronDown, CircleCheck, CircleMinus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CROP_MAP, PRIORITY_LABEL, cropName } from "@/data/crops";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import type { Compatibility, PriorityKey, ScenarioResult } from "@/types";
import { ScenarioSummary } from "./ScenarioSummary";
import { ZarcBadge } from "@/features/zarc/ZarcCalendar";

const COMPAT: Record<Compatibility, { label: string; variant: "success" | "warning" | "danger" }> = {
  alta: { label: "Alta", variant: "success" },
  media: { label: "Média", variant: "warning" },
  baixa: { label: "Baixa", variant: "danger" },
};

/** Cartão de cenário: resumo sempre visível + detalhes sob demanda. */
export function ScenarioCard({ scenario, highlight, topPriorities }: { scenario: ScenarioResult; highlight?: boolean; topPriorities?: PriorityKey[] }) {
  const [open, setOpen] = useState(false);
  return (
    <ScenarioSummary scenario={scenario} highlight={highlight} topPriorities={topPriorities}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="mt-4 flex cursor-pointer items-center justify-center gap-1 rounded-md border border-border py-2 text-[13px] font-medium hover:bg-muted"
      >
        {open ? "Ocultar detalhes" : "Ver detalhes"}
        <ChevronDown className={cn("size-4 transition-transform", open && "rotate-180")} />
      </button>
      {open && <ScenarioDetails scenario={scenario} />}
    </ScenarioSummary>
  );
}

function ScenarioDetails({ scenario }: { scenario: ScenarioResult }) {
  return (
    <div className="animate-in mt-4 flex flex-col gap-4 text-[13px]">
      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Sequência e compatibilidade</h4>
        <ul className="flex flex-col gap-2">
          {scenario.slots.map((s, i) => {
            const crop = CROP_MAP[s.cropId];
            return (
              <li key={i} className="rounded-md bg-muted/70 px-3 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span>
                    <span className="text-muted-foreground">{s.slot} · </span>
                    <strong>{cropName(s.cropId)}</strong>
                    {crop?.role === "cobertura" && <span className="text-muted-foreground"> (cobertura)</span>}
                  </span>
                  <span className="flex shrink-0 items-center gap-1">
                    <ZarcBadge zarc={s.zarc} />
                    {crop && <Badge variant={COMPAT[s.compatibility].variant}>{COMPAT[s.compatibility].label}</Badge>}
                  </span>
                </div>
                {s.waterNeedMm && (
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Precisa de {s.waterNeedMm[0]}–{s.waterNeedMm[1]} mm · choveu {fmt.n0(s.seasonPrecipMm)} mm na estação
                  </p>
                )}
                {s.notes.length > 1 && (
                  <ul className="mt-1 list-disc pl-4 text-xs text-muted-foreground">
                    {s.notes.slice(1).map((n) => (
                      <li key={n}>{n}</li>
                    ))}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Benefícios</h4>
        <ul className="flex flex-col gap-1.5">
          {scenario.benefits.length ? (
            scenario.benefits.map((b) => (
              <li key={b} className="flex gap-2">
                <CircleCheck className="mt-0.5 size-3.5 shrink-0 text-success" />
                {b}
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">Nenhum identificado pelas regras.</li>
          )}
        </ul>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Limitações</h4>
        <ul className="flex flex-col gap-1.5">
          {scenario.limitations.length ? (
            scenario.limitations.map((l) => (
              <li key={l} className="flex gap-2">
                <CircleMinus className="mt-0.5 size-3.5 shrink-0 text-warning" />
                {l}
              </li>
            ))
          ) : (
            <li className="text-muted-foreground">Nenhuma identificada pelas regras.</li>
          )}
        </ul>
      </section>

      <section>
        <h4 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Regras aplicadas</h4>
        <div className="flex flex-col gap-2.5">
          {(Object.keys(PRIORITY_LABEL) as PriorityKey[]).map((k) => (
            <div key={k}>
              <p className="mb-0.5 text-xs font-medium">
                {PRIORITY_LABEL[k]} = {scenario.indicators[k]}
              </p>
              <ul className="flex flex-col gap-0.5 text-xs">
                {scenario.rules
                  .filter((r) => r.indicator === k)
                  .map((r) => (
                    <li key={r.description} className="flex justify-between gap-3">
                      <span className="text-muted-foreground">{r.description}</span>
                      <span className={cn("tabular shrink-0 font-medium", r.points < 0 && "text-danger")}>
                        {k === "agua" || r.points === 0 ? (r.points || "—") : r.points > 0 ? `+${r.points}` : r.points}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
