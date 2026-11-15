import { useState } from "react";
import { Link } from "react-router-dom";
import { Check, ChevronRight, X } from "lucide-react";
import { useAppStore } from "@/app/store";
import { cn } from "@/lib/utils";
import type { Property } from "@/types";

const KEY = "semeia:primeiros-passos-ocultos";
const readHidden = () => {
  try {
    return localStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
};

/**
 * Primeiros passos: guia opcional e retomável. O progresso vem dos próprios dados
 * (não de um tutorial que precise ser "assistido"), então quem já sabe usar nem vê o que já fez.
 */
export function FirstSteps({ property }: { property: Property }) {
  const plots = useAppStore((s) => s.plots.filter((p) => p.propertyId === property.id && !p.demo).length);
  const hasSoil = useAppStore((s) => property.soil.ph !== null || s.soilSamples.some((x) => x.propertyId === property.id && x.status !== "rascunho"));
  const analyses = useAppStore((s) => s.analyses.some((a) => a.propertyId === property.id));
  const [hidden, setHidden] = useState(readHidden);

  const steps = [
    { done: true, label: "Cadastrar a propriedade", hint: `${property.name} já está no Semeia`, to: "/propriedades" },
    { done: plots > 0, label: "Marcar seus talhões no mapa", hint: "Cada pedaço que você planta de um jeito", to: "/mapa" },
    { done: hasSoil, label: "Contar como é o seu solo", hint: "pH ou análise de solo, se tiver", to: `/propriedades/${property.id}/editar` },
    { done: analyses, label: "Comparar rotações", hint: "Sua rotação de hoje contra outras opções", to: `/analise?propriedade=${property.id}` },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  if (hidden || doneCount === steps.length) return null;
  const next = steps.findIndex((s) => !s.done);

  return (
    <section aria-labelledby="primeiros-passos" className="rounded-lg border border-border bg-surface p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 id="primeiros-passos" className="text-[15px] font-semibold">
            Primeiros passos
          </h2>
          <p className="text-[13px] text-muted-foreground">
            {doneCount} de {steps.length} feitos · pode seguir em qualquer ordem
          </p>
        </div>
        <button
          type="button"
          onClick={() => {
            setHidden(true);
            try {
              localStorage.setItem(KEY, "1");
            } catch {
              /* sem storage: some só nesta visita */
            }
          }}
          className="flex size-8 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-label="Esconder primeiros passos"
          title="Esconder"
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="mt-3 h-1 overflow-hidden rounded-full bg-muted" aria-hidden>
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ol className="mt-3 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((s, i) => (
          <li key={s.label}>
            <Link
              to={s.to}
              className={cn(
                "flex min-h-14 items-center gap-3 rounded-md border px-3 py-2 transition-colors",
                i === next ? "border-primary bg-primary-soft/50 hover:bg-primary-soft" : "border-border hover:bg-muted/60",
              )}
            >
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-[12px] font-bold",
                  s.done ? "bg-primary text-white" : i === next ? "border-2 border-primary text-primary" : "border border-input text-muted-foreground",
                )}
                aria-hidden
              >
                {s.done ? <Check className="size-3.5" /> : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block text-sm font-medium", s.done && "text-muted-foreground line-through decoration-1")}>{s.label}</span>
                <span className="block text-xs text-muted-foreground">
                  <span className="sr-only">{s.done ? "Feito. " : i === next ? "Próximo passo. " : ""}</span>
                  {s.hint}
                </span>
              </span>
              {!s.done && <ChevronRight className="size-4 shrink-0 text-muted-foreground" aria-hidden />}
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}
