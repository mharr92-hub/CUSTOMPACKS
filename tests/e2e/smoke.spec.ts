import { expect, test } from "@playwright/test";

test("la página de inicio carga con el layout base", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Probamos que somos los mejores");
  await expect(page.getByRole("banner")).toBeVisible();
  await expect(page.getByRole("contentinfo")).toContainText("50 %");
  await expect(page.locator("a[data-analytics=whatsapp_fab]")).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+/);
});

test("un error inesperado muestra la pantalla de error con la marca y permite reintentar (M1)", async ({ page }) => {
  await page.goto("/prueba-error");
  await expect(page.getByRole("heading", { name: "Algo salió mal" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Intentar de nuevo" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Escríbenos por WhatsApp" })).toHaveAttribute("href", /^https:\/\/wa\.me\/\d+/);
});
