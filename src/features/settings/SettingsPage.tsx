import { useState, type FormEvent, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Database, RefreshCw, RotateCcw, SlidersHorizontal, User } from "lucide-react";
import { useAppStore } from "@/app/store";
import { PageHeader, DataOriginBadge, NasaMark } from "@/components/shared";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select, Switch } from "@/components/ui/form";
import { ConfirmDialog } from "@/components/ui/dialog";
import { toast } from "@/components/ui/toast";
import { clearNasaCache, getDailyClimate, getSoilMoisture, getVegetationIndex, MODIS_SOURCE, POWER_SOURCE, SMAP_SOURCE } from "@/services/nasa";
import { PERIOD_OPTIONS } from "@/features/dashboard/climateStats";
import { formatDateTime } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { DataOrigin, PeriodKey, UserProfile } from "@/types";

const SECTIONS = [
  { id: "perfil", label: "Perfil", icon: User },
  { id: "preferencias", label: "Preferências", icon: SlidersHorizontal },
  { id: "fontes", label: "Fontes de dados", icon: Database },
  { id: "sincronizacao", label: "Sincronização", icon: RefreshCw },
] as const;
type SectionId = (typeof SECTIONS)[number]["id"];

export function SettingsPage() {
  const [params, setParams] = useSearchParams();
  const fromUrl = params.get("secao");
  const section: SectionId = SECTIONS.some((s) => s.id === fromUrl) ? (fromUrl as SectionId) : "perfil";
  const setSection = (id: SectionId) => setParams(id === "perfil" ? {} : { secao: id }, { replace: true });

  return (
    <>
      <PageHeader title="Configurações" />
      <div className="grid grid-cols-1 gap-5 md:grid-cols-[200px_1fr]">
        <nav className="flex gap-1 overflow-x-auto md:flex-col" aria-label="Seções">
          {SECTIONS.map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              type="button"
              onClick={() => setSection(id)}
              aria-current={section === id ? "page" : undefined}
              className={cn(
                "flex shrink-0 cursor-pointer items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium whitespace-nowrap",
                section === id ? "bg-primary text-white" : "text-muted-foreground hover:bg-muted hover:text-foreground",
              )}
            >
              <Icon className="size-4" />
              {label}
            </button>
          ))}
        </nav>
        <div className="min-w-0 max-w-2xl">
          {section === "perfil" && <ProfileSection />}
          {section === "preferencias" && <PreferencesSection />}
          {section === "fontes" && <SourcesSection />}
          {section === "sincronizacao" && <SyncSection />}
        </div>
      </div>
    </>
  );
}

function Row({ title, hint, control, htmlFor }: { title: string; hint?: string; control: ReactNode; htmlFor?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5">
      <div>
        <label htmlFor={htmlFor} className="text-sm font-medium">
          {title}
        </label>
        {hint && <p className="text-[13px] text-muted-foreground">{hint}</p>}
      </div>
      <div className="shrink-0">{control}</div>
    </div>
  );
}

function ProfileSection() {
  const profile = useAppStore((s) => s.settings.profile);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [v, setV] = useState<UserProfile>(profile);
  const [errors, setErrors] = useState<Partial<Record<keyof UserProfile, string>>>({});
  const dirty = JSON.stringify(v) !== JSON.stringify(profile);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const errs: typeof errors = {};
    if (v.name.trim().length < 2) errs.name = "Informe seu nome.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email.trim())) errs.email = "E-mail inválido.";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    updateSettings({ profile: { ...v, name: v.name.trim(), email: v.email.trim() } });
    toast.success("Perfil salvo");
  };

  return (
    <Card className="animate-in p-5">
      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label="Nome" error={errors.name}>
          {(p) => <Input {...p} value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} />}
        </Field>
        <Field label="E-mail" error={errors.email}>
          {(p) => <Input {...p} type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />}
        </Field>
        <Field label="Organização" optional>
          {(p) => <Input {...p} value={v.organization} onChange={(e) => setV({ ...v, organization: e.target.value })} />}
        </Field>
        <Field label="Função">
          {(p) => (
            <Select {...p} value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })}>
              <option>Produtor rural</option>
              <option>Técnico agrícola</option>
              <option>Engenheiro agrônomo</option>
              <option>Consultor</option>
              <option>Estudante / pesquisador</option>
            </Select>
          )}
        </Field>
        <div className="flex justify-end gap-2 sm:col-span-2">
          <Button variant="outline" disabled={!dirty} onClick={() => { setV(profile); setErrors({}); }}>
            Descartar
          </Button>
          <Button type="submit" disabled={!dirty}>
            Salvar
          </Button>
        </div>
      </form>
    </Card>
  );
}

