import { createBrowserRouter, Link, RouterProvider } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { EmptyState } from "@/components/shared";
import { buttonVariants } from "@/components/ui/button";
import { Compass, Loader2 } from "lucide-react";

function NotFound() {
  return (
    <EmptyState
      icon={<Compass />}
      title="Página não encontrada"
      description="O endereço acessado não existe ou foi removido."
      action={
        <Link to="/" className={buttonVariants()}>
          Voltar ao painel
        </Link>
      }
    />
  );
}

/** Primeira carga, enquanto o código da tela chega (cada tela é baixada só quando usada). */
function LoadingScreen() {
  return (
    <div role="status" className="flex min-h-[60vh] items-center justify-center gap-2 text-sm text-muted-foreground">
      <Loader2 className="size-5 animate-spin text-primary" aria-hidden /> Carregando…
    </div>
  );
}

/** Falha ao baixar o código de uma tela (sem internet ou versão nova publicada). */
function RouteError() {
  return (
    <div className="mx-auto max-w-md p-6">
      <EmptyState
        icon={<Compass />}
        title="Não foi possível abrir esta tela"
        description="Verifique a internet e tente de novo. Seus dados salvos não foram afetados."
        action={
          <button type="button" onClick={() => window.location.reload()} className={buttonVariants()}>
            Tentar de novo
          </button>
        }
      />
    </div>
  );
}

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    HydrateFallback: LoadingScreen,
    errorElement: <RouteError />,
    children: [
      { path: "/", lazy: () => import("@/features/dashboard/DashboardPage").then((m) => ({ Component: m.DashboardPage })) },
      { path: "/clima", lazy: () => import("@/features/dashboard/ClimatePage").then((m) => ({ Component: m.ClimatePage })) },
      { path: "/mapa", lazy: () => import("@/features/environmental-map/EnvironmentalMapPage").then((m) => ({ Component: m.EnvironmentalMapPage })) },
      { path: "/propriedades", lazy: () => import("@/features/properties/PropertiesPage").then((m) => ({ Component: m.PropertiesPage })) },
      { path: "/propriedades/nova", lazy: () => import("@/features/properties/PropertyFormPage").then((m) => ({ Component: m.PropertyFormPage })) },
      { path: "/propriedades/:id/editar", lazy: () => import("@/features/properties/PropertyFormPage").then((m) => ({ Component: m.PropertyFormPage })) },
      { path: "/analise", lazy: () => import("@/features/analysis/AnalysisWizardPage").then((m) => ({ Component: m.AnalysisWizardPage })) },
      { path: "/analise/:id", lazy: () => import("@/features/rotations/RotationComparisonPage").then((m) => ({ Component: m.RotationComparisonPage })) },
      { path: "/historico", lazy: () => import("@/features/history/HistoryPage").then((m) => ({ Component: m.HistoryPage })) },
      { path: "/configuracoes", lazy: () => import("@/features/settings/SettingsPage").then((m) => ({ Component: m.SettingsPage })) },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
