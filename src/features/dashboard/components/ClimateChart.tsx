import { useState } from "react";
import { Area, Bar, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Table2, LineChart as LineIcon } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/misc";
import { CHART, ChartLegend, ChartTooltipBox } from "@/components/charts";
import { fmt, formatDate, formatMonth, formatShortDay } from "@/lib/format";
import type { ChartPoint, Granularity } from "../climateStats";

type Variable = "temp" | "precip" | "rh" | "radiation";

const VARS: Record<Variable, { label: string; unit: string; param: string; color: string }> = {
  temp: { label: "Temperatura", unit: "°C", param: "T2M · T2M_MIN · T2M_MAX", color: CHART.series[1] },
  precip: { label: "Precipitação", unit: "mm", param: "PRECTOTCORR", color: CHART.series[0] },
  rh: { label: "Umidade relativa", unit: "%", param: "RH2M", color: CHART.series[2] },
  radiation: { label: "Radiação solar", unit: "MJ/m²/dia", param: "ALLSKY_SFC_SW_DWN", color: CHART.series[3] },
};

const n = (v: number | null | undefined, f = fmt.n1) => (v === null || v === undefined ? "—" : f(v));

export function ClimateChart({ data, granularity }: { data: ChartPoint[]; granularity: Granularity }) {
  const [variable, setVariable] = useState<Variable>("temp");
  const [view, setView] = useState<"chart" | "table">("chart");
  const meta = VARS[variable];
  const tickFmt = granularity === "daily" ? formatShortDay : formatMonth;
  const titleFmt = (k: string) => (granularity === "daily" ? formatDate(k) : formatMonth(k));
  const precipLabel = granularity === "monthly" ? "Total mensal" : "Diária";

  return (
    <Card>
      <CardHeader className="gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <CardTitle>Histórico climático</CardTitle>
          <p className="mt-0.5 text-[13px] text-muted-foreground">
            {granularity === "monthly" ? "Agregado por mês" : "Valores diários"} · {meta.param}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Segmented
            aria-label="Variável do gráfico"
            value={variable}
            onChange={setVariable}
            options={(Object.keys(VARS) as Variable[]).map((k) => ({ value: k, label: VARS[k].label }))}
          />
          <Button
            variant="outline"
            size="icon-sm"
            onClick={() => setView(view === "chart" ? "table" : "chart")}
            aria-label={view === "chart" ? "Ver como tabela" : "Ver como gráfico"}
            title={view === "chart" ? "Ver como tabela" : "Ver como gráfico"}
          >
            {view === "chart" ? <Table2 /> : <LineIcon />}
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {variable === "temp" && view === "chart" && (
          <div className="mb-2">
            <ChartLegend
              items={[
                { color: meta.color, label: "Média (T2M)" },
                { color: meta.color, label: "Faixa mínima–máxima", kind: "band" },
              ]}
            />
          </div>
        )}
        {view === "chart" ? (
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke={CHART.grid} />
                <XAxis
                  dataKey="key"
                  tickFormatter={tickFmt}
                  tick={CHART.tick}
                  tickLine={false}
                  axisLine={{ stroke: CHART.axis }}
                  minTickGap={28}
                />
                <YAxis
                  tick={CHART.tick}
                  tickLine={false}
                  axisLine={false}
                  width={48}
                  unit={variable === "rh" ? "%" : ""}
                  domain={variable === "precip" ? [0, "auto"] : ["auto", "auto"]}
                />
                <Tooltip
                  cursor={variable === "precip" ? { fill: "#00000008" } : { stroke: CHART.axis, strokeWidth: 1 }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const p = payload[0].payload as ChartPoint;
                    const rows =
                      variable === "temp"
                        ? [
                            { color: meta.color, label: "Média", value: `${n(p.t2m)} °C` },
                            { color: meta.color, label: "Mínima", value: `${n(p.tRange?.[0])} °C` },
                            { color: meta.color, label: "Máxima", value: `${n(p.tRange?.[1])} °C` },
                          ]
                        : variable === "precip"
                          ? [{ color: meta.color, label: precipLabel, value: `${n(p.precip)} mm` }]
                          : variable === "rh"
                            ? [{ color: meta.color, label: "Média", value: `${n(p.rh, fmt.n0)}%` }]
                            : [{ color: meta.color, label: "Média", value: `${n(p.radiation)} MJ/m²` }];
                    return <ChartTooltipBox title={titleFmt(p.key)} rows={rows} />;
                  }}
                />
                {variable === "temp" && (
                  <>
                    <Area dataKey="tRange" stroke="none" fill={meta.color} fillOpacity={0.16} isAnimationActive={false} connectNulls={false} activeDot={false} />
                    <Line dataKey="t2m" stroke={meta.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fdfdfb" }} isAnimationActive={false} />
                  </>
                )}
                {variable === "precip" && (
                  <Bar dataKey="precip" fill={meta.color} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
                )}
                {variable === "rh" && (
                  <Line dataKey="rh" stroke={meta.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fdfdfb" }} isAnimationActive={false} />
                )}
                {variable === "radiation" && (
                  <Line dataKey="radiation" stroke={meta.color} strokeWidth={2} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: "#fdfdfb" }} isAnimationActive={false} />
                )}
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        ) : (
          <div className="max-h-72 overflow-auto rounded-md border border-border">
            <table className="tabular w-full text-[13px]">
              <thead className="sticky top-0 bg-muted text-left text-muted-foreground">
                <tr>
                  <th className="px-3 py-2 font-medium">{granularity === "monthly" ? "Mês" : "Data"}</th>
                  <th className="px-3 py-2 text-right font-medium">T média (°C)</th>
                  <th className="px-3 py-2 text-right font-medium">T mín/máx (°C)</th>
                  <th className="px-3 py-2 text-right font-medium">Chuva (mm)</th>
                  <th className="px-3 py-2 text-right font-medium">UR (%)</th>
                  <th className="px-3 py-2 text-right font-medium">Radiação (MJ/m²)</th>
                </tr>
              </thead>
              <tbody>
                {[...data].reverse().map((p) => (
                  <tr key={p.key} className="border-t border-border">
                    <td className="px-3 py-1.5">{titleFmt(p.key)}</td>
                    <td className="px-3 py-1.5 text-right">{n(p.t2m)}</td>
                    <td className="px-3 py-1.5 text-right">
                      {n(p.tRange?.[0])} / {n(p.tRange?.[1])}
                    </td>
                    <td className="px-3 py-1.5 text-right">{n(p.precip)}</td>
                    <td className="px-3 py-1.5 text-right">{n(p.rh, fmt.n0)}</td>
                    <td className="px-3 py-1.5 text-right">{n(p.radiation)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
