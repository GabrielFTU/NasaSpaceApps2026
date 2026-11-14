import { ExternalLink } from "lucide-react";
import { DataOriginBadge, NasaMark } from "@/components/shared";
import { formatDate } from "@/lib/format";
import { MODIS_SOURCE, POWER_SOURCE, SMAP_SOURCE } from "@/services/nasa";
import type { ClimateSeries, DataOrigin, SoilMoistureResult, VegetationResult } from "@/types";

export function DataSourcesCard({ climate, soil, vegetation }: { climate: ClimateSeries; soil: SoilMoistureResult; vegetation: VegetationResult }) {
  const rows: { name: string; url: string; what: string; origin: DataOrigin; date?: string }[] = [
    { name: POWER_SOURCE.name, url: POWER_SOURCE.url, what: "Clima", origin: climate.origin, date: climate.lastAvailableDate },
    { name: SMAP_SOURCE.name, url: SMAP_SOURCE.url, what: "Umidade do solo", origin: soil.origin, date: soil.origin !== "indisponivel" ? soil.lastAvailableDate : undefined },
    { name: MODIS_SOURCE.name, url: MODIS_SOURCE.url, what: "Vegetação", origin: vegetation.origin, date: vegetation.origin !== "indisponivel" ? vegetation.lastAvailableDate : undefined },
  ];
  const note = climate.note ?? (soil.origin !== "indisponivel" ? soil.note : undefined) ?? (vegetation.origin !== "indisponivel" ? vegetation.note : undefined);
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-white p-4 shadow-card sm:flex-row sm:items-center">
      <NasaMark className="h-9 shrink-0" />
      <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
        {rows.map((r) => (
          <div key={r.name} className="flex items-center justify-between gap-2 text-sm sm:justify-start">
            <div>
              <a href={r.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 font-medium hover:underline">
                {r.name} <ExternalLink className="size-3 text-muted-foreground" />
              </a>
              <p className="text-xs text-muted-foreground">
                {r.what}
                {r.date && ` · até ${formatDate(r.date, { day: "2-digit", month: "short" })}`}
              </p>
            </div>
            <DataOriginBadge origin={r.origin} />
          </div>
        ))}
      </div>
      {note && <p className="text-xs text-warning sm:max-w-48">{note}</p>}
    </div>
  );
}
