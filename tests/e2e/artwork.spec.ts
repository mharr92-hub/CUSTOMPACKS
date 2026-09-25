import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { e2eSql, loginAsAdmin, loginAsStaff, makePdf, PNG_1PX } from "./helpers";

test.describe.configure({ mode: "serial" });

async function next(page: Page) {
  await page.getByRole("button", { name: /^Continuar/ }).click();
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function pickCard(page: Page, name: string | RegExp) {
  const pattern = typeof name === "string" ? new RegExp(`^${escapeRegExp(name)}`) : name;
  await page.locator("label", { has: page.getByRole("radio", { name: pattern }) }).first().click();
}

/** Abre un archivo con "Ver" y devuelve la respuesta de la URL firmada que abrió la pestaña nueva. */
async function openFile(page: Page, scope: ReturnType<Page["locator"]>) {
  const [request] = await Promise.all([
    page.context().waitForEvent("request", (r) => r.url().includes("/api/storage/object?t=")),
    scope.getByRole("button", { name: "Ver" }).first().click(),
  ]);
  const response = await page.request.get(request.url());
  for (const other of page.context().pages()) if (other !== page) await other.close();
  return response;
}

test.describe("E4 · arte y proofs", () => {
  test.skip(({ isMobile }) => isMobile, "Se prueba en escritorio; la subida en móvil usa el mismo componente.");

  let trackingUrl = "";
  let requestId = "";
  const bigPdf = path.join(os.tmpdir(), `provenpack-80mb-${process.pid}.pdf`);

  test.beforeAll(() => {
    if (!fs.existsSync(bigPdf)) fs.writeFileSync(bigPdf, makePdf(80 * 1024 * 1024));
  });

  test.afterAll(() => {
    fs.rmSync(bigPdf, { force: true });
  });

  test("un archivo de 80 MB sube con barra de progreso desde el paso 7 y llega a la solicitud", async ({ page }) => {
    test.setTimeout(180_000);
    await page.goto("/cotizar?tipo=CJ-06");
    await pickCard(page, "Comercio");
    await page.getByLabel("Producto", { exact: true }).fill("Kits de regalo");
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

    await expect(page.getByRole("heading", { level: 1, name: "Arte y referencias" })).toBeVisible();
    await expect(page.getByText("Checklist para tu arte")).toBeVisible();
    await pickCard(page, "Tengo el arte");

    // Subida directa con progreso: se registran los valores que muestra la barra.
    await page.evaluate(() => {
      const seen: number[] = [];
      (window as unknown as { __progress: number[] }).__progress = seen;
      new MutationObserver(() => {
        document.querySelectorAll('[role="progressbar"][aria-label^="Progreso de"]').forEach((el) => seen.push(Number(el.getAttribute("aria-valuenow"))));
      }).observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ["aria-valuenow"] });
    });
    await page.getByLabel("Archivos de arte").setInputFiles(bigPdf);
    await expect(page.getByRole("list", { name: "Archivos subidos" }).getByRole("listitem").filter({ hasText: /provenpack-80mb/ })).toBeVisible({ timeout: 120_000 });
    const progress = await page.evaluate(() => (window as unknown as { __progress: number[] }).__progress);
    expect(progress.some((v) => v > 0 && v < 100), `valores de progreso: ${progress.slice(0, 20).join(",")}`).toBe(true);

    // Foto de referencia y un archivo que dice ser PDF pero no lo es.
    await page.getByLabel("Fotos de referencia").setInputFiles({ name: "vitrina.png", mimeType: "image/png", buffer: PNG_1PX });
    await expect(page.getByRole("list", { name: "Archivos subidos" }).getByRole("listitem").filter({ hasText: "vitrina.png" })).toBeVisible();
    await page.getByLabel("Archivos de arte").setInputFiles({ name: "falso.pdf", mimeType: "application/pdf", buffer: PNG_1PX });
    await expect(page.getByText("falso.pdf no es un archivo válido de ese formato")).toBeVisible();
    await next(page);

    await page.getByLabel("Tu nombre").fill("Marta Ríos");
    await page.getByLabel("Correo").fill("marta@example.com");
    await page.getByLabel("Ciudad").fill("Panamá");
    await page.getByLabel("Dirección de entrega").fill("Costa del Este");
    await page.getByRole("checkbox", { name: /Acepto que/ }).check();
    await next(page);
    await page.getByRole("button", { name: /Enviar solicitud/ }).click();
    await expect(page.getByTestId("request-number")).toHaveText(/^S-\d{4}-\d{5}$/, { timeout: 20_000 });
    await page.getByRole("link", { name: "Seguir mi solicitud" }).click();
    await page.waitForURL(/\/seguimiento\//);
    trackingUrl = new URL(page.url()).pathname;
    const pdfHref = (await page.getByRole("link", { name: "Ficha técnica (PDF)" }).getAttribute("href")) ?? "";
    requestId = pdfHref.match(/ficha\/([0-9a-f-]{36})/)?.[1] ?? "";
    expect(requestId).not.toBe("");

    const version = page.getByTestId("artwork-version").first();
    await expect(version).toContainText("Versión 1");
    await expect(version).toContainText("Recibido");
    const response = await openFile(page, version);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    expect(Number(response.headers()["content-length"])).toBeGreaterThan(80 * 1024 * 1024);
  });

  test("el equipo revisa con checklist y sube el proof; sin asignación no se abre", async ({ page, browser }) => {
    expect(requestId).not.toBe("");
    // Un vendedor sin asignación ve que hay arte pero no puede abrirlo ni revisarlo.
    const salesContext = await browser.newContext();
    const sales = await salesContext.newPage();
    await loginAsStaff(sales, "ventas.e4@provenpack.test", "sales", `/admin/solicitudes/${requestId}`);
    await expect(sales.getByText("Solo el equipo asignado a esta solicitud y admin pueden abrir y revisar sus archivos.")).toBeVisible();
    await expect(sales.getByTestId("staff-artwork")).toHaveCount(1);
    await expect(sales.getByRole("button", { name: "Ver" })).toHaveCount(0);

    // Admin revisa.
    await loginAsAdmin(page, `/admin/solicitudes/${requestId}`);
    const art = page.getByTestId("staff-artwork").first();
    await art.getByRole("button", { name: "Pasar a revisión" }).click();
    await expect(art.getByTestId("artwork-status")).toHaveText("En revisión");
    await art.getByRole("button", { name: "Aprobar para proof" }).click();
    await expect(art.getByText("Para aprobar, todos los puntos del checklist tienen que estar en Correcto o No aplica.")).toBeVisible();
    for (const point of ["Formato", "Sobre el troquel", "Color (CMYK o Pantone)", "Resolución (300 dpi)", "Sangrado y área segura", "Tipografías en curvas", "Troquel en capa aparte", "Nombre del archivo"]) {
      await art.getByRole("radiogroup", { name: point }).getByText("Correcto").click();
    }
    await art.getByRole("button", { name: "Aprobar para proof" }).click();
    await expect(art.getByTestId("artwork-status")).toHaveText("Aprobado para proof");
    await page.getByLabel("Subir proof").setInputFiles({ name: "proof-v1.pdf", mimeType: "application/pdf", buffer: makePdf() });
    await expect(page.getByTestId("staff-proof").getByTestId("artwork-status")).toHaveText("Proof enviado", { timeout: 20_000 });

    // Asignado: ahora el vendedor sí puede abrir.
    await e2eSql()`update public.quote_requests set assigned_to = (select id from auth.users where email = 'ventas.e4@provenpack.test') where id = ${requestId}`;
    await sales.reload();
    const opened = await openFile(sales, sales.getByTestId("staff-artwork").first());
    expect(opened.status()).toBe(200);
    await salesContext.close();
  });

  test("el cliente aprueba el proof y la aprobación queda con fecha, hora, nombre e IP", async ({ page, browser }) => {
    expect(trackingUrl).not.toBe("");
    await page.goto(trackingUrl);
    const proof = page.getByTestId("proof-card");
    await expect(proof).toContainText("Tu proof está listo");
    await proof.getByLabel("Tu nombre completo").fill("");
    await proof.getByRole("button", { name: "Aprobar proof" }).click();
    await expect(proof.getByText("Escribe tu nombre para registrar la aprobación.")).toBeVisible();
    await proof.getByLabel("Tu nombre completo").fill("Marta Ríos");
    await proof.getByRole("button", { name: "Aprobar proof" }).click();
    await expect(proof.getByTestId("proof-approved")).toContainText("por Marta Ríos");
    await expect(proof.getByRole("button", { name: "Aprobar proof" })).toHaveCount(0);

    const [row] = await e2eSql()<{ approved_at: Date; approved_by_name: string; ip: string | null; status: string; client_approved_at: Date }[]>`
      select a.approved_at, a.approved_by_name, a.ip, f.status, f.client_approved_at
        from public.artwork_approvals a join public.artwork_files f on f.id = a.artwork_file_id
       where a.request_id = ${requestId}`;
    expect(row?.approved_by_name).toBe("Marta Ríos");
    expect(row?.ip).toBeTruthy();
    expect(row?.status).toBe("proof_approved");
    expect(row?.client_approved_at.getTime()).toBe(row?.approved_at.getTime());
    await expect(e2eSql()`update public.artwork_approvals set approved_at = now() where request_id = ${requestId}`).rejects.toThrow(/inmutable/);

    // Admin ve la aprobación y libera a fábrica.
    const adminContext = await browser.newContext();
    const admin = await adminContext.newPage();
    await loginAsAdmin(admin, `/admin/solicitudes/${requestId}`);
    await expect(admin.getByTestId("staff-proof-approval")).toContainText("Aprobado por Marta Ríos");
    await admin.getByRole("button", { name: "Liberar a fábrica" }).click();
    await expect(admin.getByTestId("staff-proof").getByTestId("artwork-status")).toHaveText("Liberado a fábrica");
    await adminContext.close();
  });
});
