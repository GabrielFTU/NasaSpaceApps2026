import { expect, test } from "@playwright/test";

/**
 * Service worker só existe no build de produção. Rode:
 *   npm run build && npx vite preview --port 5299 --strictPort
 *   PREVIEW_URL=http://localhost:5299 npx playwright test e2e/pwa-preview.spec.ts --project=desktop
 */
const URL = process.env.PREVIEW_URL;
test.skip(!URL, "defina PREVIEW_URL apontando para o `vite preview`");

test("instala o service worker, abre sem internet e não guarda dados ambientais", async ({ page, context }) => {
  await page.route("**/gemini/**", (r) => r.abort());
  await page.goto(`${URL}/propriedades`);
  await page.waitForFunction(() => navigator.serviceWorker?.controller !== null || navigator.serviceWorker.ready.then(() => true), null, { timeout: 15_000 });
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload(); // agora controlado pelo SW
  await expect(page.locator("main h3").first()).toBeVisible();
  // visita outras telas para baixar o código delas
  for (const p of ["/", "/analise", "/historico", "/mapa"]) {
    await page.goto(`${URL}${p}`);
    await page.waitForTimeout(1200);
  }

  const cached = await page.evaluate(async () => {
    const out: string[] = [];
    for (const k of await caches.keys()) for (const r of await (await caches.open(k)).keys()) out.push(new URL(r.url).pathname + (new URL(r.url).host !== location.host ? ` @${new URL(r.url).host}` : ""));
    return out;
  });
  // nada de API externa, assistente ou tiles no cache
  expect(cached.filter((u) => u.includes("@") || /gemini|meteored|power|gibs|tile/i.test(u))).toEqual([]);

  await context.setOffline(true);
  await page.goto(`${URL}/historico`);
  await expect(page.getByText("Sem internet.")).toBeVisible();
  await expect(page.locator("main")).toBeVisible();
  await page.goto(`${URL}/propriedades`);
  await expect(page.locator("main h3").first()).toBeVisible();
  // tela nunca visitada antes: o código veio no pré-carregamento da instalação
  await page.goto(`${URL}/configuracoes`);
  await expect(page.getByText("Não foi possível abrir esta tela")).toHaveCount(0);
  await expect(page.locator("main h1").first()).toBeVisible();
  await context.setOffline(false);
});
