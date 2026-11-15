import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stepper({ steps, current, onSelect }: { steps: string[]; current: number; onSelect: (i: number) => void }) {
  return (
    <nav aria-label="Etapas da análise">
      {/* no celular os nomes não cabem lado a lado: mostra a etapa atual por extenso */}
      <p className="mb-2 text-sm font-medium sm:hidden">
        Etapa {current + 1} de {steps.length} · <span className="text-primary">{steps[current]}</span>
        {current < steps.length - 1 && <span className="font-normal text-muted-foreground"> · depois: {steps[current + 1]}</span>}
      </p>
      <ol className="flex gap-1 pb-1 sm:gap-2">
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          return (
            <li key={label} className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className={cn("h-1 rounded-full", done || active ? "bg-primary" : "bg-border")} />
              <button
                type="button"
                disabled={!done}
                onClick={() => onSelect(i)}
                aria-current={active ? "step" : undefined}
                aria-label={`Etapa ${i + 1}: ${label}${done ? " (concluída — voltar)" : active ? " (atual)" : ""}`}
                className={cn(
                  "flex min-h-6 items-center gap-1.5 rounded-sm text-left text-xs font-medium whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                  active ? "text-foreground" : done ? "cursor-pointer text-primary hover:underline" : "text-subtle-foreground",
                )}
              >
                <span
                  aria-hidden
                  className={cn(
                    "flex size-5 shrink-0 items-center justify-center rounded-full text-[11px]",
                    done ? "bg-primary text-primary-foreground" : active ? "border border-primary text-primary" : "border border-input",
                  )}
                >
                  {done ? <Check className="size-3" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
