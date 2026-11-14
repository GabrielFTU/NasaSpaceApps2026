import { useEffect, useMemo, useState } from "react";
import { TriangleAlert } from "lucide-react";
import type { Plot, PlotInput, Property, SoilTexture } from "@/types";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Callout } from "@/components/ui/misc";
import { fmt } from "@/lib/format";
import { round } from "@/lib/utils";
import { pointInPolygon, polygonAreaHa, selfIntersects } from "@/lib/geo";
import { TEXTURE_STYLE } from "@/services/environment/catalog";

interface Props {
  open: boolean;
  onClose: () => void;
  property: Property;
  /** Talhão em edição (dados) — ausente ao criar. */
  plot?: Plot;
  boundary: [number, number][];
  existingNames: string[];
  onSave: (input: PlotInput) => void;
}

export function PlotFormDialog({ open, onClose, property, plot, boundary, existingNames, onSave }: Props) {
  const [name, setName] = useState("");
  const [crop, setCrop] = useState("");
  const [texture, setTexture] = useState<SoilTexture | "">("");
  const [notes, setNotes] = useState("");
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (!open) return;
    setName(plot?.name ?? `Talhão ${existingNames.length + 1}`);
    setCrop(plot?.currentCrop ?? "");
    setTexture(plot?.soilTexture ?? "");
    setNotes(plot?.notes ?? "");
    setTouched(false);
  }, [open, plot, existingNames.length]);

  const area = useMemo(() => polygonAreaHa(boundary), [boundary]);
  const crossing = useMemo(() => selfIntersects(boundary), [boundary]);
  const outside = useMemo(
    () => !!property.boundary && property.boundary.length >= 3 && boundary.some(([la, lo]) => !pointInPolygon(la, lo, property.boundary!)),
    [boundary, property.boundary],
  );

  const trimmed = name.trim();
  const nameError = !trimmed
    ? "Dê um nome ao talhão."
    : existingNames.some((n) => n.toLowerCase() === trimmed.toLowerCase() && n !== plot?.name)
      ? "Já existe um talhão com esse nome nesta propriedade."
      : undefined;
  const geomError = boundary.length < 3 ? "Desenhe pelo menos 3 vértices." : crossing ? "O contorno se cruza. Arraste os vértices para corrigir." : area < 0.01 ? "Área muito pequena (< 0,01 ha)." : undefined;

  const submit = () => {
    setTouched(true);
    if (nameError || geomError) return;
    onSave({
      propertyId: property.id,
      name: trimmed,
      boundary,
      areaHa: round(area, 2),
      currentCrop: crop.trim() || undefined,
      soilTexture: texture || undefined,
      notes: notes.trim() || undefined,
      demo: plot?.demo && plot.boundary === boundary ? plot.demo : undefined,
    });
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={plot ? "Editar talhão" : "Salvar talhão"}
      description={
        <span className="tabular">
          {fmt.n2(area)} ha · {boundary.length} vértices
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!!geomError}>
            Salvar talhão
          </Button>
        </>
      }
    >
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        {geomError && (
          <Callout tone="warning" icon={<TriangleAlert />}>
            {geomError}
          </Callout>
        )}
        {!geomError && outside && (
          <Callout tone="warning" icon={<TriangleAlert />}>
            Parte do talhão está fora do limite cadastrado da propriedade. Confira o desenho ou o contorno da propriedade.
          </Callout>
        )}
        <Field label="Nome" error={touched ? nameError : undefined}>
          {(p) => <Input {...p} value={name} onChange={(e) => setName(e.target.value)} autoFocus />}
        </Field>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Cultura atual" optional>
            {(p) => <Input {...p} value={crop} onChange={(e) => setCrop(e.target.value)} placeholder="Ex.: soja" />}
          </Field>
          <Field label="Textura do solo" hint={texture ? "Informada para este talhão." : `Usa a da propriedade (${TEXTURE_STYLE[property.soil.texture].label.toLowerCase()}).`}>
            {(p) => (
              <Select {...p} value={texture} onChange={(e) => setTexture(e.target.value as SoilTexture | "")}>
                <option value="">Igual à propriedade</option>
                {Object.entries(TEXTURE_STYLE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Observações" optional>
          {(p) => <Textarea {...p} value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} />}
        </Field>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
