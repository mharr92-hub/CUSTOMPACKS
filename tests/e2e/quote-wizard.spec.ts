import { expect, test, type Page } from "@playwright/test";

/** Botón principal de la barra inferior del wizard. */
async function next(page: Page) {
  await page.getByRole("button", { name: /^Continuar/ }).click();
}

async function expectStep(page: Page, title: string) {
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  // Móvil primero: ningún paso puede generar scroll horizontal.
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow, `scroll horizontal en "${title}"`).toBeLessThanOrEqual(1);
}

/** Elige una opción (tarjeta o chip) por su nombre accesible. */
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function pickCard(page: Page, name: string | RegExp) {
  const pattern = typeof name === "string" ? new RegExp(`^${escapeRegExp(name)}`) : name;
  // Se hace clic en la tarjeta (el radio nativo está oculto visualmente y sigue siendo accesible).
  await page.locator("label", { has: page.getByRole("radio", { name: pattern }) }).first().click();
}

async function toggleChip(page: Page, name: string) {
  await page.locator("label", { has: page.getByRole("checkbox", { name: new RegExp(`^${escapeRegExp(name)}`) }) }).first().click();
}

test.describe("E3 · cotizador", () => {
  test("dos piezas (alimentaria y comercio) desde el celular, con número y confirmación en menos de 5 minutos", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Criterio de aceptación en móvil");
    const started = Date.now();
    await page.goto("/cotizar");

    // Paso 0 · segmento (avanza solo al elegir)
    await expectStep(page, "Segmento");
    await pickCard(page, "Restaurante o alimentos");

    // Paso 1 · producto
    await expectStep(page, "Qué vas a empacar");
    await page.getByLabel("Producto", { exact: true }).fill("Hamburguesas y papas");
    await page.getByLabel("Peso aproximado por unidad").fill("350");
    await toggleChip(page, "Caliente");
    await toggleChip(page, "Grasa");
    await next(page);

    // Pieza 1 · clamshell
    await expectStep(page, "Tipo de empaque");
    await pickCard(page, "Clamshell para hamburguesa");
    await next(page);
    await expectStep(page, "Tamaño");
    await pickCard(page, "Tamaño estándar");
    await pickCard(page, /^S3: 13 × 13 × 8 cm$/);
    await next(page);
    await expectStep(page, "Material");
    await expect(page.getByText("Sugerido por las condiciones de tu producto")).toBeVisible();
    await pickCard(page, "Papel antigrasa o con barrera");
    await expect(page.getByText("Sugerido por el peso de tu producto")).toBeVisible();
    await pickCard(page, "Ligero");
    await toggleChip(page, "Resistente a grasa");
    await next(page);
    await expectStep(page, "Impresión y acabados");
    await pickCard(page, "2 tintas");
    await pickCard(page, "Por fuera");
    await pickCard(page, "Solo logo");
    await page.getByRole("button", { name: "Agregar otra pieza" }).click();

    // Pieza 2 · bolsa kraft de tienda (tipo comercial que también sirve para alimentos)
    await expect(page.getByText("Pieza 2 de 2")).toBeVisible();
    await expectStep(page, "Tipo de empaque");
    await pickCard(page, "Bolsa kraft con asa plana");
    await next(page);
    await pickCard(page, "Según mi producto");
    await next(page);
    await pickCard(page, "Kraft (natural o blanco)");
    await pickCard(page, "Medio");
    await toggleChip(page, "Contacto directo con alimentos");
    await next(page);
    await pickCard(page, "Sin impresión");
    await next(page);

    // Paso 6 · cantidades
    await expectStep(page, "Cantidad y fecha");
    await page.locator("#items\\.0\\.quantities\\.0").fill("5.000");
    await page.locator("#items\\.0\\.quantities\\.1").fill("20000");
    await page.locator("#items\\.0\\.frequency").selectOption("monthly");
    await page.locator("#items\\.1\\.quantities\\.0").fill("3000");
    await page.locator("#items\\.1\\.frequency").selectOption("once");
    await expect(page.getByText("Plazo estimado: 45 días")).toBeVisible();
    await next(page);

    // Paso 7 · arte y referencias
    await expectStep(page, "Arte y referencias");
    await pickCard(page, "Aún no tengo arte");
    await page.locator("#items\\.0\\.samples").selectOption({ label: "M-006 · Clamshell para hamburguesa" });
    await page.getByRole("button", { name: "Agregar muestra" }).first().click();
    await next(page);

    // Paso 8 · contacto
    await expectStep(page, "Contacto y entrega");
    await page.getByLabel("Tu nombre").fill("Ana Pérez");
    await page.getByLabel("Empresa").fill("Burgers del Istmo");
    await page.getByLabel("WhatsApp").fill("+507 6123-4567");
    await page.getByLabel("Correo").fill("ana@example.com");
    await page.getByLabel("Ciudad").fill("Ciudad de Panamá");
    await page.getByLabel("Dirección de entrega").fill("Calle 50, local 3");
    await page.getByRole("checkbox", { name: /Acepto que/ }).check();
    await next(page);

    // Paso 9 · resumen y envío
    await expectStep(page, "Resumen");
    await expect(page.getByText("Clamshell para hamburguesa").first()).toBeVisible();
    await expect(page.getByText("5,000 / 20,000")).toBeVisible();
    await page.getByRole("button", { name: /Enviar solicitud/ }).click();

    await expect(page.getByRole("heading", { name: "Recibimos tu solicitud" })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("request-number")).toHaveText(/^S-\d{4}-\d{5}$/);
    // El token de seguimiento nunca va en la URL que ven GA4 y el Pixel (D-032).
    await expect(page).toHaveURL(/\/cotizar\/listo$/);
    expect(Date.now() - started).toBeLessThan(5 * 60 * 1000);

    // Seguimiento y ficha PDF
    await page.getByRole("link", { name: "Seguir mi solicitud" }).click();
    await expect(page.getByTestId("request-status")).toHaveText("Recibida");
    const pdfHref = await page.getByRole("link", { name: "Ficha técnica (PDF)" }).getAttribute("href");
    const pdf = await page.request.get(pdfHref ?? "");
    expect(pdf.status()).toBe(200);
    expect(pdf.headers()["content-type"]).toBe("application/pdf");
  });

  test("las combinaciones inválidas no se pueden elegir y se explica por qué", async ({ page, isMobile }) => {
    test.skip(isMobile, "Basta con escritorio");
    await page.goto("/cotizar?tipo=CJ-10");
    await pickCard(page, "Restaurante o alimentos");
    await expectStep(page, "Qué vas a empacar");
    await page.getByLabel("Producto", { exact: true }).fill("Pollo frito");
    await next(page);
    await expect(page.getByRole("radio", { name: /Balde para pollo/ })).toBeChecked();
    await next(page);
    await pickCard(page, "Según mi producto");
    await next(page);
    await expect(page.getByRole("radio", { name: /Kraft/ })).toBeDisabled();
    await expect(page.getByRole("radio", { name: /Cartulina plegadiza/ })).toBeDisabled();
    await expect(page.getByText("El balde para pollo exige papel antigrasa.").first()).toBeVisible();
    await expect(page.getByRole("radio", { name: /Papel antigrasa/ })).toBeEnabled();
  });

  test("comercio completo en el celular: «No sé, sugiéranme», otra pieza con Pantone y envío", async ({ page, isMobile }) => {
    test.skip(!isMobile, "Recorrido comercial en móvil");
    await page.goto("/cotizar");
    await pickCard(page, "Comercio");
    await expectStep(page, "Qué vas a empacar");
    await page.getByLabel("Producto", { exact: true }).fill("Kits de cosmética");
    await next(page);

    // Pieza 1 a sugerencia del equipo; desde ahí mismo se agrega otra pieza.
    await expectStep(page, "Tipo de empaque");
    await expect(page.getByRole("radio", { name: /Clamshell para hamburguesa/ })).toHaveCount(0);
    await pickCard(page, "No sé, sugiéranme");
    await page.getByRole("button", { name: "Agregar otra pieza" }).click();
    await expect(page.getByText("Pieza 2 de 2")).toBeVisible();

    await pickCard(page, /^Mailer de envío/);
    await next(page);
    await pickCard(page, "Tamaño estándar");
    await page.locator("label", { has: page.getByRole("radio", { name: /^S\d/ }) }).first().click();
    await next(page);
    await pickCard(page, "Cartón microcorrugado (flauta E o B)");
    await pickCard(page, "Medio");
    await next(page);
    await pickCard(page, "Pantone especial");
    await page.getByLabel("Códigos Pantone").fill("186 C");
    await pickCard(page, "Por fuera");
    await pickCard(page, "Solo logo");
    await next(page);

    await expectStep(page, "Cantidad y fecha");
    await page.locator("#items\\.0\\.quantities\\.0").fill("1000");
    await page.locator("#items\\.0\\.frequency").selectOption("once");
    await page.locator("#items\\.1\\.quantities\\.0").fill("2 500");
    await page.locator("#items\\.1\\.frequency").selectOption("quarterly");
    await next(page);
    await expectStep(page, "Arte y referencias");
    await pickCard(page, "Necesito que lo diseñen");
    await next(page);
    await expectStep(page, "Contacto y entrega");
    await page.getByLabel("Tu nombre").fill("Luis Gómez");
    await page.getByLabel("Correo").fill("luis@example.com");
    await page.getByLabel("Ciudad").fill("David");
    await page.getByLabel("Dirección de entrega").fill("Av. Obaldía");
    await page.getByRole("checkbox", { name: /Acepto que/ }).check();
    await next(page);
    await expectStep(page, "Resumen");
    await expect(page.getByRole("heading", { name: /Pieza 1: No sé, sugiéranme/ })).toBeVisible();
    await page.getByRole("button", { name: /Enviar solicitud/ }).click();
    await expect(page.getByTestId("request-number")).toHaveText(/^S-\d{4}-\d{5}$/, { timeout: 20_000 });
    await page.getByRole("link", { name: "Seguir mi solicitud" }).click();
    await expect(page.getByTestId("request-status")).toHaveText("Recibida");
  });

  test("con teclado, las flechas del paso de segmento eligen sin saltar de paso (WCAG 3.2.2)", async ({ page, isMobile }) => {
    test.skip(isMobile, "Basta con escritorio");
    await page.goto("/cotizar");
    await expectStep(page, "Segmento");
    await page.getByRole("radio", { name: /^Comercio/ }).focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("ArrowDown");
    await expect(page.getByRole("radio", { name: /^Restaurante o alimentos/ })).toBeChecked();
    await expectStep(page, "Segmento");
    await next(page);
    await expectStep(page, "Qué vas a empacar");
    // Los errores de un paso no aparecen en el siguiente.
    await expect(page.getByRole("alert").filter({ hasText: "Revisa lo marcado" })).toHaveCount(0);
  });

  test("«Cotizar esta pieza» se suma al borrador en curso en vez de reemplazarlo", async ({ page, isMobile }) => {
    test.skip(isMobile, "Basta con escritorio");
    await page.goto("/cotizar");
    await pickCard(page, "Comercio");
    await page.getByLabel("Producto", { exact: true }).fill("Velas aromáticas");
    await next(page);
    await pickCard(page, "Caja plegadiza con tapa");
    await next(page);
    await expectStep(page, "Tamaño");
    // Espera el primer guardado en el servidor (el borrador ya tiene token).
    await page.waitForFunction(() => Boolean(JSON.parse(localStorage.getItem("provenpack:cotizador") ?? "{}").token), null, { timeout: 10_000 });

    await page.goto("/cotizar?tipo=BL-02");
    await expect(page.getByText("Sumamos Bolsa kraft con asa retorcida a tu solicitud en curso como pieza 2.")).toBeVisible();
    await expect(page.getByText("Pieza 2 de 2")).toBeVisible();
    await expect(page.getByRole("radio", { name: /Bolsa kraft con asa retorcida/ })).toBeChecked();
    await expect(page).toHaveURL(/\/cotizar$/);
    await page.getByRole("button", { name: "Atrás" }).click();
    await expect(page.getByText("Pieza 1 de 2")).toBeVisible();
    await page.getByRole("button", { name: "Atrás" }).click();
    await page.getByRole("button", { name: "Atrás" }).click();
    await page.getByRole("button", { name: "Atrás" }).click();
    await expect(page.getByRole("radio", { name: /Caja plegadiza con tapa/ })).toBeChecked();
  });

  test("el borrador se recupera desde otro navegador con el enlace", async ({ page, browser, isMobile }) => {
    test.skip(isMobile, "Basta con escritorio");
    await page.goto("/cotizar");
    await pickCard(page, "Comercio");
    await expectStep(page, "Qué vas a empacar");
    await page.getByLabel("Producto", { exact: true }).fill("Camisetas de algodón");
    await next(page);
    await expectStep(page, "Tipo de empaque");
    // El token no queda en la barra de direcciones: se comparte con «Guardar y seguir después».
    await expect(page).toHaveURL(/\/cotizar$/);
    await page.getByRole("button", { name: "Guardar y seguir después" }).click();
    const whatsapp = page.getByRole("link", { name: "Enviármelo por WhatsApp" });
    await expect(whatsapp).toBeVisible({ timeout: 10_000 });
    const href = decodeURIComponent((await whatsapp.getAttribute("href")) ?? "");
    const link = href.match(/https?:\/\/\S+\/cotizar\?borrador=[A-Za-z0-9_-]{32,}/)?.[0] ?? "";
    expect(link).not.toBe("");

    const other = await browser.newContext();
    const page2 = await other.newPage();
    const target = new URL(link);
    await page2.goto(target.pathname + target.search);
    await expectStep(page2, "Tipo de empaque");
    await expect(page2).toHaveURL(/\/cotizar$/);
    await page2.getByRole("button", { name: "Atrás" }).click();
    await expect(page2.getByLabel("Producto", { exact: true })).toHaveValue("Camisetas de algodón");
    await other.close();
  });

  test("Pantone y tamaño a medida validan con mensajes específicos", async ({ page, isMobile }) => {
    test.skip(isMobile, "Basta con escritorio");
    await page.goto("/cotizar?tipo=CJ-06");
    await pickCard(page, "Comercio");
    await expectStep(page, "Qué vas a empacar");
    await page.getByLabel("Producto", { exact: true }).fill("Kits de cosmética");
    await next(page);
    await next(page);
    await pickCard(page, "A medida");
    await page.getByLabel("Largo", { exact: true }).fill("30,55");
    await next(page);
    await expect(page.getByText("Escribe la medida en cm, mayor que 0 y con un decimal como máximo").first()).toBeVisible();
    await page.getByLabel("Largo", { exact: true }).fill("30,5");
    await page.getByLabel("Ancho", { exact: true }).fill("20");
    await page.getByLabel("Alto", { exact: true }).fill("10");
    await next(page);
    await expectStep(page, "Material");
    await expect(page.getByRole("radio", { name: /Ligero/ })).toBeDisabled();
    await pickCard(page, "Cartón microcorrugado (flauta E o B)");
    await pickCard(page, "Medio");
    await next(page);
    await pickCard(page, "Pantone especial");
    await page.getByLabel("Códigos Pantone").fill("186");
    await pickCard(page, "Ambas caras");
    await pickCard(page, "Total");
    await next(page);
    await expect(page.getByText("Los códigos Pantone van como número + C o U").first()).toBeVisible();
    await page.getByLabel("Códigos Pantone").fill("186 C, 7621u");
    await next(page);
    await expectStep(page, "Cantidad y fecha");
    await page.locator("#items\\.0\\.quantities\\.0").fill("0");
    await page.locator("#desiredDate").fill("2020-01-01");
    await next(page);
    await expect(page.getByText("La cantidad debe ser un número entero mayor que 0").first()).toBeVisible();
    await expect(page.getByText("La fecha no puede ser anterior a hoy.").first()).toBeVisible();
  });
});
