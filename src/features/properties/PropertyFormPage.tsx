import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, MapPinned, Search, WandSparkles } from "lucide-react";
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
import { CheckboxCard, Field, Input, Select, Textarea } from "@/components/ui/form";
import { toast } from "@/components/ui/toast";
import { AreaDrawer } from "@/components/maps";
import { BRAZIL_STATES } from "@/data/sampleProperties";
import { DRAINAGE_LABEL, SOIL_TEXTURE_LABEL } from "@/data/crops";
import { polygonCenter } from "@/lib/geo";
import type { Property } from "@/types";
import { CIANORTE_EXAMPLE, EMPTY_FORM, soilFromValues, toPropertyInput, validateProperty, type FormErrors, type PropertyFormValues } from "./validation";

const NEW_ID = "nova";
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
        <Card className="flex h-fit flex-col gap-4 p-5">
          <Field label="Nome da propriedade" error={errors.name}>
            {(p) => <Input {...p} value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="Ex.: Sítio Santa Clara" />}
          </Field>
          <div className="grid grid-cols-[1fr_88px] gap-3">
            <Field label="Município" error={errors.city}>
              {(p) => (
                <div className="flex gap-1.5">
                  <Input {...p} value={values.city} onChange={(e) => set("city", e.target.value)} placeholder="Cianorte" onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), findCity())} />
                  <Button variant="outline" size="icon" onClick={findCity} loading={searching} aria-label="Localizar município no mapa" title="Localizar no mapa">
                    {!searching && <Search />}
                  </Button>
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

          <div className="h-px bg-border" />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">Solo</p>
            <Segmented<SoilMode>
              aria-label="Nível do cadastro de solo"
              value={soilMode}
              onChange={setSoilMode}
              options={[
                { value: "simples", label: "Cadastro simples" },
                { value: "completo", label: "Cadastro completo" },
              ]}
            />
          </div>
          {soilMode === "completo" && (
            <p className="-mt-2 text-xs text-muted-foreground">
              Os campos abaixo continuam valendo como base; o laudo, logo abaixo do mapa, substitui o que medir.
            </p>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Textura">
              {(p) => (
                <Select {...p} value={values.texture} onChange={(e) => set("texture", e.target.value as PropertyFormValues["texture"])}>
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
                <Select {...p} value={values.drainage} onChange={(e) => set("drainage", e.target.value as PropertyFormValues["drainage"])}>
                  {Object.entries(DRAINAGE_LABEL).map(([k, l]) => (
                    <option key={k} value={k}>
                      {l}
                    </option>
                  ))}
                </Select>
              )}
            </Field>
            <Field label="pH" optional error={errors.ph}>
              {(p) => <Input {...p} inputMode="decimal" value={values.ph} onChange={(e) => set("ph", e.target.value)} placeholder="5,5" />}
            </Field>
            <Field label="M.O. (%)" optional error={errors.organicMatter}>
              {(p) => <Input {...p} inputMode="decimal" value={values.organicMatter} onChange={(e) => set("organicMatter", e.target.value)} placeholder="1,8" />}
            </Field>
          </div>
          <CheckboxCard checked={values.compaction} onCheckedChange={(v) => set("compaction", v)} label="Sinais de compactação" />
          <CheckboxCard checked={values.erosionHistory} onCheckedChange={(v) => set("erosionHistory", v)} label="Histórico de erosão" />
          <Field label="Observações" optional error={errors.notes}>
            {(p) => <Textarea {...p} rows={2} value={values.notes} onChange={(e) => set("notes", e.target.value)} />}
          </Field>

          <div className="flex gap-2 pt-1">
            <Link to="/propriedades" className={buttonVariants({ variant: "outline", className: "flex-1" })}>
              Cancelar
            </Link>
            <Button type="submit" loading={saving} className="flex-1">
              {isEdit ? "Salvar" : "Cadastrar"}
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
