import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Bell, ChevronDown, CloudSun, History, Home, Map as MapIcon, Menu, Settings, Sprout, X, Database, BellOff, Layers } from "lucide-react";
import { Logo, NasaMark } from "@/components/shared";
import { Toaster } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { useAppStore, useSelectedProperty } from "@/app/store";
import { useEnvironmentalData } from "@/features/dashboard/useEnvironmentalData";
import { evaluateAlerts } from "@/features/dashboard/alerts";
import { lastNDays } from "@/features/dashboard/climateStats";
import { cn } from "@/lib/utils";

const NAV = [
  { to: "/", label: "Início", icon: Home, end: true },
  { to: "/propriedades", label: "Propriedades", icon: MapIcon },
  { to: "/mapa", label: "Mapa ambiental", icon: Layers },
  { to: "/clima", label: "Clima e alertas", icon: CloudSun },
  { to: "/analise", label: "Nova análise", icon: Sprout },
  { to: "/historico", label: "Estratégias salvas", icon: History },
];
const NAV_PROJECT = [
  { to: "/configuracoes?secao=fontes", label: "Fontes de dados", icon: Database, match: "fontes" },
  { to: "/configuracoes", label: "Configurações", icon: Settings, match: "" },
];

const TITLES: [RegExp, string][] = [
  [/^\/$/, "Início"],
  [/^\/propriedades\/nova/, "Nova propriedade"],
  [/^\/propriedades\/.+\/editar/, "Editar propriedade"],
  [/^\/propriedades/, "Propriedades"],
  [/^\/mapa/, "Mapa ambiental"],
  [/^\/clima/, "Clima e alertas"],
  [/^\/analise\/.+/, "Comparativo de rotações"],
  [/^\/analise/, "Nova análise"],
  [/^\/historico/, "Estratégias salvas"],
  [/^\/configuracoes/, "Configurações"],
];

function navClass(active: boolean) {
  return cn(
    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[15px] font-medium transition-colors",
    active ? "bg-primary text-white" : "text-[#2a3a2d] hover:bg-muted",
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const section = new URLSearchParams(location.search).get("secao") ?? "";
  return (
    <>
      <nav className="flex flex-col gap-1" aria-label="Navegação principal">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate} className={({ isActive }) => navClass(isActive)}>
            <Icon className="size-[18px]" />
            {label}
          </NavLink>
        ))}
      </nav>
      <div className="my-5 h-px bg-border" />
      <p className="mb-2 px-3 text-[13px] font-semibold text-foreground">Projeto</p>
      <nav className="flex flex-col gap-1" aria-label="Projeto">
        {NAV_PROJECT.map(({ to, label, icon: Icon, match }) => (
          <Link key={to} to={to} onClick={onNavigate} className={navClass(location.pathname === "/configuracoes" && section === match)}>
            <Icon className="size-[18px]" />
            {label}
          </Link>
        ))}
      </nav>
      <div className="mt-auto flex items-center gap-3 px-2">
        <NasaMark className="h-12" />
        <p className="text-[13px] leading-snug text-[#2a3a2d]">
          <strong className="block text-foreground">Dados NASA</strong>
          POWER · SMAP · MODIS
        </p>
      </div>
    </>
  );
}

function PropertySwitcher() {
  const properties = useAppStore((s) => s.properties);
  const selectProperty = useAppStore((s) => s.selectProperty);
  const property = useSelectedProperty();
  if (!property) return null;
  return (
    <label className="relative flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-muted">
      <MapIcon className="size-4 text-muted-foreground" />
      <span className="max-w-[140px] truncate sm:max-w-[220px]">
        {property.name} <span className="hidden font-normal text-muted-foreground sm:inline">· {property.city}, {property.state}</span>
      </span>
      <ChevronDown className="size-4 text-muted-foreground" />
      <select
        aria-label="Trocar propriedade"
        value={property.id}
        onChange={(e) => selectProperty(e.target.value)}
        className="absolute inset-0 cursor-pointer opacity-0"
      >
        {properties.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name} — {p.city}/{p.state}
          </option>
        ))}
      </select>
    </label>
  );
}

function AlertsBell() {
  const property = useSelectedProperty();
  const data = useEnvironmentalData(property);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const active =
    data.status === "ready"
      ? evaluateAlerts(lastNDays(data.climate.records, 60, data.climate.lastAvailableDate), data.vegetation, data.soil).filter((a) => a.status === "ativo")
      : [];

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label={`Alertas (${active.length} ativos)`} aria-expanded={open}>
        <Bell className="!size-5" />
        {active.length > 0 && <span className="absolute right-2 top-2 size-2 rounded-full bg-brand-lime ring-2 ring-white" />}
      </Button>
      {open && (
        <div className="animate-in absolute right-0 top-11 z-[1000] w-80 rounded-lg border border-border bg-white p-2 shadow-lg">
          <p className="px-2 pt-1 pb-2 text-sm font-semibold">Alertas · {property?.name}</p>
          {active.length === 0 ? (
            <p className="flex items-center gap-2 rounded-md bg-muted px-3 py-3 text-[13px] text-muted-foreground">
              <BellOff className="size-4" /> Nenhum alerta ativo.
            </p>
          ) : (
            active.map((a) => (
              <div key={a.id} className="rounded-md px-2 py-2 hover:bg-muted">
                <p className="text-sm font-medium">{a.title}</p>
                <p className="text-[13px] text-muted-foreground">{a.detail}</p>
              </div>
            ))
          )}
          <Link to="/clima" onClick={() => setOpen(false)} className="mt-1 block rounded-md px-2 py-2 text-[13px] font-medium text-primary hover:bg-muted">
            Ver critérios e histórico climático →
          </Link>
        </div>
      )}
    </div>
  );
}

function Avatar() {
  const name = useAppStore((s) => s.settings.profile.name);
  const initials = name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");
  return (
    <Link to="/configuracoes" className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-semibold text-white" title={name}>
      {initials || "?"}
    </Link>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const title = TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? "Semeia";
  const fullBleed = location.pathname.startsWith("/mapa");

  useEffect(() => {
    window.scrollTo(0, 0);
    setOpen(false);
  }, [location.pathname]);

  return (
    <div className="min-h-full lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-border bg-sidebar px-4 py-6 lg:flex">
        <Link to="/" className="mb-8 px-2">
          <Logo className="h-11" />
        </Link>
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-[900] lg:hidden">
          <div className="absolute inset-0 bg-[#0b1f0e]/40" onClick={() => setOpen(false)} />
          <aside className="animate-in absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col bg-white px-4 py-5">
            <div className="mb-6 flex items-center justify-between px-2">
              <Logo className="h-9" />
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X />
              </Button>
            </div>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-[800] flex h-16 items-center gap-2 border-b border-border bg-white/95 px-4 backdrop-blur sm:px-6 lg:px-8">
        <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu">
          <Menu />
        </Button>
        <h1 className="hidden text-[17px] font-semibold sm:block">{title}</h1>
        <img src="/logo-mark.png" alt="" className="h-7 sm:hidden" />
        <div className="ml-auto flex items-center gap-1 sm:gap-3">
          <PropertySwitcher />
          <AlertsBell />
          <Avatar />
        </div>
      </header>

      {/* telas de mapa ocupam toda a área útil, sem margens nem largura máxima */}
      <main className={fullBleed ? "w-full lg:h-[calc(100dvh-4rem)]" : "mx-auto w-full max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8"}>
        <Outlet />
      </main>
      <Toaster />
    </div>
  );
}
