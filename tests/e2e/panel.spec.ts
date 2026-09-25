import { expect, test, type Page } from "@playwright/test";
import { loginAsStaff } from "./helpers";

async function next(page: Page) {
  await page.getByRole("button", { name: /^Continuar/ }).click();
}

async function pickCard(page: Page, name: string) {
  await page.locator("label", { has: page.getByRole("radio", { name: new RegExp(`^${name}`) }) }).first().click();
}

/** Solicitud rápida desde el cotizador; devuelve número, id y enlace de seguimiento. */
async function submitQuickRequest(page: Page, product: string) {
  await page.goto("/cotizar");
  await pickCard(page, "Comercio");
  await page.getByLabel("Producto", { exact: true }).fill(product);
  await next(page);
  await pickCard(page, "No sé, sugiéranme");
  await next(page);
  await page.locator("#items\\.0\\.quantities\\.0").fill("1500");
  await page.locator("#items\\.0\\.frequency").selectOption("monthly");
  await next(page);
  await next(page);
  await page.getByLabel("Tu nombre").fill("Tomás Aguilar");
  await page.getByLabel("Correo").fill("tomas@example.com");
  await page.getByLabel("Ciudad").fill("Colón");
  await page.getByLabel("Dirección de entrega").fill("Zona Libre, galera 4");
  await page.getByRole("checkbox", { name: /Acepto que/ }).check();
  await next(page);
  await page.getByRole("button", { name: /Enviar solicitud/ }).click();
  const number = ((await page.getByTestId("request-number").textContent({ timeout: 20_000 })) ?? "").trim();
  await page.getByRole("link", { name: "Seguir mi solicitud" }).click();
  await page.waitForURL(/\/seguimiento\//);
  const trackingUrl = new URL(page.url()).pathname;
  const href = (await page.getByRole("link", { name: "Ficha técnica (PDF)" }).getAttribute("href")) ?? "";
  return { number, trackingUrl, requestId: href.match(/ficha\/([0-9a-f-]{36})/)?.[1] ?? "" };
}

test.describe("E6 · panel interno", () => {
  test.skip(({ isMobile }) => isMobile, "El panel se prueba en escritorio (PRD §15).");

  test("un vendedor toma la solicitud, pide datos, recibe la respuesta y la pasa a RFQ enviado sin salir del panel", async ({ page, browser }) => {
    const request = await submitQuickRequest(page, "Mermeladas artesanales");

    const salesCtx = await browser.newContext();
    const sales = await salesCtx.newPage();
    await loginAsStaff(sales, "ventas.e6@provenpack.test", "sales", `/admin/solicitudes?q=${request.number}`);
    const row = sales.getByTestId("inbox-row").filter({ hasText: request.number });
    await expect(row).toBeVisible();
    await row.getByRole("button", { name: "Tomar" }).click();
    await expect(row).toContainText("ventas.e6@provenpack.test");
    await row.getByRole("link", { name: request.number }).click();
    await expect(sales.getByTestId("assigned-name")).toHaveText("ventas.e6@provenpack.test");

    // Pedir datos faltantes: la lista viene del semáforo y se ajusta.
    const list = sales.getByTestId("missing-list");
    await expect(list).toHaveValue(/el tipo de empaque/);
    await list.fill("el peso por unidad y una foto de tu producto");
    await expect(sales.getByText("nos falta: el peso por unidad y una foto de tu producto")).toBeVisible();
    await sales.getByRole("button", { name: "Pedir datos al cliente" }).click();
    await expect(sales.getByTestId("admin-request-status")).toHaveText("Datos pendientes");
    await expect(sales.getByTestId("notifications")).toContainText("Datos faltantes");

    // El cliente responde desde su enlace.
    await page.goto(request.trackingUrl);
    const box = page.getByTestId("pending-reply");
    await expect(box).toContainText("el peso por unidad y una foto de tu producto");
    await box.getByLabel("Tu respuesta").fill("Cada frasco pesa 250 g. La foto la subo en la sección de arte.");
    await box.getByRole("button", { name: "Enviar respuesta" }).click();
    await expect(box).toContainText("Recibimos tu respuesta");

    // El vendedor ve la respuesta y avanza.
    await sales.reload();
    await expect(sales.getByTestId("timeline")).toContainText("Cada frasco pesa 250 g.");
    await sales.getByTestId("status-select").selectOption({ label: "En revisión" });
    await sales.getByRole("button", { name: "Aplicar" }).click();
    await expect(sales.getByTestId("admin-request-status")).toHaveText("En revisión");
    await sales.getByTestId("status-select").selectOption({ label: "RFQ enviado" });
    await sales.getByRole("button", { name: "Aplicar" }).click();
    await expect(sales.getByTestId("admin-request-status")).toHaveText("RFQ enviado");
    await sales.getByLabel("Texto").fill("Llamé a Tomás: prefiere entrega los viernes.");
    await sales.getByLabel("Tipo").selectOption({ label: "Llamada" });
    await sales.getByRole("button", { name: "Guardar" }).click();
    await expect(sales.getByTestId("timeline")).toContainText("Contacto por Llamada");
    await salesCtx.close();
  });

  test("el viewer ve todo y no puede editar nada", async ({ page, browser }) => {
    const request = await submitQuickRequest(page, "Velas de soya");
    const ctx = await browser.newContext();
    const viewer = await ctx.newPage();
    await loginAsStaff(viewer, "lectura.e6@provenpack.test", "viewer", `/admin/solicitudes?q=${request.number}`);
    const row = viewer.getByTestId("inbox-row").filter({ hasText: request.number });
    await expect(row).toBeVisible();
    await expect(row.getByRole("button")).toHaveCount(0);
    await row.getByRole("link", { name: request.number }).click();
    await expect(viewer.getByText("Tienes acceso de solo lectura.")).toBeVisible();
    for (const name of ["Tomarla yo", "Aplicar", "Pedir datos al cliente", "Guardar", "Siguiente en turno"]) {
      await expect(viewer.getByRole("button", { name })).toHaveCount(0);
    }
    await expect(viewer.getByRole("link", { name: "Usuarios" })).toHaveCount(0);
    await viewer.goto("/admin/usuarios");
    await expect(viewer).toHaveURL(/\/admin\/sin-acceso/);
    await ctx.close();
  });
});
