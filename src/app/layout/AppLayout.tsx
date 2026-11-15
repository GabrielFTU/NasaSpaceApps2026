import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation, useNavigation } from "react-router-dom";
import { Bell, ChevronDown, CloudSun, History, Home, Map as MapIcon, Menu, Settings, Sprout, X, BellOff, Layers } from "lucide-react";
import { Logo, SpaceAppsLogo } from "@/components/shared";
import { ImageCreditsLink } from "@/components/ImageCreditsDialog";
import { Toaster } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { useAppStore, useSelectedProperty } from "@/app/store";
import { useEnvironmentalData } from "@/features/dashboard/useEnvironmentalData";
import { evaluateAlerts } from "@/features/dashboard/alerts";
import { lastNDays } from "@/features/dashboard/climateStats";
import { cn } from "@/lib/utils";
import { useOffline } from "@/lib/pwa";
import { WifiOff } from "lucide-react";

const NAV = [
  { to: "/", label: "Início", icon: Home, end: true },
  { to: "/propriedades", label: "Propriedades", icon: MapIcon },
  { to: "/mapa", label: "Mapa ambiental", icon: Layers },
  { to: "/clima", label: "Clima e alertas", icon: CloudSun },
  { to: "/analise", label: "Nova análise", icon: Sprout },
  { to: "/historico", label: "Estratégias salvas", icon: History },
];
const NAV_PROJECT = [
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
    "flex items-center gap-3 rounded-lg px-3 py-2 text-[14px] font-medium transition-colors",
    active
      ? "bg-primary-soft text-primary-soft-foreground [&_svg]:text-primary"
      : "text-muted-foreground hover:bg-muted hover:text-foreground",
  );
}

function Sidebar({ onNavigate }: { onNavigate?: () => void }) {
  const location = useLocation();
  const section = new URLSearchParams(location.search).get("secao") ?? "";
  return (
    <>
      <nav className="flex flex-col gap-0.5" aria-label="Navegação principal">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink key={to} to={to} end={end} onClick={onNavigate} className={({ isActive }) => navClass(isActive)}>
            <Icon className="size-[18px] transition-colors" />
            {label}
          </NavLink>
        ))}
      </nav>
      <nav className="mt-auto flex flex-col gap-0.5 border-t border-border pt-3" aria-label="Conta">
        {NAV_PROJECT.map(({ to, label, icon: Icon, match }) => (
          <Link key={to} to={to} onClick={onNavigate} className={navClass(location.pathname === "/configuracoes" && section === match)}>
            <Icon className="size-[18px] transition-colors" />
            {label}
          </Link>
        ))}
      </nav>
    </>
  );
}

