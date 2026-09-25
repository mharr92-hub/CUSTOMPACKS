import path from "node:path";
import { devices, expect, test, type Locator, type Page } from "@playwright/test";
import { loginAsAdmin, makePdf, PNG_1PX } from "./helpers";

/*
 * E9 · Recorrido completo cliente + equipo con una pieza impresa:
 * solicitud con arte (celular) → revisión y proof → aprobación del cliente →
 * RFQ → cotización → aceptación → pedido con anticipo por comprobante →
 * producción, QA con foto, embarque y entrega → saldo → cerrado → encuesta,
 * y el pedido se ve en los reportes con su CSV.
 */
async function next(page: Page) {
  await page.getByRole("button", { name: /^Continuar/ }).click();
}

async function pickCard(page: Page, name: string | RegExp) {
  const pattern = typeof name === "string" ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) : name;
  await page.locator("label", { has: page.getByRole("radio", { name: pattern }) }).first().click();
}

/**
 * Capturas para docs/manual-equipo.md: solo con MANUAL_SHOTS_DIR definido
 * (`MANUAL_SHOTS_DIR=docs/manual pnpm test:e2e tests/e2e/journey.spec.ts`).
 */
async function shot(target: Page | Locator, name: string) {
  const dir = process.env.MANUAL_SHOTS_DIR;
  if (!dir) return;
  // Sin el indicador de desarrollo de Next.js en las capturas.
  const page = "page" in target && typeof target.page === "function" ? target.page() : (target as Page);
  await page.evaluate(() => document.querySelectorAll("nextjs-portal").forEach((el) => el.remove()));
  await target.screenshot({ path: path.resolve(dir, `${name}.png`) });
}

async function recordMilestone(admin: Page, label: string, fill?: () => Promise<void>) {
  const form = admin.getByTestId("milestone-form");
  await form.getByLabel("Hito").selectOption({ label });
  if (fill) await fill();
  await form.getByRole("button", { name: "Registrar" }).click();
}

