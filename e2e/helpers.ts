import type { Page } from "@playwright/test";

export const ROUTES = [
  { path: "/", name: "inicio" },
  { path: "/clima", name: "clima" },
  { path: "/mapa", name: "mapa" },
  { path: "/propriedades", name: "propriedades" },
  { path: "/propriedades/nova", name: "propriedade-nova" },
  { path: "/propriedades/prop_cianorte/editar", name: "propriedade-editar" },
  { path: "/analise", name: "analise" },
  { path: "/historico", name: "historico" },
  { path: "/configuracoes", name: "configuracoes" },
  { path: "/rota-que-nao-existe", name: "404" },
] as const;

export const WIDTHS = [320, 360, 390, 430, 768, 1024, 1280, 1440, 1920] as const;

/**
 * Isola o teste do mundo externo que custa cota ou é instável:
 * - Gemini: resposta SSE simulada (texto fixo ou o que o teste pedir);
 * - Meteored: falha controlada (o app precisa mostrar estado de indisponível).
 * NASA/GIBS/tiles seguem reais, porque são públicos e é o que o agricultor vê.
 */
export async function isolate(page: Page, opts: { reply?: string | ((body: string) => string); geminiStatus?: number; delayMs?: number } = {}) {
  await page.route("**/gemini/**", async (route) => {
    if (opts.delayMs) await new Promise((r) => setTimeout(r, opts.delayMs));
    if (opts.geminiStatus && opts.geminiStatus !== 200) {
      return route.fulfill({ status: opts.geminiStatus, contentType: "application/json", body: JSON.stringify({ error: { message: "simulado" } }) });
    }
    const body = route.request().postData() ?? "";
    const text = typeof opts.reply === "function" ? opts.reply(body) : (opts.reply ?? "Resposta de teste do assistente.");
    const chunk = { candidates: [{ content: { role: "model", parts: [{ text }] }, finishReason: "STOP" }] };
    return route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify(chunk)}\n\n` });
  });
  await page.route("**/meteored/**", (route) => route.fulfill({ status: 503, body: "" }));
}

/** Espera a página estabilizar sem depender de "networkidle" (tiles de mapa nunca param). */
export async function settle(page: Page, ms = 1200) {
  await page.waitForLoadState("domcontentloaded");
  await page.waitForTimeout(ms);
}

/** Elementos visíveis cuja borda direita passa da viewport (causa de scroll horizontal). */
export async function horizontalOverflow(page: Page) {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const scroll = document.documentElement.scrollWidth;
    const offenders: string[] = [];
    if (scroll > vw + 1) {
      for (const el of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        if (r.right > vw + 1 && getComputedStyle(el).position !== "fixed") {
          // ignora filhos de quem já transborda (reporta só a raiz)
          if (offenders.some((o) => el.parentElement?.matches(o))) continue;
          const id = el.id ? `#${el.id}` : "";
          const cls = typeof el.className === "string" ? "." + el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
          offenders.push(`${el.tagName.toLowerCase()}${id}${cls}`.replace(/[[\]():/%!]/g, "\\$&"));
          if (offenders.length > 8) break;
        }
      }
    }
    return { vw, scroll, overflow: scroll > vw + 1, offenders };
  });
}
