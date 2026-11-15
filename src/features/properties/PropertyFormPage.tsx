import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { HelpTip } from "@/components/ui/help";
import { Link, useBlocker, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ConfirmDialog } from "@/components/ui/dialog";
import { ArrowLeft, Check, Loader2, MapPinned, MousePointerClick, Search, WandSparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { fmt } from "@/lib/format";
import { polygonAreaHa } from "@/lib/geo";
import { useAppStore } from "@/app/store";
import { Segmented } from "@/components/ui/misc";
import { deleteFile } from "@/lib/fileStore";
import { deriveSoilEvidence } from "@/features/soil/model";
import { SoilEvidenceSummary } from "@/features/soil/SoilEvidenceSummary";
import { SoilSamplesSection } from "@/features/soil/SoilCompleteSection";
import { CropHistorySection } from "@/features/soil/CropHistorySection";
import type { CropHistoryEntry, SoilSample } from "@/types";
import { EmptyState } from "@/components/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChoiceChips, Field, Input, Label, Select, Textarea, ToggleChip } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { AreaDrawer } from "@/components/maps";
import { BRAZIL_STATES } from "@/data/sampleProperties";
import { DRAINAGE_LABEL } from "@/data/crops";
import { SoilTexturePicker } from "./SoilTexturePicker";
import { polygonCenter } from "@/lib/geo";
import type { Property } from "@/types";
import { CIANORTE_EXAMPLE, EMPTY_FORM, soilFromValues, toPropertyInput, validateProperty, type FormErrors, type PropertyFormValues } from "./validation";

const NEW_ID = "nova";

/** Bloco numerado do formulário; o número vira ✓ quando a etapa está completa. */
function FormSection({ n, title, done, aside, children }: { n: number; title: string; done?: boolean; aside?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold">
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full text-[12px] font-bold transition-colors",
              done ? "bg-primary text-white" : "bg-muted text-muted-foreground",
            )}
          >
            {done ? <Check className="size-3.5" /> : n}
          </span>
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}
type SoilMode = "simples" | "completo";

const CIANORTE_CENTER: [number, number] = [-23.6599, -52.6054];

function fromProperty(p: Property): PropertyFormValues {
  return {
    name: p.name,
    city: p.city,
    state: p.state,
    boundary: p.boundary ?? [],
    texture: p.soil.texture,
    ph: p.soil.ph === null ? "" : String(p.soil.ph).replace(".", ","),
    organicMatter: p.soil.organicMatter === null ? "" : String(p.soil.organicMatter).replace(".", ","),
    drainage: p.soil.drainage,
    compaction: p.soil.compaction,
    erosionHistory: p.soil.erosionHistory,
    notes: p.soil.notes ?? "",
  };
}