test.describe("E9 · recorrido completo", () => {
  test.skip(({ isMobile }) => isMobile, "El cliente usa un contexto de celular dentro de la prueba de escritorio.");

  test("cliente en celular y equipo en escritorio: de la solicitud impresa al pedido cerrado y los reportes", async ({ browser }) => {
    test.setTimeout(300_000);
    const clientContext = await browser.newContext({ ...devices["Pixel 7"], locale: "es-PA", timezoneId: "America/Panama" });
    const client = await clientContext.newPage();
    const staffContext = await browser.newContext({ locale: "es-PA", timezoneId: "America/Panama" });
    const admin = await staffContext.newPage();

    // 1. Cliente: solicitud con impresión y arte, desde el celular.
    await client.goto("/cotizar?tipo=CJ-06");
    await pickCard(client, "Comercio");
    await client.getByLabel("Producto", { exact: true }).fill("Cajas para café de altura");
    await client.getByLabel("Peso aproximado por unidad").fill("340");
    await client.getByLabel("Largo", { exact: true }).fill("14");
    await client.getByLabel("Ancho", { exact: true }).fill("9");
    await client.getByLabel("Alto", { exact: true }).fill("6");
    await next(client);
    await next(client);
    await pickCard(client, "Tamaño estándar");
    await client.locator("label", { has: client.getByRole("radio", { name: /^S\d/ }) }).first().click();
    await next(client);
    await pickCard(client, "Cartón microcorrugado (flauta E o B)");
    await pickCard(client, "Medio");
    await next(client);
    await pickCard(client, "2 tintas");
    await pickCard(client, "Por fuera");
    await pickCard(client, "Solo logo");
    await next(client);
    await client.locator("#items\\.0\\.quantities\\.0").fill("5000");
    await client.locator("#items\\.0\\.frequency").selectOption("monthly");
    await next(client);
    await pickCard(client, "Tengo el arte");
    await client.getByLabel("Archivos de arte").setInputFiles({ name: "logo-cafe.pdf", mimeType: "application/pdf", buffer: makePdf() });
    await expect(client.getByRole("list", { name: "Archivos subidos" }).getByRole("listitem").filter({ hasText: "logo-cafe.pdf" })).toBeVisible();
    // La vista previa (pdf.js) dibuja la primera página.
    await expect(client.getByRole("img", { name: "Vista previa de logo-cafe.pdf" })).toBeVisible({ timeout: 20_000 });
    await next(client);
    await client.getByLabel("Tu nombre").fill("Lucía Batista");
    await client.getByLabel("Correo").fill("lucia@example.com");
    await client.getByLabel("Ciudad").fill("Boquete");
    await client.getByLabel("Dirección de entrega").fill("Alto Boquete, finca 3");
    await client.getByRole("checkbox", { name: /Acepto que/ }).check();
    await next(client);
    await client.getByRole("button", { name: /Enviar solicitud/ }).click();
    await client.getByTestId("request-number").waitFor({ timeout: 20_000 });
    await client.getByRole("link", { name: "Seguir mi solicitud" }).click();
    await client.waitForURL(/\/seguimiento\//);
    const trackingUrl = new URL(client.url()).pathname;
    const requestId = ((await client.getByRole("link", { name: "Ficha técnica (PDF)" }).getAttribute("href")) ?? "").match(/ficha\/([0-9a-f-]{36})/)?.[1] ?? "";
    expect(requestId).not.toBe("");

    // 2. Equipo: revisión del arte con checklist y proof.
    if (process.env.MANUAL_SHOTS_DIR) {
      await admin.goto("/admin/ingresar");
      await shot(admin, "01-ingreso");
    }
    await loginAsAdmin(admin, `/admin/solicitudes/${requestId}`);
    if (process.env.MANUAL_SHOTS_DIR) {
      await admin.goto("/admin/solicitudes");
      await shot(admin, "02-bandeja");
      await admin.goto(`/admin/solicitudes/${requestId}`);
    }
    await shot(admin, "03-solicitud");
    await admin.getByTestId("status-select").selectOption({ label: "En revisión" });
    await admin.getByRole("button", { name: "Aplicar" }).click();
    await expect(admin.getByTestId("admin-request-status")).toHaveText("En revisión");
    const art = admin.getByTestId("staff-artwork").first();
    await art.getByRole("button", { name: "Pasar a revisión" }).click();
    await expect(art.getByTestId("artwork-status")).toHaveText("En revisión");
    for (const point of ["Formato", "Sobre el troquel", "Color (CMYK o Pantone)", "Resolución (300 dpi)", "Sangrado y área segura", "Tipografías en curvas", "Troquel en capa aparte", "Nombre del archivo"]) {
      await art.getByRole("radiogroup", { name: point }).getByText("Correcto").click();
    }
    await shot(art, "04-arte-checklist");
    await art.getByRole("button", { name: "Aprobar para proof" }).click();
    await expect(art.getByTestId("artwork-status")).toHaveText("Aprobado para proof");
    await admin.getByLabel("Subir proof").setInputFiles({ name: "proof-cafe.pdf", mimeType: "application/pdf", buffer: makePdf() });
    await expect(admin.getByTestId("staff-proof").getByTestId("artwork-status")).toHaveText("Proof enviado", { timeout: 20_000 });

    // 3. Cliente: aprueba el proof desde el celular.
    await client.goto(trackingUrl);
    const proof = client.getByTestId("proof-card");
    await proof.getByLabel("Tu nombre completo").fill("Lucía Batista");
    await proof.getByRole("button", { name: "Aprobar proof" }).click();
    await expect(proof.getByTestId("proof-approved")).toContainText("por Lucía Batista");
    await shot(proof, "05-cliente-proof");

    // 4. Equipo: libera a fábrica, RFQ, costo y cotización.
    await admin.reload();
    await admin.getByRole("button", { name: "Liberar a fábrica" }).click();
    await expect(admin.getByTestId("staff-proof").getByTestId("artwork-status")).toHaveText("Liberado a fábrica");
    await admin.getByRole("button", { name: "Generar RFQ" }).click();
    const rfq = admin.getByTestId("rfq").first();
    await expect(rfq).toContainText(/RFQ S-\d{4}-\d{5}-v1/);
    await rfq.getByRole("button", { name: "Enviar a fábrica" }).click();
    await expect(admin.getByTestId("admin-request-status")).toHaveText("RFQ enviado");
    await admin.getByTestId("rfq-cost").first().fill("0,38");
    await admin.getByRole("button", { name: "Guardar respuesta" }).click();
    await expect(admin.getByTestId("rfq").first()).toContainText("Respuesta registrada");
    await shot(admin.getByTestId("rfq-panel"), "06-rfq");
    await admin.getByRole("button", { name: "Preparar cotización" }).click();
    await expect(admin.getByTestId("quote-editor")).toBeVisible();
    await shot(admin.getByTestId("quote-editor"), "07-cotizacion");
    await admin.getByTestId("quote-editor").getByRole("button", { name: "Emitir y enviar al cliente" }).click();
    await expect(admin.getByTestId("admin-request-status")).toHaveText("Cotizada");

    // 5. Cliente: acepta y paga el anticipo subiendo el comprobante.
    await client.goto(trackingUrl);
    await shot(client.getByTestId("client-quote"), "08-cliente-cotizacion");
    await client.getByTestId("client-quote").getByRole("button", { name: "Aceptar cotización" }).click();
    await expect(client.getByTestId("client-quote").getByTestId("quote-accepted")).toBeVisible();
    const order = client.getByTestId("client-order");
    await expect(order.getByTestId("order-status")).toHaveText("Esperando anticipo");
    await expect(order.getByTestId("client-milestone-artwork_approved")).toBeVisible();
    await client.getByLabel("Subir comprobante de pago").setInputFiles({ name: "anticipo.pdf", mimeType: "application/pdf", buffer: makePdf() });
    await expect(client.getByText("Recibimos tu comprobante.")).toBeVisible({ timeout: 20_000 });
    await expect(client.getByTestId("client-payment-deposit")).toContainText("Comprobante en revisión");
    await expect(client.locator("body")).not.toContainText("$");

    // 6. Equipo: confirma el anticipo y lleva el pedido por sus hitos.
    await admin.reload();
    await admin.getByTestId("request-order-link").click();
    await admin.waitForURL(/\/admin\/pedidos\/[0-9a-f-]{36}$/);
    await shot(admin.getByTestId("payments-panel"), "09-pedido-comprobante");
    await admin.getByTestId("review-receipt").getByRole("button", { name: "Confirmar" }).click();
    await expect(admin.getByTestId("order-status")).toHaveText("Anticipo recibido");
    await expect(admin.getByTestId("order-estimated")).not.toHaveText("por confirmar");
    await recordMilestone(admin, "Producción iniciada");
    await expect(admin.getByTestId("order-status")).toHaveText("En producción");
    await recordMilestone(admin, "QA en planta", async () => {
      const radios = admin.getByTestId("qa-checklist").getByRole("radio", { name: "Correcto" });
      for (let i = 0; i < (await radios.count()); i++) await radios.nth(i).check();
      await shot(admin.getByTestId("milestone-form"), "10-qa-checklist");
    });
    await expect(admin.getByTestId("order-status")).toHaveText("QA en planta");
    const qa = admin.getByTestId("milestone-qa_completed");
    await qa.getByText("Subir fotos, video o PDF").click();
    await qa.getByLabel("Evidencias").setInputFiles({ name: "qa-cafe.png", mimeType: "image/png", buffer: PNG_1PX });
    await expect(qa.getByTestId("evidence-list").getByRole("img")).toBeVisible({ timeout: 20_000 });
    await shot(admin.getByTestId("order-timeline"), "11-linea-de-tiempo");
    await recordMilestone(admin, "Embarcado", async () => {
      await admin.getByTestId("milestone-form").getByLabel("Transporte").fill("Terrestre Panamá–Chiriquí");
      await admin.getByTestId("milestone-form").getByLabel("Guía o número de rastreo").fill("CHQ-2026-0042");
    });
    await expect(admin.getByTestId("order-status")).toHaveText("Embarcado");
    await recordMilestone(admin, "Entregado");
    await expect(admin.getByTestId("order-status")).toHaveText("Entregado");

    // 7. Cliente: ve la foto de QA y paga el saldo.
    await client.reload();
    await expect(client.getByTestId("client-milestone-qa_completed").getByRole("img")).toBeVisible();
    await shot(client, "12-cliente-pedido");
    await expect(order).toContainText("Rastreo: CHQ-2026-0042");
    await client.getByLabel("Subir comprobante de pago").setInputFiles({ name: "saldo.pdf", mimeType: "application/pdf", buffer: makePdf() });
    await expect(client.getByText("Recibimos tu comprobante.")).toBeVisible({ timeout: 20_000 });

    // 8. Equipo: confirma el saldo y cierra.
    await admin.reload();
    await admin.getByTestId("review-receipt").getByRole("button", { name: "Confirmar" }).click();
    await expect(admin.getByTestId("payment-confirmed")).toHaveCount(2);
    await recordMilestone(admin, "Pedido cerrado");
    await expect(admin.getByTestId("order-status")).toHaveText("Cerrado");
    const orderNumber = (await admin.getByTestId("order-number").textContent()) ?? "";

    // 9. Cliente: encuesta y estado de pagos.
    await client.reload();
    await expect(order.getByTestId("order-status")).toHaveText("Cerrado");
    const statement = await client.request.get((await client.getByTestId("statement-link").getAttribute("href")) ?? "");
    expect(statement.headers()["content-type"]).toBe("application/pdf");
    await client.getByTestId("survey-form").locator("label", { hasText: /^10$/ }).click();
    await client.getByTestId("survey-form").getByRole("button", { name: "Enviar" }).click();
    await expect(client.getByTestId("survey-thanks")).toBeVisible();

    // 10. Equipo: el pedido aparece en la lista y la solicitud en los reportes; el CSV baja listo.
    await admin.goto("/admin/pedidos");
    await expect(admin.getByTestId("orders")).toContainText(orderNumber);
    await shot(admin, "13-pedidos");
    await admin.goto("/admin/reportes");
    await shot(admin, "14-reportes");
    const pipeline = admin.getByTestId("report-pipeline");
    await expect(pipeline.getByRole("row", { name: /Aceptada/ })).not.toContainText(/Aceptada\s*0$/);
    const csvHref = (await pipeline.getByRole("link", { name: "Descargar CSV" }).getAttribute("href")) ?? "";
    const csv = await admin.request.get(csvHref);
    expect(csv.status()).toBe(200);
    expect(csv.headers()["content-type"]).toContain("text/csv");
    const text = (await csv.body()).toString("utf8");
    expect(text.startsWith("\uFEFFEstado,Solicitudes\r\n")).toBe(true);
    expect(text).toMatch(/\r\nAceptada,[1-9]\d*\r\n/);
    // Sin sesión, el CSV no se entrega.
    expect((await client.request.get(csvHref)).status()).toBe(401);

    // Otras pantallas del panel para el manual.
    if (process.env.MANUAL_SHOTS_DIR) {
      for (const [route, name] of [
        ["/admin/plantillas", "15-plantillas"],
        ["/admin/usuarios", "16-usuarios"],
        ["/admin/catalogo", "17-catalogo"],
        ["/admin/configuracion", "18-configuracion"],
        ["/admin/archivos", "19-archivos"],
      ] as const) {
        await admin.goto(route);
        await shot(admin, name);
      }
    }

    await clientContext.close();
    await staffContext.close();
  });
});
