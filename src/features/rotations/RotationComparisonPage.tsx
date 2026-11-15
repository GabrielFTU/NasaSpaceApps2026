import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Dropdown } from "@/components/ui/dropdown";
import { getMarketData, marketPrices, type MarketData, type PriceBasis } from "@/services/market";
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
import type { PriorityKey, ScenarioResult } from "@/types";
import { CRITERIA, METHOD_NOTES, buildScenario, rankCriteria, replaceSlot, type CriterionKey, type Sequence } from "./engine";
import { DIFFICULTY_LABEL, ECON_METHOD, REFERENCE_ECONOMICS, UNIT_LABEL, econKey, type Difficulty, type EconOverrides } from "./economics";
import { CriterionCard } from "./components/CriterionCard";
import { ZARC_ORIGIN_TITLE, ZarcRotationCalendar } from "@/features/zarc/ZarcCalendar";

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
  const [recalculating, setRecalculating] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [tab, setTab] = useState<DetailTab>("precos");
  const userEcon = useAppStore((s) => s.settings.economics);
  const basis = useAppStore((s) => s.settings.priceBasis ?? "hoje");
  const updateSettings = useAppStore((s) => s.updateSettings);
  const market = useMarket();
  /** Preço de mercado (hoje ou colheita) por baixo; o que a pessoa digitou por cima. */
  const marketEcon = useMemo(() => marketPrices(market.data, basis), [market.data, basis]);
  const econ = useMemo(() => {
    const out: EconOverrides = { ...marketEcon };
    for (const [k, v] of Object.entries(userEcon ?? {})) out[k] = { ...out[k], ...v };
    return out;
  }, [marketEcon, userEcon]);
  /** Trocas manuais por cenário (ex.: sem nabo → aveia ou pousio). */
  const [edits, setEdits] = useState<Partial<Record<ScenarioResult["key"], Sequence>>>({});

  const maxDifficulty = useAppStore((s) => s.settings.maxDifficulty ?? 2);
  // recalcula sempre com o motor atual: análises antigas também ganham os três critérios
  const rank = useMemo(
    () => (analysis ? rankCriteria(analysis.input, analysis.climate, analysis.zarc, econ, maxDifficulty) : null),
    [analysis, econ, maxDifficulty],
  );
  const suggested = useMemo(() => {
    if (!analysis || !rank) return [];
    const { input: inp, climate: cl, zarc: z } = analysis;
    const cur: Sequence = [inp.currentRotation.verao, inp.currentRotation.inverno, inp.currentRotation.verao, inp.currentRotation.inverno];
    return [
      buildScenario("atual", "Rotação atual", "O que é feito hoje", cur, inp, cl, z, econ),
      ...(Object.keys(CRITERIA) as CriterionKey[])
        .filter((k) => rank[k][0])
        .map((k) => buildScenario(k, CRITERIA[k].label, CRITERIA[k].focus, rank[k][0].seq, inp, cl, z, econ)),
    ];
  }, [analysis, rank, econ]);
  const scenarios = useMemo(
    () =>
      suggested.map((s) => {
        const seq = edits[s.key];
        return seq && analysis ? buildScenario(s.key, s.label, s.focus, seq, analysis.input, analysis.climate, analysis.zarc, econ) : s;
      }),
    [suggested, edits, analysis, econ],
  );

  if (!analysis) {
    return (
      <EmptyState
        icon={<FileSearch />}
        title="Análise não encontrada"
        description="Ela pode ter sido excluída."
        action={
          <Link to="/historico" className={buttonVariants({ variant: "outline" })}>
            Ver estratégias salvas
          </Link>
        }
      />
    );
  }

  const { climate, input, propertySnapshot: prop } = analysis;
  const usedCrops = [...new Set(scenarios.flatMap((s) => s.sequence))].filter((c) => CROP_MAP[c]);
  const baseline = scenarios.find((s) => s.key === "atual")?.economics?.netPerYear;
  /** Sugestão: maior lucro descontando o risco (média entre ano normal e ano ruim). */
  const riskAdjusted = (s: ScenarioResult) => (s.economics ? (s.economics.netPerYear + s.economics.badYearNet) / 2 : -Infinity);
  const recommended = scenarios.filter((s) => s.key !== "atual" && s.economics).sort((a, b) => riskAdjusted(b) - riskAdjusted(a))[0];
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

      <MarketStrip
        market={market}
        basis={basis}
        onBasis={(b) => updateSettings({ priceBasis: b })}
        maxDifficulty={maxDifficulty}
        onDifficulty={(d) => {
          setEdits({});
          updateSettings({ maxDifficulty: d });
        }}
      />
      {scenarios.length <= 1 && (
        <Callout tone="warning" className="mb-4">
          Nenhuma rotação possível com manejo {DIFFICULTY_LABEL[maxDifficulty].toLowerCase()} e as culturas desta análise. Aceite um manejo mais exigente acima.
        </Callout>
      )}

      {recommended && (
        <div className="mb-4 flex flex-col gap-1 rounded-lg border border-primary/30 bg-primary-soft px-4 py-3 text-primary-soft-foreground sm:flex-row sm:items-center sm:gap-3">
          <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-primary-foreground">Sugestão</span>
          <span className="text-sm">
            <strong>{recommended.label}</strong>: {sequenceLabel(recommended.sequence)}
            <span className="text-xs opacity-80">
              {" "}
              · melhor lucro descontando o risco de ano ruim
              {baseline !== undefined && recommended.economics && Math.round(recommended.economics.netPerYear - baseline) !== 0 && (
                <>
                  {" "}
                  · {recommended.economics.netPerYear > baseline ? "+" : "−"}R$ {fmt.n0(Math.abs(Math.round(recommended.economics.netPerYear - baseline)))}/ha·ano vs atual
                </>
              )}
            </span>
          </span>
        </div>
      )}

      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 xl:grid-cols-4">
        {[...scenarios.slice(1), scenarios[0]].map((s) => (
          <CriterionCard
            key={s.key}
            recommended={s.key === recommended?.key}
            scenario={s}
            baseline={s.key === "atual" ? undefined : baseline}
            areaHa={prop.areaHa}
            edited={!!edits[s.key]}
            onReplace={(slot, id) => setEdits((e) => ({ ...e, [s.key]: replaceSlot(s.sequence as Sequence, slot, id) }))}
            onReset={() => setEdits(({ [s.key]: _, ...rest }) => rest)}
            alternatives={s.key !== "atual" && rank ? rank[s.key as CriterionKey] : undefined}
            onPick={(seq) => setEdits((e) => ({ ...e, [s.key]: seq }))}
          />
        ))}
      </div>

      <p className="mt-4 flex items-start gap-2 text-xs text-muted-foreground">
        <FlaskConical className="mt-0.5 size-3.5 shrink-0 text-warning" />
        <span>

          Preços {basis === "hoje" ? "do dia (CEPEA)" : basis === "colheita" ? "projetados para a colheita" : "de referência"}; produtividade e custo de referência
          {userEcon && Object.keys(userEcon).length ? ", com os seus ajustes" : ""}. Troque qualquer cultura na lista para recalcular. Estimativa para comparar, não
          substitui o agrônomo.
        </span>
      </p>

      <button
        type="button"
        onClick={() => setShowDetails((v) => !v)}
        aria-expanded={showDetails}
        className="mt-5 flex cursor-pointer items-center gap-1 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        Detalhes da análise <ChevronDown className={cn("size-4 transition-transform", showDetails && "rotate-180")} />
      </button>

      {showDetails && (
        <Card className="animate-in mt-3">
          <div role="tablist" className="flex gap-1 overflow-x-auto border-b border-border px-3">
            {DETAIL_TABS.filter((t) => (t.key !== "solo" || input.soilEvidence) && (t.key !== "zarc" || analysis.zarc)).map((t) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={tab === t.key}
                onClick={() => setTab(t.key)}
                className={cn(
                  "-mb-px shrink-0 cursor-pointer border-b-2 px-3 py-3 text-sm font-medium transition-colors",
                  tab === t.key ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground",
                )}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="px-5 py-4">
        {tab === "precos" && (
          <EconomicsEditor
            cropIds={[...new Set(scenarios.flatMap((s) => s.sequence.map((id, i) => econKey(id, i))))].filter((k) => REFERENCE_ECONOMICS[k])}
            overrides={userEcon ?? {}}
            base={marketEcon}
            priceSource={(k) => {
              if (basis === "referencia") return "referência";
              const h = basis === "colheita" ? market.data?.harvest.find((q) => q.keys.includes(k)) : undefined;
              if (h) return h.contract;
              const q = market.data?.spot.find((x) => x.keys.includes(k));
              return q ? `CEPEA ${q.date.slice(0, 5)}` : "referência";
            }}
            onChange={(next) => updateSettings({ economics: next })}
          />
        )}

        {tab === "parametros" && (
          <>
          <div className="mb-3 flex justify-end">
            <DataOriginBadge origin={climate.origin} />
          </div>
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
          </>
        )}

        {tab === "solo" && input.soilEvidence && (
          <>
            <p className="mb-3 text-xs text-muted-foreground">{LEVEL_LABEL[input.soilEvidence.level].title}</p>
            <SoilEvidenceSummary evidence={input.soilEvidence} propertyId={property ? analysis.propertyId : undefined} />
          </>
        )}

        {tab === "zarc" && analysis.zarc && (
          <>
            <div className="mb-3 flex justify-end">
              <DataOriginBadge origin={analysis.zarc.origin} title={ZARC_ORIGIN_TITLE} />
            </div>
            <ZarcRotationCalendar zarc={analysis.zarc} cropIds={usedCrops} />
          </>
        )}

        {tab === "metodo" && (
          <>
          <div className="grid grid-cols-1 gap-x-8 gap-y-4 md:grid-cols-2">
            {[...ECON_METHOD, ...METHOD_NOTES].map((n) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Motor de regras {analysis.engineVersion}.</p>
          </>
        )}
          </div>
        </Card>
      )}

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

/** "Soja → Milho · Soja → Trigo" (ano 1 · ano 2), sem repetir anual. */
const sequenceLabel = (seq: string[]) =>
  [seq.slice(0, 2), seq.slice(2, 4)].map(([a, b]) => (a === b ? cropName(a) : `${cropName(a)} → ${CROP_MAP[b] ? cropName(b) : "pousio"}`)).join(" · ");

type MarketState ={ data: MarketData | null; loading: boolean; error: string | null; reload: () => void };

/** Cotações do dia (CEPEA) + projeção para a colheita, com cache de algumas horas. */
function useMarket(): MarketState {
  const [state, setState] = useState<{ data: MarketData | null; loading: boolean; error: string | null }>({ data: null, loading: true, error: null });
  const [n, setN] = useState(0);
  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));
    getMarketData(n > 0)
      .then((data) => alive && setState({ data, loading: false, error: null }))
      .catch((e) => alive && setState((s) => ({ ...s, loading: false, error: e instanceof Error ? e.message : "Falha ao consultar cotações." })));
    return () => {
      alive = false;
    };
  }, [n]);
  return { ...state, reload: () => setN((x) => x + 1) };
}

