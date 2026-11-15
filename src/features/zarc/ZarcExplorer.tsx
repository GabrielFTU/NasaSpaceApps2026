import { useEffect, useMemo, useState } from "react";
import { ChevronDown, Search, X } from "lucide-react";
import { Input } from "@/components/ui/form";
import { Segmented } from "@/components/ui/misc";
import { getZarcOthers, type Place } from "@/services/zarc";
import type { Property, ZarcOthersResult, ZarcResult } from "@/types";
import { ZarcCalendar, ZarcUnavailable, rotationRows, type CalendarRow } from "./ZarcCalendar";

/** Linhas exibidas antes de "Ver todas". */
const PREVIEW = 6;

type Season = "todas" | "verao" | "inverno";
const SEASONS: { value: Season; label: string }[] = [
  { value: "todas", label: "Todas" },
  { value: "verao", label: "Verão" },
  { value: "inverno", label: "Inverno" },
];

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Janelas de plantio da propriedade com uma busca única: sem busca, mostra as culturas da rotação;
 * ao buscar, procura também nas demais culturas zoneadas do município (carregadas sob demanda).
 */
export function ZarcExplorer({ property, zarc, place }: { property: Property; zarc: ZarcResult; place?: Place }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [season, setSeason] = useState<Season>("todas");
  const [others, setOthers] = useState<ZarcOthersResult | null>(null);

  const { city, state } = place ?? property;
  const texture = property.soil.texture;
  const q = norm(query.trim());

  useEffect(() => setOthers(null), [city, state, texture]);
  useEffect(() => {
    if (!q || others) return;
    let alive = true;
    getZarcOthers({ city, state }, texture).then((r) => alive && setOthers(r));
    return () => {
      alive = false;
    };
  }, [q, others, city, state, texture]);

  const rotation = useMemo(() => (zarc.origin === "real" ? rotationRows(zarc) : []), [zarc]);
  const otherRows: CalendarRow[] = useMemo(
    () =>
      others?.origin === "real"
        ? others.crops.map((c) => ({ key: `${c.name}|${c.manejo}`, title: c.name, subtitle: c.manejo.toLowerCase(), profile: c }))
        : [],
    [others],
  );

  if (zarc.origin !== "real") return <ZarcUnavailable reason={zarc.reason} />;

  // "Anual" serve para as duas épocas; culturas fora da rotação (sem época) só aparecem em "Todas"
  const inSeason = (r: CalendarRow) => season === "todas" || r.season === season || r.season === "anual";
  const match = (r: CalendarRow) => norm(r.title).includes(q) && inSeason(r);
  const pool = rotation.filter(inSeason);
  const rows = q ? [...rotation.filter(match), ...otherRows.filter(match)] : expanded ? pool : pool.slice(0, PREVIEW);
  const hidden = pool.length - PREVIEW;
  const searchingOthers = Boolean(q) && !others;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Segmented value={season} onChange={setSeason} options={SEASONS} aria-label="Época de plantio" className="shrink-0" />
      <div className="relative flex-1">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cultura"
          aria-label="Buscar cultura"
          className="h-10 pl-9 pr-9"
        />
        {query && (
          <button
            type="button"
            onClick={() => setQuery("")}
            aria-label="Limpar busca"
            className="absolute right-2 top-1/2 flex size-6 -translate-y-1/2 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" />
          </button>
        )}
      </div>
      </div>

      <ZarcCalendar rows={rows} empty={searchingOthers ? "Buscando…" : q ? "Nenhuma cultura encontrada." : undefined} />

      {!q && hidden > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mx-auto flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-[13px] font-medium text-primary hover:bg-primary-soft"
        >
          {expanded ? "Ver menos" : `Ver todas (${rotation.length})`}
          <ChevronDown className={expanded ? "size-4 rotate-180 transition-transform" : "size-4 transition-transform"} />
        </button>
      )}
    </div>
  );
}
