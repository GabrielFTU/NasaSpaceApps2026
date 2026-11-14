import type { Analysis, AnalysisInput, PowerMode, Property, SoilProfile, SoilSample } from "@/types";
import { getDailyClimate } from "@/services/nasa";
import { getZarc } from "@/services/zarc";
import { ENGINE_VERSION, generateComparison } from "@/features/rotations/engine";
import { deriveSoilEvidence, effectiveSoilProfile } from "@/features/soil/model";
import { uid } from "@/lib/utils";
import { summarizeClimate } from "./climateSummary";

/**
 * Gera uma análise completa (clima + ZARC + solo + motor). Usada pelo assistente e pelo
 * recálculo de análises com dados de solo atualizados (RF-SOLO-08) — a análise antiga é mantida.
 */
export async function runAnalysis(opts: {
  property: Property;
  samples: SoilSample[];
  currentRotation: AnalysisInput["currentRotation"];
  interestCropIds: string[];
  priorities: AnalysisInput["priorities"];
  powerMode: PowerMode;
  /** Ajustes feitos no assistente; sem ele, usa o perfil efetivo da propriedade. */
  soil?: SoilProfile;
  recalculatedFrom?: string;
}): Promise<Analysis> {
  const { property } = opts;
  const soilEvidence = deriveSoilEvidence(property, opts.samples);
  const soil = opts.soil ?? effectiveSoilProfile(property.soil, soilEvidence);

  const [series, zarc] = await Promise.all([
    getDailyClimate(property.latitude, property.longitude, opts.powerMode),
    getZarc({ city: property.city, state: property.state }, soil.texture),
  ]);
  const climate = summarizeClimate(series);
  const input: AnalysisInput = {
    propertyId: property.id,
    currentRotation: opts.currentRotation,
    interestCropIds: opts.interestCropIds,
    soil,
    soilEvidence,
    priorities: opts.priorities,
  };

  return {
    id: uid("an"),
    createdAt: new Date().toISOString(),
    propertyId: property.id,
    propertySnapshot: {
      name: property.name,
      city: property.city,
      state: property.state,
      latitude: property.latitude,
      longitude: property.longitude,
      areaHa: property.areaHa,
    },
    input,
    climate,
    zarc,
    scenarios: generateComparison(input, climate, zarc),
    engineVersion: ENGINE_VERSION,
    ...(opts.recalculatedFrom && { recalculatedFrom: opts.recalculatedFrom }),
  };
}
