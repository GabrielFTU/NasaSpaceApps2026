import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/form";
import { CROPS } from "@/data/crops";
import type { CropHistoryEntry, Season, YieldUnit } from "@/types";
import { blockEnterSubmit } from "./SoilSampleEditor";

const currentSafra = () => {
  const d = new Date();
  const y = d.getMonth() >= 6 ? d.getFullYear() : d.getFullYear() - 1;
  return `${y}/${y + 1}`;
};

const num = (t: string) => (t.trim() === "" ? null : Number(t.replace(",", ".")));
const txt = (v: number | null) => (v === null ? "" : String(v).replace(".", ","));

/** Histórico agrícola: culturas, safras, produtividade e manejo (cadastro completo). */
export function CropHistorySection({ propertyId, entries, onChange }: { propertyId: string; entries: CropHistoryEntry[]; onChange: (e: CropHistoryEntry[]) => void }) {
  const update = (id: string, patch: Partial<CropHistoryEntry>) => onChange(entries.map((e) => (e.id === id ? { ...e, ...patch } : e)));
  const add = () =>
    onChange([
      ...entries,
      {
        id: `hist_${Math.random().toString(36).slice(2, 10)}`,
        propertyId,
        plot: entries.at(-1)?.plot ?? "Talhão 1",
        safra: currentSafra(),
        season: "verao",
        cropId: "soja",
        yieldValue: null,
        yieldUnit: "sc/ha",
        irrigated: false,
        fertilization: "",
        limingTHa: null,
        coverAfter: "",
      },
    ]);

  return (
    <div className="flex flex-col gap-3" onKeyDown={blockEnterSubmit}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="font-semibold">Histórico agrícola</h3>
          <p className="text-[13px] text-muted-foreground">Registro das safras anteriores. Por enquanto fica só como registro — não altera a comparação.</p>
        </div>
        <Button variant="outline" onClick={add}>
          <Plus /> Adicionar safra
        </Button>
      </div>

      {entries.length === 0 ? (
        <p className="rounded-md border border-dashed border-input px-4 py-5 text-center text-sm text-muted-foreground">Nenhuma safra registrada.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((e) => (
            <li key={e.id} className="grid grid-cols-2 gap-2 rounded-md border border-border p-3 sm:grid-cols-6">
              <Input aria-label="Talhão" value={e.plot} onChange={(x) => update(e.id, { plot: x.target.value })} placeholder="Talhão" />
              <Input aria-label="Safra" value={e.safra} onChange={(x) => update(e.id, { safra: x.target.value })} placeholder="2025/2026" />
              <Select aria-label="Época" value={e.season} onChange={(x) => update(e.id, { season: x.target.value as Season })}>
                <option value="verao">Verão</option>
                <option value="inverno">2ª safra / inverno</option>
              </Select>
              <Select aria-label="Cultura" value={e.cropId} onChange={(x) => update(e.id, { cropId: x.target.value })}>
                {CROPS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
              <div className="flex gap-1">
                <Input aria-label="Produtividade" inputMode="decimal" value={txt(e.yieldValue)} onChange={(x) => update(e.id, { yieldValue: num(x.target.value) })} placeholder="Produt." />
                <Select aria-label="Unidade de produtividade" value={e.yieldUnit} onChange={(x) => update(e.id, { yieldUnit: x.target.value as YieldUnit })} className="w-[84px] px-2 pr-7">
                  <option>sc/ha</option>
                  <option>kg/ha</option>
                  <option>t/ha</option>
                </Select>
              </div>
              <label className="flex h-9 cursor-pointer items-center gap-2 text-[13px]">
                <input type="checkbox" className="accent-[var(--color-primary)]" checked={e.irrigated} onChange={(x) => update(e.id, { irrigated: x.target.checked })} />
                Irrigado
              </label>
              <Input aria-label="Adubação" className="col-span-2" value={e.fertilization} onChange={(x) => update(e.id, { fertilization: x.target.value })} placeholder="Adubação (ex.: 300 kg/ha 04-14-08)" />
              <Input aria-label="Calagem (t/ha)" inputMode="decimal" value={txt(e.limingTHa)} onChange={(x) => update(e.id, { limingTHa: num(x.target.value) })} placeholder="Calcário (t/ha)" />
              <Input aria-label="Cobertura do solo após a colheita" className="col-span-2" value={e.coverAfter} onChange={(x) => update(e.id, { coverAfter: x.target.value })} placeholder="Cobertura após colheita" />
              <Button variant="ghost" size="icon-sm" className="justify-self-end text-danger hover:bg-danger-soft" onClick={() => onChange(entries.filter((x) => x.id !== e.id))} aria-label="Remover safra">
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
