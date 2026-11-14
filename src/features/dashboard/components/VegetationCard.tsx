import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART, ChartTooltipBox } from "@/components/charts";
import { DataOriginBadge } from "@/components/shared";
import { fmt, formatDate, formatMonth } from "@/lib/format";
import type { VegetationResult } from "@/types";

const COLOR = "#5aa300";

export function VegetationCard({ vegetation }: { vegetation: VegetationResult }) {
  if (vegetation.origin === "indisponivel") return null;
  const last = [...vegetation.records].reverse().find((r) => r.ndvi !== null);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Cobertura vegetal</CardTitle>
          <p className="text-[13px] text-muted-foreground">NDVI · MODIS · 250 m</p>
        </div>
        <DataOriginBadge origin={vegetation.origin} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex items-end gap-3">
          <p className="text-2xl font-bold">{last ? fmt.n2(last.ndvi!) : "—"}</p>
          {last && <p className="pb-1 text-xs text-muted-foreground">{formatDate(last.date)} · 0 = solo nu, 1 = lavoura densa</p>}
        </div>
        <div className="h-49 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={vegetation.records} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="date" tickFormatter={formatMonth} tick={CHART.tick} tickLine={false} axisLine={{ stroke: CHART.axis }} minTickGap={28} />
              <YAxis domain={[0, 1]} ticks={[0, 0.25, 0.5, 0.75, 1]} tickFormatter={(v: number) => fmt.n2(v)} tick={CHART.tick} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                cursor={{ stroke: CHART.axis }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as { date: string; ndvi: number | null };
                  return <ChartTooltipBox title={formatDate(p.date)} rows={[{ color: COLOR, label: "NDVI", value: p.ndvi === null ? "nuvens" : fmt.n2(p.ndvi) }]} />;
                }}
              />
              <Line dataKey="ndvi" stroke={COLOR} strokeWidth={2} connectNulls dot={{ r: 3, fill: COLOR, strokeWidth: 0 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
