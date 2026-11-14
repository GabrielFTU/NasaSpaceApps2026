import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, CalendarRange, FlaskConical, MapPinned, Search, Sprout } from "lucide-react";
import { useZarc } from "@/features/zarc/useZarc";
import { CropCard } from "./components/CropCard";
import { useAppStore } from "@/app/store";
import { PageHeader, EmptyState, KeyValue } from "@/components/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckboxCard, Field, Input, Select } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { CROPS, CROP_GROUP_LABEL, CROP_MAP, DRAINAGE_LABEL, FALLOW_ID, PRIORITY_LABEL, SOIL_TEXTURE_LABEL, cropName } from "@/data/crops";
import { fmt } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Crop, CropGroup, Priorities, PriorityKey, SoilProfile, ZarcSeason } from "@/types";
import { Stepper } from "./components/Stepper";
import { runAnalysis } from "./runAnalysis";
import { deriveSoilEvidence, effectiveSoilProfile } from "@/features/soil/model";
import { SoilEvidenceSummary } from "@/features/soil/SoilEvidenceSummary";

const STEPS = ["Propriedade", "Culturas", "Solo", "Prioridades", "Revisão"];
const MAX_INTEREST = 6;

const WEIGHT_LABEL = ["Nada", "Muito baixa", "Baixa", "Média", "Alta", "Muito alta"];

