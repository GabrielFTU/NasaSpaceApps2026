import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ChevronRight, History, Sprout, Trash2 } from "lucide-react";
import { useAppStore } from "@/app/store";
import { PageHeader, EmptyState } from "@/components/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Select } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { cropName } from "@/data/crops";
import { formatDateTime } from "@/lib/format";
import type { Analysis } from "@/types";
import { SCENARIO_COLOR } from "@/features/rotations/components/ScenarioSummary";

const SHORT = { atual: "Atual", retorno: "Rentável", estavel: "Estável", equilibrio: "Moderado", a: "A", b: "B" } as const;

export function HistoryPage() {
  const analyses = useAppStore((s) => s.analyses);
  const deleteAnalysis = useAppStore((s) => s.deleteAnalysis);
  const [propertyFilter, setPropertyFilter] = useState("all");
  const [toDelete, setToDelete] = useState<Analysis | null>(null);

  const propertyOptions = useMemo(() => {
    const m = new Map<string, string>();
    analyses.forEach((a) => m.set(a.propertyId, a.propertySnapshot.name));
    return [...m.entries()];
  }, [analyses]);

  const filtered = analyses.filter((a) => propertyFilter === "all" || a.propertyId === propertyFilter);

  return (
    <>
      <PageHeader
        title="Estratégias salvas"
        actions={
          <>
            {propertyOptions.length > 1 && (
              <Select aria-label="Filtrar por propriedade" value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)} className="w-52">
                <option value="all">Todas as propriedades</option>
                {propertyOptions.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </Select>
            )}
            <Link to="/analise" className={buttonVariants()}>
              <Sprout /> Nova análise
            </Link>
          </>
        }
      />

      {analyses.length === 0 ? (
        <EmptyState
          icon={<History />}
          title="Nenhuma análise ainda"
          description="Suas comparações de rotação aparecem aqui."
          action={
            <Link to="/analise" className={buttonVariants()}>
              Fazer análise
            </Link>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          {filtered.map((a) => {
            const best = [...a.scenarios].sort((x, y) => y.overall - x.overall)[0];
            return (
              <Card key={a.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
                <Link to={`/analise/${a.id}`} className="min-w-0 flex-1">
                  <p className="font-semibold">{a.propertySnapshot.name}</p>
                  <p className="text-[13px] text-muted-foreground">{formatDateTime(a.createdAt)}</p>
                  <p className="mt-1 truncate text-sm">
                    <span className="text-muted-foreground">Melhor: </span>
                    {best.sequence.filter((id, i, arr) => !(i % 2 === 1 && arr[i - 1] === id)).map(cropName).join(" → ")}
                  </p>
                </Link>
                <div className="flex items-center gap-2">
                  {a.scenarios.map((s) => (
                    <span key={s.key} className="flex flex-col items-center rounded-md bg-muted px-3 py-1.5" title={s.label}>
                      <span className="text-[11px] text-muted-foreground">{SHORT[s.key]}</span>
                      <span className="tabular text-base font-bold" style={{ color: SCENARIO_COLOR[s.key] }}>
                        {s.economics ? `R$ ${(s.economics.netPerYear / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} mil` : s.overall}
                      </span>
                    </span>
                  ))}
                  <Button variant="ghost" size="icon-sm" className="text-danger hover:bg-danger-soft" aria-label="Excluir análise" onClick={() => setToDelete(a)}>
                    <Trash2 />
                  </Button>
                  <Link to={`/analise/${a.id}`} className={buttonVariants({ variant: "outline", size: "icon-sm" })} aria-label="Abrir análise">
                    <ChevronRight />
                  </Link>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Excluir análise?"
        description="Esta ação não pode ser desfeita."
        onConfirm={() => {
          if (!toDelete) return;
          deleteAnalysis(toDelete.id);
          toast.success("Análise excluída");
        }}
      />
    </>
  );
}
