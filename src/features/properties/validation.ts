import type { PropertyInput, SoilProfile } from "@/types";
import { polygonAreaHa, polygonCenter, rectAround } from "@/lib/geo";
import { round } from "@/lib/utils";

export interface PropertyFormValues {
  name: string;
  city: string;
  state: string;
  boundary: [number, number][];
  texture: SoilProfile["texture"];
  ph: string;
  organicMatter: string;
  drainage: SoilProfile["drainage"];
  compaction: boolean;
  erosionHistory: boolean;
  notes: string;
}

export type FormErrors = Partial<Record<keyof PropertyFormValues, string>>;

const num = (s: string) => Number(s.trim().replace(",", "."));
const isNum = (s: string) => s.trim() !== "" && Number.isFinite(num(s));

const BR = { latMin: -33.8, latMax: 5.3, lonMin: -74, lonMax: -34.7 };

export function validateProperty(v: PropertyFormValues): FormErrors {
  const e: FormErrors = {};
  if (v.name.trim().length < 2) e.name = "Informe o nome da propriedade.";
  else if (v.name.trim().length > 80) e.name = "Use no máximo 80 caracteres.";
  if (v.city.trim().length < 2) e.city = "Informe o município.";
  if (!v.state) e.state = "Selecione o estado.";

  if (v.boundary.length < 3) e.boundary = "Desenhe o contorno da área no mapa (mínimo de 3 pontos).";
  else {
    const [lat, lon] = polygonCenter(v.boundary);
    const area = polygonAreaHa(v.boundary);
    if (lat < BR.latMin || lat > BR.latMax || lon < BR.lonMin || lon > BR.lonMax) e.boundary = "A área desenhada está fora do território brasileiro.";
    else if (area < 0.05) e.boundary = "A área desenhada é muito pequena. Confira os pontos.";
    else if (area > 100000) e.boundary = "A área desenhada passa de 100.000 ha. Confira os pontos.";
  }

  if (v.ph.trim() !== "" && (!isNum(v.ph) || num(v.ph) < 3.5 || num(v.ph) > 9)) e.ph = "pH entre 3,5 e 9,0.";
  if (v.organicMatter.trim() !== "" && (!isNum(v.organicMatter) || num(v.organicMatter) < 0 || num(v.organicMatter) > 15))
    e.organicMatter = "Valor entre 0 e 15%.";
  if (v.notes.length > 500) e.notes = "Use no máximo 500 caracteres.";
  return e;
}

export function toPropertyInput(v: PropertyFormValues): PropertyInput {
  const [lat, lon] = polygonCenter(v.boundary);
  return {
    name: v.name.trim(),
    city: v.city.trim(),
    state: v.state,
    latitude: Number(lat.toFixed(6)),
    longitude: Number(lon.toFixed(6)),
    boundary: v.boundary.map(([a, b]) => [Number(a.toFixed(6)), Number(b.toFixed(6))]),
    areaHa: round(polygonAreaHa(v.boundary), 2),
    soil: soilFromValues(v),
  };
}

/** Perfil declarado (cadastro simples); valores inválidos viram "não informado". */
export function soilFromValues(v: PropertyFormValues): SoilProfile {
  const opt = (s: string) => (isNum(s) ? num(s) : null);
  return {
    texture: v.texture,
    ph: opt(v.ph),
    organicMatter: opt(v.organicMatter),
    drainage: v.drainage,
    compaction: v.compaction,
    erosionHistory: v.erosionHistory,
    notes: v.notes.trim() || undefined,
  };
}

export const EMPTY_FORM: PropertyFormValues = {
  name: "",
  city: "",
  state: "PR",
  boundary: [],
  texture: "media",
  ph: "",
  organicMatter: "",
  drainage: "boa",
  compaction: false,
  erosionHistory: false,
  notes: "",
};

export const CIANORTE_EXAMPLE: PropertyFormValues = {
  name: "Sítio Novo Horizonte",
  city: "Cianorte",
  state: "PR",
  boundary: rectAround(-23.6631, -52.6407, 600, 540),
  texture: "arenosa",
  ph: "5,3",
  organicMatter: "1,4",
  drainage: "boa",
  compaction: false,
  erosionHistory: true,
  notes: "Exemplo: solo derivado do Arenito Caiuá.",
};
