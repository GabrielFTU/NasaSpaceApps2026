import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronDown, FileSearch, FlaskConical, RefreshCw, RotateCcw, Trash2 } from "lucide-react";
import { Callout } from "@/components/ui/misc";
import { runAnalysis } from "@/features/analysis/runAnalysis";
import { LEVEL_LABEL } from "@/features/soil/model";
import { SoilEvidenceSummary } from "@/features/soil/SoilEvidenceSummary";
import { useAppStore } from "@/app/store";
import { EmptyState, KeyValue, DataOriginBadge } from "@/components/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { CROPS, CROP_MAP, PRIORITY_LABEL, SOIL_TEXTURE_LABEL, cropName } from "@/data/crops";
import { fmt, formatDate, formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PriorityKey } from "@/types";
import { METHOD_NOTES } from "./engine";
import { ScenarioCard } from "./components/ScenarioCard";
import { ZARC_ORIGIN_TITLE, ZarcRotationCalendar, ZarcSourceNote } from "@/features/zarc/ZarcCalendar";

export function RotationComparisonPage() {
  const { id } = useParams();
  const analysis = useAppStore((s) => s.analyses.find((a) => a.id === id));
  const deleteAnalysis = useAppStore((s) => s.deleteAnalysis);
  const saveAnalysis = useAppStore((s) => s.saveAnalysis);
  const property = useAppStore((s) => s.properties.find((p) => p.id === analysis?.propertyId));
  const soilSamples = useAppStore((s) => s.soilSamples);
  const powerMode = useAppStore((s) => s.settings.powerMode);
  const original = useAppStore((s) => s.analyses.find((a) => a.id === analysis?.recalculatedFrom));
  const navigate = useNavigate();
  const [confirm, setConfirm] = useState(false);
  const [showSoil, setShowSoil] = useState(false);
  const [recalculating, setRecalculating] = useState(false);
  const [showParams, setShowParams] = useState(false);
  const [showMethod, setShowMethod] = useState(false);
  const [showZarc, setShowZarc] = useState(false);

  if (!analysis) {
    return (
      <EmptyState
        icon={<FileSearch />}
        title="Análise não encontrada"
        description="Ela pode ter sido excluída ou os dados locais foram restaurados."
        action={
          <Link to="/historico" className={buttonVariants({ variant: "outline" })}>
            Ver estratégias salvas
          </Link>
        }
      />
    );
  }

  const { climate, input, scenarios, propertySnapshot: prop } = analysis;
  const best = Math.max(...scenarios.map((s) => s.overall));
  const maxW = Math.max(...Object.values(input.priorities));
  const top = (Object.keys(input.priorities) as PriorityKey[]).filter((k) => input.priorities[k] === maxW && maxW > 0);
  const usedCrops = [...new Set(scenarios.flatMap((s) => s.sequence))].filter((c) => CROP_MAP[c]);
  // dados da propriedade (inclusive solo e laudos, salvos junto) mudaram depois desta análise
  const stale = !!property && property.updatedAt > analysis.createdAt;

  /** RF-SOLO-08: nova análise com os dados atuais; esta continua no histórico. */
  const recalculate = async () => {
    if (!property) return;
    setRecalculating(true);
    try {
      const fresh = await runAnalysis({
        property,
        samples: soilSamples,
        currentRotation: input.currentRotation,
        interestCropIds: input.interestCropIds,
        priorities: input.priorities,
        powerMode,
        recalculatedFrom: analysis.id,
      });
      saveAnalysis(fresh);
      toast.success("Análise recalculada", "A versão anterior continua nas estratégias salvas.");
      navigate(`/analise/${fresh.id}`);
    } catch (e) {
      toast.error("Não foi possível recalcular", e instanceof Error ? e.message : undefined);
    } finally {
      setRecalculating(false);
    }
  };

  return (
    <>
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Link to="/historico" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Estratégias salvas
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-brand-dark">Comparativo de rotações</h1>
          <p className="text-sm text-muted-foreground">
            {prop.name} · {prop.city}/{prop.state} · {formatDateTime(analysis.createdAt)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="ghost" size="icon" onClick={() => setConfirm(true)} aria-label="Excluir análise" title="Excluir análise" className="text-danger hover:bg-danger-soft">
            <Trash2 />
          </Button>
          <Link to={`/analise?propriedade=${analysis.propertyId}`} className={buttonVariants()}>
            <RotateCcw /> Nova análise
          </Link>
        </div>
      </div>

      {stale && (
        <Callout tone="info" icon={<RefreshCw />} className="mb-4">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <span>Os dados desta propriedade (incluindo solo e laudos) foram atualizados depois desta análise.</span>
            <Button size="sm" onClick={recalculate} loading={recalculating} className="shrink-0">
              {!recalculating && <RefreshCw />} Recalcular com dados atuais
            </Button>
          </div>
        </Callout>
      )}
      {analysis.recalculatedFrom && (
        <p className="mb-3 text-[13px] text-muted-foreground">
          Recálculo de{" "}
          {original ? (
            <Link to={`/analise/${original.id}`} className="font-medium text-primary hover:underline">
              análise de {formatDateTime(original.createdAt)}
            </Link>
          ) : (
            "uma análise anterior (excluída)"
          )}{" "}
          com dados de solo atualizados.
        </p>
      )}

      <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-3">
        {scenarios.map((s) => (
          <ScenarioCard key={s.key} scenario={s} highlight={s.key !== "atual" && s.overall === best} topPriorities={top} />
        ))}
      </div>

      <p className="mt-4 flex items-start gap-2 text-[13px] text-muted-foreground">
        <FlaskConical className="mt-0.5 size-4 shrink-0 text-warning" />
        Índices simulados para comparar cenários — não substituem o agrônomo.
      </p>

      <div className="mt-6 flex flex-col gap-3">
        <Collapsible title="Parâmetros usados" open={showParams} onToggle={() => setShowParams((v) => !v)} aside={<DataOriginBadge origin={climate.origin} />}>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <KeyValue label="Rotação atual">
              {cropName(input.currentRotation.verao)} → {cropName(input.currentRotation.inverno)}
            </KeyValue>
            <KeyValue label="Culturas de interesse">{input.interestCropIds.map(cropName).join(", ")}</KeyValue>
            <KeyValue label="Solo">
              {SOIL_TEXTURE_LABEL[input.soil.texture]} · pH {input.soil.ph === null ? "n/i" : fmt.n1(input.soil.ph)}
            </KeyValue>
            <KeyValue label="Prioridades (0–5)">
              {(Object.keys(PRIORITY_LABEL) as PriorityKey[]).map((k) => `${PRIORITY_LABEL[k].split(" ")[0]} ${input.priorities[k]}`).join(" · ")}
            </KeyValue>
            <KeyValue label="Chuva no verão">{fmt.n0(climate.summerPrecipMm)} mm</KeyValue>
            <KeyValue label="Chuva no inverno">{fmt.n0(climate.winterPrecipMm)} mm</KeyValue>
            <KeyValue label="Temperatura média">{fmt.n1(climate.meanTemp)} °C</KeyValue>
            <KeyValue label="Dias com mínima ≤ 2 °C">{climate.frostRiskDays}</KeyValue>
          </dl>
          <p className="mt-3 text-xs text-muted-foreground">
            Clima observado de {formatDate(climate.periodStart)} a {formatDate(climate.periodEnd)} (NASA POWER). Verão = out–mar; inverno = abr–set. Não é previsão.
          </p>
        </Collapsible>

        {input.soilEvidence && (
          <Collapsible
            title="Solo considerado"
            open={showSoil}
            onToggle={() => setShowSoil((v) => !v)}
            aside={<span className="hidden text-xs text-muted-foreground sm:inline">{LEVEL_LABEL[input.soilEvidence.level].title}</span>}
          >
            <SoilEvidenceSummary evidence={input.soilEvidence} propertyId={property ? analysis.propertyId : undefined} />
          </Collapsible>
        )}

        {analysis.zarc && (
          <Collapsible
            title="Calendário de plantio (ZARC)"
            open={showZarc}
            onToggle={() => setShowZarc((v) => !v)}
            aside={<DataOriginBadge origin={analysis.zarc.origin} title={ZARC_ORIGIN_TITLE} />}
          >
            <ZarcRotationCalendar zarc={analysis.zarc} cropIds={usedCrops} />
            <div className="mt-3">
              <ZarcSourceNote zarc={analysis.zarc} />
            </div>
          </Collapsible>
        )}

        <Collapsible title="Como os índices são calculados" open={showMethod} onToggle={() => setShowMethod((v) => !v)}>
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
            {METHOD_NOTES.map((n) => (
              <div key={n.title}>
                <h4 className="text-sm font-semibold">{n.title}</h4>
                <p className="mt-0.5 text-[13px] leading-relaxed text-muted-foreground">{n.body}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 overflow-x-auto rounded-md border border-border">
            <table className="w-full text-[13px]">
              <thead className="bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">Cultura</th>
                  <th className="px-3 py-2 font-medium">Água (mm/ciclo)</th>
                  <th className="px-3 py-2 font-medium">pH</th>
                  <th className="px-3 py-2 font-medium">Fonte</th>
                </tr>
              </thead>
              <tbody>
                {CROPS.filter((c) => usedCrops.includes(c.id)).map((c) => (
                  <tr key={c.id} className="border-t border-border">
                    <td className="px-3 py-1.5 font-medium">{c.name}</td>
                    <td className="tabular px-3 py-1.5">
                      {c.waterNeedMm[0]}–{c.waterNeedMm[1]}
                    </td>
                    <td className="tabular px-3 py-1.5">
                      {fmt.n1(c.phRange[0])}–{fmt.n1(c.phRange[1])}
                    </td>
                    <td className="px-3 py-1.5 text-muted-foreground">{c.waterNeedSource}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Motor de regras {analysis.engineVersion}.</p>
        </Collapsible>
      </div>

      <ConfirmDialog
        open={confirm}
        onClose={() => setConfirm(false)}
        title="Excluir análise?"
        description="A comparação será removida. Esta ação não pode ser desfeita."
        onConfirm={() => {
          deleteAnalysis(analysis.id);
          toast.success("Análise excluída");
          navigate("/historico");
        }}
      />
    </>
  );
}

function Collapsible({ title, open, onToggle, aside, children }: { title: string; open: boolean; onToggle: () => void; aside?: React.ReactNode; children: React.ReactNode }) {
  return (
    <Card>
      <button type="button" onClick={onToggle} aria-expanded={open} className="flex w-full cursor-pointer items-center justify-between gap-3 px-5 py-4 text-left">
        <span className="font-semibold">{title}</span>
        <span className="flex items-center gap-2">
          {aside}
          <ChevronDown className={cn("size-5 text-muted-foreground transition-transform", open && "rotate-180")} />
        </span>
      </button>
      {open && <div className="animate-in border-t border-border px-5 py-4">{children}</div>}
    </Card>
  );
}