export function AnalysisWizardPage() {
  const properties = useAppStore((s) => s.properties);
  const selectedPropertyId = useAppStore((s) => s.selectedPropertyId);
  const powerMode = useAppStore((s) => s.settings.powerMode);
  const saveAnalysis = useAppStore((s) => s.saveAnalysis);
  const soilSamples = useAppStore((s) => s.soilSamples);
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const initialPropertyId = params.get("propriedade") ?? selectedPropertyId ?? properties[0]?.id ?? "";
  const [step, setStep] = useState(0);
  const [propertyId, setPropertyId] = useState(initialPropertyId);
  const [currentVerao, setCurrentVerao] = useState("soja");
  const [currentInverno, setCurrentInverno] = useState("milho");
  const [interest, setInterest] = useState<string[]>(["soja", "milho"]);
  const [soil, setSoil] = useState<SoilProfile | null>(null);
  const [phText, setPhText] = useState("");
  const [moText, setMoText] = useState("");
  const [priorities, setPriorities] = useState<Priorities>({ conservacao: 4, agua: 3, produtividade: 3, diversificacao: 2 });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const property = properties.find((p) => p.id === propertyId) ?? null;

  const [cropQuery, setCropQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<CropGroup | "todas">("todas");
  const [onlyZoned, setOnlyZoned] = useState(true);
  const zarc = useZarc(property);
  const evidence = useMemo(() => (property ? deriveSoilEvidence(property, soilSamples) : null), [property, soilSamples]);

  const summerOptions = useMemo(() => CROPS.filter((c) => c.role === "comercial" && c.seasons.includes("verao") && !c.annual), []);
  const winterOptions = useMemo(() => CROPS.filter((c) => c.seasons.includes("inverno") && !c.annual), []);
  const commercialGroups = useMemo(() => [...new Set(CROPS.filter((c) => c.role === "comercial").map((c) => c.group))], []);

  /** Posições em que a cultura tem janela no ZARC do município; null = sem dado do ZARC ou cultura sem zoneamento. */
  const zonedSeasons = (c: Crop): ZarcSeason[] | null => {
    if (zarc?.origin !== "real" || !c.zarc) return null;
    return (Object.keys(c.zarc) as ZarcSeason[]).filter((s) => zarc.entries[`${c.id}:${s}`]?.zoned);
  };
  const zarcCardBadge = (c: Crop) => {
    const z = zonedSeasons(c);
    if (!z) return undefined;
    if (!z.length)
      return (
        <Badge variant="danger" title="Sem janela de plantio no ZARC para o município e o solo da propriedade">
          Fora do ZARC
        </Badge>
      );
    const where = z.map((s) => (s === "verao" ? "verão" : s === "inverno" ? "2ª safra/inverno" : "anual")).join(" e ");
    return (
      <Badge variant="success" className="bg-white/90" title={`Indicada no ZARC: ${where}`}>
        <CalendarRange /> ZARC
      </Badge>
    );
  };
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
  const visibleCrops = CROPS.filter((c) => {
    if (c.role !== "comercial") return false;
    if (interest.includes(c.id)) return true; // selecionadas sempre visíveis
    if (groupFilter !== "todas" && c.group !== groupFilter) return false;
    if (cropQuery.trim() && !norm(c.name).includes(norm(cropQuery.trim()))) return false;
    if (onlyZoned) {
      const z = zonedSeasons(c);
      if (z && !z.length) return false;
    }
    return true;
  });

  if (properties.length === 0) {
    return (
      <>
        <PageHeader title="Análise agrícola" />
        <EmptyState
          icon={<MapPinned />}
          title="Cadastre uma propriedade primeiro"
          description="A análise usa a localização e o solo da propriedade para comparar rotações."
          action={
            <Link to="/propriedades/nova" className={buttonVariants()}>
              Cadastrar propriedade
            </Link>
          }
        />
      </>
    );
  }

  const loadSoilFromProperty = () => {
    if (!property || !evidence) return;
    const eff = effectiveSoilProfile(property.soil, evidence);
    setSoil(eff);
    setPhText(eff.ph === null ? "" : String(eff.ph).replace(".", ","));
    setMoText(eff.organicMatter === null ? "" : String(eff.organicMatter).replace(".", ","));
  };

  const validate = (s: number): Record<string, string> => {
    const e: Record<string, string> = {};
    if (s === 0 && !property) e.property = "Selecione uma propriedade.";
    if (s === 1) {
      if (interest.length === 0) e.interest = "Selecione ao menos uma cultura de interesse.";
      if (interest.length > MAX_INTEREST) e.interest = `Selecione no máximo ${MAX_INTEREST} culturas.`;
    }
    if (s === 2) {
      const ph = phText.trim() === "" ? null : Number(phText.replace(",", "."));
      if (ph !== null && (!Number.isFinite(ph) || ph < 3.5 || ph > 9)) e.ph = "Informe um pH entre 3,5 e 9,0 ou deixe em branco.";
      const mo = moText.trim() === "" ? null : Number(moText.replace(",", "."));
      if (mo !== null && (!Number.isFinite(mo) || mo < 0 || mo > 15)) e.mo = "Informe um valor entre 0 e 15% ou deixe em branco.";
    }
    if (s === 3 && Object.values(priorities).every((v) => v === 0)) e.priorities = "Defina peso maior que zero para ao menos uma prioridade.";
    return e;
  };

  const next = () => {
    const e = validate(step);
    setErrors(e);
    if (Object.keys(e).length) return;
    if (step === 0 && !soil) loadSoilFromProperty();
    if (step === 2 && soil) {
      setSoil({
        ...soil,
        ph: phText.trim() === "" ? null : Number(phText.replace(",", ".")),
        organicMatter: moText.trim() === "" ? null : Number(moText.replace(",", ".")),
      });
    }
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  };
  const back = () => {
    setErrors({});
    setStep((s) => Math.max(0, s - 1));
  };

  const toggleInterest = (id: string, on: boolean) => {
    setInterest((cur) => (on ? (cur.length >= MAX_INTEREST ? cur : [...cur, id]) : cur.filter((x) => x !== id)));
    if (on && interest.length >= MAX_INTEREST) toast.info(`Limite de ${MAX_INTEREST} culturas`, "Remova uma cultura para adicionar outra.");
  };

  const generate = async () => {
    if (!property || !soil) return;
    setGenerating(true);
    setGenError(null);
    try {
      const analysis = await runAnalysis({
        property,
        samples: soilSamples,
        currentRotation: { verao: currentVerao, inverno: currentInverno },
        interestCropIds: interest,
        priorities,
        powerMode,
        soil,
      });
      saveAnalysis(analysis);
      toast.success("Comparação gerada", "A análise foi salva no histórico.");
      navigate(`/analise/${analysis.id}`);
    } catch (e) {
      setGenError(e instanceof Error ? e.message : "Erro ao gerar a comparação.");
    } finally {
      setGenerating(false);
    }
  };

  return (
    <>
      <PageHeader title="Nova análise" />

      <div className="mb-5">
        <Stepper steps={STEPS} current={step} onSelect={(i) => setStep(i)} />
      </div>

      <Card className="animate-in" key={step}>
        {step === 0 && (
          <>
            <CardHeader>
              <CardTitle>Qual propriedade?</CardTitle>
              
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-2 sm:grid-cols-2" role="radiogroup" aria-label="Propriedade">
              {properties.map((p) => (
                <label
                  key={p.id}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-md border px-3 py-3 transition-colors",
                    propertyId === p.id ? "border-primary bg-primary-soft/60" : "border-border hover:bg-muted/60",
                  )}
                >
                  <input
                    type="radio"
                    name="property"
                    className="mt-1 accent-[var(--color-primary)]"
                    checked={propertyId === p.id}
                    onChange={() => {
                      setPropertyId(p.id);
                      setSoil(null);
                    }}
                  />
                  <span>
                    <span className="block text-sm font-medium">{p.name}</span>
                    <span className="block text-[13px] text-muted-foreground">
                      {p.city}/{p.state} · {fmt.n1(p.areaHa)} ha · solo {SOIL_TEXTURE_LABEL[p.soil.texture].toLowerCase()}
                    </span>
                  </span>
                </label>
              ))}
              {errors.property && <p className="text-[13px] text-danger">{errors.property}</p>}
            </CardContent>
          </>
        )}

        {step === 1 && (
          <>
            <CardHeader>
              <CardTitle>Culturas</CardTitle>
              
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Hoje no verão">
                  {(p) => (
                    <Select {...p} value={currentVerao} onChange={(e) => setCurrentVerao(e.target.value)}>
                      {summerOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
                <Field label="Hoje no inverno">
                  {(p) => (
                    <Select {...p} value={currentInverno} onChange={(e) => setCurrentInverno(e.target.value)}>
                      <option value={FALLOW_ID}>Pousio (sem cultivo)</option>
                      {winterOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                          {c.role === "cobertura" ? " (cobertura)" : ""}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
              <div>
                <div className="mb-2 flex items-baseline justify-between gap-2">
                  <p className="text-sm font-medium">O que você pensa em plantar?</p>
                  <span className="text-xs text-muted-foreground">
                    {interest.length}/{MAX_INTEREST} selecionadas
                  </span>
                </div>
                <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap gap-1.5" aria-label="Filtrar por grupo">
                    {(["todas", ...commercialGroups] as (CropGroup | "todas")[]).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setGroupFilter(g)}
                        aria-pressed={groupFilter === g}
                        className={cn(
                          "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium",
                          groupFilter === g ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border text-muted-foreground hover:bg-muted",
                        )}
                      >
                        {g === "todas" ? "Todas" : CROP_GROUP_LABEL[g]}
                      </button>
                    ))}
                  </div>
                  <div className="relative sm:w-56">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={cropQuery} onChange={(e) => setCropQuery(e.target.value)} placeholder="Buscar cultura" aria-label="Buscar cultura" className="pl-8" />
                  </div>
                </div>
                {zarc?.origin === "real" && (
                  <label className="mb-3 flex cursor-pointer items-center gap-2 text-[13px]">
                    <input type="checkbox" className="accent-[var(--color-primary)]" checked={onlyZoned} onChange={(e) => setOnlyZoned(e.target.checked)} />
                    Só culturas indicadas no ZARC de {zarc.municipio}/{zarc.uf}
                  </label>
                )}
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {visibleCrops.map((c) => {
                    const on = interest.includes(c.id);
                    return <CropCard key={c.id} crop={c} selected={on} onToggle={() => toggleInterest(c.id, !on)} badge={zarcCardBadge(c)} />;
                  })}
                </div>
                {visibleCrops.length === 0 && <p className="py-4 text-center text-sm text-muted-foreground">Nenhuma cultura encontrada com esses filtros.</p>}
                {errors.interest && <p className="mt-2 text-[13px] text-danger">{errors.interest}</p>}
                <p className="mt-3 text-xs text-muted-foreground">Plantas de cobertura entram automaticamente.</p>
              </div>
            </CardContent>
          </>
        )}

        {step === 2 && soil && (
          <>
            <CardHeader>
              <CardTitle>Solo</CardTitle>
              <CardDescription>
                {evidence?.sample ? "Já preenchido com o laudo confirmado e o cadastro." : "Já preenchido com o cadastro."}
              </CardDescription>
            </CardHeader>
            {evidence && (
              <div className="px-5 pb-4">
                <SoilEvidenceSummary evidence={evidence} propertyId={property!.id} compact />
              </div>
            )}
            <CardContent className="grid grid-cols-1 gap-4 sm:grid-cols-4">
              <Field label="Textura">
                {(p) => (
                  <Select {...p} value={soil.texture} onChange={(e) => setSoil({ ...soil, texture: e.target.value as SoilProfile["texture"] })}>
                    {Object.entries(SOIL_TEXTURE_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="Drenagem">
                {(p) => (
                  <Select {...p} value={soil.drainage} onChange={(e) => setSoil({ ...soil, drainage: e.target.value as SoilProfile["drainage"] })}>
                    {Object.entries(DRAINAGE_LABEL).map(([k, l]) => (
                      <option key={k} value={k}>
                        {l}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <Field label="pH em água" optional error={errors.ph}>
                {(p) => <Input {...p} inputMode="decimal" value={phText} onChange={(e) => setPhText(e.target.value)} placeholder="Não informado" />}
              </Field>
              <Field label="Matéria orgânica (%)" optional error={errors.mo}>
                {(p) => <Input {...p} inputMode="decimal" value={moText} onChange={(e) => setMoText(e.target.value)} placeholder="Não informado" />}
              </Field>
              <div className="grid grid-cols-1 gap-3 sm:col-span-4 sm:grid-cols-2">
                <CheckboxCard checked={soil.compaction} onCheckedChange={(v) => setSoil({ ...soil, compaction: v })} label="Sinais de compactação" />
                <CheckboxCard checked={soil.erosionHistory} onCheckedChange={(v) => setSoil({ ...soil, erosionHistory: v })} label="Histórico de erosão" />
              </div>
              <Button variant="link" className="justify-self-start sm:col-span-4" onClick={loadSoilFromProperty}>
                Restaurar dados do cadastro
              </Button>
            </CardContent>
          </>
        )}

        {step === 3 && (
          <>
            <CardHeader>
              <CardTitle>Prioridades</CardTitle>
              <CardDescription>O que é mais importante para você?</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              {(Object.keys(PRIORITY_LABEL) as PriorityKey[]).map((k) => (
                <div key={k} className="grid grid-cols-1 gap-2 rounded-md border border-border px-4 py-3 sm:grid-cols-[1fr_260px] sm:items-center">
                  <div>
                    <label htmlFor={`w-${k}`} className="text-sm font-medium">
                      {PRIORITY_LABEL[k]}
                    </label>
                    
                  </div>
                  <div className="flex items-center gap-3">
                    <input
                      id={`w-${k}`}
                      type="range"
                      min={0}
                      max={5}
                      step={1}
                      value={priorities[k]}
                      onChange={(e) => setPriorities({ ...priorities, [k]: Number(e.target.value) })}
                      className="flex-1 cursor-pointer"
                      aria-valuetext={WEIGHT_LABEL[priorities[k]]}
                    />
                    <span className="w-24 text-right text-[13px] font-medium">{WEIGHT_LABEL[priorities[k]]}</span>
                  </div>
                </div>
              ))}
              {errors.priorities && <p className="text-[13px] text-danger">{errors.priorities}</p>}
            </CardContent>
          </>
        )}

        {step === 4 && property && soil && (
          <>
            <CardHeader>
              <CardTitle>Tudo certo?</CardTitle>
              
            </CardHeader>
            <CardContent className="flex flex-col gap-5">
              <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
                <KeyValue label="Propriedade">{property.name}</KeyValue>
                <KeyValue label="Município">
                  {property.city}/{property.state}
                </KeyValue>
                <KeyValue label="Rotação atual">
                  {cropName(currentVerao)} → {cropName(currentInverno)}
                </KeyValue>
                <KeyValue label="Solo">
                  {SOIL_TEXTURE_LABEL[soil.texture]} · pH {soil.ph === null ? "n/i" : fmt.n1(soil.ph)}
                </KeyValue>
              </dl>
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Culturas de interesse</p>
                <div className="flex flex-wrap gap-1.5">
                  {interest.map((id) => (
                    <Badge key={id} variant="primary">
                      {CROP_MAP[id]?.name}
                    </Badge>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs text-muted-foreground">Pesos das prioridades</p>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(PRIORITY_LABEL) as PriorityKey[]).map((k) => (
                    <Badge key={k} variant="outline">
                      {PRIORITY_LABEL[k]}: {priorities[k]}
                    </Badge>
                  ))}
                </div>
              </div>
              <Callout tone="warning" icon={<FlaskConical />}>
                Comparação demonstrativa com índices simulados — não substitui o agrônomo.
              </Callout>
              {genError && <p className="text-[13px] text-danger">{genError}</p>}
            </CardContent>
          </>
        )}

        <CardFooter className="justify-between">
          <Button variant="outline" onClick={back} disabled={step === 0 || generating}>
            <ArrowLeft /> Voltar
          </Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={next}>
              Continuar <ArrowRight />
            </Button>
          ) : (
            <Button onClick={generate} loading={generating}>
              {!generating && <Sprout />}
              {generating ? "Gerando comparação…" : "Gerar comparação"}
            </Button>
          )}
        </CardFooter>
      </Card>
    </>
  );
}
