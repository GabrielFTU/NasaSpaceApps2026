import { useRef, useState } from "react";
import { Copy, FileUp, Layers, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import { ACCEPTED_TYPES, MAX_FILE_BYTES, saveFile } from "@/lib/fileStore";
import type { SoilSample } from "@/types";
import { depthLabel, emptySample } from "./model";
import { SoilSampleEditor } from "./SoilSampleEditor";
import { AttachmentLink } from "./AttachmentLink";

/**
 * Lista de análises de solo da propriedade (cadastro completo), com o fluxo
 * "Tenho uma análise de solo": preencher manualmente ou anexar o laudo (RF-SOLO-02/03/04/07).
 */
export function SoilSamplesSection({
  propertyId,
  samples,
  onChange,
  onFileStored,
}: {
  propertyId: string;
  samples: SoilSample[];
  onChange: (s: SoilSample[]) => void;
  /** Avisa o formulário de um arquivo novo no armazenamento local (para limpar se o cadastro for cancelado). */
  onFileStored: (fileId: string) => void;
}) {
  const [editing, setEditing] = useState<SoilSample | null>(null);
  const [chooser, setChooser] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const startManual = (base?: SoilSample) => {
    setChooser(false);
    setEditing(base ?? emptySample(propertyId, samples[0]?.plot));
  };

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    if (!ACCEPTED_TYPES.includes(file.type)) return toast.error("Formato não suportado", "Envie o laudo em PDF, PNG, JPG ou WEBP.");
    if (file.size > MAX_FILE_BYTES) return toast.error("Arquivo muito grande", "O limite é 10 MB.");
    const fileId = `laudo_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
    try {
      await saveFile(fileId, file);
    } catch (e) {
      return toast.error("Não foi possível guardar o laudo", e instanceof Error ? e.message : undefined);
    }
    onFileStored(fileId);
    startManual({ ...emptySample(propertyId, samples[0]?.plot), attachment: { fileId, name: file.name, type: file.type, size: file.size } });
  };

  const save = (s: SoilSample) => {
    const exists = samples.some((x) => x.id === s.id);
    onChange(exists ? samples.map((x) => (x.id === s.id ? s : x)) : [...samples, s]);
    setEditing(null);
    toast.success(s.status === "confirmada" ? "Análise confirmada" : "Rascunho salvo", "Salve a propriedade para gravar as alterações.");
  };

  /** Nova camada da mesma coleta: mesmo talhão, data, laboratório e laudo, profundidade seguinte. */
  const addLayer = (s: SoilSample) => {
    const span = (s.depthBottomCm ?? 20) - (s.depthTopCm ?? 0);
    const base = emptySample(propertyId, s.plot);
    startManual({ ...base, date: s.date, lab: s.lab, attachment: s.attachment, depthTopCm: s.depthBottomCm, depthBottomCm: (s.depthBottomCm ?? 0) + span });
  };

  const sorted = [...samples].sort(
    (a, b) => a.plot.localeCompare(b.plot) || (b.date ?? "").localeCompare(a.date ?? "") || (a.depthTopCm ?? 0) - (b.depthTopCm ?? 0),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">Análises de solo</h3>
          <p className="text-[13px] text-muted-foreground">Uma por talhão, data e profundidade. Só as confirmadas entram na avaliação.</p>
        </div>
        {!editing && (
          <Button onClick={() => setChooser((v) => !v)} aria-expanded={chooser}>
            <Plus /> Tenho uma análise de solo
          </Button>
        )}
      </div>

      {chooser && !editing && (
        <div className="animate-in grid grid-cols-1 gap-2 rounded-lg border border-border bg-muted/50 p-3 sm:grid-cols-2">
          <button type="button" onClick={() => startManual()} className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-white p-3 text-left hover:border-primary">
            <Pencil className="mt-0.5 size-5 text-primary" />
            <span>
              <strong className="block text-sm">Preencher manualmente</strong>
              <span className="text-xs text-muted-foreground">Digite os resultados do laudo, com unidade e método.</span>
            </span>
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} className="flex cursor-pointer items-start gap-3 rounded-md border border-border bg-white p-3 text-left hover:border-primary">
            <FileUp className="mt-0.5 size-5 text-primary" />
            <span>
              <strong className="block text-sm">Enviar o laudo (PDF ou imagem)</strong>
              <span className="text-xs text-muted-foreground">Fica guardado neste navegador. Você confere e digita os valores ao lado do documento.</span>
            </span>
          </button>
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="hidden"
            onChange={(e) => {
              void onFile(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </div>
      )}

      {editing && <SoilSampleEditor key={editing.id} sample={editing} onSave={save} onCancel={() => setEditing(null)} />}

      {sorted.length === 0 && !editing && !chooser && (
        <p className="rounded-md border border-dashed border-input px-4 py-6 text-center text-sm text-muted-foreground">
          Nenhuma análise cadastrada. A avaliação usa o cadastro simples até você informar um laudo.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {sorted.map((s) => (
          <li key={s.id} className={cn("flex flex-col gap-2 rounded-md border border-border px-3 py-2.5 sm:flex-row sm:items-center", editing?.id === s.id && "opacity-50")}>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <strong className="text-sm">{s.plot}</strong>
                <span className="text-[13px] text-muted-foreground">
                  · {s.date ? formatDate(s.date) : "sem data"} · {depthLabel(s)}
                  {s.lab && ` · ${s.lab}`}
                </span>
                <Badge variant={s.status === "confirmada" ? "success" : "warning"}>{s.status === "confirmada" ? "Confirmada" : "Rascunho"}</Badge>
                {s.measurements.some((m) => m.origin === "exemplo") && <Badge variant="warning">Valores de exemplo</Badge>}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                <span>{s.measurements.length} indicador(es)</span>
                {s.attachment && <AttachmentLink attachment={s.attachment} />}
              </div>
            </div>
            <div className="flex shrink-0 gap-1">
              <Button variant="ghost" size="sm" onClick={() => startManual(s)} disabled={!!editing}>
                <Pencil /> Editar
              </Button>
              <Button variant="ghost" size="sm" onClick={() => addLayer(s)} disabled={!!editing} title="Outra profundidade da mesma coleta">
                <Layers /> Camada
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => startManual({ ...s, id: emptySample(propertyId).id, status: "rascunho", attachment: undefined, measurements: s.measurements.map((m) => ({ ...m, verified: false })) })}
                disabled={!!editing}
                aria-label="Duplicar análise"
                title="Duplicar (ex.: nova coleta do mesmo talhão)"
              >
                <Copy />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-danger hover:bg-danger-soft"
                onClick={() => onChange(samples.filter((x) => x.id !== s.id))}
                disabled={!!editing}
                aria-label="Excluir análise"
              >
                <Trash2 />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
