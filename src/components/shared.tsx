import { useState, type ReactNode } from "react";
import { CircleSlash, FlaskConical, RefreshCw, Satellite, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { DataOrigin } from "@/types";

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="text-2xl font-bold tracking-tight text-brand-dark">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({ icon, title, description, action, className }: { icon: ReactNode; title: string; description: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center justify-center rounded-lg border border-dashed border-input bg-surface px-6 py-12 text-center", className)}>
      <div className="mb-3 flex size-10 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">{icon}</div>
      <h3 className="text-[15px] font-semibold">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry, extra }: { message: string; onRetry?: () => void; extra?: ReactNode }) {
  return (
    <div role="alert" className="flex flex-col items-start gap-3 rounded-lg border border-[#efcaca] bg-danger-soft px-4 py-4 sm:flex-row sm:items-center">
      <TriangleAlert className="size-5 shrink-0 text-danger" />
      <div className="flex-1 text-sm">
        <p className="font-medium text-danger">Não foi possível carregar os dados</p>
        <p className="text-[#7a2b2b]">{message}</p>
      </div>
      <div className="flex gap-2">
        {extra}
        {onRetry && (
          <Button variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw /> Tentar novamente
          </Button>
        )}
      </div>
    </div>
  );
}

const ORIGIN_META: Record<DataOrigin, { label: string; variant: "success" | "warning" | "neutral"; icon: ReactNode; title: string }> = {
  real: { label: "Dado real", variant: "success", icon: <Satellite />, title: "Obtido diretamente da API da NASA" },
  simulado: { label: "Simulado", variant: "warning", icon: <FlaskConical />, title: "Gerado por mock documentado — não é observação" },
  indisponivel: { label: "Indisponível", variant: "neutral", icon: <CircleSlash />, title: "Sem dado para este local/período" },
};

export function DataOriginBadge({ origin, className, title }: { origin: DataOrigin; className?: string; title?: string }) {
  const m = ORIGIN_META[origin];
  return (
    <Badge variant={m.variant} title={title ?? m.title} className={className}>
      {m.icon}
      {m.label}
    </Badge>
  );
}

export function NasaMark({ className }: { className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <span className={cn("inline-flex aspect-square items-center justify-center rounded-full bg-[#0b3d91] text-[11px] font-black italic tracking-tight text-white", className)}>
        NASA
      </span>
    );
  return <img src="/nasa-logo.png" alt="NASA" className={cn("w-auto object-contain", className)} onError={() => setFailed(true)} />;
}

export function Logo({ className }: { className?: string }) {
  return <img src="/logo-full.png" alt="Semeia" className={cn("h-9 w-auto select-none", className)} draggable={false} />;
}

export function KeyValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}
