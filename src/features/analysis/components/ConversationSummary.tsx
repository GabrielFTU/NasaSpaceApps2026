import type { ReactNode } from "react";
import { Check, CircleAlert, Info, PencilLine, Sprout } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DRAINAGE_LABEL, PRIORITY_LABEL, SOIL_TEXTURE_LABEL } from "@/data/crops";
import { cn } from "@/lib/utils";
import type { PriorityKey, Property } from "@/types";
import type { ConvState, CropEntry, Readiness } from "../conversation/tools";

function Row({ label, done, source, children }: { label: string; done: boolean; source?: string; children: ReactNode }) {
  return (
    <div className="flex gap-3 py-3">
      <span className={cn("mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full transition-colors", done ? "bg-primary text-white" : "bg-muted ring-1 ring-border")}>
        {done && <Check className="size-3" />}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center justify-between gap-2 text-[12px] font-medium text-muted-foreground">
          {label}
          {source && <span className="rounded-full bg-muted px-1.5 py-px text-[10px] font-medium text-subtle-foreground">{source}</span>}
        </p>
        <div className="mt-0.5 text-[13.5px]">{children}</div>
      </div>
    </div>
  );
}

const pending = <span className="text-subtle-foreground">a conversar</span>;

/** Cultura como chip: foto quando é do catálogo; aviso quando não tem parâmetros. */
function CropChip({ c }: { c: CropEntry }) {
  return (
    <span
      className={cn("inline-flex items-center gap-1.5 rounded-full py-0.5 pl-0.5 pr-2.5 text-[12px] font-medium", c.id ? "bg-muted" : "bg-warning-soft text-warning")}
      title={c.id ? undefined : c.note}
    >
      {c.id ? (
        <img src={`/culturas/${c.id}.jpg`} alt="" className="size-5 rounded-full object-cover" onError={(e) => (e.currentTarget.style.visibility = "hidden")} />
      ) : (
        <CircleAlert className="ml-1 size-3.5" />
      )}
      {c.name}
    </span>
  );
}

/**
 * Resumo ao vivo do que o assistente entendeu, com a origem de cada dado.
 * O agricultor acompanha e pode corrigir na conversa, sem recomeçar.
 */
export function ConversationSummary(p: {
  state: ConvState;
  property: Property | null;
  readiness: Readiness;
  generating: boolean;
  error: string | null;
  onGenerate: () => void;
  onEdit: () => void;
}) {
  const s = p.state;
  const r = p.readiness;
  const checks = [!!s.propertyId, !!s.verao, !!s.inverno, s.candidates.length > 0, s.soilConfirmed, !!s.priorities];
  const done = checks.filter(Boolean).length;
  const limitations = [...r.partial, ...r.notes];

  return (
    <aside className="rounded-xl bg-white p-4 shadow-card ring-1 ring-border lg:sticky lg:top-20">
      <div className="flex items-center justify-between">
        <h2 className="text-[15px] font-semibold">O que entendi até agora</h2>
        <span className="text-[12px] text-muted-foreground">
          {done}/{checks.length}
        </span>
      </div>
      <div className="mt-2 h-1 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-gradient-to-r from-primary to-brand-lime transition-all duration-500" style={{ width: `${(done / checks.length) * 100}%` }} />
      </div>

      <div className="mt-1 divide-y divide-border">
        <Row label="Propriedade" done={!!s.propertyId}>
          {p.property ? (
            <>
              <strong className="font-semibold">{p.property.name}</strong>
              <span className="text-muted-foreground"> · {p.property.city}/{p.property.state}</span>
            </>
          ) : (
            pending
          )}
        </Row>
        <Row label="Planta hoje" done={!!s.verao && !!s.inverno} source={s.verao || s.inverno ? "você contou" : undefined}>
          {s.verao || s.inverno ? (
            <div className="flex flex-col gap-1">
              <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">Verão {s.verao ? <CropChip c={s.verao} /> : pending}</span>
              <span className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">Inverno {s.inverno ? <CropChip c={s.inverno} /> : pending}</span>
            </div>
          ) : (
            pending
          )}
        </Row>
        <Row label="Quer comparar" done={s.candidates.length > 0}>
          {s.candidates.length ? (
            <div className="flex flex-wrap gap-1">
              {s.candidates.map((c) => (
                <CropChip key={c.name} c={c} />
              ))}
            </div>
          ) : (
            pending
          )}
        </Row>
        <Row
          label="Solo"
          done={s.soilConfirmed}
          source={s.soil ? (s.soilChanged.length ? "corrigido por você" : s.soilSource === "laudo" ? "análise de laboratório" : "cadastro") : undefined}
        >
          {s.soil ? (
            <span>
              {SOIL_TEXTURE_LABEL[s.soil.texture]}, drenagem {DRAINAGE_LABEL[s.soil.drainage].toLowerCase()}
              {s.soil.erosionHistory && ", já teve erosão"}
              {!s.soilConfirmed && <span className="block text-[12px] text-subtle-foreground">falta você confirmar</span>}
            </span>
          ) : (
            pending
          )}
        </Row>
        <Row label="O que importa" done={!!s.priorities}>
          {s.priorities ? (
            <div className="space-y-1">
              {s.prioritiesNote && <p className="text-[12.5px] italic text-muted-foreground">“{s.prioritiesNote}”</p>}
              {(Object.keys(s.priorities) as PriorityKey[]).map((k) => (
                <div key={k} className="flex items-center gap-2 text-[12px]">
                  <span className="w-28 truncate text-muted-foreground">{PRIORITY_LABEL[k]}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-primary" style={{ width: `${(s.priorities![k] / 5) * 100}%` }} />
                  </span>
                </div>
              ))}
            </div>
          ) : (
            pending
          )}
        </Row>
      </div>

      {(limitations.length > 0 || s.unknown.length > 0) && (
        <div className="mb-3 rounded-[10px] bg-muted/70 px-3 py-2.5 text-[12px] text-muted-foreground">
          <p className="mb-1 flex items-center gap-1.5 font-semibold text-foreground">
            <Info className="size-3.5" /> Limitações da análise
          </p>
          <ul className="list-disc space-y-0.5 pl-4">
            {limitations.map((l) => (
              <li key={l}>{l}</li>
            ))}
            {s.unknown.map((u) => (
              <li key={u}>não sabe: {u}</li>
            ))}
          </ul>
        </div>
      )}

      {p.error && <p className="mb-2 text-[12.5px] text-danger">{p.error}</p>}
      <div className="flex flex-col gap-2">
        <Button onClick={p.onGenerate} loading={p.generating} disabled={r.blocking.length > 0} title={r.blocking.join("; ") || undefined}>
          {!p.generating && <Sprout />} {r.partial.length ? "Explorar mesmo assim" : "Explorar três estratégias"}
        </Button>
        {r.blocking.length > 0 && <p className="text-center text-[11.5px] text-subtle-foreground">Continue a conversa para liberar a comparação.</p>}
        <Button variant="ghost" size="sm" onClick={p.onEdit}>
          <PencilLine /> Revisar no formulário
        </Button>
      </div>
    </aside>
  );
}
