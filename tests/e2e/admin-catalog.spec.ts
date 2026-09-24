import { expect, test } from "@playwright/test";
import { loginAsAdmin, PNG_1PX, uniqueSuffix } from "./helpers";

test.describe("E1 · catálogo en el panel", () => {
  test.skip(({ isMobile }) => isMobile, "El panel interno se prueba en escritorio (PRD §15).");

  test("/admin sin sesión redirige al login", async ({ page }) => {
    await page.goto("/admin/catalogo");
    await expect(page).toHaveURL(/\/admin\/ingresar\?next=%2Fadmin%2Fcatalogo/);
  });

  test("admin crea un tipo con foto, marca una compatibilidad y aparece en la API pública", async ({ page, request }) => {
    const suffix = uniqueSuffix();
    const code = `CJ-${suffix}`;
    const slug = `prueba-${suffix.toLowerCase()}`;

    await loginAsAdmin(page, "/admin/catalogo");
    await expect(page.getByRole("heading", { name: "Catálogo", level: 1 })).toBeVisible();

    // Alta del tipo
    await page.goto("/admin/catalogo/tipos/nuevo");
    await page.getByLabel("Código").fill(code);
    await page.getByLabel("Nombre").fill(`Caja de prueba ${suffix}`);
    await page.getByLabel("Slug (URL)").fill(slug);
    await page.getByLabel("Categoría").selectOption({ label: "CAJ · Cajas" });
    await page.getByLabel("Familia de tamaños").selectOption("box");
    await page.getByRole("checkbox", { name: "Comercio y retail" }).check();
    await page.getByRole("button", { name: "Crear" }).click();
    await page.waitForURL(/\/admin\/catalogo\/tipos\/[0-9a-f-]{36}$/);

    // Foto principal
    await page.getByLabel("Elegir foto").first().setInputFiles({ name: "foto.png", mimeType: "image/png", buffer: PNG_1PX });
    await page.getByRole("button", { name: "Subir foto" }).click();
    await expect(page.getByRole("button", { name: "Quitar foto" }).first()).toBeVisible();

    // Compatibilidad: exige papel antigrasa
    await page.goto(`/admin/catalogo/compatibilidades?tipo=${code}`);
    await page.getByRole("button", { name: /Papel antigrasa o con barrera · Cualquier calibre/ }).click();
    await page.getByRole("radio", { name: "Exige / permite" }).check();
    await page.getByLabel("Motivo (lo ve el cliente)").fill("Prueba: exige antigrasa.");
    await page.getByRole("button", { name: "Guardar regla" }).click();
    await expect(page.getByRole("dialog")).toBeHidden();

    // API pública
    await expect
      .poll(async () => {
        const catalog = (await (await request.get("/api/catalog")).json()) as {
          productTypes: { id: string; code: string; photoUrl: string | null }[];
          compatibilities: { productTypeId: string; allowed: boolean; reason: string | null }[];
        };
        const type = catalog.productTypes.find((p) => p.code === code);
        const rule = type ? catalog.compatibilities.find((c) => c.productTypeId === type.id) : undefined;
        return { hasType: Boolean(type), hasPhoto: Boolean(type?.photoUrl), rule: rule ? { allowed: rule.allowed, reason: rule.reason } : null };
      })
      .toEqual({ hasType: true, hasPhoto: true, rule: { allowed: true, reason: "Prueba: exige antigrasa." } });

    // La foto se sirve de verdad
    const catalog = (await (await request.get("/api/catalog")).json()) as { productTypes: { code: string; photoUrl: string }[] };
    const photoUrl = catalog.productTypes.find((p) => p.code === code)?.photoUrl ?? "";
    const photo = await request.get(photoUrl);
    expect(photo.status()).toBe(200);
    expect(photo.headers()["content-type"]).toBe("image/png");
  });

  test("un código duplicado muestra el error y conserva lo escrito", async ({ page }) => {
    await loginAsAdmin(page, "/admin/catalogo/papeles/nuevo");
    await page.getByLabel("Código").fill("PA-01");
    await page.getByLabel("Nombre").fill("Duplicado");
    await page.getByRole("button", { name: "Crear" }).click();
    await expect(page.getByText("Ya existe un registro con ese código o slug.")).toBeVisible();
    await expect(page.getByLabel("Nombre")).toHaveValue("Duplicado");
  });
});
