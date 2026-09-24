import { expect, type Page } from "@playwright/test";

/** Debe coincidir con ADMIN_EMAIL del webServer en playwright.config.ts. */
export const E2E_ADMIN_EMAIL = "admin@provenpack.test";

/** PNG 1×1 válido (magic bytes reales) para probar subidas de fotos. */
export const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

/** Entra al panel con el enlace mágico del modo local (se muestra en pantalla fuera de producción). */
export async function loginAsAdmin(page: Page, next = "/admin"): Promise<void> {
  await page.goto(`/admin/ingresar?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Correo").fill(E2E_ADMIN_EMAIL);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  const link = page.getByRole("link", { name: "Abrir enlace de acceso" });
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/admin/ingresar"));
}

export function uniqueSuffix(): string {
  return `${Date.now().toString(36)}${Math.floor(Math.random() * 1000)}`.toUpperCase();
}
