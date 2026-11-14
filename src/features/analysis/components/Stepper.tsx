import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export function Stepper({ steps, current, onSelect }: { steps: string[]; current: number; onSelect: (i: number) => void }) {
  return (
    <ol className="flex gap-1 overflow-x-auto pb-1 sm:gap-2" aria-label="Etapas da análise">
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
              className={cn(
                "flex items-center gap-1.5 text-left text-xs font-medium whitespace-nowrap",
                active ? "text-foreground" : done ? "cursor-pointer text-primary hover:underline" : "text-subtle-foreground",
              )}
            >
              <span
                className={cn(
                  "flex size-4 shrink-0 items-center justify-center rounded-full text-[10px]",
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
  );
}
