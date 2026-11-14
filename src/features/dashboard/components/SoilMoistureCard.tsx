import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CHART, ChartLegend, ChartTooltipBox } from "@/components/charts";
import { DataOriginBadge } from "@/components/shared";
import { fmt, formatDate, formatShortDay } from "@/lib/format";
import type { SoilMoistureResult } from "@/types";

const C1 = "#2a78d6";
const C2 = "#8a5a00";

export function SoilMoistureCard({ soil }: { soil: SoilMoistureResult }) {
  if (soil.origin === "indisponivel") return null;
  const last = [...soil.records].reverse().find((r) => r.surface !== null);
  const lastRoot = [...soil.records].reverse().find((r) => r.rootZone !== null);
  return (
    <Card>
      <CardHeader className="flex-row items-start justify-between gap-2">
        <div>
          <CardTitle>Umidade do solo</CardTitle>
          <p className="text-[13px] text-muted-foreground">SMAP · m³/m³ · 9 km</p>
        </div>
        <DataOriginBadge origin={soil.origin} />
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <div className="flex gap-6">
          <div>
            <p className="text-xs text-muted-foreground">Superfície</p>
            <p className="text-2xl font-bold">{last ? fmt.n2(last.surface!) : "—"}</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Raízes</p>
            <p className="text-2xl font-bold">{lastRoot ? fmt.n2(lastRoot.rootZone!) : "—"}</p>
          </div>
          {last && <p className="self-end pb-1 text-xs text-muted-foreground">{formatDate(last.date)}</p>}
        </div>
        <ChartLegend
          items={[
            { color: C1, label: "Superfície (0–5 cm)" },
            { color: C2, label: "Raízes (0–100 cm)" },
          ]}
        />
        <div className="h-44 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={soil.records} margin={{ top: 4, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="date" tickFormatter={formatShortDay} tick={CHART.tick} tickLine={false} axisLine={{ stroke: CHART.axis }} minTickGap={28} />
              <YAxis domain={[0, 0.5]} tickFormatter={(v: number) => fmt.n2(v)} tick={CHART.tick} tickLine={false} axisLine={false} width={44} />
              <Tooltip
                cursor={{ stroke: CHART.axis }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as { date: string; surface: number | null; rootZone: number | null };
                  return (
                    <ChartTooltipBox
                      title={formatDate(p.date)}
                      rows={[
                        { color: C1, label: "Superfície", value: p.surface === null ? "—" : fmt.n2(p.surface) },
                        { color: C2, label: "Raízes", value: p.rootZone === null ? "—" : fmt.n2(p.rootZone) },
                      ]}
                    />
                  );
                }}
              />
              <Line dataKey="surface" stroke={C1} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4 }} isAnimationActive={false} />
              <Line dataKey="rootZone" stroke={C2} strokeWidth={2} dot={false} connectNulls activeDot={{ r: 4 }} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
