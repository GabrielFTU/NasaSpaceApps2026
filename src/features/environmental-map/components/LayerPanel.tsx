import { useState } from "react";
import { ChevronDown, ExternalLink, Info } from "lucide-react";
import { Switch } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { LAYER_GROUPS, LAYERS, type LayerGroup, type LayerId } from "@/services/environment/catalog";

export type LayerState = Partial<Record<LayerId, { on: boolean; opacity: number }>>;

interface Props {
  state: LayerState;
  onToggle: (id: LayerId, on: boolean) => void;
  onOpacity: (id: LayerId, v: number) => void;
}

export function LayerPanel({ state, onToggle, onOpacity }: Props) {
  const [open, setOpen] = useState<LayerId | null>(null);
  const groups = Object.keys(LAYER_GROUPS) as LayerGroup[];

  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => (
        <section key={g}>
          <h3 className="mb-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{LAYER_GROUPS[g]}</h3>
          <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-surface">
            {LAYERS.filter((l) => l.group === g).map((l) => {
              const s = state[l.id];
              const on = !!s?.on;
              const planned = l.render.kind === "planned";
              const expanded = open === l.id;
              return (
                <li key={l.id} className={cn("px-3 py-2.5", planned && "bg-muted/40")}>
                  <div className="flex items-center gap-2.5">
                    <Switch
                      checked={on}
                      disabled={planned}
                      onCheckedChange={(v) => onToggle(l.id, v)}
                      aria-label={`Exibir ${l.label}`}
                    />
                    <button
                      type="button"
                      onClick={() => setOpen(expanded ? null : l.id)}
                      className="flex min-w-0 flex-1 cursor-pointer items-center gap-1.5 text-left"
                      aria-expanded={expanded}
                    >
                      <span className="min-w-0 flex-1">
                        <span className={cn("block truncate text-sm font-medium", planned && "text-muted-foreground")}>{l.label}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {l.source} · {l.spatialResolution.split(" (")[0]} · {l.temporalLabel}
                        </span>
                      </span>
                      {planned && <Badge variant="outline">Em breve</Badge>}
                      {l.render.kind === "user" && <Badge variant="info">Cadastro</Badge>}
                      <ChevronDown className={cn("size-4 shrink-0 text-muted-foreground transition-transform", expanded && "rotate-180")} />
                    </button>
                  </div>

                  {on && !planned && (
                    <label className="mt-2 flex items-center gap-2 pl-[46px] text-xs text-muted-foreground">
                      <span className="w-20 shrink-0">Opacidade</span>
                      <input
                        type="range"
                        min={0.1}
                        max={1}
                        step={0.05}
                        value={s!.opacity}
                        onChange={(e) => onOpacity(l.id, Number(e.target.value))}
                        className="h-1 w-full cursor-pointer"
                        aria-label={`Opacidade de ${l.label}`}
                      />
                      <span className="tabular w-9 text-right">{Math.round(s!.opacity * 100)}%</span>
                    </label>
                  )}

                  {expanded && (
                    <div className="animate-in mt-2 space-y-1.5 rounded-md bg-muted/60 px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
                      <p className="text-foreground">{l.product}</p>
                      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-0.5">
                        <dt>Resolução</dt>
                        <dd className="text-foreground">{l.spatialResolution}</dd>
                        <dt>Frequência</dt>
                        <dd className="text-foreground">{l.temporalLabel}</dd>
                        {l.latency && (
                          <>
                            <dt>Publicação</dt>
                            <dd className="text-foreground">{l.latency} após a data</dd>
                          </>
                        )}
                      </dl>
                      <p className="flex gap-1.5">
                        <Info className="mt-0.5 size-3.5 shrink-0" />
                        <span>{l.render.kind === "planned" ? l.render.reason : l.limitations}</span>
                      </p>
                      {l.sourceUrl && (
                        <a href={l.sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">
                          Sobre o produto <ExternalLink className="size-3" />
                        </a>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
