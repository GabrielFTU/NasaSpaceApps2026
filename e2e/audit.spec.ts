import { test } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs";
import path from "node:path";
import { horizontalOverflow, isolate, ROUTES, settle, WIDTHS } from "./helpers";

/**
 * Varredura exploratória: cada rota em 9 larguras.
 * Gera test-results/audit/report.json + screenshots (não falha: serve de evidência para revisão humana).
 */
const OUT = path.resolve("test-results/audit");
const SHOT_WIDTHS = new Set([320, 390, 768, 1440]);

for (const r of ROUTES) {
  test(`auditoria ${r.name}`, async ({ page }) => {
    test.setTimeout(240_000);
    fs.mkdirSync(OUT, { recursive: true });
    const consoleErrors: string[] = [];
    page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text().slice(0, 240)));
    page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message.slice(0, 240)}`));
    await isolate(page);

    const result: Record<string, unknown> = { route: r.path, widths: {} as Record<number, unknown> };
    for (const w of WIDTHS) {
      await page.setViewportSize({ width: w, height: w < 768 ? 800 : 900 });
      await page.goto(r.path);
      await settle(page, 2500);
      const ov = await horizontalOverflow(page);
      (result.widths as Record<number, unknown>)[w] = ov;
      if (SHOT_WIDTHS.has(w)) await page.screenshot({ path: path.join(OUT, `${r.name}-${w}.png`), fullPage: true });
      if (w === 390 || w === 1440) {
        const axe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
        result[`axe${w}`] = axe.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          help: v.help,
          nodes: v.nodes.slice(0, 6).map((n) => `${n.target.join(" ")} :: ${n.failureSummary?.split("\n")[1]?.trim() ?? ""}`),
          count: v.nodes.length,
        }));
      }
    }
    result.consoleErrors = [...new Set(consoleErrors)];
    fs.writeFileSync(path.join(OUT, `${r.name}.json`), JSON.stringify(result, null, 2));
  });
}
