import { useState } from "react";
import { BellOff, ChevronDown, CircleAlert, TriangleAlert } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { AlertEvaluation } from "../alerts";

const STATUS_BADGE = {
  ativo: { label: "Ativo", variant: "warning" as const },
  inativo: { label: "Não atingido", variant: "neutral" as const },
  sem_dados: { label: "Sem dados", variant: "outline" as const },
};

export function AlertsPanel({ alerts, referenceDate }: { alerts: AlertEvaluation[]; referenceDate: string }) {
  const [showAll, setShowAll] = useState(false);
  const active = alerts.filter((a) => a.status === "ativo");

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>Alertas ambientais</CardTitle>
          <Badge variant={active.length ? "warning" : "neutral"}>{active.length} ativo(s)</Badge>
        </div>
        <p className="text-[13px] text-muted-foreground">Dados até {formatDate(referenceDate, { day: "2-digit", month: "short" })}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        {active.length === 0 ? (
          <div className="flex items-center gap-2.5 rounded-md bg-muted/70 px-3 py-3 text-sm text-muted-foreground">
            <BellOff className="size-4 shrink-0" />
            Tudo normal.
          </div>
        ) : (
          active.map((a) => (
            <div
              key={a.id}
              className={cn(
                "flex gap-2.5 rounded-md border px-3 py-2.5",
                a.level === "alerta" ? "border-[#efcaca] bg-danger-soft" : "border-[#f0dfb5] bg-warning-soft",
              )}
            >
              {a.level === "alerta" ? (
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-danger" />
              ) : (
                <CircleAlert className="mt-0.5 size-4 shrink-0 text-warning" />
              )}
              <div className="min-w-0 text-sm">
                <p className="font-medium">
                  {a.title} <span className="font-normal text-muted-foreground">· {a.level === "alerta" ? "Alerta" : "Atenção"}</span>
                </p>
                {a.detail && <p className="text-[13px]">{a.detail}</p>}
              </div>
            </div>
          ))
        )}

        <button
          type="button"
          onClick={() => setShowAll((v) => !v)}
          aria-expanded={showAll}
          className="mt-1 flex cursor-pointer items-center gap-1 self-start text-[13px] font-medium text-primary hover:underline"
        >
          <ChevronDown className={cn("size-4 transition-transform", showAll && "rotate-180")} />
          {showAll ? "Ocultar critérios" : "Ver critérios"}
        </button>

        {showAll && (
          <ul className="animate-in divide-y divide-border rounded-md border border-border">
            {alerts.map((a) => (
              <li key={a.id} className="flex flex-col gap-1 px-3 py-2.5 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">{a.criterion}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-mono text-[11px] text-subtle-foreground">{a.variable}</span>
                  <Badge variant={STATUS_BADGE[a.status].variant}>{STATUS_BADGE[a.status].label}</Badge>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
