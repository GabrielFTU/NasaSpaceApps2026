import type { SoilTexture, ZarcSeason } from "@/types";
import { CROPS } from "@/data/crops";

/**
 * Culturas do catálogo de rotação que têm zoneamento oficial no ZARC (somente sequeiro),
 * derivadas do campo `zarc` de src/data/crops.ts. Chave `${cropId}:${season}`.
 *
 * Braquiária, crotalária e nabo forrageiro não têm zoneamento próprio — ficam sem restrição do ZARC.
 */
export const ZARC_CROPS: Record<string, { name: string; season: ZarcSeason }> = Object.fromEntries(
  CROPS.flatMap((c) =>
    Object.entries(c.zarc ?? {}).map(([season, name]) => [`${c.id}:${season}`, { name: name as string, season: season as ZarcSeason }]),
  ),
);

export const ZARC_MANEJO_LABEL: Record<number, string> = {
  1: "Sequeiro",
  2: "Irrigado",
  3: "Irrigado c/ controle de geada",
};

export const zarcKey = (cropId: string, season: ZarcSeason) => `${cropId}:${season}`;

/** Códigos de solo da Tábua de Risco (dicionário de dados MAPA). */
export const ZARC_SOIL_LABEL: Record<number, string> = {
  1: "Tipo 1 (arenoso)",
  2: "Tipo 2 (textura média)",
  3: "Tipo 3 (argiloso)",
  11: "AD1",
  12: "AD2",
  13: "AD3",
  14: "AD4",
  15: "AD5",
  16: "AD6",
};

/**
 * Textura informada → classes de solo do ZARC em ordem de preferência.
 * O ZARC atual classifica o solo pela água disponível (AD1 = menor retenção … AD6 = maior);
 * algumas culturas ainda usam os tipos 1–3. A correspondência por textura é APROXIMADA —
 * a classe oficial vem da análise granulométrica, conforme a norma do MAPA para o ZARC.
 */
export const SOIL_PREFERENCE: Record<SoilTexture, number[]> = {
  arenosa: [11, 12, 1],
  media: [13, 12, 14, 2],
  argilosa: [14, 15, 13, 3],
  muito_argilosa: [16, 15, 14, 3],
};

export const SOIL_TEXTURE_ZARC_HINT: Record<SoilTexture, string> = {
  arenosa: "AD1 / Tipo 1",
  media: "AD3 / Tipo 2",
  argilosa: "AD4 / Tipo 3",
  muito_argilosa: "AD6 / Tipo 3",
};

export const ZARC_CYCLE_LABEL: Record<number, string> = {
  13: "Perene",
  19: "Semiperene",
  20: "Grupo I",
  21: "Grupo II",
  22: "Grupo III",
  24: "Grupo IV",
  25: "Grupo V",
  26: "Grupo VI",
};