const BASIS_OPTIONS: { value: PriceBasis; label: string; hint: string }[] = [
  { value: "hoje", label: "Preço de hoje", hint: "Indicador CEPEA do último pregão" },
  { value: "colheita", label: "Preço na colheita", hint: "Hoje × curva de futuros (CBOT/ICE)" },
  { value: "referencia", label: "Referência fixa", hint: "Valores médios do app" },
];

/** Faixa curta com as cotações e o preço usado no cálculo. */
const DIFFICULTY_OPTIONS: { value: "1" | "2" | "3"; label: string; hint: string }[] = [
  { value: "1", label: "Só fácil", hint: "Soja, milho, sorgo, coberturas" },
  { value: "2", label: "Até médio", hint: "+ trigo, feijão, girassol, consórcios" },
  { value: "3", label: "Qualquer", hint: "+ algodão, amendoim, batata, canola" },
];

function MarketStrip({
  market,
  basis,
  onBasis,
  maxDifficulty,
  onDifficulty,
}: {
  market: MarketState;
  basis: PriceBasis;
  onBasis: (b: PriceBasis) => void;
  maxDifficulty: Difficulty;
  onDifficulty: (d: Difficulty) => void;
}) {
  const { data, loading, error } = market;
  const shown = data?.spot.filter((q) => ["soja", "milho", "trigo"].some((k) => q.keys[0] === k)) ?? [];
  return (
    <div className="mb-4 flex flex-col divide-y divide-border rounded-lg border border-border bg-surface lg:flex-row lg:items-stretch lg:divide-x lg:divide-y-0">
      <div className="flex items-center gap-2 px-4 py-2.5 lg:w-56 lg:shrink-0">
        <span className="shrink-0 text-[13px] text-muted-foreground">Preço</span>
        <Dropdown aria-label="Preço usado" value={basis} onChange={onBasis} menuClassName="w-64" className="py-0.5 text-[13px] font-semibold" options={BASIS_OPTIONS} />
      </div>
      <div className="flex items-center gap-2 px-4 py-2.5 lg:w-48 lg:shrink-0">
        <span className="shrink-0 text-[13px] text-muted-foreground">Manejo</span>
        <Dropdown
          aria-label="Manejo aceito"
          value={String(maxDifficulty) as "1" | "2" | "3"}
          onChange={(v) => onDifficulty(Number(v) as Difficulty)}
          menuClassName="w-64"
          className="py-0.5 text-[13px] font-semibold"
          options={DIFFICULTY_OPTIONS}
        />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-3 px-4 py-2.5">
      <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-5 gap-y-1.5">
        {loading && !data ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3.5 animate-spin" /> Consultando cotações…
          </span>
        ) : error && !data ? (
          <span className="text-xs text-danger">Cotações indisponíveis agora — usando referência. </span>
        ) : (
          shown.map((q) => {
            const h = data?.harvest.find((x) => x.keys[0] === q.keys[0]);
            return (
              <span key={q.label} className="text-[13px]" title={`${q.source} · ${q.date}${h ? ` · projeção ${h.contract}` : ""}`}>
                <span className="text-muted-foreground">{q.label.replace(/ \(.*\)/, "")} </span>
                <span className="tabular font-semibold">R$ {fmt.n2(q.price)}</span>
                {h && (
                  <span className={cn("tabular ml-1.5 text-xs", h.ratio >= 1 ? "text-success" : "text-danger")}>
                    → {fmt.n2(h.price)} <span className="text-subtle-foreground">{h.contract.split(" ").pop()}</span>
                  </span>
                )}
              </span>
            );
          })
        )}
      </div>
      <div className="flex items-center gap-2 text-[11px] text-subtle-foreground">
        {data && <span>CEPEA {data.spot[0]?.date}</span>}
        <button type="button" onClick={market.reload} disabled={loading} className="cursor-pointer rounded-full p-1 hover:bg-muted hover:text-foreground disabled:opacity-50" aria-label="Atualizar cotações" title="Atualizar cotações">
          <RefreshCw className={cn("size-3.5", loading && "animate-spin")} />
        </button>
      </div>
      </div>
    </div>
  );
}

