import { expect, type Page } from "@playwright/test";
import postgres from "postgres";

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

/** PDF válido de una página (magic bytes reales), con relleno opcional para probar archivos grandes. */
export function makePdf(paddingBytes = 0): Buffer {
  const content = "0 0 1 rg 20 20 160 160 re f";
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 200] /Contents 4 0 R >>",
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];
  let body = `%PDF-1.4\n%${"0".repeat(Math.max(0, paddingBytes))}\n`;
  const offsets: number[] = [];
  objects.forEach((obj, i) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) body += `${String(o).padStart(10, "0")} 00000 n \n`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

let sql: postgres.Sql | null = null;
/** Conexión a la base e2e (la levanta playwright.config.ts en :54323). */
export function e2eSql(): postgres.Sql {
  sql ??= postgres(process.env.E2E_DATABASE_URL ?? "postgres://postgres:postgres@localhost:54323/postgres", { max: 2, onnotice: () => {} });
  return sql;
}

/** Crea (o reutiliza) un usuario del equipo con ese rol y entra con el enlace mágico local. */
export async function loginAsStaff(page: Page, email: string, role: "sales" | "ops" | "viewer", next = "/admin"): Promise<void> {
  const db = e2eSql();
  const [user] = await db<{ id: string }[]>`
    insert into auth.users (email) values (${email})
    on conflict do nothing returning id`;
  const id = user?.id ?? (await db<{ id: string }[]>`select id from auth.users where email = ${email}`)[0]?.id;
  await db`update public.profiles set role = ${role} where user_id = ${id ?? null}`;
  await page.goto(`/admin/ingresar?next=${encodeURIComponent(next)}`);
  await page.getByLabel("Correo").fill(email);
  await page.getByRole("button", { name: "Enviar enlace" }).click();
  const link = page.getByRole("link", { name: "Abrir enlace de acceso" });
  await expect(link).toBeVisible();
  await link.click();
  await page.waitForURL((url) => !url.pathname.startsWith("/admin/ingresar"));
}
