import type { Property } from "@/types";
import { polygonAreaHa, rectAround } from "@/lib/geo";
import { round } from "@/lib/utils";

/**
 * Propriedades demonstrativas. Cianorte (PR) está sobre a formação Arenito Caiuá,
 * com predominância de solos de textura arenosa — característica refletida no perfil abaixo.
 * Nomes e contornos são fictícios.
 */
const cianorteBoundary = rectAround(-23.6599, -52.6054, 720, 680);
const tapejaraBoundary = rectAround(-23.7317, -52.8738, 1200, 1060);

export const SAMPLE_PROPERTIES: Property[] = [
  {
    id: "prop_cianorte",
    name: "Sítio Santa Clara",
    city: "Cianorte",
    state: "PR",
    latitude: -23.6599,
    longitude: -52.6054,
    boundary: cianorteBoundary,
    areaHa: round(polygonAreaHa(cianorteBoundary), 1),
    soil: {
      texture: "arenosa",
      ph: 5.4,
      organicMatter: 1.6,
      drainage: "boa",
      compaction: false,
      erosionHistory: true,
      notes: "Arenito Caiuá. Sulcos de erosão observados na área de baixada em 2024.",
    },
    createdAt: "2026-03-02T12:00:00.000Z",
    updatedAt: "2026-03-02T12:00:00.000Z",
  },
  {
    id: "prop_tapejara",
    name: "Fazenda Água Limpa",
    city: "Tapejara",
    state: "PR",
    latitude: -23.7317,
    longitude: -52.8738,
    boundary: tapejaraBoundary,
    areaHa: round(polygonAreaHa(tapejaraBoundary), 1),
    soil: {
      texture: "media",
      ph: 5.8,
      organicMatter: 2.1,
      drainage: "moderada",
      compaction: true,
      erosionHistory: false,
    },
    createdAt: "2026-04-18T12:00:00.000Z",
    updatedAt: "2026-04-18T12:00:00.000Z",
  },
];

export const BRAZIL_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA", "PB",
  "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;
