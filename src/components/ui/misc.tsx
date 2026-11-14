import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/utils";

export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("animate-pulse rounded-md bg-muted", className)} {...props} />;
}

interface SegmentedProps<T extends string> {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  "aria-label": string;
  className?: string;
}

/** Controle segmentado — usado para filtros de período e alternância de visualização. */
export function Segmented<T extends string>({ value, onChange, options, className, ...rest }: SegmentedProps<T>) {
  return (
    <div role="radiogroup" aria-label={rest["aria-label"]} className={cn("inline-flex max-w-full overflow-x-auto rounded-md border border-border bg-muted p-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            "shrink-0 cursor-pointer whitespace-nowrap rounded-[5px] px-2.5 py-1 text-[13px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value === o.value ? "bg-surface text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

type CalloutTone = "info" | "warning" | "neutral";
export function Callout({ tone = "neutral", icon, children, className }: { tone?: CalloutTone; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        "flex items-start gap-2.5 rounded-md border px-3 py-2.5 text-[13px] leading-relaxed [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0",
        tone === "info" && "border-[#cfdcee] bg-info-soft text-[#1f4a78]",
        tone === "warning" && "border-[#f0dfb5] bg-warning-soft text-[#6d4700]",
        tone === "neutral" && "border-border bg-muted/60 text-muted-foreground",
        className,
      )}
    >
      {icon}
      <div className="min-w-0">{children}</div>
    </div>
  );
}
