import { Link } from "react-router-dom";
import { ClipboardCheck, FlaskConical, Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { SOIL_TEXTURE_LABEL, PRIORITY_LABEL } from "@/data/crops";
import { SOIL_PARAM_MAP } from "@/data/soilParameters";
import { fmt, formatDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SoilEvidence, SoilEvidenceValue } from "@/types";
import { LEVEL_LABEL } from "./model";

const SOURCE: Record<SoilEvidenceValue["source"], { label: string; variant: "success" | "info" | "neutral" }> = {
  medido: { label: "laudo", variant: "success" },
  estimado: { label: "calculado", variant: "info" },
  declarado: { label: "declarado", variant: "neutral" },
};

const LEVEL_VARIANT = { basico: "neutral", intermediario: "info", detalhado: "success" } as const;

function Row({ label, value, v }: { label: string; value: string; v: { source: SoilEvidenceValue["source"]; note?: string } }) {
  return (
    <li className="flex items-baseline justify-between gap-3 py-1.5" title={v.note}>
      <span className="text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5 text-right font-medium">
        {value}
        <Badge variant={SOURCE[v.source].variant}>{SOURCE[v.source].label}</Badge>
      </span>
    </li>
  );
}

/**
 * O que o motor sabe sobre o solo e de onde veio cada informação (RF-SOLO-06),
 * mais os dados que melhorariam a avaliação (RF-SOLO-09).
 */
export function SoilEvidenceSummary({ evidence: ev, propertyId, compact }: { evidence: SoilEvidence; propertyId?: string; compact?: boolean }) {
  const lvl = LEVEL_LABEL[ev.level];
  const missing = compact ? ev.missing.slice(0, 3) : ev.missing;
  return (
    <div className={cn("flex flex-col gap-3 text-[13px]", !compact && "md:flex-row md:gap-6")}>
      <div className="min-w-0 flex-1">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <Badge variant={LEVEL_VARIANT[ev.level]}>
            <ClipboardCheck /> {lvl.title}
          </Badge>
          {ev.sample && (
            <span className="text-xs text-muted-foreground">
              {ev.sample.plot} · {ev.sample.date ? formatDate(ev.sample.date) : "sem data"} · {ev.sample.depth}
              {ev.sample.lab && ` · ${ev.sample.lab}`}
            </span>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{lvl.text}</p>
        {ev.sample?.illustrative && (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-warning">
            <FlaskConical className="size-3.5" /> Contém valores ilustrativos de exemplo, não de um laudo real.
          </p>
        )}
        <ul className="mt-2 divide-y divide-border">
          <Row
            label="Textura"
            value={`${SOIL_TEXTURE_LABEL[ev.texture.value]}${ev.texture.note ? ` (${ev.texture.note})` : ""}`}
            v={{ source: ev.texture.source === "medido" ? "medido" : "declarado", note: ev.texture.note }}
          />
          {ev.phWater && <Row label="pH em água" value={fmt.n1(ev.phWater.value)} v={ev.phWater} />}
          {ev.organicMatter && <Row label="Matéria orgânica" value={`${fmt.n1(ev.organicMatter.value)}%`} v={ev.organicMatter} />}
          {ev.effectiveDepthCm && <Row label="Profundidade efetiva" value={`${fmt.n0(ev.effectiveDepthCm.value)} cm`} v={ev.effectiveDepthCm} />}
          {ev.availableWaterMm && <Row label="Água disponível" value={`${fmt.n0(ev.availableWaterMm.value)} mm`} v={ev.availableWaterMm} />}
          {ev.baseSaturation && <Row label="Saturação por bases (V%)" value={`${fmt.n0(ev.baseSaturation.value)}%`} v={ev.baseSaturation} />}
          {ev.aluminumSaturation && (
            <Row label={`Saturação por Al (m%) · ${ev.aluminumSaturation.depth}`} value={`${fmt.n0(ev.aluminumSaturation.value)}%`} v={ev.aluminumSaturation} />
          )}
        </ul>
      </div>

      {missing.length > 0 && (
        <div className={cn("rounded-md bg-muted/70 px-3 py-2.5", !compact && "md:w-[46%]")}>
          <p className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold">
            <Lightbulb className="size-3.5 text-warning" /> Dados que melhorariam esta avaliação
          </p>
          <ul className="flex flex-col gap-1.5 text-xs">
            {missing.map((m) => (
              <li key={m.parameter}>
                <strong>{SOIL_PARAM_MAP[m.parameter].label}</strong>
                {m.criteria.length > 0 && <span className="text-muted-foreground"> · {m.criteria.map((c) => PRIORITY_LABEL[c].toLowerCase()).join(", ")}</span>}
                {!compact && <span className="block text-muted-foreground">{m.why}</span>}
              </li>
            ))}
            {compact && ev.missing.length > missing.length && <li className="text-muted-foreground">e mais {ev.missing.length - missing.length}…</li>}
          </ul>
          {propertyId && (
            <Link to={`/propriedades/${propertyId}/editar?solo=completo`} className="mt-2 inline-block text-xs font-medium text-primary hover:underline">
              Tenho uma análise de solo →
            </Link>
          )}
        </div>
      )}
    </div>
  );
}