/** Tabela curta: a pessoa troca preço, produtividade e custo pelos seus; tudo recalcula na hora. */
function EconomicsEditor({
  cropIds,
  overrides,
  base,
  priceSource,
  onChange,
}: {
  cropIds: string[];
  overrides: EconOverrides;
  /** Preços de mercado em uso (sem os ajustes da pessoa). */
  base: Record<string, { price: number }>;
  priceSource: (k: string) => string;
  onChange: (o: EconOverrides) => void;
}) {
  const baseOf = (k: string, field: "yield" | "price" | "cost") => (field === "price" ? (base[k]?.price ?? REFERENCE_ECONOMICS[k].price) : REFERENCE_ECONOMICS[k][field]);
  const set = (k: string, field: "yield" | "price" | "cost", raw: string) => {
    const v = Number(raw.replace(/\./g, "").replace(",", "."));
    const cur = { ...overrides[k] };
    if (raw.trim() === "" || !Number.isFinite(v) || Math.abs(v - baseOf(k, field)) < 0.005) delete cur[field];
    else cur[field] = v;
    const next = { ...overrides };
    if (Object.keys(cur).length) next[k] = cur;
    else delete next[k];
    onChange(next);
  };
  const label = (k: string) => {
    const [id, season] = k.split(":");
    return `${cropName(id)}${season ? " (2ª safra)" : ""}`;
  };
  const changed = Object.keys(overrides).length > 0;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left text-[11px] uppercase tracking-wide text-subtle-foreground">
              <th className="pb-2 font-medium">Cultura</th>
              <th className="pb-2 font-medium">Produtividade</th>
              <th className="pb-2 font-medium">Preço (R$)</th>
              <th className="pb-2 font-medium">Custo (R$/ha)</th>
            </tr>
          </thead>
          <tbody>
            {cropIds.map((k) => {
              const ref = REFERENCE_ECONOMICS[k];
              const o = overrides[k] ?? {};
              const cover = ref.yield === 0;
              return (
                <tr key={k} className="border-t border-border">
                  <td className="py-1.5 pr-3 font-medium">
                    {label(k)}
                    {cover && <span className="ml-1 text-[11px] font-normal text-subtle-foreground">cobertura</span>}
                  </td>
                  <td className="py-1.5 pr-3">
                    {cover ? (
                      <span className="text-subtle-foreground">—</span>
                    ) : (
                      <NumCell value={o.yield ?? ref.yield} edited={o.yield !== undefined} suffix={UNIT_LABEL[ref.unit]} onCommit={(v) => set(k, "yield", v)} />
                    )}
                  </td>
                  <td className="py-1.5 pr-3">
                    {cover ? (
                      <span className="text-subtle-foreground">—</span>
                    ) : (
                      <span className="flex flex-col">
                        <NumCell value={o.price ?? baseOf(k, "price")} decimals={2} edited={o.price !== undefined} suffix={`/${ref.unit}`} onCommit={(v) => set(k, "price", v)} />
                        <span className="mt-0.5 text-[10px] text-subtle-foreground">{o.price !== undefined ? "seu valor" : priceSource(k)}</span>
                      </span>
                    )}
                  </td>
                  <td className="py-1.5">
                    <NumCell value={o.cost ?? ref.cost} edited={o.cost !== undefined} onCommit={(v) => set(k, "cost", v)} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <span>Produtividade e custo: referência aproximada para o PR, safra 25/26. Valores alterados ficam em verde e valem para todas as análises.</span>
        {changed && (
          <Button size="sm" variant="ghost" onClick={() => onChange({})}>
            <RotateCcw /> Voltar à referência
          </Button>
        )}
      </div>
    </div>
  );
}

function NumCell({ value, edited, suffix, decimals = 0, onCommit }: { value: number; edited: boolean; suffix?: string; decimals?: number; onCommit: (raw: string) => void }) {
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-1">
      <input
        inputMode="decimal"
        value={draft ?? (decimals ? fmt.n2(value) : fmt.n0(value))}
        onFocus={(e) => {
          setDraft(String(Math.round(value * 100) / 100).replace(".", ","));
          requestAnimationFrame(() => e.target.select());
        }}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          if (draft !== null) onCommit(draft);
          setDraft(null);
        }}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
        className={cn(
          "tabular h-7 w-20 rounded-md border border-transparent bg-muted/60 px-2 text-right transition-colors hover:border-input focus:border-ring focus:bg-surface focus:outline-none",
          edited && "bg-primary-soft font-semibold text-primary-soft-foreground",
        )}
      />
      {suffix && <span className="text-[11px] text-subtle-foreground">{suffix}</span>}
    </span>
  );
}

type DetailTab = "precos" | "parametros" | "solo" | "zarc" | "metodo";
const DETAIL_TABS: { key: DetailTab; label: string }[] = [
  { key: "precos", label: "Preços e custos" },
  { key: "parametros", label: "Parâmetros" },
  { key: "solo", label: "Solo" },
  { key: "zarc", label: "Calendário ZARC" },
  { key: "metodo", label: "Como calculamos" },
];
