import type { ReactNode } from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";
import { Sparkline } from "@/components/charts";
import { Skeleton } from "@/components/ui/misc";
import type { DataOrigin } from "@/types";

interface KpiTileProps {
  label: string;
  icon: ReactNode;
  value: string;
  unit: string;
  delta?: { value: number; text: string } | null;
  caption: string;
  spark?: { v: number | null }[];
  sparkKind?: "area" | "bar";
  color: string;
  origin?: DataOrigin;
  loading?: boolean;
}

const ORIGIN_TEXT: Record<DataOrigin, string> = { real: "NASA", simulado: "simulado", indisponivel: "indisponível" };

export function KpiTile({ label, icon, value, unit, delta, caption, spark, sparkKind, color, origin, loading }: KpiTileProps) {
  return (
    <div className="flex items-start gap-3 rounded-lg border border-border bg-white p-4 shadow-card">
      <span className="mt-0.5 shrink-0 [&_svg]:size-7" style={{ color }}>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-[13px] text-muted-foreground">
          {label}
          {origin && origin !== "real" && (
            <span className="rounded bg-warning-soft px-1 text-[10px] font-medium uppercase tracking-wide text-warning">{ORIGIN_TEXT[origin]}</span>
          )}
        </p>
        {loading ? (
          <Skeleton className="mt-1.5 h-7 w-24" />
        ) : (
          <p className="mt-0.5 text-[26px] font-bold leading-tight tracking-tight">
            {value}
            <span className="ml-1 text-base font-semibold">{unit}</span>
          </p>
        )}
        <div className="mt-1 flex items-end justify-between gap-2">
          <div className="min-w-0 text-xs">
            {delta && !loading && (
              <p className="flex items-center gap-0.5 font-semibold text-foreground">
                {delta.value > 0 ? <ArrowUp className="size-3.5" /> : delta.value < 0 ? <ArrowDown className="size-3.5" /> : <Minus className="size-3.5" />}
                {delta.text}
              </p>
            )}
            <p className="text-muted-foreground">{caption}</p>
          </div>
          {spark && !loading && <Sparkline data={spark} color={color} kind={sparkKind} />}
        </div>
      </div>
    </div>
  );
}
