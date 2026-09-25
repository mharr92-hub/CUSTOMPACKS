import { expect, test } from "@playwright/test";

/** Rutas que no son del sitio público (no se rastrean). */
const SKIP = /^\/(admin|api|auth|seguimiento)(\/|$)/;
/** Un precio visible (US$ 12, $1.50, USD 20…) nunca debe aparecer en el sitio público. */
const PRICE = /(US\$|\$|USD)\s?\d/;
/** Sellos o certificaciones con nombre propio: solo con certificado vigente (hoy, ninguno). */
const SEALS = /\b(FSC|PEFC|SFI|ISO\s?\d{4,5}|BRCGS?|HACCP)\b/;
/** Imágenes que parecen logos de clientes o sellos. */
const LOGO_LIKE = /logo|sello|certific|fsc|pefc|cliente/i;

test.describe("E2 · sitio público", () => {
  test.skip(({ isMobile }) => isMobile, "El rastreo completo corre una sola vez (escritorio).");
  test.setTimeout(240_000);

  test("navegación completa sin enlaces rotos, un h1 por página, sin precios, logos de clientes, sellos ni etiquetas internas", async ({ page }) => {
    const queue = ["/"];
    const seen = new Set<string>(queue);
    const problems: string[] = [];

    while (queue.length > 0 && seen.size < 200) {
      const path = queue.shift() as string;
      const response = await page.goto(path);
      const status = response?.status() ?? 0;
      if (status >= 400) {
        problems.push(`${path} → ${status}`);
        continue;
      }
      const h1Count = await page.locator("h1").count();
      if (h1Count !== 1) problems.push(`${path}: ${h1Count} h1`);
      const text = await page.locator("main").innerText();
      if (text.includes("PROVISIONAL")) problems.push(`${path}: muestra PROVISIONAL`);
      if (PRICE.test(text)) problems.push(`${path}: muestra un precio`);
      if (SEALS.test(text)) problems.push(`${path}: menciona un sello o certificación: ${text.match(SEALS)?.[0]}`);
      const logos = await page
        .locator("main img")
        .evaluateAll((els) => els.map((el) => `${el.getAttribute("alt") ?? ""} ${el.getAttribute("src") ?? ""}`));
      for (const img of logos) if (LOGO_LIKE.test(img)) problems.push(`${path}: imagen con aspecto de logo o sello: ${img.slice(0, 120)}`);
      if (path === "/clientes" && logos.length > 0) problems.push("/clientes: muestra imágenes (solo con autorización escrita del cliente)");

      const hrefs = await page.locator("a[href^='/']").evaluateAll((els) => els.map((el) => el.getAttribute("href") ?? ""));
      for (const href of hrefs) {
        const clean = href.split("#")[0] ?? "";
        if (!clean || SKIP.test(clean) || seen.has(clean)) continue;
        seen.add(clean);
        queue.push(clean);
      }
    }

    expect(problems, problems.join("\n")).toEqual([]);
    expect(seen.size).toBeGreaterThan(30);
  });

  test("SEO técnico: sitemap, robots, datos estructurados e imagen OpenGraph", async ({ page, request }) => {
    const sitemap = await request.get("/sitemap.xml");
    expect(sitemap.status()).toBe(200);
    const xml = await sitemap.text();
    expect(xml).toContain("/catalogo/cajas/plegadiza-con-tapa");

    const robots = await (await request.get("/robots.txt")).text();
    expect(robots).toMatch(/Disallow: \/admin/);
    expect(robots).toMatch(/Sitemap: /);

    await page.goto("/catalogo/empaque-alimentario/balde-para-pollo");
    const jsonLd = await page.locator('script[type="application/ld+json"]').allTextContents();
    const types = jsonLd.map((j) => (JSON.parse(j) as { "@type": string })["@type"]);
    expect(types).toEqual(expect.arrayContaining(["Organization", "Product", "BreadcrumbList"]));
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", /\/catalogo\/empaque-alimentario\/balde-para-pollo$/);
    await expect(page.getByText("El balde para pollo exige papel antigrasa.")).toBeVisible();

    await page.goto("/faq");
    const faq = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(faq.some((j) => j.includes('"FAQPage"'))).toBe(true);

    const og = await request.get("/opengraph-image");
    expect(og.status()).toBe(200);
    expect(og.headers()["content-type"]).toBe("image/png");
  });

  test("los filtros del catálogo y la galería funcionan sin JavaScript", async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.goto("/catalogo");
    await page.getByRole("link", { name: "Alimentos" }).click();
    await expect(page).toHaveURL(/segmento=alimentos/);
    await expect(page.getByRole("heading", { name: "Balde para pollo" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Caja rígida" })).toHaveCount(0);

    await page.goto("/galeria");
    await page.getByLabel("Tipo").selectOption({ label: "Balde para pollo" });
    await page.getByRole("button", { name: "Aplicar" }).click();
    await expect(page.locator("figcaption").getByText("M-008", { exact: true })).toBeVisible();
    await expect(page.locator("figcaption").getByText("M-001", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: /Quiero algo así: usar la muestra M-008/ })).toHaveAttribute("href", "/cotizar?muestra=M-008");
    await context.close();
  });
});

test("inicio en móvil: hero, dos puertas y botón de cotizar visibles", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Solo móvil");
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toBeInViewport();
  await expect(page.getByRole("link", { name: "Cotiza en 5 minutos" }).first()).toBeVisible();
  await page.locator("summary[aria-label='Abrir menú']").click();
  const menu = page.locator("#menu-movil nav");
  await expect(menu.getByRole("link", { name: "Galería de muestras" })).toBeVisible();
  await menu.getByRole("link", { name: "Galería de muestras" }).click();
  await expect(page).toHaveURL(/\/galeria$/);
  await expect(menu).toBeHidden();
});
