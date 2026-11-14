import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { ClimateSeries, SoilMoistureResult, VegetationResult } from "@/types";
import { CHART, ChartLegend, ChartTooltipBox } from "@/components/charts";
import { fmt, formatDate, formatMonth, formatShortDay } from "@/lib/format";
import { buildChartData, type ChartPoint, type Granularity } from "@/features/dashboard/climateStats";
import { SLOPE_CLASSES } from "@/services/environment/catalog";
import type { TerrainStats } from "@/services/environment/terrain";

const n = (v: number | null | undefined, f = fmt.n1) => (v === null || v === undefined ? "—" : f(v));
const axis = { tick: CHART.tick, tickLine: false, axisLine: { stroke: CHART.axis } } as const;
const dot = { r: 4, strokeWidth: 2, stroke: "#fdfdfb" };
const H = "h-[180px] lg:h-full min-h-[120px]";

function inPeriod<T extends { date: string }>(rs: T[], start: string, end: string) {
  return rs.filter((r) => r.date >= start && r.date <= end);
}

export function granularityFor(days: number): Granularity {
  return days > 120 ? "monthly" : "daily";
}

/** Chuva (barras) e temperatura (faixa mín–máx + média) em dois painéis sincronizados — sem eixo duplo. */
export function RainTempChart({ series, start, end, granularity }: { series: ClimateSeries; start: string; end: string; granularity: Granularity }) {
  const data = buildChartData(inPeriod(series.records, start, end), granularity);
  const tickFmt = granularity === "daily" ? formatShortDay : formatMonth;
  const title = (k: string) => (granularity === "daily" ? formatDate(k) : formatMonth(k));
  return (
    <div className="flex h-full flex-col gap-1">
      <ChartLegend
        items={[
          { color: CHART.series[0], label: granularity === "monthly" ? "Chuva mensal (mm)" : "Chuva diária (mm)", kind: "bar" },
          { color: CHART.series[1], label: "Temperatura média (°C)" },
          { color: CHART.series[1], label: "Mín–máx", kind: "band" },
        ]}
      />
      <div className="grid min-h-[180px] flex-1 grid-rows-2 gap-1 lg:min-h-0">
        <div className="min-h-[60px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} syncId="clima" margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="key" hide />
              <YAxis {...axis} axisLine={false} width={44} domain={[0, "auto"]} />
              <Tooltip cursor={{ fill: "#00000008" }} content={(p) => <ClimateTip {...p} title={title} />} />
              <Bar dataKey="precip" fill={CHART.series[0]} radius={[3, 3, 0, 0]} maxBarSize={18} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="min-h-[60px]">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={data} syncId="clima" margin={{ top: 6, right: 8, left: -8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="key" tickFormatter={tickFmt} {...axis} minTickGap={28} />
              <YAxis {...axis} axisLine={false} width={44} domain={["auto", "auto"]} />
              <Tooltip cursor={{ stroke: CHART.axis }} content={(p) => <ClimateTip {...p} title={title} />} />
              <Area dataKey="tRange" stroke="none" fill={CHART.series[1]} fillOpacity={0.16} isAnimationActive={false} activeDot={false} />
              <Line dataKey="t2m" stroke={CHART.series[1]} strokeWidth={2} dot={false} activeDot={dot} isAnimationActive={false} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function ClimateTip({ active, payload, title }: { active?: boolean; payload?: readonly { payload?: unknown }[]; title: (k: string) => string }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as ChartPoint;
  return (
    <ChartTooltipBox
      title={title(p.key)}
      rows={[
        { color: CHART.series[0], label: "Chuva", value: `${n(p.precip)} mm` },
        { color: CHART.series[1], label: "Média", value: `${n(p.t2m)} °C` },
        { color: CHART.series[1], label: "Mín / máx", value: `${n(p.tRange?.[0])} / ${n(p.tRange?.[1])} °C` },
      ]}
    />
  );
}

export function HumidityChart({ series, start, end, granularity }: { series: ClimateSeries; start: string; end: string; granularity: Granularity }) {
  const data = buildChartData(inPeriod(series.records, start, end), granularity);
  const tickFmt = granularity === "daily" ? formatShortDay : formatMonth;
  return (
    <div className={H}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="key" tickFormatter={tickFmt} {...axis} minTickGap={28} />
          <YAxis {...axis} axisLine={false} width={44} unit="%" domain={[0, 100]} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as ChartPoint;
              return <ChartTooltipBox title={granularity === "daily" ? formatDate(p.key) : formatMonth(p.key)} rows={[{ color: CHART.series[2], label: "UR média", value: `${n(p.rh, fmt.n0)}%` }]} />;
            }}
          />
          <Line dataKey="rh" stroke={CHART.series[2]} strokeWidth={2} dot={false} activeDot={dot} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SoilMoistureChart({ result }: { result: Extract<SoilMoistureResult, { records: unknown }> }) {
  return (
    <div className="flex h-full flex-col gap-1">
      <ChartLegend
        items={[
          { color: CHART.series[0], label: "Superficial 0–5 cm" },
          { color: CHART.series[3], label: "Zona das raízes 0–100 cm" },
        ]}
      />
      <div className="min-h-[150px] flex-1 lg:min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={result.records} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={CHART.grid} />
            <XAxis dataKey="date" tickFormatter={formatShortDay} {...axis} minTickGap={28} />
            <YAxis {...axis} axisLine={false} width={48} domain={[0, "auto"]} tickFormatter={(v: number) => fmt.n2(v)} />
            <Tooltip
              content={({ active, payload }) => {
                if (!active || !payload?.length) return null;
                const p = payload[0].payload as { date: string; surface: number | null; rootZone: number | null };
                return (
                  <ChartTooltipBox
                    title={formatDate(p.date)}
                    rows={[
                      { color: CHART.series[0], label: "0–5 cm", value: `${n(p.surface, fmt.n2)} m³/m³` },
                      { color: CHART.series[3], label: "0–100 cm", value: `${n(p.rootZone, fmt.n2)} m³/m³` },
                    ]}
                  />
                );
              }}
            />
            <Line dataKey="surface" stroke={CHART.series[0]} strokeWidth={2} dot={false} activeDot={dot} connectNulls={false} isAnimationActive={false} />
            <Line dataKey="rootZone" stroke={CHART.series[3]} strokeWidth={2} dot={false} activeDot={dot} connectNulls={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function NdviChart({ result, start, end }: { result: Extract<VegetationResult, { records: unknown }>; start: string; end: string }) {
  const data = inPeriod(result.records, start, end);
  return (
    <div className={H}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, left: -4, bottom: 0 }}>
          <CartesianGrid vertical={false} stroke={CHART.grid} />
          <XAxis dataKey="date" tickFormatter={formatMonth} {...axis} minTickGap={28} />
          <YAxis {...axis} axisLine={false} width={44} domain={[0, 1]} tickFormatter={(v: number) => fmt.n1(v)} />
          <Tooltip
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as { date: string; ndvi: number | null };
              return (
                <ChartTooltipBox
                  title={`Composição de ${formatDate(p.date)}`}
                  rows={[{ color: CHART.series[2], label: "NDVI", value: p.ndvi === null ? "sem pixel válido (nuvem)" : fmt.n2(p.ndvi) }]}
                />
              );
            }}
          />
          <Line dataKey="ndvi" stroke={CHART.series[2]} strokeWidth={2} dot={{ r: 2.5, fill: CHART.series[2] }} activeDot={dot} connectNulls={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SlopeClassChart({ stats }: { stats: TerrainStats }) {
  const data = SLOPE_CLASSES.map((c, i) => ({ label: c.label, range: c.range, pct: Math.round(stats.slopeClasses[i] * 1000) / 10, color: c.color }));
  return (
    <div className={H}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
          <CartesianGrid horizontal={false} stroke={CHART.grid} />
          <XAxis type="number" domain={[0, 100]} unit="%" {...axis} />
          <YAxis type="category" dataKey="label" width={104} tick={CHART.tick} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: "#00000008" }}
            content={({ active, payload }) => {
              if (!active || !payload?.length) return null;
              const p = payload[0].payload as (typeof data)[number];
              return <ChartTooltipBox title={`${p.label} (${p.range})`} rows={[{ color: p.color, label: "Área do talhão", value: `${fmt.n1(p.pct)}%` }]} />;
            }}
          />
          <Bar dataKey="pct" radius={[0, 3, 3, 0]} isAnimationActive={false} label={{ position: "right", fontSize: 11, fill: "#6f6e69", formatter: (v: number) => `${fmt.n1(v)}%` }}>
            {data.map((d) => (
              <Cell key={d.label} fill={d.color} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
