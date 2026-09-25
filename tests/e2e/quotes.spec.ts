import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin, makePdf } from "./helpers";

async function next(page: Page) {
  await page.getByRole("button", { name: /^Continuar/ }).click();
}

async function pickCard(page: Page, name: string | RegExp) {
  const pattern = typeof name === "string" ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) : name;
  await page.locator("label", { has: page.getByRole("radio", { name: pattern }) }).first().click();
}

test.describe("E7 · RFQ y cotización", () => {
  test.skip(({ isMobile }) => isMobile, "El panel se prueba en escritorio.");

  test("de una solicitud verde sale el RFQ sin retipear, se registra el costo, se emite la cotización y el cliente la acepta desde su enlace", async ({ page, browser }) => {
    test.setTimeout(150_000);
    // Solicitud completa (verde): tipo, cantidad, peso, medidas, arte y referencia.
    await page.goto("/cotizar?tipo=CJ-06");
    await pickCard(page, "Comercio");
    await page.getByLabel("Producto", { exact: true }).fill("Cajas para velas");
    await page.getByLabel("Peso aproximado por unidad").fill("400");
    await page.getByLabel("Largo", { exact: true }).fill("20");
    await page.getByLabel("Ancho", { exact: true }).fill("15");
    await page.getByLabel("Alto", { exact: true }).fill("10");
    await next(page);
    await next(page);
    await pickCard(page, "Tamaño estándar");
    await page.locator("label", { has: page.getByRole("radio", { name: /^S\d/ }) }).first().click();
    await next(page);
    await pickCard(page, "Cartón microcorrugado (flauta E o B)");
    await pickCard(page, "Medio");
    await next(page);
    await pickCard(page, "2 tintas");
    await pickCard(page, "Por fuera");
    await pickCard(page, "Solo logo");
    await next(page);
    await page.locator("#items\\.0\\.quantities\\.0").fill("3000");
    await page.locator("#items\\.0\\.frequency").selectOption("once");
    await next(page);
    await pickCard(page, "Tengo el arte");
    await page.getByLabel("Archivos de arte").setInputFiles({ name: "logo-velas.pdf", mimeType: "application/pdf", buffer: makePdf() });
    await expect(page.getByRole("list", { name: "Archivos subidos" }).getByRole("listitem").filter({ hasText: "logo-velas.pdf" })).toBeVisible();
    await page.getByRole("button", { name: "Agregar enlace" }).click();
    await page.getByLabel("Enlaces 1").fill("https://example.com/inspiracion");
    await next(page);
    await page.getByLabel("Tu nombre").fill("Elena Soto");
    await page.getByLabel("Correo").fill("elena@example.com");
    await page.getByLabel("Ciudad").fill("Panamá");
    await page.getByLabel("Dirección de entrega").fill("Costa del Este, torre 2");
    await page.getByRole("checkbox", { name: /Acepto que/ }).check();
    await next(page);
    await page.getByRole("button", { name: /Enviar solicitud/ }).click();
    await page.getByTestId("request-number").waitFor({ timeout: 20_000 });
    await page.getByRole("link", { name: "Seguir mi solicitud" }).click();
    await page.waitForURL(/\/seguimiento\//);
    const trackingUrl = new URL(page.url()).pathname;
    const requestId = ((await page.getByRole("link", { name: "Ficha técnica (PDF)" }).getAttribute("href")) ?? "").match(/ficha\/([0-9a-f-]{36})/)?.[1] ?? "";

    // Equipo: revisión, RFQ, respuesta de fábrica y cotización.
    const ctx = await browser.newContext();
    const admin = await ctx.newPage();
    await loginAsAdmin(admin, `/admin/solicitudes/${requestId}`);
    await expect(admin.getByText("Verde", { exact: true })).toBeVisible();
    await admin.getByTestId("status-select").selectOption({ label: "En revisión" });
    await admin.getByRole("button", { name: "Aplicar" }).click();
    await expect(admin.getByTestId("admin-request-status")).toHaveText("En revisión");
    await admin.getByRole("button", { name: "Generar RFQ" }).click();
    const rfq = admin.getByTestId("rfq").first();
    await expect(rfq).toContainText(/RFQ S-\d{4}-\d{5}-v1/);
    const [xlsxRequest] = await Promise.all([
      admin.context().waitForEvent("request", (r) => r.url().includes("/api/storage/object?t=")),
      rfq.getByRole("button", { name: "Excel" }).click(),
    ]);
    const xlsx = await admin.request.get(xlsxRequest.url());
    expect(xlsx.status()).toBe(200);
    expect((await xlsx.body()).subarray(0, 2).toString()).toBe("PK");
    for (const other of admin.context().pages()) if (other !== admin) await other.close();
    await rfq.getByRole("button", { name: "Enviar a fábrica" }).click();
    await expect(admin.getByTestId("admin-request-status")).toHaveText("RFQ enviado");
    await expect(rfq).toContainText("Enviado a fabrica@provenpack.test");
    await admin.getByTestId("rfq-cost").first().fill("0,45");
    await admin.getByRole("button", { name: "Guardar respuesta" }).click();
    await expect(admin.getByTestId("rfq").first()).toContainText("Respuesta registrada");

    await admin.getByRole("button", { name: "Preparar cotización" }).click();
    const editor = admin.getByTestId("quote-editor");
    await expect(editor).toBeVisible();
    // (0,45 + 90/3000) / (1 − 0,35) = 0,7385
    await editor.getByLabel(/^Flete total 1/).fill("90");
    await expect(editor.getByTestId("quote-unit-price")).toContainText("0.7385");
    await editor.getByRole("button", { name: "Emitir y enviar al cliente" }).click();
    await expect(admin.getByTestId("quote-status").first()).toHaveText("Enviada");
    await expect(admin.getByTestId("admin-request-status")).toHaveText("Cotizada");

    // Rechazar exige motivo de pérdida.
    await admin.getByTestId("status-select").selectOption({ label: "Rechazada" });
    await admin.getByRole("button", { name: "Aplicar" }).click();
    await expect(admin.getByText("Elige el motivo de pérdida.")).toBeVisible();
    await expect(admin.getByTestId("admin-request-status")).toHaveText("Cotizada");

    // Cliente: descarga el PDF (con precios) y acepta en pantalla sin ver precios.
    await page.goto(trackingUrl);
    const quote = page.getByTestId("client-quote");
    await expect(quote).toContainText(/Tu cotización C-\d{4}-\d{5}-v1 está lista/);
    const pdfHref = (await quote.getByRole("link", { name: "Descargar cotización (PDF)" }).getAttribute("href")) ?? "";
    const pdf = await page.request.get(pdfHref);
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
    await expect(page.locator("body")).not.toContainText("$");
    await expect(quote.getByRole("radio", { name: "3,000 unidades" })).toBeChecked();
    await quote.getByRole("button", { name: "Aceptar cotización" }).click();
    await expect(quote.getByTestId("quote-accepted")).toContainText("Aceptaste la cotización");

    await admin.reload();
    await expect(admin.getByTestId("admin-request-status")).toHaveText("Aceptada");
    await expect(admin.getByTestId("quote-status").first()).toHaveText("Aceptada");
    await expect(admin.getByTestId("notifications")).toContainText("Cotización aceptada (equipo)");
    await ctx.close();
  });
});
