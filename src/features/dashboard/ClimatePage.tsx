import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { MapPinned, RefreshCw } from "lucide-react";
import { useAppStore, useSelectedProperty } from "@/app/store";
import { PageHeader, EmptyState, ErrorState } from "@/components/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { Segmented, Skeleton } from "@/components/ui/misc";
import { toast } from "@/components/ui/toast";
import { clearNasaCache } from "@/services/nasa";
import { formatDate } from "@/lib/format";
import type { PeriodKey } from "@/types";
import { useEnvironmentalData } from "./useEnvironmentalData";
import { PERIOD_OPTIONS, buildChartData, lastNDays, periodDays } from "./climateStats";
import { evaluateAlerts } from "./alerts";
import { ClimateChart } from "./components/ClimateChart";
import { AlertsPanel } from "./components/AlertsPanel";
import { VegetationCard } from "./components/VegetationCard";
import { SoilMoistureCard } from "./components/SoilMoistureCard";
import { DataSourcesCard } from "./components/DataSourcesCard";

export function ClimatePage() {
  const property = useSelectedProperty();
  const settings = useAppStore((s) => s.settings);
  const updateSettings = useAppStore((s) => s.updateSettings);
  const [period, setPeriod] = useState<PeriodKey>(settings.defaultPeriod);
  const data = useEnvironmentalData(property);

  useEffect(() => setPeriod(settings.defaultPeriod), [settings.defaultPeriod]);

  const { reload } = data;
  useEffect(() => {
    if (!settings.autoSync) return;
    const t = setInterval(() => {
      clearNasaCache();
      updateSettings({ lastSyncAt: new Date().toISOString() });
      reload();
    }, 6 * 60 * 60 * 1000);
    return () => clearInterval(t);
  }, [settings.autoSync, reload, updateSettings]);

  const view = useMemo(() => {
    if (data.status !== "ready") return null;
    const records = lastNDays(data.climate.records, periodDays(period), data.climate.lastAvailableDate);
    const granularity = period === "12m" ? ("monthly" as const) : ("daily" as const);
    return {
      chart: buildChartData(records, granularity),
      granularity,
      alerts: evaluateAlerts(lastNDays(data.climate.records, 60, data.climate.lastAvailableDate), data.vegetation, data.soil),
    };
  }, [data, period]);

  if (!property) {
    return (
      <EmptyState
        icon={<MapPinned />}
        title="Nenhuma propriedade cadastrada"
        description="Cadastre uma propriedade para ver o histórico climático da região."
        action={
          <Link to="/propriedades/nova" className={buttonVariants()}>
            Cadastrar propriedade
          </Link>
        }
      />
    );
  }

  const refresh = () => {
    clearNasaCache();
    updateSettings({ lastSyncAt: new Date().toISOString() });
    data.reload();
    toast.info("Atualizando…");
  };

  return (
    <>
      <PageHeader
        title="Clima e alertas"
        description={data.status === "ready" ? `${property.name} · até ${formatDate(data.climate.lastAvailableDate)}` : property.name}
        actions={
          <>
            <Segmented aria-label="Período" value={period} onChange={setPeriod} options={PERIOD_OPTIONS.map(({ value, label }) => ({ value, label }))} />
            <Button variant="outline" size="icon" onClick={refresh} loading={data.status === "loading"} aria-label="Atualizar dados" title="Atualizar dados">
              {data.status !== "loading" && <RefreshCw />}
            </Button>
          </>
        }
      />

      {data.status === "error" && (
        <ErrorState
          message={data.error}
          onRetry={data.reload}
          extra={
            settings.powerMode === "api" ? (
              <Button variant="outline" size="sm" onClick={() => updateSettings({ powerMode: "mock" })}>
                Usar dados simulados
              </Button>
            ) : undefined
          }
        />
      )}

      {(data.status === "loading" || data.status === "idle") && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3" aria-busy="true">
          <Skeleton className="h-[380px] rounded-lg lg:col-span-2" />
          <Skeleton className="h-[380px] rounded-lg" />
        </div>
      )}

      {data.status === "ready" && view && (
        <div className="flex flex-col gap-5">
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
            <div className="min-w-0 lg:col-span-2">
              <ClimateChart data={view.chart} granularity={view.granularity} />
            </div>
            <AlertsPanel alerts={view.alerts} referenceDate={data.climate.lastAvailableDate} />
          </div>
          <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
            <SoilMoistureCard soil={data.soil} />
            <VegetationCard vegetation={data.vegetation} />
          </div>
          <DataSourcesCard climate={data.climate} soil={data.soil} vegetation={data.vegetation} />
        </div>
      )}
    </>
  );
}
