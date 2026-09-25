import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./helpers";

async function next(page: Page) {
  await page.getByRole("button", { name: /^Continuar/ }).click();
}

async function pickCard(page: Page, name: string) {
  await page.locator("label", { has: page.getByRole("radio", { name: new RegExp(`^${name}`) }) }).first().click();
}

test.describe("E5 · notificaciones", () => {
  test.skip(({ isMobile }) => isMobile, "El panel se prueba en escritorio.");

  test("cada solicitud deja sus avisos en el panel; el WhatsApp se abre y se marca enviado", async ({ page, browser }) => {
    await page.goto("/cotizar");
    await pickCard(page, "Comercio");
    await page.getByLabel("Producto", { exact: true }).fill("Jabones artesanales");
    await next(page);
    await pickCard(page, "No sé, sugiéranme");
    await next(page);
    await page.locator("#items\\.0\\.quantities\\.0").fill("800");
    await page.locator("#items\\.0\\.frequency").selectOption("once");
    await next(page);
    await next(page);
    await page.getByLabel("Tu nombre").fill("Rosa Batista");
    await page.getByLabel("WhatsApp").fill("+507 6555-1234");
    await page.getByLabel("Correo").fill("rosa@example.com");
    await page.getByLabel("Ciudad").fill("Chitré");
    await page.getByLabel("Dirección de entrega").fill("Calle Aminta Burgos");
    await page.getByRole("checkbox", { name: /Acepto que/ }).check();
    await next(page);
    await page.getByRole("button", { name: /Enviar solicitud/ }).click();
    const number = (await page.getByTestId("request-number").textContent({ timeout: 20_000 }))?.trim() ?? "";
    await page.getByRole("link", { name: "Seguir mi solicitud" }).click();
    const href = (await page.getByRole("link", { name: "Ficha técnica (PDF)" }).getAttribute("href")) ?? "";
    const requestId = href.match(/ficha\/([0-9a-f-]{36})/)?.[1] ?? "";

    const ctx = await browser.newContext();
    const admin = await ctx.newPage();
    await loginAsAdmin(admin, `/admin/solicitudes/${requestId}`);
    const list = admin.getByTestId("notifications");
    await expect(list.getByTestId("notification")).toHaveCount(3);
    const email = list.getByTestId("notification").filter({ hasText: "rosa@example.com" });
    await expect(email).toContainText("Solicitud recibida");
    await expect(email.getByTestId("notification-status")).toHaveText("Simulado");
    await email.getByText("Ver texto").click();
    await expect(email).toContainText(`recibimos tu solicitud ${number}`);
    await expect(list.getByTestId("notification").filter({ hasText: "Nueva solicitud (equipo)" })).toBeVisible();

    const wa = list.getByTestId("notification").filter({ hasText: "+50765551234" });
    const waHref = (await wa.getByRole("link", { name: "Abrir WhatsApp" }).getAttribute("href")) ?? "";
    expect(waHref).toMatch(/^https:\/\/wa\.me\/50765551234\?text=/);
    expect(decodeURIComponent(waHref)).toContain(number);
    await wa.getByRole("button", { name: "Marcar enviado" }).click();
    await expect(wa.getByTestId("notification-status")).toHaveText("Enviado");
    await ctx.close();
  });

  test("admin edita una plantilla con vista previa y no acepta variables inexistentes", async ({ page }) => {
    await loginAsAdmin(page, "/admin/plantillas");
    await expect(page.getByRole("heading", { level: 1, name: "Plantillas de mensajes" })).toBeVisible();
    await page.getByRole("link", { name: "Recordatorio de vigencia" }).first().click();
    const body = page.getByLabel("Texto");
    await body.fill("{nombre}, tu cotización {numero_cotizacion} vence el {fecha}. Escríbenos si quieres ajustar algo {descuento}.");
    await expect(page.getByText("Estas variables no existen para este mensaje: descuento.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Guardar plantilla" })).toBeDisabled();
    await body.fill("{nombre}, tu cotización {numero_cotizacion} vence el {fecha}. ¿La aprobamos o ajustamos algo?");
    await expect(page.getByTestId("whatsapp-preview")).toHaveText("Ana, tu cotización C-2026-00034 vence el 15 oct 2026. ¿La aprobamos o ajustamos algo?");
    await page.getByRole("button", { name: "Guardar plantilla" }).click();
    await expect(page.getByText("Plantilla guardada.")).toBeVisible();
  });
});
