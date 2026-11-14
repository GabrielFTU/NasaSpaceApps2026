import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Analysis, CropHistoryEntry, Plot, PlotInput, Property, PropertyInput, Settings, SoilSample } from "@/types";
import { SAMPLE_PROPERTIES } from "@/data/sampleProperties";
import { SAMPLE_PLOTS } from "@/data/samplePlots";
import { uid } from "@/lib/utils";
import { deleteFile } from "@/lib/fileStore";

/**
 * Estado da aplicação com persistência local (localStorage).
 * As ações espelham as operações de um repositório remoto, para facilitar a troca por
 * Supabase ou uma API .NET sem alterar os componentes.
 */

export const DEFAULT_SETTINGS: Settings = {
  profile: { name: "Produtor demonstrativo", email: "produtor@exemplo.com.br", organization: "", role: "Produtor rural" },
  defaultPeriod: "30d",
  showDataOriginBadges: true,
  powerMode: "api",
  autoSync: true,
  lastSyncAt: null,
};

interface AppState {
  properties: Property[];
  analyses: Analysis[];
  /** Amostras de solo (cadastro completo), uma entidade por talhão + data + profundidade. */
  soilSamples: SoilSample[];
  cropHistory: CropHistoryEntry[];
  /** Talhões desenhados no Mapa Ambiental. */
  plots: Plot[];
  selectedPropertyId: string | null;
  settings: Settings;

  addPlot: (input: PlotInput) => Plot;
  updatePlot: (id: string, patch: Partial<PlotInput>) => void;
  deletePlot: (id: string) => void;

  addProperty: (input: PropertyInput) => Property;
  /** Substitui amostras e histórico de uma propriedade (salvos junto com o formulário). */
  setPropertySoilData: (propertyId: string, samples: SoilSample[], history: CropHistoryEntry[]) => void;
  updateProperty: (id: string, input: PropertyInput) => void;
  deleteProperty: (id: string) => void;
  selectProperty: (id: string) => void;

  saveAnalysis: (a: Analysis) => void;
  deleteAnalysis: (id: string) => void;

