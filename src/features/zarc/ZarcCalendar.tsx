import type { ReactNode } from "react";
import { CalendarRange, CircleSlash, ExternalLink, Landmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CROP_MAP, cropName } from "@/data/crops";
import { cn } from "@/lib/utils";
import { formatDate } from "@/lib/format";
import type { ZarcResult, ZarcRisk, ZarcRiskProfile } from "@/types";
import { DECENDIOS, MONTH_LABELS, ZARC_SOURCE, decLabel, decendioOf, windowLabel } from "@/services/zarc";

export const ZARC_ORIGIN_TITLE = "Tábua de risco oficial do MAPA (dados abertos)";
export const RISK_COLOR: Record<ZarcRisk, string> = { 20: "#1baf7a", 30: "#eda100", 40: "#eb6834" };
export const SEASON_LABEL = { verao: "1ª safra / verão", inverno: "2ª safra / inverno", anual: "ciclo anual" } as const;

export interface CalendarRow {
  key: string;
  title: string;
  subtitle?: string;
  profile: ZarcRiskProfile;
}

export const windowsText = (p: ZarcRiskProfile) =>
  p.zoned ? p.windows.map((w) => `${windowLabel(w.startDec, w.endDec)} (${w.risk}%)`).join("; ") : "Sem indicação de plantio";

/** Linhas do calendário para as culturas do catálogo de rotação (todas as zoneadas, ou as pedidas). */
export function rotationRows(zarc: Extract<ZarcResult, { origin: "real" }>, cropIds?: string[]): CalendarRow[] {
  const all = Object.entries(zarc.entries);
  const picked = cropIds ? cropIds.flatMap((id) => all.filter(([, e]) => e.cropId === id)) : all.filter(([, e]) => e.zoned);
  return picked
    .filter(([, e]) => cropIds || e.zoned)
    .map(([key, e]) => ({
      key,
      title: cropName(e.cropId),
      subtitle: CROP_MAP[e.cropId]?.role === "cobertura" ? `cobertura · ${SEASON_LABEL[e.season]}` : SEASON_LABEL[e.season],
      profile: e,
    }));
}

/** Grade de 36 decêndios por cultura, colorida pelo risco indicado pelo ZARC. */
export function ZarcCalendar({ rows, footer, empty, className }: { rows: CalendarRow[]; footer?: ReactNode; empty?: string; className?: string }) {
  const today = decendioOf(new Date());
  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate border-spacing-y-1 text-[13px]">
          <thead>
            <tr className="text-[11px] text-muted-foreground">
              <th className="w-48 pr-3 text-left font-medium">Cultura</th>
              {MONTH_LABELS.map((m, i) => (
                <th key={m} colSpan={3} className={cn("font-medium capitalize", i > 0 && "border-l border-border")}>
                  {m}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={37} className="py-3 text-muted-foreground">
                  {empty ?? "Nenhuma cultura com janela indicada neste município para o solo informado."}
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <ZarcRow key={r.key} row={r} today={today} />
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex flex-col gap-2 text-xs text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
        <RiskLegend />
        {footer && <span>{footer}</span>}
      </div>
    </div>
  );
}

export function RiskLegend() {
  return (
    <div className="flex flex-wrap items-center gap-3">
      {([20, 30, 40] as ZarcRisk[]).map((r) => (
        <span key={r} className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm" style={{ background: RISK_COLOR[r] }} />
          Risco {r}%
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="size-2.5 rounded-sm bg-muted ring-1 ring-border" /> Não indicado
      </span>
      <span className="inline-flex items-center gap-1.5">
        <span className="h-3 w-0.5 bg-foreground" /> Hoje
      </span>
    </div>
  );
}

function ZarcRow({ row, today }: { row: CalendarRow; today: number }) {
  const p = row.profile;
  return (
    <tr title={[windowsText(p), p.cycles.join(", "), p.managementLevel, p.portaria].filter(Boolean).join(" · ")}>
      <td className="pr-3 align-middle">
        <span className="block font-medium leading-tight">{row.title}</span>
        {row.subtitle && <span className="block text-[11px] text-muted-foreground">{row.subtitle}</span>}
      </td>
      {DECENDIOS.map((d) => {
        const r = p.risks[d - 1];
        return (
          <td key={d} className={cn("relative p-0", d % 3 === 1 && d > 1 && "border-l border-border")}>
            <span
              className={cn("block h-5", r === null && "bg-muted")}
              style={r !== null ? { background: RISK_COLOR[r] } : undefined}
              title={`${decLabel(d)}: ${r === null ? "não indicado" : `risco ${r}%`}`}
            />
            {d === today && <span className="pointer-events-none absolute inset-y-[-3px] left-1/2 w-0.5 -translate-x-1/2 bg-foreground" aria-hidden />}
          </td>
        );
      })}
    </tr>
  );
}

/** Mensagem para quando o ZARC não pôde ser carregado. */
export function ZarcUnavailable({ reason, className }: { reason: string; className?: string }) {
  return (
    <div className={cn("flex items-start gap-2 rounded-md bg-muted px-3 py-3 text-sm text-muted-foreground", className)}>
      <CircleSlash className="mt-0.5 size-4 shrink-0" />
      <span>ZARC indisponível: {reason}</span>
    </div>
  );
}

/** Calendário das culturas de uma análise (tela de comparação). */
export function ZarcRotationCalendar({ zarc, cropIds }: { zarc: ZarcResult; cropIds?: string[] }) {
  if (zarc.origin !== "real") return <ZarcUnavailable reason={zarc.reason} />;
  return (
    <ZarcCalendar
      rows={rotationRows(zarc, cropIds)}
      footer={`${zarc.municipio}/${zarc.uf} · safra ${zarc.safra} · solo ${zarc.soilLabel} · sequeiro`}
    />
  );
}

/** Rodapé com fonte oficial, data de geração e link para o dado aberto. */
export function ZarcSourceNote({ zarc }: { zarc: ZarcResult }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
      <Landmark className="size-3.5" />
      <a href={ZARC_SOURCE.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium hover:underline">
        Zoneamento Agrícola de Risco Climático — MAPA <ExternalLink className="size-3" />
      </a>
      {zarc.origin === "real" && <span>· tábua de risco atualizada em {formatDate(zarc.generatedAt.slice(0, 10))}</span>}
      <a href={ZARC_SOURCE.dataset} target="_blank" rel="noreferrer" className="hover:underline">
        · dados abertos
      </a>
    </p>
  );
}

export function ZarcBadge({ zarc }: { zarc?: { zoned: boolean; minRisk: ZarcRisk | null; windows: string } }) {
  if (!zarc) return null;
  if (!zarc.zoned)
    return (
      <Badge variant="danger" title="Sem indicação de plantio no ZARC para o município/solo">
        <CalendarRange /> Fora do ZARC
      </Badge>
    );
  return (
    <Badge variant={zarc.minRisk === 20 ? "success" : "warning"} title={`ZARC: ${zarc.windows}`}>
      <CalendarRange /> ZARC {zarc.minRisk}%
    </Badge>
  );
}
