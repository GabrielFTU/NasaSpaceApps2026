import type { ReactNode } from "react";
import { Area, AreaChart, Bar, BarChart, ResponsiveContainer, YAxis } from "recharts";

export function Sparkline({ data, color, kind = "area" }: { data: { v: number | null }[]; color: string; kind?: "area" | "bar" }) {
  const id = `spark-${color.replace("#", "")}`;
  return (
    <div className="h-12 w-28 shrink-0" aria-hidden>
      <ResponsiveContainer width="100%" height="100%">
        {kind === "bar" ? (
          <BarChart data={data} margin={{ top: 2, right: 0, bottom: 0, left: 0 }} barCategoryGap={1}>
            <YAxis hide domain={[0, "dataMax"]} />
            <Bar dataKey="v" fill={color} radius={[2, 2, 0, 0]} isAnimationActive={false} />
          </BarChart>
        ) : (
          <AreaChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: 0 }}>
            <defs>
              <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor={color} stopOpacity={0.22} />
                <stop offset="1" stopColor={color} stopOpacity={0} />
              </linearGradient>
            </defs>
            <YAxis hide domain={["dataMin", "dataMax"]} />
            <Area dataKey="v" stroke={color} strokeWidth={2} fill={`url(#${id})`} connectNulls isAnimationActive={false} dot={false} />
          </AreaChart>
        )}
      </ResponsiveContainer>
    </div>
  );
}

export const CHART = {
  series: ["#2a78d6", "#eb6834", "#1baf7a", "#eda100"] as const,
  grid: "#e1e0d9",
  axis: "#c3c2b7",
  tick: { fill: "#6f6e69", fontSize: 12 },
};

interface TooltipRow {
  color: string;
  label: string;
  value: string;
}

export function ChartTooltipBox({ title, rows }: { title: string; rows: TooltipRow[] }) {
  return (
    <div className="min-w-40 rounded-md border border-border bg-surface px-3 py-2 text-[13px] shadow-md">
      <p className="mb-1 font-medium">{title}</p>
      {rows.map((r) => (
        <div key={r.label} className="flex items-center justify-between gap-4">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="inline-block size-2 rounded-full" style={{ background: r.color }} />
            {r.label}
          </span>
          <span className="tabular font-medium">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

export function ChartLegend({ items }: { items: { color: string; label: ReactNode; kind?: "line" | "band" | "bar" }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-muted-foreground">
      {items.map((it, i) => (
        <span key={i} className="flex items-center gap-1.5">
          {it.kind === "band" ? (
            <span className="inline-block h-2.5 w-4 rounded-sm" style={{ background: it.color, opacity: 0.25 }} />
          ) : it.kind === "bar" ? (
            <span className="inline-block size-2.5 rounded-sm" style={{ background: it.color }} />
          ) : (
            <span className="inline-block h-0.5 w-4 rounded" style={{ background: it.color }} />
          )}
          {it.label}
        </span>
      ))}
    </div>
  );
}
