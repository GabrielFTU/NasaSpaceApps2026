import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Analysis, Property, PropertyInput, Settings } from "@/types";
import { SAMPLE_PROPERTIES } from "@/data/sampleProperties";
import { uid } from "@/lib/utils";

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
  selectedPropertyId: string | null;
  settings: Settings;

  addProperty: (input: PropertyInput) => Property;
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
      selectedPropertyId: SAMPLE_PROPERTIES[0].id,
      settings: DEFAULT_SETTINGS,

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
          return { properties, selectedPropertyId };
        }),
      selectProperty: (id) => set({ selectedPropertyId: id }),

      saveAnalysis: (a) => set((s) => ({ analyses: [a, ...s.analyses] })),
      deleteAnalysis: (id) => set((s) => ({ analyses: s.analyses.filter((a) => a.id !== id) })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
      resetDemo: () => {
        const keepProfile = get().settings.profile;
        set({
          properties: SAMPLE_PROPERTIES,
          analyses: [],
          selectedPropertyId: SAMPLE_PROPERTIES[0].id,
          settings: { ...DEFAULT_SETTINGS, profile: keepProfile },
        });
      },
    }),
    {
      name: "semeia:v1",
      version: 3,
      // v3: dados reais da NASA por padrão (POWER + SMAP + MODIS); propriedades de exemplo com contorno
      migrate: (persisted, version) => {
        const s = persisted as Partial<AppState>;
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
