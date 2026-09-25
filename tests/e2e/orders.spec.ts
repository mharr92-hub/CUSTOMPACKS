import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin, PNG_1PX, makePdf } from "./helpers";

async function next(page: Page) {
  await page.getByRole("button", { name: /^Continuar/ }).click();
}

async function pickCard(page: Page, name: string | RegExp) {
  const pattern = typeof name === "string" ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) : name;
  await page.locator("label", { has: page.getByRole("radio", { name: pattern }) }).first().click();
}

async function toggleChip(page: Page, name: string) {
  await page.locator("label", { has: page.getByRole("checkbox", { name: new RegExp(`^${name}`) }) }).first().click();
}

async function recordMilestone(admin: Page, label: string, fill?: () => Promise<void>) {
  const form = admin.getByTestId("milestone-form");
  await form.getByLabel("Hito").selectOption({ label });
  if (fill) await fill();
  await form.getByRole("button", { name: "Registrar" }).click();
}

test.describe("E8 · Pedidos", () => {
  test.skip(({ isMobile }) => isMobile, "El panel se prueba en escritorio.");

  test("pedido completo (alimentos) de anticipo a cerrado con hitos, fotos y saldo; el cliente ve la foto de QA en menos de un minuto", async ({ page, browser }) => {
    test.setTimeout(240_000);
    // Segmento alimentos, sin impresión (no necesita proof), hasta la cotización
    // aceptada. El recorrido completo (journey) cubre comercio con impresión.
    await page.goto("/cotizar");
    await pickCard(page, "Restaurante o alimentos");
    await page.getByLabel("Producto", { exact: true }).fill("Hamburguesas para llevar");
    await page.getByLabel("Peso aproximado por unidad").fill("350");
    await toggleChip(page, "Caliente");
    await toggleChip(page, "Grasa");
    await next(page);
    await pickCard(page, "Clamshell para hamburguesa");
    await next(page);
    await pickCard(page, "Tamaño estándar");
    await pickCard(page, /^S3: 13 × 13 × 8 cm$/);
    await next(page);
    await pickCard(page, "Papel antigrasa o con barrera");
    await pickCard(page, "Ligero");
    await toggleChip(page, "Resistente a grasa");
    await next(page);
    await pickCard(page, "Sin impresión");
    await next(page);
    await page.locator("#items\\.0\\.quantities\\.0").fill("2000");
    await page.locator("#items\\.0\\.frequency").selectOption("once");
    await next(page);
    await page.getByRole("button", { name: "Agregar enlace" }).click();
    await page.getByLabel("Enlaces 1").fill("https://example.com/hamburguesas");
    await next(page);
    await page.getByLabel("Tu nombre").fill("Marta Quintero");
    await page.getByLabel("Correo").fill("marta@example.com");
    await page.getByLabel("Ciudad").fill("Panamá");
    await page.getByLabel("Dirección de entrega").fill("Obarrio, calle 50");
    await page.getByRole("checkbox", { name: /Acepto que/ }).check();
    await next(page);
    await page.getByRole("button", { name: /Enviar solicitud/ }).click();
    await page.getByTestId("request-number").waitFor({ timeout: 20_000 });
    await page.getByRole("link", { name: "Seguir mi solicitud" }).click();
    await page.waitForURL(/\/seguimiento\//);
    const trackingUrl = new URL(page.url()).pathname;
    const requestId = ((await page.getByRole("link", { name: "Ficha técnica (PDF)" }).getAttribute("href")) ?? "").match(/ficha\/([0-9a-f-]{36})/)?.[1] ?? "";

    const ctx = await browser.newContext();
    const admin = await ctx.newPage();
    await loginAsAdmin(admin, `/admin/solicitudes/${requestId}`);
    await admin.getByTestId("status-select").selectOption({ label: "En revisión" });
    await admin.getByRole("button", { name: "Aplicar" }).click();
    await expect(admin.getByTestId("admin-request-status")).toHaveText("En revisión");
    await admin.getByRole("button", { name: "Generar RFQ" }).click();
    const rfq = admin.getByTestId("rfq").first();
    await expect(rfq).toContainText(/RFQ S-\d{4}-\d{5}-v1/);
    await rfq.getByRole("button", { name: "Enviar a fábrica" }).click();
    await expect(admin.getByTestId("admin-request-status")).toHaveText("RFQ enviado");
    await admin.getByTestId("rfq-cost").first().fill("0,30");
    await admin.getByRole("button", { name: "Guardar respuesta" }).click();
    await expect(admin.getByTestId("rfq").first()).toContainText("Respuesta registrada");
    await admin.getByRole("button", { name: "Preparar cotización" }).click();
    await admin.getByTestId("quote-editor").getByRole("button", { name: "Emitir y enviar al cliente" }).click();
    await expect(admin.getByTestId("quote-status").first()).toHaveText("Enviada");

    await page.goto(trackingUrl);
    await page.getByTestId("client-quote").getByRole("button", { name: "Aceptar cotización" }).click();
    await expect(page.getByTestId("client-quote").getByTestId("quote-accepted")).toBeVisible();

    // Equipo: el pedido ya existe; registra el anticipo.
    await admin.reload();
    await admin.getByTestId("request-order-link").click();
    await admin.waitForURL(/\/admin\/pedidos\/[0-9a-f-]{36}$/);
    await expect(admin.getByTestId("order-number")).toHaveText(/^P-\d{4}-\d{5}$/);
    await expect(admin.getByTestId("order-status")).toHaveText("Esperando anticipo");
    await expect(admin.getByTestId("order-estimated")).toHaveText("por confirmar");
    const payments = admin.getByTestId("payments-panel");
    await payments.getByLabel("Método").last().fill("ACH");
    await payments.getByRole("button", { name: "Registrar pago" }).click();
    await expect(admin.getByTestId("order-status")).toHaveText("Anticipo recibido");
    await expect(admin.getByTestId("order-estimated")).not.toHaveText("por confirmar");

    // Hitos: producción y QA con checklist.
    await recordMilestone(admin, "Producción iniciada");
    await expect(admin.getByTestId("order-status")).toHaveText("En producción");
    await recordMilestone(admin, "QA en planta", async () => {
      const checklist = admin.getByTestId("qa-checklist");
      const radios = checklist.getByRole("radio", { name: "Correcto" });
      for (let i = 0; i < (await radios.count()); i++) await radios.nth(i).check();
    });
    await expect(admin.getByTestId("order-status")).toHaveText("QA en planta");

    // Foto de QA: el cliente la ve con su enlace en menos de un minuto.
    const qaMilestone = admin.getByTestId("milestone-qa_completed");
    await qaMilestone.getByText("Subir fotos, video o PDF").click();
    await qaMilestone.getByLabel("Evidencias").setInputFiles({ name: "qa-planta.png", mimeType: "image/png", buffer: PNG_1PX });
    await expect(qaMilestone.getByTestId("evidence-list").getByRole("img")).toBeVisible({ timeout: 20_000 });
    const uploadedAt = Date.now();
    await page.goto(trackingUrl);
    const clientQa = page.getByTestId("client-milestone-qa_completed");
    await expect(clientQa.getByRole("img", { name: /Evidencia de QA en planta/ })).toBeVisible({ timeout: 60_000 });
    expect(Date.now() - uploadedAt).toBeLessThan(60_000);
    const photoSrc = (await clientQa.getByRole("img").getAttribute("src")) ?? "";
    const photo = await page.request.get(photoSrc);
    expect(photo.status()).toBe(200);
    // Con la cotización aceptada, el portal muestra los montos y la leyenda de impuesto (D-101, D-102).
    await expect(page.getByTestId("client-order-total")).toContainText(/USD\s[\d,]+\.\d{2}/);
    await expect(page.getByTestId("client-order-total")).toContainText("más ITBMS 7 %");
    await expect(page.getByTestId("client-payment-deposit")).toContainText(/USD\s[\d,]+\.\d{2}/);
    await expect(page.getByTestId("client-payment-deposit")).toContainText("Confirmado");
    await expect(page.getByTestId("client-payment-list")).toContainText("Confirmado");

    // Embarque, entrega; el cliente sube el comprobante del saldo y el equipo lo confirma.
    await recordMilestone(admin, "Embarcado", async () => {
      await admin.getByTestId("milestone-form").getByLabel("Guía o número de rastreo").fill("MSKU7654321");
    });
    await expect(admin.getByTestId("order-status")).toHaveText("Embarcado");
    await recordMilestone(admin, "Entregado");
    await expect(admin.getByTestId("order-status")).toHaveText("Entregado");

    await page.reload();
    await expect(page.getByTestId("client-order")).toContainText("Rastreo: MSKU7654321");
    await page.getByLabel("Subir comprobante de pago").setInputFiles({ name: "transferencia.pdf", mimeType: "application/pdf", buffer: makePdf() });
    await expect(page.getByText("Recibimos tu comprobante.")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("client-payment-balance")).toContainText("Comprobante en revisión");

    await admin.reload();
    const review = admin.getByTestId("review-receipt");
    await review.getByRole("button", { name: "Confirmar" }).click();
    await expect(admin.getByTestId("payment-confirmed")).toHaveCount(2);
    await recordMilestone(admin, "Pedido cerrado");
    await expect(admin.getByTestId("order-status")).toHaveText("Cerrado");
    await expect(admin.getByTestId("order-timeline").locator("[data-testid^=milestone-]")).toHaveCount(7);

    // Cliente: cerrado, estado de pagos en PDF y encuesta.
    await page.reload();
    await expect(page.getByTestId("client-order").getByTestId("order-status")).toHaveText("Cerrado");
    await expect(page.getByTestId("client-payment-balance")).toContainText("Confirmado");
    const statement = await page.request.get((await page.getByTestId("statement-link").getAttribute("href")) ?? "");
    expect(statement.status()).toBe(200);
    expect(statement.headers()["content-type"]).toBe("application/pdf");
    const survey = page.getByTestId("survey-form");
    await survey.locator("label", { hasText: /^9$/ }).click();
    await survey.getByRole("button", { name: "Enviar" }).click();
    await expect(page.getByTestId("survey-thanks")).toBeVisible();
    await ctx.close();
  });
});
