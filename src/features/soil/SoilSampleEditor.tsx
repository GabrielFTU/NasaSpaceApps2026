import { useMemo, useState, type KeyboardEvent } from "react";
import { ChevronDown, ClipboardCopy, FileText, Info, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/form";
import { Callout } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import { EXAMPLE_MEASUREMENTS, SOIL_PARAMS, SOIL_SECTION_LABEL, type SoilParamDef, type SoilSection } from "@/data/soilParameters";
import type { MeasurementOrigin, SoilMeasurement, SoilParamKey, SoilSample } from "@/types";
import { validateSample } from "./model";
import { AttachmentLink } from "./AttachmentLink";

/** Estado de edição de um indicador: texto livre até salvar. */
interface Draft {
  text: string;
  unit: string;
  method: string;
  origin: MeasurementOrigin;
  verified: boolean;
}

const toText = (v: number) => String(v).replace(".", ",");
const parse = (t: string) => Number(t.trim().replace(/\./g, "").replace(",", "."));
// aceita "0,12" e "0.12" (sem separador de milhar quando há só um ponto)
const parseNum = (t: string) => (/^\s*-?\d+\.\d+\s*$/.test(t) ? Number(t) : parse(t));

function draftsFrom(sample: SoilSample): Partial<Record<SoilParamKey, Draft>> {
  return Object.fromEntries(
    sample.measurements.map((m) => [m.parameter, { text: toText(m.value), unit: m.unit, method: m.method ?? "", origin: m.origin, verified: m.verified }]),
  );
}

export function blockEnterSubmit(e: KeyboardEvent<HTMLElement>) {
  if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
}

const ORIGIN_LABEL: Record<MeasurementOrigin, string> = { manual: "digitado", laudo: "do laudo", exemplo: "exemplo" };

export function SoilSampleEditor({
  sample,
  onSave,
  onCancel,
}: {
  sample: SoilSample;
  onSave: (s: SoilSample) => void;
  onCancel: () => void;
}) {
  const [meta, setMeta] = useState({
    plot: sample.plot,
    date: sample.date ?? "",
    lab: sample.lab,
    top: sample.depthTopCm === null ? "" : String(sample.depthTopCm),
    bottom: sample.depthBottomCm === null ? "" : String(sample.depthBottomCm),
    notes: sample.notes ?? "",
  });
  const [drafts, setDrafts] = useState(() => draftsFrom(sample));
  const [open, setOpen] = useState<Record<SoilSection, boolean>>({ fisica: true, agua: false, fertilidade: true, outros: false });
  const [help, setHelp] = useState<SoilParamKey | null>(null);
  const [tried, setTried] = useState(false);

  /** Origem padrão de um valor digitado: "laudo" quando há documento anexado. */
  const typedOrigin: MeasurementOrigin = sample.attachment ? "laudo" : "manual";

  const built: SoilSample = useMemo(() => {
    const measurements: SoilMeasurement[] = [];
    for (const def of SOIL_PARAMS) {
      const d = drafts[def.key];
      if (!d || d.text.trim() === "") continue;
      measurements.push({
        parameter: def.key,
        value: parseNum(d.text),
        unit: d.unit || def.units[0].unit,
        ...(d.method && { method: d.method }),
        origin: d.origin,
        verified: d.verified,
      });
    }
    const int = (t: string) => (t.trim() === "" ? null : Number(t.replace(",", ".")));
    return {
      ...sample,
      plot: meta.plot.trim(),
      date: meta.date || null,
      lab: meta.lab.trim(),
      depthTopCm: int(meta.top),
      depthBottomCm: int(meta.bottom),
      notes: meta.notes.trim() || undefined,
      measurements,
      updatedAt: new Date().toISOString(),
    };
  }, [drafts, meta, sample]);

  const validation = validateSample(built);
  const errorCount = Object.keys(validation.errors).length;
  const unverified = built.measurements.filter((m) => !m.verified).length;
  const show = (k: string) => (tried ? validation.errors[k] : undefined);

  const setDraft = (def: SoilParamDef, patch: Partial<Draft>) =>
    setDrafts((cur) => {
      const prev = cur[def.key] ?? { text: "", unit: def.units[0].unit, method: "", origin: typedOrigin, verified: false };
      // editar o valor muda a origem para digitado/laudo e exige nova conferência
      const touchedValue = patch.text !== undefined || patch.unit !== undefined || patch.method !== undefined;
      return { ...cur, [def.key]: { ...prev, ...(touchedValue && { origin: typedOrigin, verified: false }), ...patch } };
    });

  const copyExample = () => {
    setDrafts((cur) => {
      const next = { ...cur };
      for (const e of EXAMPLE_MEASUREMENTS)
        next[e.parameter] = { text: toText(e.value), unit: e.unit, method: e.method ?? "", origin: "exemplo", verified: false };
      return next;
    });
    setOpen({ fisica: true, agua: true, fertilidade: true, outros: false });
  };

  const save = (confirm: boolean) => {
    setTried(true);
    if (errorCount) return;
    if (confirm && built.measurements.length === 0) return;
    onSave({
      ...built,
      status: confirm ? "confirmada" : "rascunho",
      measurements: confirm ? built.measurements.map((m) => ({ ...m, verified: true })) : built.measurements,
    });
  };

  const filledIn = (sec: SoilSection) => SOIL_PARAMS.filter((p) => p.section === sec && drafts[p.key]?.text.trim()).length;

  return (
    // o editor fica dentro do <form> da propriedade: Enter num campo não pode enviar o cadastro inteiro
    <div className="animate-in flex flex-col gap-4 rounded-lg border border-primary/40 bg-white p-4" onKeyDown={blockEnterSubmit}>
      {/* Identificação da amostra */}
      <section>
        <h4 className="mb-2 text-sm font-semibold">Identificação da amostra</h4>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-6">
          <Field label="Talhão" error={show("plot")} className="col-span-2 sm:col-span-2">
            {(p) => <Input {...p} value={meta.plot} onChange={(e) => setMeta({ ...meta, plot: e.target.value })} placeholder="Talhão 1" />}
          </Field>
          <Field label="Data da coleta" optional error={show("date")} className="col-span-2 sm:col-span-2">
            {(p) => <Input {...p} type="date" value={meta.date} onChange={(e) => setMeta({ ...meta, date: e.target.value })} />}
          </Field>
          <Field label="Laboratório" optional className="col-span-2 sm:col-span-2">
            {(p) => <Input {...p} value={meta.lab} onChange={(e) => setMeta({ ...meta, lab: e.target.value })} placeholder="Nome do laboratório" />}
          </Field>
          <Field label="Prof. inicial (cm)" error={show("depth")} className="col-span-1 sm:col-span-2">
            {(p) => <Input {...p} inputMode="numeric" value={meta.top} onChange={(e) => setMeta({ ...meta, top: e.target.value })} />}
          </Field>
          <Field label="Prof. final (cm)" className="col-span-1 sm:col-span-2">
            {(p) => <Input {...p} inputMode="numeric" value={meta.bottom} onChange={(e) => setMeta({ ...meta, bottom: e.target.value })} />}
          </Field>
          {sample.attachment && (
            <div className="col-span-2 flex items-end sm:col-span-2">
              <AttachmentLink attachment={sample.attachment} />
            </div>
          )}
        </div>
      </section>

      {sample.attachment && (
        <Callout tone="info" icon={<FileText />}>
          A leitura automática do laudo ainda não está disponível. Abra o documento, digite os valores e confira cada um — eles ficam marcados como
          “do laudo” e só entram na avaliação depois de confirmados.
        </Callout>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">Todos os campos são opcionais. Informe a unidade e o método exatamente como no laudo.</p>
        <Button variant="outline" size="sm" onClick={copyExample}>
          <ClipboardCopy /> Copiar dados de exemplo
        </Button>
      </div>

      {(Object.keys(SOIL_SECTION_LABEL) as SoilSection[]).map((sec) => (
        <section key={sec} className="rounded-md border border-border">
          <button
            type="button"
            onClick={() => setOpen((o) => ({ ...o, [sec]: !o[sec] }))}
            aria-expanded={open[sec]}
            className="flex w-full cursor-pointer items-center justify-between gap-3 px-3 py-2.5 text-left"
          >
            <span>
              <span className="text-sm font-semibold">{SOIL_SECTION_LABEL[sec].title}</span>
              <span className="ml-2 text-xs text-muted-foreground">{SOIL_SECTION_LABEL[sec].description}</span>
            </span>
            <span className="flex items-center gap-2">
              {filledIn(sec) > 0 && <Badge variant="primary">{filledIn(sec)}</Badge>}
              <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open[sec] && "rotate-180")} />
            </span>
          </button>
          {open[sec] && (
            <div className="flex flex-col divide-y divide-border border-t border-border">
              {SOIL_PARAMS.filter((p) => p.section === sec).map((def) => {
                const d = drafts[def.key];
                const err = tried || d?.text ? validation.errors[def.key] : undefined;
                return (
                  <div key={def.key} className="grid grid-cols-1 gap-2 px-3 py-2.5 sm:grid-cols-[minmax(0,1fr)_110px_130px_120px] sm:items-start">
                    <div className="min-w-0">
                      <div className="flex items-center gap-1">
                        <label htmlFor={`soil-${def.key}`} className="text-[13px] font-medium">
                          {def.label}
                          {def.short && def.short !== def.label && <span className="text-muted-foreground"> ({def.short})</span>}
                        </label>
                        <button
                          type="button"
                          onClick={() => setHelp(help === def.key ? null : def.key)}
                          aria-label={`Por que informar ${def.label}?`}
                          aria-expanded={help === def.key}
                          className="cursor-pointer rounded p-0.5 text-muted-foreground hover:text-foreground"
                        >
                          <Info className="size-3.5" />
                        </button>
                        {d?.text && (
                          <Badge variant={d.origin === "exemplo" ? "warning" : "outline"} className="ml-1">
                            {ORIGIN_LABEL[d.origin]}
                          </Badge>
                        )}
                      </div>
                      {help === def.key && <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{def.why}</p>}
                      {err && <p className="mt-1 text-xs text-danger">{err}</p>}
                    </div>
                    <Input
                      id={`soil-${def.key}`}
                      inputMode="decimal"
                      value={d?.text ?? ""}
                      onChange={(e) => setDraft(def, { text: e.target.value })}
                      placeholder="—"
                      aria-invalid={!!err}
                      className={cn(err && "border-danger")}
                    />
                    {def.units.length > 1 ? (
                      <Select aria-label={`Unidade de ${def.label}`} value={d?.unit ?? def.units[0].unit} onChange={(e) => setDraft(def, { unit: e.target.value })}>
                        {def.units.map((u) => (
                          <option key={u.unit}>{u.unit}</option>
                        ))}
                      </Select>
                    ) : (
                      <span className="flex h-9 items-center text-[13px] text-muted-foreground">{def.units[0].unit === "—" ? "" : def.units[0].unit}</span>
                    )}
                    {def.methods ? (
                      <Select aria-label={`Método de ${def.label}`} value={d?.method ?? ""} onChange={(e) => setDraft(def, { method: e.target.value })}>
                        <option value="">Método…</option>
                        {def.methods.map((m) => (
                          <option key={m}>{m}</option>
                        ))}
                      </Select>
                    ) : d?.text ? (
                      <label className="flex h-9 cursor-pointer items-center gap-1.5 text-xs text-muted-foreground">
                        <input type="checkbox" className="accent-[var(--color-primary)]" checked={d.verified} onChange={(e) => setDraft(def, { verified: e.target.checked })} />
                        Conferido
                      </label>
                    ) : (
                      <span />
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ))}

      <Field label="Observações" optional>
        {(p) => <Input {...p} value={meta.notes} onChange={(e) => setMeta({ ...meta, notes: e.target.value })} placeholder="Ex.: amostra composta de 15 subamostras" />}
      </Field>

      {validation.warnings.length > 0 && (
        <Callout tone="warning" icon={<TriangleAlert />}>
          <ul className="list-disc pl-4">
            {validation.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </Callout>
      )}
      {tried && errorCount > 0 && <p className="text-[13px] text-danger">Corrija {errorCount} campo(s) antes de salvar.</p>}

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        <Button variant="ghost" onClick={onCancel}>
          Cancelar
        </Button>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => save(false)}>
            Salvar rascunho
          </Button>
          <Button onClick={() => save(true)} disabled={built.measurements.length === 0} title="Marca todos os valores como conferidos e passa a usar a amostra na avaliação">
            Confirmar valores{unverified > 0 ? ` (${unverified} a conferir)` : ""}
          </Button>
        </div>
      </div>
    </div>
  );
}
