import { defineConfig, devices } from "@playwright/test";

/**
 * Testes end-to-end do Semeia.
 * - `npm run test:e2e`        → fluxos críticos + acessibilidade (axe) + responsividade
 * - `npm run test:e2e:audit`  → varredura de todas as rotas × 9 larguras com screenshots (lenta)
 *
 * O assistente (Gemini) é sempre simulado nos testes: nenhuma cota real é gasta.
 */
const PORT = 5199;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: true,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "pt-BR",
    timezoneId: "America/Sao_Paulo",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /audit\.spec/ },
    { name: "mobile", use: { ...devices["Pixel 7"] }, testIgnore: /audit\.spec/ },
    { name: "audit", use: { ...devices["Desktop Chrome"] }, testMatch: /audit\.spec/ },
  ],
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
