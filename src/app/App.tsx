import { createBrowserRouter, Link, RouterProvider } from "react-router-dom";
import { AppLayout } from "./layout/AppLayout";
import { DashboardPage } from "@/features/dashboard/DashboardPage";
import { ClimatePage } from "@/features/dashboard/ClimatePage";
import { PropertiesPage } from "@/features/properties/PropertiesPage";
import { PropertyFormPage } from "@/features/properties/PropertyFormPage";
import { AnalysisWizardPage } from "@/features/analysis/AnalysisWizardPage";
import { RotationComparisonPage } from "@/features/rotations/RotationComparisonPage";
import { HistoryPage } from "@/features/history/HistoryPage";
import { SettingsPage } from "@/features/settings/SettingsPage";
import { EmptyState } from "@/components/shared";
import { buttonVariants } from "@/components/ui/button";
import { Compass } from "lucide-react";

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

const router = createBrowserRouter([
  {
    element: <AppLayout />,
    children: [
      { path: "/", element: <DashboardPage /> },
      { path: "/clima", element: <ClimatePage /> },
      { path: "/propriedades", element: <PropertiesPage /> },
      { path: "/propriedades/nova", element: <PropertyFormPage /> },
      { path: "/propriedades/:id/editar", element: <PropertyFormPage /> },
      { path: "/analise", element: <AnalysisWizardPage /> },
      { path: "/analise/:id", element: <RotationComparisonPage /> },
      { path: "/historico", element: <HistoryPage /> },
      { path: "/configuracoes", element: <SettingsPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
]);

export function App() {
  return <RouterProvider router={router} />;
}
