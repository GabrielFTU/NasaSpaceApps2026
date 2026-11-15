import { expect, test, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { horizontalOverflow, isolate, ROUTES, settle } from "./helpers";

/** Estado inicial determinístico: dados de clima simulados (sem depender da API da NASA no teste). */
async function seedMockData(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("seeded")) return;
    sessionStorage.setItem("seeded", "1");
    localStorage.setItem(
      "semeia:v1",
      JSON.stringify({
        state: {
          settings: {
            profile: { name: "Agnaldo Teste", email: "teste@exemplo.com.br", organization: "", role: "Produtor rural" },
            defaultPeriod: "30d",
            showDataOriginBadges: true,
            powerMode: "mock",
            autoSync: false,
            lastSyncAt: null,
          },
        },
        version: 5,
      }),
    );
  });
}

const isMobile = (page: Page) => (page.viewportSize()?.width ?? 1440) < 1024;

test.beforeEach(async ({ page }) => {
  await isolate(page);
  await seedMockData(page);
});

test.describe("navegação", () => {
  test("todas as rotas carregam sem erro de JavaScript e sem rolagem horizontal", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    for (const r of ROUTES) {
      await page.goto(r.path);
      await settle(page, 800);
      await expect(page.locator("main#conteudo")).toBeVisible();
      const ov = await horizontalOverflow(page);
      expect(ov.overflow, `${r.path} transborda: ${ov.offenders.join(", ")}`).toBe(false);
    }
    expect(errors).toEqual([]);
  });

  test("rota inexistente mostra 404 com caminho de volta", async ({ page }) => {
    await page.goto("/nao-existe");
    await expect(page.getByText("Página não encontrada")).toBeVisible();
    await page.getByRole("link", { name: "Voltar ao painel" }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test("recarregar uma rota interna mantém a tela", async ({ page }) => {
    await page.goto("/historico");
    await page.reload();
    await expect(page.getByRole("heading", { level: 1 }).first()).toContainText(/Estratégias salvas|Histórico/);
  });

  test("menu: navega, marca a página ativa e o voltar do navegador funciona", async ({ page }) => {
    await page.goto("/");
    if (isMobile(page)) await page.getByRole("button", { name: "Abrir menu" }).click();
    await page.getByRole("navigation", { name: "Navegação principal" }).last().getByRole("link", { name: "Propriedades" }).click();
    await expect(page).toHaveURL(/\/propriedades$/);
    await expect(page.getByRole("link", { name: "Nova propriedade" })).toBeVisible();
    if (isMobile(page)) {
      // o menu fecha sozinho ao navegar
      await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
      await page.getByRole("button", { name: "Abrir menu" }).click();
      await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
      await page.screenshot({ path: "test-results/menu-mobile.png" });
    }
    await expect(page.getByRole("navigation", { name: "Navegação principal" }).last().getByRole("link", { name: "Propriedades" })).toHaveAttribute("aria-current", "page");
    if (isMobile(page)) await page.keyboard.press("Escape");
    await page.goBack();
    await expect(page).toHaveURL(/\/$/);
  });
});

test.describe("menu mobile", () => {
  test("abre, fecha com Esc e devolve o foco ao botão", async ({ page }) => {
    test.skip(!isMobile(page), "só no celular");
    await page.goto("/");
    const btn = page.getByRole("button", { name: "Abrir menu" });
    await btn.click();
    await expect(page.getByRole("dialog", { name: "Menu" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "Menu" })).toHaveCount(0);
    await expect(btn).toBeFocused();
  });
});

test.describe("propriedades", () => {
  test("cadastro: validação, mensagem clara e campos marcados", async ({ page }) => {
    await page.goto("/propriedades/nova");
    await page.getByRole("button", { name: "Cadastrar propriedade" }).click();
    await expect(page.getByText("Revise os campos destacados")).toBeVisible();
    await expect(page.getByLabel("Nome")).toHaveAttribute("aria-invalid", "true");
  });

  test("cadastro com exemplo salva uma única vez mesmo com clique duplo", async ({ page }) => {
    await page.goto("/propriedades");
    await expect(page.locator("main h3").first()).toBeVisible(); // telas carregam sob demanda
    const before = await page.locator("main h3").count();
    await page.goto("/propriedades/nova");
    await page.getByRole("button", { name: "Usar exemplo de Cianorte" }).click();
    await page.getByLabel("Nome").fill("Sítio do Teste");
    await page.getByRole("button", { name: "Cadastrar propriedade" }).dblclick();
    await expect(page).toHaveURL(/\/propriedades$/);
    await expect(page.locator("main h3")).toHaveCount(before + 1);
    await expect(page.locator("main h3", { hasText: "Sítio do Teste" })).toHaveCount(1);
  });

  test("sair com dados não salvos pede confirmação e permite continuar editando", async ({ page }) => {
    await page.goto("/propriedades/nova");
    await page.getByLabel("Nome").fill("Rascunho importante");
    await page.getByRole("link", { name: "Propriedades" }).first().click();
    const dlg = page.getByRole("dialog", { name: "Sair sem salvar?" });
    await expect(dlg).toBeVisible();
    await dlg.getByRole("button", { name: "Continuar editando" }).click();
    await expect(page).toHaveURL(/\/propriedades\/nova$/);
    await expect(page.getByLabel("Nome")).toHaveValue("Rascunho importante");
    await page.getByRole("link", { name: "Propriedades" }).first().click();
    await page.getByRole("dialog").getByRole("button", { name: "Sair sem salvar" }).click();
    await expect(page).toHaveURL(/\/propriedades$/);
  });

  test("menu de ações do cartão fecha ao tocar fora e com Esc", async ({ page }) => {
    await page.goto("/propriedades");
    const trigger = page.getByRole("button", { name: /Ações para/ }).first();
    await trigger.click();
    await expect(page.getByRole("button", { name: "Excluir" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("button", { name: "Excluir" })).toHaveCount(0);
    await trigger.click();
    await page.locator("main h1").click();
    await expect(page.getByRole("button", { name: "Excluir" })).toHaveCount(0);
  });

  test("diálogo de exclusão: foco preso, Esc fecha e nada é apagado", async ({ page }) => {
    await page.goto("/propriedades");
    await expect(page.locator("main h3").first()).toBeVisible();
    const count = await page.locator("main h3").count();
    await page.getByRole("button", { name: /Ações para/ }).first().click();
    await page.getByRole("button", { name: "Excluir" }).click();
    const dlg = page.getByRole("dialog", { name: "Excluir propriedade?" });
    await expect(dlg).toBeVisible();
    for (let i = 0; i < 5; i++) await page.keyboard.press("Tab");
    expect(await dlg.evaluate((d) => d.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dlg).toHaveCount(0);
    await expect(page.locator("main h3")).toHaveCount(count);
  });
});

test.describe("análise", () => {
  test("formulário guiado: indica a etapa, volta preservando respostas e gera a comparação", async ({ page }) => {
    test.setTimeout(90_000);
    await page.goto("/analise");
    await page.getByRole("radio", { name: "Formulário" }).click();
    if (isMobile(page)) await expect(page.getByText("Etapa 1 de 5")).toBeVisible();
    await page.getByRole("button", { name: "Continuar" }).click(); // propriedade
    await page.getByRole("button", { name: "Continuar" }).click(); // culturas
    await page.getByLabel("pH em água").fill("12");
    await page.getByRole("button", { name: "Continuar" }).click();
    await expect(page.getByText("Informe um pH entre 3,5 e 9,0")).toBeVisible();
    await page.getByLabel("pH em água").fill("5,6");
    await page.getByRole("button", { name: "Continuar" }).click(); // solo
    await page.getByRole("button", { name: "Voltar", exact: true }).click();
    await expect(page.getByLabel("pH em água")).toHaveValue("5,6");
    await page.getByRole("button", { name: "Continuar" }).click();
    await page.getByRole("button", { name: "Continuar" }).click(); // prioridades
    await expect(page.getByText("Tudo certo?")).toBeVisible();
    await page.getByRole("button", { name: "Gerar comparação" }).click();
    await expect(page).toHaveURL(/\/analise\/.+/, { timeout: 60_000 });
    await settle(page, 1500);
    const ov = await horizontalOverflow(page);
    expect(ov.overflow, ov.offenders.join(", ")).toBe(false);
    const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).exclude(".leaflet-tile-pane").analyze();
    const serious = axe.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`)).toEqual([]);
    const tag = isMobile(page) ? "mobile" : "desktop";
    await page.screenshot({ path: `test-results/comparativo-${tag}.png`, fullPage: true });
    await page.setViewportSize({ width: 320, height: 720 });
    await settle(page, 600);
    const ov320 = await horizontalOverflow(page);
    expect(ov320.overflow, `320px: ${ov320.offenders.join(", ")}`).toBe(false);
    if (tag === "mobile") await page.screenshot({ path: `test-results/comparativo-320.png`, fullPage: true });
    // reabrir pelo histórico
    await page.goto("/historico");
    await expect(page.locator("main").getByRole("link").filter({ hasText: /Sítio Santa Clara|Ver|Abrir/ }).first()).toBeVisible();
  });

  test("assistente: envia, mostra a resposta, ignora mensagem vazia e mantém a conversa ao ir para o formulário e voltar", async ({ page }) => {
    await page.route("**/gemini/**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "text/event-stream",
        body: `data: ${JSON.stringify({ candidates: [{ content: { role: "model", parts: [{ text: "Entendi: soja no verão." }] }, finishReason: "STOP" }] })}\n\n`,
      }),
    );
    await page.goto("/analise");
    const box = page.getByLabel("Sua mensagem");
    await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled(); // vazio
    await box.fill("   ");
    await expect(page.getByRole("button", { name: "Enviar" })).toBeDisabled();
    await box.fill("eu planto soja no verao e milho safrinha");
    await box.press("Enter");
    await expect(page.getByText("Entendi: soja no verão.")).toBeVisible();
    await page.getByRole("radio", { name: "Formulário" }).click();
    await page.getByRole("radio", { name: "Conversando" }).click();
    await expect(page.getByText("eu planto soja no verao e milho safrinha")).toBeVisible();
    await expect(page.getByText("Entendi: soja no verão.")).toBeVisible();
  });

  test("assistente: falha do servidor mostra erro compreensível e permite tentar de novo", async ({ page }) => {
    await page.route("**/gemini/**", (route) => route.fulfill({ status: 503, contentType: "application/json", body: "{}" }));
    await page.goto("/analise");
    await page.getByLabel("Sua mensagem").fill("oi");
    await page.getByLabel("Sua mensagem").press("Enter");
    await expect(page.getByText(/O assistente falhou|demorando|Sem conexão/)).toBeVisible({ timeout: 30_000 });
    await expect(page.getByLabel("Sua mensagem")).toBeEnabled();
  });

  test("assistente: resposta demorada mostra que está processando e pode ser interrompida", async ({ page }) => {
    await page.route("**/gemini/**", async (route) => {
      await new Promise((r) => setTimeout(r, 4000));
      await route.fulfill({ status: 200, contentType: "text/event-stream", body: "" }).catch(() => {});
    });
    await page.goto("/analise");
    await page.getByLabel("Sua mensagem").fill("qual a melhor época?");
    await page.getByLabel("Sua mensagem").press("Enter");
    await expect(page.getByText("O assistente está escrevendo…")).toBeAttached();
    await page.getByRole("button", { name: "Parar resposta" }).click();
    await expect(page.getByRole("button", { name: "Parar resposta" })).toHaveCount(0);
  });
});

test.describe("mapa ambiental", () => {
  test("troca de camada, abre a lista de talhões e fecha com Esc", async ({ page }) => {
    await page.goto("/mapa");
    await page.getByRole("button", { name: "Camada do mapa" }).click();
    await page.getByRole("option", { name: /Chuva/ }).first().click();
    await expect(page.getByRole("button", { name: "Camada do mapa" })).toContainText(/Chuva/);
    await page.getByRole("button", { name: "Talhões" }).click();
    await expect(page.getByRole("region", { name: "Talhões" })).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("region", { name: "Talhões" })).toHaveCount(0);
  });

  test("desenho de talhão: toque no mapa, concluir abre o diálogo e salvar cria o talhão", async ({ page }) => {
    await page.goto("/mapa");
    await settle(page, 1500);
    await page.getByRole("button", { name: "Desenhar" }).click();
    const map = page.locator(".leaflet-container.envmap, .leaflet-container").first();
    const b = (await map.boundingBox())!;
    // pontos na metade de cima: garante que a barra de desenho não cobre essa área (regressão do celular)
    for (const [dx, dy] of [[0.3, 0.25], [0.7, 0.25], [0.55, 0.6]]) {
      const x = b.x + b.width * dx;
      const y = b.y + b.height * dy;
      if (isMobile(page)) await page.touchscreen.tap(x, y);
      else await page.mouse.click(x, y);
      await page.waitForTimeout(350); // evita que dois toques virem "duplo toque" (zoom)
    }
    await page.screenshot({ path: `test-results/draw-${isMobile(page) ? "mobile" : "desktop"}.png` });
    await page.getByRole("button", { name: "Concluir" }).click();
    const dlg = page.getByRole("dialog", { name: "Salvar talhão" });
    await expect(dlg).toBeVisible();
    await expect(dlg.getByLabel("Nome")).toBeFocused();
    await dlg.getByLabel("Nome").fill("Talhão do teste");
    await page.waitForTimeout(1500); // dados chegando ao fundo não podem tirar o foco do campo
    await expect(dlg.getByLabel("Nome")).toBeFocused();
    await dlg.getByRole("button", { name: "Salvar talhão" }).click();
    await expect(page.getByText("Talhão salvo")).toBeVisible();
  });
});

test.describe("PWA e offline", () => {
  test("manifest válido com ícones instaláveis", async ({ page, request }) => {
    await page.goto("/");
    const href = await page.locator('link[rel="manifest"]').getAttribute("href");
    const res = await request.get(href!);
    expect(res.ok()).toBe(true);
    const m = await res.json();
    expect(m.name).toContain("Semeia");
    expect(m.start_url).toBe("/");
    expect(m.display).toBe("standalone");
    for (const size of ["192x192", "512x512"]) expect(m.icons.some((i: { sizes: string }) => i.sizes === size)).toBe(true);
    for (const i of m.icons) expect((await request.get(i.src)).ok(), i.src).toBe(true);
  });

  test("sem internet: aviso claro do que funciona e do que depende de conexão", async ({ page, context }) => {
    await page.goto("/propriedades");
    await expect(page.locator("main h3").first()).toBeVisible();
    await context.setOffline(true);
    await expect(page.getByText("Sem internet.")).toBeVisible();
    await expect(page.locator("main h3").first()).toBeVisible(); // dados locais seguem visíveis
    await context.setOffline(false);
    await expect(page.getByText("Sem internet.")).toHaveCount(0);
  });
});

test.describe("acessibilidade (axe, WCAG 2.2 AA)", () => {
  for (const r of ROUTES) {
    test(`sem violações graves em ${r.path}`, async ({ page }) => {
      await page.goto(r.path);
      await settle(page, 2000);
      const res = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
        .exclude(".leaflet-tile-pane") // imagens de tiles de terceiros
        .analyze();
      const serious = res.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).slice(0, 4).join(" | ")}`)).toEqual([]);
    });
  }
});

test.describe("orientação ao agricultor", () => {
  test("primeiros passos: mostra progresso, leva ao próximo passo e pode ser escondido", async ({ page }) => {
    await page.goto("/");
    const box = page.getByRole("region", { name: "Primeiros passos" });
    await expect(box).toBeVisible();
    await expect(box).toContainText(/de 4 feitos/);
    await page.screenshot({ path: `test-results/inicio-${isMobile(page) ? "mobile" : "desktop"}.png` });
    await box.getByRole("button", { name: "Esconder primeiros passos" }).click();
    await expect(box).toHaveCount(0);
    await page.reload();
    await expect(page.getByRole("region", { name: "Primeiros passos" })).toHaveCount(0);
  });

  test("ajuda contextual abre por teclado e por toque, sem depender de hover", async ({ page }) => {
    await page.goto("/propriedades/nova");
    const q = page.getByRole("button", { name: "Como sei se minha terra é arenosa?" });
    await q.focus();
    await page.keyboard.press("Enter");
    await expect(q).toHaveAttribute("aria-expanded", "true");
    await expect(page.getByText("Pegue um punhado de terra úmida")).toBeVisible();
    await q.click();
    await expect(page.getByText("Pegue um punhado de terra úmida")).toHaveCount(0);
  });

  test("cada tela tem um título de aba próprio e um único h1", async ({ page }) => {
    for (const r of ROUTES.filter((x) => x.name !== "404")) {
      await page.goto(r.path);
      await expect(page.locator("main h1")).toHaveCount(1);
      if (r.path !== "/") await expect(page).toHaveTitle(/ · Semeia$/);
    }
  });
});
