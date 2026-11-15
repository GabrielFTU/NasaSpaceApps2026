import type { SoilTexture, ZarcCropSeason, ZarcOtherCrop, ZarcOthersResult, ZarcResult, ZarcRisk, ZarcRiskProfile, ZarcWindow } from "@/types";
import { SOIL_PREFERENCE, ZARC_CROPS, ZARC_CYCLE_LABEL, ZARC_MANEJO_LABEL, ZARC_SOIL_LABEL, SOIL_TEXTURE_ZARC_HINT } from "./crops";

export * from "./crops";
export * from "./decendios";

/**
 * ZARC — Zoneamento Agrícola de Risco Climático (MAPA/Embrapa).
 *
 * Os dados vêm da Tábua de Risco oficial (dados abertos do MAPA), pré-processada por
 * `npm run zarc:sync` em public/zarc/. A tábua indica, por município, cultura, ciclo e classe
 * de solo, em quais decêndios o plantio tem risco de perda de 20%, 30% ou 40%.
 * Plantar dentro da janela é condição para Proagro e para o seguro rural subvencionado.
 *
 *   <UF>.json         culturas do catálogo de rotação (sequeiro)       → getZarc
 *   <UF>-outras.json  demais culturas zoneadas (consulta, c/ irrigado) → getZarcOthers
 */

export const ZARC_SOURCE = {
  name: "ZARC · MAPA",
  url: "https://www.gov.br/agricultura/pt-br/assuntos/riscos-seguro/programa-nacional-de-zoneamento-agricola-de-risco-climatico",
  dataset: "https://dados.agricultura.gov.br/dataset/6d3d141c-885e-41a4-ab7f-dc8ff323b96f",
};

/** [codSolo, codCiclo, codNM, índice do padrão de risco em R, codManejo (só em -outras)] */
type Row = [number, number, number, number, number?];
interface UfFile {
  uf: string;
  safra: string;
  generatedAt: string;
  /** Padrões de risco (36 caracteres: 0 | 2 | 3 | 4), referenciados pelas linhas. */
  R: string[];
  municipios: Record<string, { n: string; c: Record<string, { p: string; r: Row[] }> }>;
}

const fileCache = new Map<string, Promise<UfFile>>();

function loadFile(name: string): Promise<UfFile> {
  const hit = fileCache.get(name);
  if (hit) return hit;
  const p = fetch(`/zarc/${name}.json`)
    .then((r) => {
      if (!r.ok) throw new Error(`Tábua do ZARC "${name}" não encontrada (HTTP ${r.status}). Rode "npm run zarc:sync".`);
      return r.json() as Promise<UfFile>;
    })
    .catch((e) => {
      fileCache.delete(name);
      throw e;
    });
  fileCache.set(name, p);
  return p;
}

export function clearZarcCache() {
  fileCache.clear();
}