function PreferencesSection() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  return (
    <Card className="animate-in divide-y divide-border px-5">
      <Row
        title="Período padrão dos gráficos"
        htmlFor="pref-period"
        control={
          <Select id="pref-period" value={settings.defaultPeriod} onChange={(e) => updateSettings({ defaultPeriod: e.target.value as PeriodKey })} className="w-36">
            {PERIOD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </Select>
        }
      />
      <Row
        title="Mostrar selo de origem dos dados"
        htmlFor="pref-badges"
        control={<Switch id="pref-badges" checked={settings.showDataOriginBadges} onCheckedChange={(v) => updateSettings({ showDataOriginBadges: v })} />}
      />
    </Card>
  );
}

function SourcesSection() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const properties = useAppStore((s) => s.properties);
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<Record<string, DataOrigin> | null>(null);
  const real = settings.powerMode === "api";

  const test = async () => {
    const p = properties[0];
    if (!p) return toast.error("Cadastre uma propriedade primeiro");
    setTesting(true);
    clearNasaCache();
    const [c, s, v] = await Promise.all([
      getDailyClimate(p.latitude, p.longitude, "api"),
      getSoilMoisture(p.latitude, p.longitude, "api"),
      getVegetationIndex(p.latitude, p.longitude, "api"),
    ]);
    setStatus({ power: c.origin, smap: s.origin, modis: v.origin });
    setTesting(false);
    const ok = [c, s, v].filter((x) => x.origin === "real").length;
    if (ok === 3) toast.success("Conectado à NASA", "POWER, SMAP e MODIS respondendo.");
    else toast.error(`${ok} de 3 fontes responderam`, "As demais usarão dados simulados.");
  };

  const sources = [
    { id: "power", name: POWER_SOURCE.name, what: "Temperatura, chuva, umidade do ar, radiação" },
    { id: "smap", name: SMAP_SOURCE.name, what: "Umidade do solo (superfície e raízes)" },
    { id: "modis", name: MODIS_SOURCE.name, what: "Cobertura vegetal (NDVI)" },
  ];

  return (
    <div className="animate-in flex flex-col gap-4">
      <Card className="flex items-center gap-4 p-5">
        <NasaMark className="h-12" />
        <div className="flex-1">
          <label htmlFor="real-data" className="font-semibold">
            Dados reais da NASA
          </label>
          <p className="text-[13px] text-muted-foreground">{real ? "Ligado. Se a NASA não responder, usa simulado." : "Desligado. Usando dados simulados (offline)."}</p>
        </div>
        <Switch
          id="real-data"
          checked={real}
          onCheckedChange={(v) => {
            clearNasaCache();
            setStatus(null);
            updateSettings({ powerMode: v ? "api" : "mock" });
          }}
        />
      </Card>

      <Card className="divide-y divide-border px-5">
        {sources.map((s) => (
          <div key={s.id} className="flex items-center justify-between gap-3 py-3.5">
            <div>
              <p className="text-sm font-medium">{s.name}</p>
              <p className="text-[13px] text-muted-foreground">{s.what}</p>
            </div>
            <DataOriginBadge origin={status?.[s.id] ?? (real ? "real" : "simulado")} />
          </div>
        ))}
      </Card>

      <Button variant="outline" onClick={test} loading={testing} className="self-start">
        Testar conexão
      </Button>
    </div>
  );
}

function SyncSection() {
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const resetDemo = useAppStore((s) => s.resetDemo);
  const properties = useAppStore((s) => s.properties);
  const [syncing, setSyncing] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);

  const syncNow = async () => {
    setSyncing(true);
    clearNasaCache();
    try {
      await Promise.all(properties.map((p) => getDailyClimate(p.latitude, p.longitude, settings.powerMode)));
      updateSettings({ lastSyncAt: new Date().toISOString() });
      toast.success("Dados atualizados");
    } catch (e) {
      toast.error("Falha na sincronização", e instanceof Error ? e.message : undefined);
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="animate-in flex flex-col gap-4">
      <Card className="divide-y divide-border px-5">
        <Row
          title="Última sincronização"
          hint={settings.lastSyncAt ? formatDateTime(settings.lastSyncAt) : "Nunca"}
          control={
            <Button variant="outline" onClick={syncNow} loading={syncing}>
              {!syncing && <RefreshCw />} Sincronizar
            </Button>
          }
        />
        <Row
          title="Atualizar a cada 6 horas"
          htmlFor="auto-sync"
          control={<Switch id="auto-sync" checked={settings.autoSync} onCheckedChange={(v) => updateSettings({ autoSync: v })} />}
        />
      </Card>
      <Card className="flex items-center justify-between gap-4 p-5">
        <div>
          <p className="text-sm font-medium">Restaurar exemplo</p>
          <p className="text-[13px] text-muted-foreground">Apaga suas propriedades e análises.</p>
        </div>
        <Button variant="outline" className="text-danger" onClick={() => setConfirmReset(true)}>
          <RotateCcw /> Restaurar
        </Button>
      </Card>
      <ConfirmDialog
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="Restaurar dados de exemplo?"
        description="Propriedades e análises criadas serão apagadas deste navegador."
        confirmLabel="Restaurar"
        onConfirm={() => {
          clearNasaCache();
          resetDemo();
          toast.success("Exemplo restaurado");
        }}
      />
    </div>
  );
}
