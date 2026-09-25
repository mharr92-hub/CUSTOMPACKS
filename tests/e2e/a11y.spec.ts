import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/*
 * Accesibilidad con axe (WCAG 2.1 A y AA) en las páginas públicas y en cada
 * paso del cotizador. Falla con cualquier problema crítico o serio. También
 * verifica que la política de contenido (CSP) no bloquee nada en esas páginas.
 */
const PUBLIC_PAGES = [
  "/",
  "/catalogo",
  "/catalogo/cajas",
  "/catalogo/cajas/plegadiza-con-tapa",
  "/galeria",
  "/como-funciona",
  "/clientes",
  "/sostenibilidad",
  "/nosotros",
  "/faq",
  "/contacto",
  "/legal/privacidad",
  "/legal/terminos",
];

type Finding = { page: string; id: string; impact: string; help: string; nodes: string[] };

async function audit(page: Page, label: string): Promise<Finding[]> {
  const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  return result.violations
    .filter((v) => v.impact === "critical" || v.impact === "serious")
    .map((v) => ({ page: label, id: v.id, impact: v.impact ?? "", help: v.help, nodes: v.nodes.slice(0, 3).map((n) => n.target.join(" ")) }));
}

function watchCsp(page: Page): string[] {
  const blocked: string[] = [];
  page.on("console", (msg) => {
    if (msg.type() === "error" && /Content Security Policy/i.test(msg.text())) blocked.push(msg.text());
  });
  return blocked;
}

async function next(page: Page) {
  await page.getByRole("button", { name: /^Continuar/ }).click();
}

async function pickCard(page: Page, name: string | RegExp) {
  const pattern = typeof name === "string" ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) : name;
  await page.locator("label", { has: page.getByRole("radio", { name: pattern }) }).first().click();
}

test.describe("E9 · accesibilidad y CSP", () => {
  test("páginas públicas sin problemas críticos ni serios de accesibilidad", async ({ page }) => {
    test.setTimeout(120_000);
    const blocked = watchCsp(page);
    const findings: Finding[] = [];
    for (const path of PUBLIC_PAGES) {
      const response = await page.goto(path);
      expect(response?.status(), path).toBe(200);
      findings.push(...(await audit(page, path)));
    }
    expect(findings).toEqual([]);
    expect(blocked).toEqual([]);
  });

  test("cada paso del cotizador, también con errores a la vista, sin problemas críticos ni serios", async ({ page }) => {
    test.setTimeout(120_000);
    const blocked = watchCsp(page);
    const findings: Finding[] = [];
    await page.goto("/cotizar?tipo=CJ-06");
    findings.push(...(await audit(page, "paso 1: segmento")));
    await pickCard(page, "Comercio");
    await expect(page.getByLabel("Producto", { exact: true })).toBeVisible();
    findings.push(...(await audit(page, "paso 2: producto")));
    await page.getByLabel("Producto", { exact: true }).fill("Tazas de cerámica");
    await next(page);
    findings.push(...(await audit(page, "paso 3: tipo")));
    await next(page);
    findings.push(...(await audit(page, "paso 4: tamaño")));
    await pickCard(page, "Tamaño estándar");
    await page.locator("label", { has: page.getByRole("radio", { name: /^S\d/ }) }).first().click();
    await next(page);
    findings.push(...(await audit(page, "paso 5: material")));
    await pickCard(page, "Cartón microcorrugado (flauta E o B)");
    await pickCard(page, "Medio");
    await next(page);
    findings.push(...(await audit(page, "paso 6: impresión")));
    await pickCard(page, "2 tintas");
    await pickCard(page, "Por fuera");
    await pickCard(page, "Solo logo");
    await next(page);
    findings.push(...(await audit(page, "paso 7: cantidades")));
    await page.locator("#items\\.0\\.quantities\\.0").fill("1000");
    await page.locator("#items\\.0\\.frequency").selectOption("once");
    await next(page);
    findings.push(...(await audit(page, "paso 8: arte")));
    await pickCard(page, "Aún no tengo arte");
    await next(page);
    findings.push(...(await audit(page, "paso 9: contacto")));
    await next(page);
    await expect(page.locator('[aria-invalid="true"]').first()).toBeVisible();
    findings.push(...(await audit(page, "paso 9: contacto (con errores)")));
    await page.getByLabel("Tu nombre").fill("Rosa Ibarra");
    await page.getByLabel("Correo").fill("rosa@example.com");
    await page.getByLabel("Ciudad").fill("Colón");
    await page.getByLabel("Dirección de entrega").fill("Zona Libre, galera 4");
    await page.getByRole("checkbox", { name: /Acepto que/ }).check();
    await next(page);
    await expect(page.getByRole("button", { name: /Enviar solicitud/ })).toBeVisible();
    findings.push(...(await audit(page, "resumen")));
    expect(findings).toEqual([]);
    expect(blocked).toEqual([]);
  });
});
