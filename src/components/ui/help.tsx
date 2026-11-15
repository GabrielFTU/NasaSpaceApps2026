import { useId, useState, type ReactNode } from "react";
import { CircleHelp } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Ajuda curta no lugar da dúvida ("O que é um talhão?").
 * Abre por toque, clique ou teclado (Enter/Espaço) e mostra o texto logo abaixo, no fluxo da página —
 * sem tooltip de hover, que não existe no celular, e sem cobrir outros campos.
 */
export function HelpTip({ question, children, className }: { question: string; children: ReactNode; className?: string }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return (
    <div className={cn("text-[13px]", className)}>
      <button
        type="button"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-6 cursor-pointer items-center gap-1 rounded-sm font-medium text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <CircleHelp className="size-3.5 shrink-0" aria-hidden />
        {question}
      </button>
      {open && (
        <div id={id} className="animate-in mt-1.5 rounded-md bg-primary-soft/60 px-3 py-2 leading-relaxed text-primary-soft-foreground">
          {children}
        </div>
      )}
    </div>
  );
}
