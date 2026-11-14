import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/form";
import { cn } from "@/lib/utils";
import { CROP_GROUP_LABEL, CROP_MAP } from "@/data/crops";
import { getZarcOthers } from "@/services/zarc";
import type { CropGroup, Property, ZarcOthersResult, ZarcResult } from "@/types";
import { ZarcCalendar, ZarcUnavailable, rotationRows, type CalendarRow } from "./ZarcCalendar";

type Tab = "rotacao" | "outras";

const norm = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();

/**
 * Consulta do ZARC para a propriedade: culturas do catálogo de rotação (sequeiro) e,
 * sob demanda, todas as demais culturas zoneadas no município.
 */
export function ZarcExplorer({ property, zarc }: { property: Property; zarc: ZarcResult }) {
  const [tab, setTab] = useState<Tab>("rotacao");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState<CropGroup | "todas">("todas");
  const [others, setOthers] = useState<ZarcOthersResult | null>(null);

  const { city, state } = property;
  const texture = property.soil.texture;
  useEffect(() => setOthers(null), [city, state, texture]);
  useEffect(() => {
    if (tab !== "outras" || others) return;
    let alive = true;
    getZarcOthers({ city, state }, texture).then((r) => alive && setOthers(r));
    return () => {
      alive = false;
    };
  }, [tab, others, city, state, texture]);

  const rotation = useMemo(() => (zarc.origin === "real" ? rotationRows(zarc) : []), [zarc]);
  const groups = useMemo(
    () => [...new Set(rotation.map((r) => CROP_MAP[r.key.split(":")[0]]?.group).filter(Boolean))] as CropGroup[],
    [rotation],
  );
  const otherRows: CalendarRow[] = useMemo(
    () =>
      others?.origin === "real"
        ? others.crops.map((c) => ({ key: `${c.name}|${c.manejo}`, title: c.name, subtitle: c.manejo.toLowerCase(), profile: c }))
        : [],
    [others],
  );

  const q = norm(query.trim());
  const match = (r: CalendarRow) => !q || norm(r.title).includes(q);
  const shownRotation = rotation.filter((r) => match(r) && (group === "todas" || CROP_MAP[r.key.split(":")[0]]?.group === group));
  const shownOthers = otherRows.filter(match);

  if (zarc.origin !== "real") return <ZarcUnavailable reason={zarc.reason} />;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div role="tablist" aria-label="Grupo de culturas do ZARC" className="inline-flex rounded-md bg-muted p-0.5 text-[13px]">
          {(
            [
              ["rotacao", `Culturas da rotação (${rotation.length})`],
              ["outras", `Outras culturas${others?.origin === "real" ? ` (${otherRows.length})` : ""}`],
            ] as [Tab, string][]
          ).map(([k, label]) => (
            <button
              key={k}
              role="tab"
              type="button"
              aria-selected={tab === k}
              onClick={() => setTab(k)}
              className={cn("cursor-pointer rounded px-3 py-1.5 font-medium", tab === k ? "bg-white shadow-card" : "text-muted-foreground hover:text-foreground")}
            >
              {label}
            </button>
          ))}
        </div>
        <div className="relative sm:w-64">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar cultura" aria-label="Buscar cultura no ZARC" className="pl-8" />
        </div>
      </div>

      {tab === "rotacao" && (
        <>
          {groups.length > 1 && (
            <div className="flex flex-wrap gap-1.5" aria-label="Filtrar por grupo">
              {(["todas", ...groups] as (CropGroup | "todas")[]).map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGroup(g)}
                  aria-pressed={group === g}
                  className={cn(
                    "cursor-pointer rounded-full border px-2.5 py-1 text-xs font-medium",
                    group === g ? "border-primary bg-primary-soft text-primary-soft-foreground" : "border-border text-muted-foreground hover:bg-muted",
                  )}
                >
                  {g === "todas" ? "Todas" : CROP_GROUP_LABEL[g]}
                </button>
              ))}
            </div>
          )}
          <ZarcCalendar
            rows={shownRotation}
            empty={q ? "Nenhuma cultura encontrada." : undefined}
            footer={`${zarc.municipio}/${zarc.uf} · safra ${zarc.safra} · solo ${zarc.soilLabel} · sequeiro`}
          />
        </>
      )}

      {tab === "outras" &&
        (!others ? (
          <div className="h-40 animate-pulse rounded-md bg-muted" aria-label="Carregando outras culturas do ZARC" />
        ) : others.origin !== "real" ? (
          <ZarcUnavailable reason={others.reason} />
        ) : (
          <>
            <p className="text-xs text-muted-foreground">
              Perenes, frutíferas, cana, olerícolas e forrageiras zoneadas no município — só para consulta, não entram na comparação de rotações.
              Quando não há zoneamento de sequeiro para o solo, mostra o irrigado.
            </p>
            <ZarcCalendar
              rows={shownOthers}
              empty={q ? "Nenhuma cultura encontrada." : "Nenhuma outra cultura zoneada neste município para o solo informado."}
              footer={`${others.municipio}/${others.uf} · solo ${others.soilLabel}`}
            />
          </>
        ))}
    </div>
  );
}