  updateSettings: (patch: Partial<Settings>) => void;
  resetDemo: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set, get) => ({
      properties: SAMPLE_PROPERTIES,
      analyses: [],
      soilSamples: [],
      cropHistory: [],
      plots: SAMPLE_PLOTS,
      selectedPropertyId: SAMPLE_PROPERTIES[0].id,
      settings: DEFAULT_SETTINGS,

      addPlot: (input) => {
        const now = new Date().toISOString();
        const p: Plot = { ...input, id: uid("plot"), createdAt: now, updatedAt: now };
        set((s) => ({ plots: [...s.plots, p] }));
        return p;
      },
      updatePlot: (id, patch) =>
        set((s) => ({ plots: s.plots.map((p) => (p.id === id ? { ...p, ...patch, updatedAt: new Date().toISOString() } : p)) })),
      deletePlot: (id) => set((s) => ({ plots: s.plots.filter((p) => p.id !== id) })),

      setPropertySoilData: (propertyId, samples, history) =>
        set((s) => {
          // apaga do armazenamento local os laudos que deixaram de ser referenciados
          const kept = new Set(samples.map((x) => x.attachment?.fileId).filter(Boolean));
          s.soilSamples
            .filter((x) => x.propertyId === propertyId && x.attachment && !kept.has(x.attachment.fileId))
            .forEach((x) => void deleteFile(x.attachment!.fileId));
          return {
            soilSamples: [...s.soilSamples.filter((x) => x.propertyId !== propertyId), ...samples.map((x) => ({ ...x, propertyId }))],
            cropHistory: [...s.cropHistory.filter((x) => x.propertyId !== propertyId), ...history.map((x) => ({ ...x, propertyId }))],
          };
        }),

      addProperty: (input) => {
        const now = new Date().toISOString();
        const p: Property = { ...input, id: uid("prop"), createdAt: now, updatedAt: now };
        set((s) => ({ properties: [...s.properties, p], selectedPropertyId: s.selectedPropertyId ?? p.id }));
        return p;
      },
      updateProperty: (id, input) =>
        set((s) => ({
          properties: s.properties.map((p) => (p.id === id ? { ...p, ...input, updatedAt: new Date().toISOString() } : p)),
        })),
      deleteProperty: (id) =>
        set((s) => {
          const properties = s.properties.filter((p) => p.id !== id);
          const selectedPropertyId = s.selectedPropertyId === id ? (properties[0]?.id ?? null) : s.selectedPropertyId;
          s.soilSamples.filter((x) => x.propertyId === id && x.attachment).forEach((x) => void deleteFile(x.attachment!.fileId));
          return {
            properties,
            selectedPropertyId,
            soilSamples: s.soilSamples.filter((x) => x.propertyId !== id),
            cropHistory: s.cropHistory.filter((x) => x.propertyId !== id),
            plots: s.plots.filter((x) => x.propertyId !== id),
          };
        }),
      selectProperty: (id) => set({ selectedPropertyId: id }),

      saveAnalysis: (a) => set((s) => ({ analyses: [a, ...s.analyses] })),
      deleteAnalysis: (id) => set((s) => ({ analyses: s.analyses.filter((a) => a.id !== id) })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      resetDemo: () => {
        const keepProfile = get().settings.profile;
        get().soilSamples.forEach((x) => x.attachment && void deleteFile(x.attachment.fileId));
        set({
          properties: SAMPLE_PROPERTIES,
          analyses: [],
          soilSamples: [],
          cropHistory: [],
          plots: SAMPLE_PLOTS,
          selectedPropertyId: SAMPLE_PROPERTIES[0].id,
          settings: { ...DEFAULT_SETTINGS, profile: keepProfile },
        });
      },
    }),
    {
      name: "semeia:v1",
      version: 5,
      // v3: dados reais da NASA por padrão (POWER + SMAP + MODIS); propriedades de exemplo com contorno
      // v4: cadastro completo de solo (amostras laboratoriais + histórico agrícola)
      // v5: talhões do Mapa Ambiental (exemplos só para as propriedades de exemplo ainda existentes)
      migrate: (persisted, version) => {
        let s = persisted as Partial<AppState>;
        if (version < 4) s = { ...s, soilSamples: s.soilSamples ?? [], cropHistory: s.cropHistory ?? [] };
        if (version < 5) {
          const ids = new Set((s.properties ?? SAMPLE_PROPERTIES).map((p) => p.id));
          s = { ...s, plots: s.plots ?? SAMPLE_PLOTS.filter((p) => ids.has(p.propertyId)) };
        }
        if (version < 3) {
          const old = (s.settings ?? {}) as Partial<Settings> & { smapEnabled?: boolean; ndviEnabled?: boolean };
          return {
            ...s,
            settings: { ...DEFAULT_SETTINGS, profile: old.profile ?? DEFAULT_SETTINGS.profile, defaultPeriod: old.defaultPeriod ?? "30d", powerMode: "api" },
            properties: (s.properties ?? SAMPLE_PROPERTIES).map((p) => SAMPLE_PROPERTIES.find((sp) => sp.id === p.id) ?? p),
          } as AppState;
        }
        return s as AppState;
      },
      storage: createJSONStorage(() => {
        try {
          return localStorage;
        } catch {
          // ambiente sem storage: mantém apenas em memória
          const mem = new Map<string, string>();
          return {
            getItem: (k: string) => mem.get(k) ?? null,
            setItem: (k: string, v: string) => void mem.set(k, v),
            removeItem: (k: string) => void mem.delete(k),
          };
        }
      }),
    },
  ),
);

export const useSelectedProperty = () =>
  useAppStore((s) => s.properties.find((p) => p.id === s.selectedPropertyId) ?? s.properties[0] ?? null);
