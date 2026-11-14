import { CircleCheck, Droplets, Layers, Shapes, Sprout } from "lucide-react";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { PRIORITY_LABEL, cropName } from "@/data/crops";
import { cn } from "@/lib/utils";
import type { PriorityKey, ScenarioResult } from "@/types";

/** Cores fixas por cenário — usadas em anéis, barras e legendas. */
export const SCENARIO_COLOR: Record<ScenarioResult["key"], string> = {
  atual: "#e5a000",
  a: "#1d8a34",
  b: "#2a78d6",
};

export const INDICATOR_ICON: Record<PriorityKey, ReactNode> = {
  agua: <Droplets />,
  conservacao: <Layers />,
  diversificacao: <Shapes />,
  produtividade: <Sprout />,
};

const SHORT: Record<PriorityKey, string> = {
  agua: "Água",
  conservacao: "Solo",
  diversificacao: "Diversidade",
  produtividade: "Produtividade",
};

export function ScoreRing({ value, color, size = 76 }: { value: number; color: string; size?: number }) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }} role="img" aria-label={`Índice ${value} de 100`}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#edf0ea" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - value / 100)}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
        <span className="text-[22px] font-bold tracking-tight">{value}</span>
        <span className="text-[10px] text-muted-foreground">/100</span>
      </div>
    </div>
  );
}

const TAG: Record<ScenarioResult["key"], string> = { atual: "Atual", a: "Alternativa A", b: "Alternativa B" };

interface Props {
  scenario: ScenarioResult;
  highlight?: boolean;
  topPriorities?: PriorityKey[];
  compact?: boolean;
  children?: ReactNode;
}

/** Resumo visual de um cenário: anel com índice ponderado + barras dos quatro indicadores. */
export function ScenarioSummary({ scenario, highlight, topPriorities, compact, children }: Props) {
  const color = SCENARIO_COLOR[scenario.key];
  return (
    <div className={cn("flex flex-col rounded-lg border bg-white p-4", highlight ? "border-primary ring-1 ring-primary" : "border-border")}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Badge variant={highlight ? "primary" : "neutral"} className={highlight ? "bg-primary text-white" : ""}>
            {TAG[scenario.key]}
          </Badge>
          <p className="mt-2 text-[15px] font-semibold leading-snug">
            {scenario.sequence
              .filter((id, i, arr) => !(i % 2 === 1 && arr[i - 1] === id))
              .map(cropName)
              .join(" → ")}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground">2 anos · verão e inverno</p>
        </div>
        <ScoreRing value={scenario.overall} color={color} size={compact ? 68 : 76} />
      </div>
      <dl className="mt-4 flex flex-col gap-2.5">
        {(Object.keys(PRIORITY_LABEL) as PriorityKey[]).map((k) => (
          <div key={k} className="grid grid-cols-[18px_1fr_96px_24px] items-center gap-2 text-[13px]">
            <span className="text-muted-foreground [&_svg]:size-4">{INDICATOR_ICON[k]}</span>
            <dt className="truncate">{SHORT[k]}</dt>
            <dd className="h-2 overflow-hidden rounded-full bg-[#edf0ea]">
              <div className="h-full rounded-full" style={{ width: `${scenario.indicators[k]}%`, background: color }} />
            </dd>
            <dd className="tabular text-right text-xs font-medium text-muted-foreground">{scenario.indicators[k]}</dd>
          </div>
        ))}
      </dl>
      {highlight && topPriorities && topPriorities.length > 0 && (
        <div className="mt-4 flex items-start gap-2 rounded-md bg-primary-soft px-3 py-2.5 text-[13px] text-primary-soft-foreground">
          <CircleCheck className="mt-0.5 size-4 shrink-0" />
          <span>
            Maior índice para sua prioridade: <strong>{topPriorities.map((k) => PRIORITY_LABEL[k].toLowerCase()).join(" e ")}</strong>
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