export function PropertyFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const existing = useAppStore((s) => s.properties.find((p) => p.id === id));
  const addProperty = useAppStore((s) => s.addProperty);
  const updateProperty = useAppStore((s) => s.updateProperty);
  const setPropertySoilData = useAppStore((s) => s.setPropertySoilData);
  const isEdit = !!id;
  const [params] = useSearchParams();

  const [values, setValues] = useState<PropertyFormValues>(() => (existing ? fromProperty(existing) : EMPTY_FORM));
  // os dois níveis convivem no estado: alternar não apaga nada (RF-SOLO-01)
  const [soilMode, setSoilMode] = useState<SoilMode>(() => (params.get("solo") === "completo" ? "completo" : (existing?.soilMode ?? "simples")));
  const [samples, setSamples] = useState<SoilSample[]>(() => (id ? useAppStore.getState().soilSamples.filter((s) => s.propertyId === id) : []));
  const [history, setHistory] = useState<CropHistoryEntry[]>(() => (id ? useAppStore.getState().cropHistory.filter((s) => s.propertyId === id) : []));
  // laudos enviados nesta edição: se o cadastro for cancelado, saem do armazenamento local
  const uploaded = useRef<string[]>([]);
  const savedRef = useRef(false);
  useEffect(
    () => () => {
      if (!savedRef.current) uploaded.current.forEach((f) => void deleteFile(f));
    },
    [],
  );
  const evidence = useMemo(() => deriveSoilEvidence({ id: id ?? NEW_ID, soil: soilFromValues(values) }, samples), [id, values, samples]);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [searching, setSearching] = useState(false);
  const [flyTarget, setFlyTarget] = useState<[number, number] | null>(null);
  const [drawerKey, setDrawerKey] = useState(0);

  // Perda acidental de dados: avisa antes de sair (link, menu, voltar do navegador ou fechar a aba)
  const [initial] = useState(() => JSON.stringify([values, soilMode, samples, history]));
  const dirty = JSON.stringify([values, soilMode, samples, history]) !== initial;
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  const blocker = useBlocker(({ currentLocation, nextLocation }) => dirtyRef.current && !savedRef.current && currentLocation.pathname !== nextLocation.pathname);
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current && !savedRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, []);
  const leaveDialog = (
    <ConfirmDialog
      open={blocker.state === "blocked"}
      onClose={() => blocker.state === "blocked" && blocker.reset()}
      onConfirm={() => blocker.state === "blocked" && blocker.proceed()}
      tone="default"
      title="Sair sem salvar?"
      description="Você preencheu dados que ainda não foram salvos. Se sair agora, eles serão perdidos."
      confirmLabel="Sair sem salvar"
      cancelLabel="Continuar editando"
    />
  );

  if (isEdit && !existing) {
    return (
      <EmptyState
        icon={<MapPinned />}
        title="Propriedade não encontrada"
        description="Ela pode ter sido excluída."
        action={
          <Link to="/propriedades" className={buttonVariants({ variant: "outline" })}>
            Voltar para propriedades
          </Link>
        }
      />
    );
  }

  const set = <K extends keyof PropertyFormValues>(k: K, v: PropertyFormValues[K]) => {
    const next = { ...values, [k]: v };
    setValues(next);
    if (submitted) setErrors(validateProperty(next));
  };

  const initialCenter: [number, number] = existing?.boundary?.length ? polygonCenter(existing.boundary) : existing ? [existing.latitude, existing.longitude] : CIANORTE_CENTER;

  const findCity = async () => {
    if (values.city.trim().length < 2) {
      setErrors((e) => ({ ...e, city: "Digite o município para localizar no mapa." }));
      return;
    }
    setSearching(true);
    try {
      const q = encodeURIComponent(`${values.city.trim()}, ${values.state}, Brasil`);
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${q}`, {
        headers: { "Accept-Language": "pt-BR" },
      });
      const json = (await res.json()) as { lat: string; lon: string }[];
      if (!json.length) throw new Error();
      setFlyTarget([Number(json[0].lat), Number(json[0].lon)]);
    } catch {
      toast.error("Município não encontrado", "Confira o nome ou navegue pelo mapa manualmente.");
    } finally {
      setSearching(false);
    }
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (saving) return; // duplo clique / Enter repetido não cadastra duas vezes
    setSubmitted(true);
    const errs = validateProperty(values);
    setErrors(errs);
    if (Object.keys(errs).length) {
      toast.error("Revise os campos destacados", errs.boundary ?? `${Object.keys(errs).length} campo(s) precisam de correção.`);
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 300));
    const input = { ...toPropertyInput(values), soilMode };
    if (isEdit && existing) {
      setPropertySoilData(existing.id, samples, history);
      updateProperty(existing.id, input);
      toast.success("Propriedade atualizada", input.name);
    } else {
      const p = addProperty(input);
      setPropertySoilData(p.id, samples, history);
      toast.success("Propriedade cadastrada", `${input.name} · ${input.areaHa.toLocaleString("pt-BR")} ha`);
    }
    savedRef.current = true;
    const drafts = samples.filter((s) => s.status === "rascunho").length;
    if (drafts) toast.info(`${drafts} análise(s) em rascunho`, "Confirme os valores para que entrem na avaliação.");
    setSaving(false);
    navigate("/propriedades");
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      {leaveDialog}
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link to="/propriedades" className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> Propriedades
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-brand-dark">{isEdit ? "Editar propriedade" : "Nova propriedade"}</h1>
        </div>
        {!isEdit && (
          <Button
            variant="ghost"
            onClick={() => {
              setValues(CIANORTE_EXAMPLE);
              setErrors({});
              setDrawerKey((k) => k + 1);
            }}
          >
            <WandSparkles /> Usar exemplo de Cianorte
          </Button>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_380px]">
        {/* Mapa */}
        <div className="flex min-w-0 flex-col gap-2">
          <AreaDrawer
            key={drawerKey}
            points={values.boundary}
            onChange={(pts) => set("boundary", pts)}
            initialCenter={values.boundary.length ? polygonCenter(values.boundary) : initialCenter}
            flyTarget={flyTarget}
          />
          {errors.boundary ? (
            <p className="text-[13px] text-danger">{errors.boundary}</p>
          ) : (
            <p className="text-[13px] text-muted-foreground">Arraste os pontos para ajustar.</p>
          )}
        </div>

        {/* Campos */}
        <Card className="flex h-fit flex-col lg:sticky lg:top-20">
          <div className="flex flex-col gap-6 p-5">
            {/* 1 · Identificação */}
            <FormSection n={1} title="Identificação" done={values.name.trim().length >= 2 && values.city.trim().length >= 2}>
              <Field label="Nome" error={errors.name}>
                {(p) => <Input {...p} value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Sítio Santa Clara" />}
              </Field>
              <div className="grid grid-cols-[1fr_84px] gap-2">
                <Field label="Município" error={errors.city}>
                  {(p) => (
                    <div className="relative">
                      <Input
                        {...p}
                        value={values.city}
                        onChange={(e) => set("city", e.target.value)}
                        placeholder="Cianorte"
                        className="pr-10"
                        onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), findCity())}
                      />
                      <button
                        type="button"
                        onClick={findCity}
                        disabled={searching}
                        aria-label="Localizar município no mapa"
                        title="Localizar no mapa"
                        className="absolute right-1 top-1/2 flex size-7 -translate-y-1/2 cursor-pointer items-center justify-center rounded-[8px] text-muted-foreground hover:bg-primary-soft hover:text-primary disabled:opacity-50"
                      >
                        {searching ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
                      </button>
                    </div>
                  )}
                </Field>
                <Field label="UF" error={errors.state}>
                  {(p) => (
                    <Select {...p} value={values.state} onChange={(e) => set("state", e.target.value)}>
                      {BRAZIL_STATES.map((uf) => (
                        <option key={uf}>{uf}</option>
                      ))}
                    </Select>
                  )}
                </Field>
              </div>
            </FormSection>

            {/* 2 · Área (desenhada no mapa) */}
            <FormSection n={2} title="Área" done={values.boundary.length >= 3}>
              {values.boundary.length >= 3 ? (
                <div className="flex items-baseline justify-between rounded-[10px] bg-primary-soft/60 px-3 py-2.5">
                  <p className="tabular text-[22px] font-bold leading-none text-brand-dark">
                    {fmt.n1(polygonAreaHa(values.boundary))}
                    <span className="ml-1 text-sm font-semibold">ha</span>
                  </p>
                  <p className="text-xs text-muted-foreground">{values.boundary.length} pontos</p>
                </div>
              ) : (
                <p className={cn("flex items-center gap-2 rounded-[10px] bg-muted px-3 py-2.5 text-[13px]", errors.boundary ? "text-danger" : "text-muted-foreground")}>
                  <MousePointerClick className="size-4 shrink-0" />
                  <span className="hidden lg:inline">Clique nos cantos da área no mapa ao lado.</span>
                  <span className="lg:hidden">Toque nos cantos da área no mapa acima.</span>
                </p>
              )}
            </FormSection>

            {/* 3 · Solo */}
            <FormSection
              n={3}
              title="Solo"
              aside={
                <Segmented<SoilMode>
                  aria-label="Nível do cadastro de solo"
                  value={soilMode}
                  onChange={setSoilMode}
                  options={[
                    { value: "simples", label: "Simples" },
                    { value: "completo", label: "Completo" },
                  ]}
                />
              }
            >
              {soilMode === "completo" && <p className="-mt-1 text-xs text-muted-foreground">Laudo e histórico ficam abaixo do mapa.</p>}
              <div className="flex flex-col gap-1.5">
                <Label>Textura</Label>
                <SoilTexturePicker value={values.texture} onChange={(v) => set("texture", v)} />
                <HelpTip question="Como sei se minha terra é arenosa?">
                  Pegue um punhado de terra úmida e aperte na mão. <strong>Arenosa</strong>: é áspera e esfarela, não forma bolinha.{" "}
                  <strong>Média</strong>: forma bolinha que quebra fácil. <strong>Argilosa</strong>: faz rolinho e gruda nos dedos. Na dúvida, escolha
                  “Média” — dá para mudar depois ou informar a análise de solo no cadastro completo.
                </HelpTip>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Drenagem</Label>
                <ChoiceChips
                  aria-label="Drenagem do solo"
                  value={values.drainage}
                  onChange={(v) => set("drainage", v)}
                  options={Object.entries(DRAINAGE_LABEL).map(([value, label]) => ({ value: value as PropertyFormValues["drainage"], label }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Field label="pH" optional error={errors.ph}>
                  {(p) => <Input {...p} inputMode="decimal" value={values.ph} onChange={(e) => set("ph", e.target.value)} placeholder="5,5" />}
                </Field>
                <Field label="M.O." optional error={errors.organicMatter}>
                  {(p) => (
                    <div className="relative">
                      <Input {...p} inputMode="decimal" value={values.organicMatter} onChange={(e) => set("organicMatter", e.target.value)} placeholder="1,8" className="pr-8" />
                      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-subtle-foreground">%</span>
                    </div>
                  )}
                </Field>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label>Sinais na área</Label>
                <div className="flex flex-wrap gap-1.5">
                  <ToggleChip checked={values.compaction} onCheckedChange={(v) => set("compaction", v)}>
                    Compactação
                  </ToggleChip>
                  <ToggleChip checked={values.erosionHistory} onCheckedChange={(v) => set("erosionHistory", v)}>
                    Erosão
                  </ToggleChip>
                </div>
              </div>
              <Field label="Observações" optional error={errors.notes}>
                {(p) => <Textarea {...p} rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} placeholder="Ex.: baixada encharca no verão" />}
              </Field>
            </FormSection>
          </div>

          <div className="flex gap-2 rounded-b-lg border-t border-border bg-muted/40 px-5 py-3">
            <Link to="/propriedades" className={buttonVariants({ variant: "ghost", className: "flex-1" })}>
              Cancelar
            </Link>
            <Button type="submit" loading={saving} className="flex-[2]">
              {isEdit ? "Salvar alterações" : "Cadastrar propriedade"}
            </Button>
          </div>
        </Card>
      </div>

      {soilMode === "completo" ? (
        <div className="mt-5 flex flex-col gap-5">
          <Card className="p-5">
            <h2 className="mb-3 text-lg font-semibold tracking-tight">O que a avaliação vai usar</h2>
            <SoilEvidenceSummary evidence={evidence} />
            <p className="mt-3 text-xs text-muted-foreground">
              Mais dados tornam a avaliação mais específica, desde que sejam representativos da área. Isso não significa, por si só, maior precisão
              estatística — essa melhoria depende de validação agronômica das regras.
            </p>
          </Card>
          <Card className="p-5">
            <SoilSamplesSection
              propertyId={id ?? NEW_ID}
              samples={samples}
              onChange={setSamples}
              onFileStored={(f) => uploaded.current.push(f)}
            />
          </Card>
          <Card className="p-5">
            <CropHistorySection propertyId={id ?? NEW_ID} entries={history} onChange={setHistory} />
          </Card>
        </div>
      ) : (
        (samples.length > 0 || history.length > 0) && (
          <p className="mt-4 text-[13px] text-muted-foreground">
            Esta propriedade tem {samples.length} análise(s) de solo e {history.length} safra(s) no histórico — continuam salvas; veja em “Cadastro completo”.
          </p>
        )
      )}
    </form>
  );
}
