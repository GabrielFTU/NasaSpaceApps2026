import { CROP_MAP, DRAINAGE_LABEL, FALLOW_ID, PRIORITY_LABEL, SOIL_TEXTURE_LABEL, cropName } from "@/data/crops";
import { windowLabel } from "@/services/zarc";
import type { Crop, Priorities, PriorityKey, Property, SoilProfile, ZarcResult } from "@/types";

const WEIGHT = ["nada", "muito baixa", "baixa", "média", "alta", "muito alta"];
const SEASON = { verao: "verão", inverno: "2ª safra/inverno", anual: "anual" } as const;

interface Input {
  step: string;
  catalog?: { properties: Property[]; verao: Crop[]; inverno: Crop[]; interesse: Crop[] };
  conversationState?: string;
  zarcCropIds?: string[];
  property: Property | null;
  soil: SoilProfile | null;
  currentVerao: string;
  currentInverno: string;
  interest: string[];
  priorities: Priorities;
  zarc: ZarcResult | null;
}

export function buildAnalysisContext(i: Input): string {
  const lines: string[] = [`Etapa atual do formulário: ${i.step}`];

  if (i.catalog) {
    const { properties, verao, inverno, interesse } = i.catalog;
    lines.push(`Propriedades cadastradas (id | nome): ${properties.map((x) => `${x.id} | ${x.name} (${x.city}/${x.state})`).join("; ")}`);
    const zoned = (c: Crop) => {
      if (i.zarc?.origin !== "real" || !c.zarc) return "";
      const ok = Object.entries(i.zarc.entries).filter(([, e]) => e.cropId === c.id && e.zoned).map(([, e]) => SEASON[e.season]);
      return ok.length ? ` [ZARC ok: ${[...new Set(ok)].join(", ")}]` : " [fora do ZARC no município]";
    };
    const list = (cs: Crop[]) => cs.map((c) => `${c.id} (${c.name})${zoned(c)}`).join("; ");
    lines.push(`Catálogo — ids válidos para o verão atual: ${list(verao)}`);
    lines.push(`Catálogo — ids válidos para o inverno atual: pousio; ${list(inverno)}`);
    lines.push(`Catálogo — ids válidos para culturas de interesse: ${list(interesse)}`);
  }

  if (i.conversationState) lines.push(i.conversationState);

  const p = i.property;
  if (!p) return [...lines, i.conversationState ? "" : "Nenhuma propriedade selecionada."].join("\n");

  lines.push(`Propriedade: ${p.name} — ${p.city}/${p.state}, ${p.areaHa.toFixed(1)} ha (lat ${p.latitude.toFixed(3)}, lon ${p.longitude.toFixed(3)})`);

  if (i.conversationState) {
    pushZarc(lines, i.zarc, i.zarcCropIds ?? []);
    return lines.join("\n");
  }

  const s = i.soil ?? p.soil;
  const soil = [
    `textura ${SOIL_TEXTURE_LABEL[s.texture].toLowerCase()}`,
    `drenagem ${DRAINAGE_LABEL[s.drainage].toLowerCase()}`,
    s.ph !== null ? `pH ${s.ph}` : "pH não informado",
    s.organicMatter !== null ? `matéria orgânica ${s.organicMatter}%` : "M.O. não informada",
    s.compaction ? "com sinais de compactação" : null,
    s.erosionHistory ? "com histórico de erosão" : null,
  ].filter(Boolean);
  lines.push(`Solo: ${soil.join(", ")}${s.notes ? `. Observações: ${s.notes}` : ""}`);

  lines.push(`Rotação atual: verão = ${cropName(i.currentVerao)}; inverno = ${i.currentInverno === FALLOW_ID ? "pousio" : cropName(i.currentInverno)}`);
  lines.push(`Culturas de interesse: ${i.interest.map(cropName).join(", ") || "nenhuma"}`);
  lines.push(
    `Prioridades (peso 0–5): ${(Object.keys(i.priorities) as PriorityKey[]).map((k) => `${PRIORITY_LABEL[k]} ${WEIGHT[i.priorities[k]] ?? i.priorities[k]}`).join("; ")}`,
  );

  pushZarc(lines, i.zarc, i.zarcCropIds ?? [i.currentVerao, i.currentInverno, ...i.interest]);
  return lines.join("\n");
}

/** Janelas do ZARC das culturas citadas (só as que existem no zoneamento). */
function pushZarc(lines: string[], z: ZarcResult | null, cropIds: string[]) {
  if (z?.origin === "real") {
    const ids = new Set(cropIds.filter((id) => id !== FALLOW_ID));
    const rows = Object.entries(z.entries)
      .filter(([, e]) => ids.has(e.cropId))
      .map(([, e]) => {
        const name = CROP_MAP[e.cropId]?.name ?? e.cropId;
        if (!e.zoned) return `- ${name} (${SEASON[e.season]}): sem janela indicada`;
        return `- ${name} (${SEASON[e.season]}): ${e.windows.map((w) => `${windowLabel(w.startDec, w.endDec)} (${w.risk}% de risco)`).join("; ")}`;
      });
    if (rows.length) lines.push(`Janelas de plantio do ZARC no município (risco = chance de perda):\n${rows.join("\n")}`);
  } else if (z) {
    lines.push(`ZARC indisponível: ${z.reason}`);
  }
}