function PropertySwitcher() {
  const properties = useAppStore((s) => s.properties);
  const selectProperty = useAppStore((s) => s.selectProperty);
  const property = useSelectedProperty();
  if (!property) return null;
  return (
    <label className="relative flex min-h-9 min-w-0 items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-medium hover:bg-muted focus-within:ring-2 focus-within:ring-ring/40">
      <MapIcon className="hidden size-4 shrink-0 text-muted-foreground min-[400px]:block" />
      <span className="min-w-0 truncate sm:max-w-[220px]">
        {property.name} <span className="hidden font-normal text-muted-foreground sm:inline">· {property.city}, {property.state}</span>
      </span>
      <ChevronDown className="size-4 shrink-0 text-muted-foreground" />
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
    const close = (e: PointerEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const active =
    data.status === "ready"
      ? evaluateAlerts(lastNDays(data.climate.records, 60, data.climate.lastAvailableDate), data.vegetation, data.soil).filter((a) => a.status === "ativo")
      : [];

  return (
    <div className="relative" ref={ref}>
      <Button variant="ghost" size="icon" onClick={() => setOpen((v) => !v)} aria-label={`Alertas (${active.length} ativos)`} aria-expanded={open}>
        <Bell className="!size-5" />
        {active.length > 0 && (
          <span className="absolute right-0.5 top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-space-red px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {active.length}
          </span>
        )}
      </Button>
      {open && (
        // no celular o painel ocupa a largura da tela (ancorado no sino ele saía pela esquerda)
        <div className="animate-in glass fixed inset-x-4 top-16 z-[1000] max-h-[calc(100dvh-5rem)] overflow-y-auto rounded-lg border p-2 sm:absolute sm:inset-x-auto sm:right-0 sm:top-11 sm:w-80">
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

/** Aviso de sem internet: diz o que continua funcionando e o que depende de conexão. */
function OfflineBanner() {
  const offline = useOffline();
  if (!offline) return null;
  return (
    <div role="status" className="flex items-start gap-2.5 border-b border-[#f0dfb5] bg-warning-soft px-4 py-2.5 text-[13px] text-[#6d4700] sm:px-6 lg:px-8">
      <WifiOff className="mt-0.5 size-4 shrink-0" aria-hidden />
      <p className="flex-1">
        <strong>Sem internet.</strong> Suas propriedades, talhões e análises salvas continuam aqui. Clima, imagens de satélite, previsão e o
        assistente precisam de conexão — os números mostrados podem ser da última vez que você esteve on-line.
      </p>
      <button type="button" onClick={() => window.location.reload()} className="min-h-6 shrink-0 cursor-pointer font-semibold underline underline-offset-2">
        Tentar de novo
      </button>
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
    <Link
      to="/configuracoes"
      className="flex size-9 items-center justify-center rounded-full bg-gradient-to-br from-primary to-brand-dark text-[13px] font-semibold text-white ring-2 ring-white shadow-card transition-transform hover:scale-105"
      title={name}
      aria-label={`Perfil de ${name}`}
    >
      {initials || "?"}
    </Link>
  );
}

export function AppLayout() {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const navigation = useNavigation();
  const title = TITLES.find(([re]) => re.test(location.pathname))?.[1] ?? "Semeia";
  const fullBleed = location.pathname.startsWith("/mapa");

  // título da aba por tela (WCAG 2.4.2): "Propriedades · Semeia"
  useEffect(() => {
    document.title = title === "Semeia" ? "Semeia" : `${title} · Semeia`;
  }, [title]);

  useEffect(() => {
    window.scrollTo(0, 0);
    setOpen(false);
  }, [location.pathname]);

  // menu mobile: Esc fecha, fundo não rola, foco volta ao botão que abriu
  const menuButton = useRef<HTMLButtonElement>(null);
  const drawer = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    drawer.current?.querySelector<HTMLElement>("a,button")?.focus();
    const trigger = menuButton.current;
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      trigger?.focus();
    };
  }, [open]);

  return (
    <div className="flex min-h-full flex-col lg:pl-64">
      <a
        href="#conteudo"
        className="sr-only z-[1001] rounded-md bg-primary px-3 py-2 text-sm font-semibold text-white focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Pular para o conteúdo
      </a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col overflow-y-auto border-r border-border bg-sidebar px-4 py-6 lg:flex">
        <Link to="/" className="mb-8 px-3" aria-label="Semeia — início">
          <Logo />
        </Link>
        <Sidebar />
      </aside>

      {open && (
        <div className="fixed inset-0 z-[900] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="scrim absolute inset-0" onClick={() => setOpen(false)} />
          <aside ref={drawer} className="animate-in absolute inset-y-0 left-0 flex w-72 max-w-[85%] flex-col overflow-y-auto rounded-r-xl bg-sidebar px-4 py-5 shadow-raised">
            <div className="mb-6 flex items-center justify-between px-2">
              <Logo size="sm" />
              <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} aria-label="Fechar menu">
                <X />
              </Button>
            </div>
            <Sidebar onNavigate={() => setOpen(false)} />
          </aside>
        </div>
      )}

      <header className="glass sticky top-0 z-[800] flex h-16 items-center gap-2 border-b !border-border/70 !shadow-none px-4 sm:px-6 lg:px-8">
        <Button ref={menuButton} variant="ghost" size="icon" className="shrink-0 lg:hidden" onClick={() => setOpen(true)} aria-label="Abrir menu" aria-expanded={open}>
          <Menu />
        </Button>
        {/* título visual do cabeçalho; o h1 de cada tela fica no conteúdo (um por página) */}
        <p className="hidden truncate text-[18px] font-semibold sm:block">{title}</p>
        <Link to="/" className="shrink-0 sm:hidden" aria-label="Semeia — início">
          <Logo size="sm" compact />
        </Link>
        <div className="ml-auto flex min-w-0 items-center justify-end gap-1 sm:gap-2">
          <PropertySwitcher />
          <div className="mx-1 hidden h-6 w-px bg-border sm:block" />
          <AlertsBell />
          <Avatar />
        </div>
      </header>

      <OfflineBanner />
      {/* troca de tela com código ainda baixando (rede móvel lenta): barra fina no topo em vez de clique "sem resposta" */}
      {navigation.state === "loading" && (
        <div role="progressbar" aria-label="Carregando a próxima tela" className="fixed inset-x-0 top-0 z-[1200] h-0.5 animate-pulse bg-primary" />
      )}
      {/* telas de mapa ocupam toda a área útil, sem margens nem largura máxima */}
      <main
        id="conteudo"
        tabIndex={-1}
        className={fullBleed ? "w-full outline-none lg:h-[calc(100dvh-4rem)]" : "mx-auto w-full max-w-[1280px] flex-1 px-4 py-6 outline-none sm:px-6 lg:px-8"}
      >
        <Outlet />
      </main>
      {!fullBleed && (
        <footer className="mx-auto flex w-full max-w-[1280px] flex-col items-center gap-4 border-t border-border px-4 py-6 text-[12.5px] text-muted-foreground sm:flex-row sm:justify-between sm:px-6 lg:px-8">
          <p className="text-center sm:text-left">
            Projeto desenvolvido para o{" "}
            <a href="https://www.spaceappschallenge.org/" target="_blank" rel="noreferrer" className="font-semibold text-foreground hover:text-primary">
              NASA Space Apps Challenge
            </a>
            .<span className="mx-2 text-border">|</span>
            <ImageCreditsLink />
          </p>
          <SpaceAppsLogo className="h-7 opacity-80" />
        </footer>
      )}
      <Toaster />
    </div>
  );
}