const normalize = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[''`´-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const toRisk = (ch: string): ZarcRisk | null => (ch === "2" ? 20 : ch === "3" ? 30 : ch === "4" ? 40 : null);

/** Agrupa decêndios consecutivos com indicação em janelas; trata a virada dez→jan como contínua. */
export function buildWindows(risks: (ZarcRisk | null)[]): ZarcWindow[] {
  if (risks.every((r) => r !== null)) return [{ startDec: 1, endDec: 36, risk: Math.min(...(risks as ZarcRisk[])) as ZarcRisk }];
  // começa logo após um decêndio vazio, para não partir uma janela que cruza o ano
  const firstGap = risks.findIndex((r) => r === null);
  const windows: ZarcWindow[] = [];
  let cur: ZarcWindow | null = null;
  for (let k = 1; k <= 36; k++) {
    const i = (firstGap + k) % 36;
    const r = risks[i];
    if (r === null) {
      if (cur) windows.push(cur);
      cur = null;
    } else if (!cur) cur = { startDec: i + 1, endDec: i + 1, risk: r };
    else {
      cur.endDec = i + 1;
      cur.risk = Math.min(cur.risk, r) as ZarcRisk;
    }
  }
  if (cur) windows.push(cur);
  return windows.sort((a, b) => a.startDec - b.startDec);
}

const EMPTY_PROFILE: ZarcRiskProfile = {
  zoned: false,
  risks: Array(36).fill(null),
  windows: [],
  minRisk: null,
  soilCode: null,
  cycles: [],
  managementLevel: null,
  portaria: null,
};

/**
 * Resume as linhas de uma cultura para a textura informada:
 * 1) classe de solo: a primeira preferida que exista para a cultura no município;
 * 2) nível de manejo (soja): o MENOR publicado — leitura conservadora;
 * 3) por decêndio, o menor risco entre os ciclos (grupos de maturação) indicados.
 */
function summarizeRows(rows: Row[], R: string[], texture: SoilTexture, portaria: string | null): ZarcRiskProfile {
  if (!rows.length) return { ...EMPTY_PROFILE, portaria };
  const available = new Set(rows.map((r) => r[0]));
  const soil = SOIL_PREFERENCE[texture].find((s) => available.has(s));
  if (soil === undefined) return { ...EMPTY_PROFILE, portaria };
  let sel = rows.filter((r) => r[0] === soil);

  const nms = [...new Set(sel.map((r) => r[2]).filter((n) => n > 0))].sort((a, b) => a - b);
  if (nms.length) sel = sel.filter((r) => r[2] === nms[0]);

  const risks: (ZarcRisk | null)[] = Array.from({ length: 36 }, (_, i) => {
    const vals = sel.map((r) => toRisk(R[r[3]][i])).filter((v): v is ZarcRisk => v !== null);
    return vals.length ? (Math.min(...vals) as ZarcRisk) : null;
  });
  const present = risks.filter((r): r is ZarcRisk => r !== null);

  return {
    zoned: present.length > 0,
    risks,
    windows: buildWindows(risks),
    minRisk: present.length ? (Math.min(...present) as ZarcRisk) : null,
    soilCode: soil,
    cycles: [...new Set(sel.map((r) => ZARC_CYCLE_LABEL[r[1]] ?? `Ciclo ${r[1]}`))].sort(),
    managementLevel: nms.length ? `NM${nms[0]}` : null,
    portaria: portaria || null,
  };
}

const soilLabelOf = (profiles: ZarcRiskProfile[], texture: SoilTexture) => {
  const used = [...new Set(profiles.map((e) => e.soilCode).filter((s): s is number => s !== null))].sort((a, b) => b - a);
  return used.length ? used.map((s) => ZARC_SOIL_LABEL[s]).join(" / ") : SOIL_TEXTURE_ZARC_HINT[texture];
};

export type Place = { city: string; state: string };

export const ZARC_UFS = [
  "AC", "AL", "AM", "AP", "BA", "CE", "DF", "ES", "GO", "MA", "MG", "MS", "MT", "PA",
  "PB", "PE", "PI", "PR", "RJ", "RN", "RO", "RR", "RS", "SC", "SE", "SP", "TO",
] as const;

/** Municípios zoneados de uma UF (nomes como publicados, em ordem alfabética). */
export async function listZarcMunicipios(uf: string): Promise<string[]> {
  const data = await loadFile(uf.toUpperCase());
  return Object.values(data.municipios)
    .map((m) => m.n)
    .sort((a, b) => a.localeCompare(b, "pt-BR"));
}

async function findMunicipio(file: string, place: Place) {
  const data = await loadFile(file);
  const target = normalize(place.city);
  const found = Object.entries(data.municipios).find(([, m]) => normalize(m.n) === target);
  return { data, found };
}

/**
 * Janelas do ZARC para as culturas do catálogo de rotação no município da propriedade.
 * Nunca lança: falhas viram `origin: "indisponivel"` com o motivo.
 */
export async function getZarc(place: Place, texture: SoilTexture): Promise<ZarcResult> {
  const unavailable = (reason: string): ZarcResult => ({ origin: "indisponivel", source: ZARC_SOURCE.name, reason });
  if (!place.state || !place.city) return unavailable("Município não informado no cadastro da propriedade.");

  let res: Awaited<ReturnType<typeof findMunicipio>>;
  try {
    res = await findMunicipio(place.state.toUpperCase(), place);
  } catch (e) {
    return unavailable(e instanceof Error ? e.message : "Falha ao carregar a tábua do ZARC.");
  }
  const { data, found } = res;
  if (!found) return unavailable(`"${place.city}/${place.state}" não consta na tábua de risco da safra ${data.safra}.`);
  const [geocodigo, muni] = found;

  const entries: Record<string, ZarcCropSeason> = {};
  for (const [key, meta] of Object.entries(ZARC_CROPS)) {
    const c = muni.c[key];
    entries[key] = { cropId: key.split(":")[0], season: meta.season, ...summarizeRows(c?.r ?? [], data.R, texture, c?.p ?? null) };
  }

  return {
    origin: "real",
    source: ZARC_SOURCE.name,
    safra: data.safra,
    generatedAt: data.generatedAt,
    uf: data.uf,
    municipio: muni.n,
    geocodigo,
    soilLabel: soilLabelOf(Object.values(entries), texture),
    entries,
  };
}

/**
 * Demais culturas zoneadas no município (perenes, frutíferas, cana, olerícolas, forrageiras…),
 * fora do catálogo de rotação. Usa sequeiro quando há; senão, o zoneamento irrigado.
 */
export async function getZarcOthers(place: Place, texture: SoilTexture): Promise<ZarcOthersResult> {
  const unavailable = (reason: string): ZarcOthersResult => ({ origin: "indisponivel", source: ZARC_SOURCE.name, reason });
  if (!place.state || !place.city) return unavailable("Município não informado no cadastro da propriedade.");

  let res: Awaited<ReturnType<typeof findMunicipio>>;
  try {
    res = await findMunicipio(`${place.state.toUpperCase()}-outras`, place);
  } catch (e) {
    return unavailable(e instanceof Error ? e.message : "Falha ao carregar a tábua do ZARC.");
  }
  const { data, found } = res;
  if (!found) return unavailable(`"${place.city}/${place.state}" não tem outras culturas zoneadas na tábua de risco.`);
  const [, muni] = found;

  const crops: ZarcOtherCrop[] = [];
  for (const [name, c] of Object.entries(muni.c)) {
    const manejos = [...new Set(c.r.map((r) => r[4] ?? 1))].sort((a, b) => a - b);
    for (const man of manejos) {
      const profile = summarizeRows(c.r.filter((r) => (r[4] ?? 1) === man), data.R, texture, c.p);
      if (profile.zoned) {
        crops.push({ name, manejo: ZARC_MANEJO_LABEL[man] ?? `Manejo ${man}`, ...profile });
        break; // sequeiro tem prioridade; irrigado só quando não há sequeiro para o solo
      }
    }
  }
  crops.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));

  return { origin: "real", safra: data.safra, uf: data.uf, municipio: muni.n, soilLabel: soilLabelOf(crops, texture), crops };
}
