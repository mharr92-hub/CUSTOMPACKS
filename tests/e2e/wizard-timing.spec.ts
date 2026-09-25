import fs from "node:fs";
import path from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";

/*
 * Medición del tiempo de completado del cotizador en celular (auditoría).
 * Solo corre con MEASURE_WIZARD=1:
 *   MEASURE_WIZARD=1 pnpm test:e2e tests/e2e/wizard-timing.spec.ts --project=mobile
 * Ritmo de una persona (ajustable): WIZARD_TAP_MS antes de cada toque,
 * WIZARD_KEY_MS por tecla y WIZARD_READ_MS de lectura por paso. Con
 * WIZARD_PACE=machine todo va a 0 (solo la latencia de la interfaz).
 * Escribe el resultado en .data/wizard-timing.json.
 */
const MACHINE = process.env.WIZARD_PACE === "machine";
const TAP_MS = MACHINE ? 0 : Number(process.env.WIZARD_TAP_MS ?? 1200);
const KEY_MS = MACHINE ? 0 : Number(process.env.WIZARD_KEY_MS ?? 180);
const READ_MS = MACHINE ? 0 : Number(process.env.WIZARD_READ_MS ?? 2500);

type Stats = { taps: number; keys: number; steps: number };

function pacer(page: Page) {
  const stats: Stats = { taps: 0, keys: 0, steps: 0 };
  const wait = (ms: number) => (ms > 0 ? page.waitForTimeout(ms) : Promise.resolve());
  return {
    stats,
    async tap(locator: Locator) {
      await wait(TAP_MS);
      await locator.click();
      stats.taps += 1;
    },
    async type(locator: Locator, text: string) {
      await wait(TAP_MS);
      await locator.click();
      await locator.pressSequentially(text, { delay: KEY_MS });
      stats.taps += 1;
      stats.keys += text.length;
    },
    async select(locator: Locator, value: string) {
      await wait(TAP_MS * 2); // abrir la lista y elegir
      await locator.selectOption(value);
      stats.taps += 2;
    },
    async card(name: string | RegExp) {
      const pattern = typeof name === "string" ? new RegExp(`^${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`) : name;
      await this.tap(page.locator("label", { has: page.getByRole("radio", { name: pattern }) }).first());
    },
    async chip(name: string) {
      await this.tap(page.locator("label", { has: page.getByRole("checkbox", { name: new RegExp(`^${name}`) }) }).first());
    },
    async next() {
      await wait(READ_MS);
      await page.getByRole("button", { name: /^Continuar/ }).click();
      stats.taps += 1;
      stats.steps += 1;
    },
  };
}

function report(name: string, ms: number, stats: Stats) {
  const file = path.resolve(".data/wizard-timing.json");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let all: Record<string, unknown> = {};
  try {
    all = JSON.parse(fs.readFileSync(file, "utf8")) as Record<string, unknown>;
  } catch {
    // primera medición
  }
  all[`${name} (${MACHINE ? "máquina" : "persona"})`] = { segundos: Math.round(ms / 100) / 10, ...stats, ritmo: { TAP_MS, KEY_MS, READ_MS } };
  fs.writeFileSync(file, `${JSON.stringify(all, null, 2)}\n`);
}

test.describe("Medición · tiempo de completado del cotizador", () => {
  test.skip(({ isMobile }) => !isMobile || process.env.MEASURE_WIZARD !== "1", "Solo con MEASURE_WIZARD=1 en móvil.");
  test.setTimeout(600_000);

  test("comercio, una pieza, camino mínimo", async ({ page }) => {
    const p = pacer(page);
    await page.goto("/cotizar");
    const started = Date.now();
    await p.card("Comercio");
    await p.type(page.getByLabel("Producto", { exact: true }), "Velas aromáticas");
    await p.next();
    await p.card("Mailer de envío (tapa abatible)");
    await p.next();
    await p.card("Tamaño estándar");
    await p.tap(page.locator("label", { has: page.getByRole("radio", { name: /^S\d/ }) }).first());
    await p.next();
    await p.card("Cartón microcorrugado (flauta E o B)");
    await p.card("Medio");
    await p.next();
    await p.card("Sin impresión");
    await p.next();
    await p.type(page.locator("#items\\.0\\.quantities\\.0"), "2000");
    await p.select(page.locator("#items\\.0\\.frequency"), "once");
    await p.next();
    await p.next(); // arte y referencias: nada que agregar
    await p.type(page.getByLabel("Tu nombre"), "Ana Pérez");
    await p.type(page.getByLabel("WhatsApp"), "+507 6123-4567");
    await p.type(page.getByLabel("Ciudad"), "Panamá");
    await p.type(page.getByLabel("Dirección de entrega"), "Calle 50, local 3");
    await p.tap(page.getByRole("checkbox", { name: /Acepto que/ }));
    await p.next();
    await p.tap(page.getByRole("button", { name: /Enviar solicitud/ }));
    await expect(page.getByTestId("request-number")).toBeVisible({ timeout: 20_000 });
    report("comercio · 1 pieza", Date.now() - started, p.stats);
  });

  test("alimentos + comercio, dos piezas (criterio de E3)", async ({ page }) => {
    const p = pacer(page);
    await page.goto("/cotizar");
    const started = Date.now();
    await p.card("Restaurante o alimentos");
    await p.type(page.getByLabel("Producto", { exact: true }), "Hamburguesas y papas");
    await p.type(page.getByLabel("Peso aproximado por unidad"), "350");
    await p.chip("Caliente");
    await p.chip("Grasa");
    await p.next();
    await p.card("Clamshell para hamburguesa");
    await p.next();
    await p.card("Tamaño estándar");
    await p.card(/^S3: 13 × 13 × 8 cm$/);
    await p.next();
    await p.card("Papel antigrasa o con barrera");
    await p.card("Ligero");
    await p.chip("Resistente a grasa");
    await p.next();
    await p.card("2 tintas");
    await p.card("Por fuera");
    await p.card("Solo logo");
    await p.tap(page.getByRole("button", { name: "Agregar otra pieza" }));
    await p.card("Bolsa kraft con asa plana");
    await p.next();
    await p.card("Según mi producto");
    await p.next();
    await p.card("Kraft (natural o blanco)");
    await p.card("Medio");
    await p.chip("Contacto directo con alimentos");
    await p.next();
    await p.card("Sin impresión");
    await p.next();
    await p.type(page.locator("#items\\.0\\.quantities\\.0"), "5000");
    await p.type(page.locator("#items\\.0\\.quantities\\.1"), "20000");
    await p.select(page.locator("#items\\.0\\.frequency"), "monthly");
    await p.type(page.locator("#items\\.1\\.quantities\\.0"), "3000");
    await p.select(page.locator("#items\\.1\\.frequency"), "once");
    await p.next();
    await p.card("Aún no tengo arte");
    await p.next();
    await p.type(page.getByLabel("Tu nombre"), "Ana Pérez");
    await p.type(page.getByLabel("Empresa"), "Burgers del Istmo");
    await p.type(page.getByLabel("WhatsApp"), "+507 6123-4567");
    await p.type(page.getByLabel("Correo"), "ana@example.com");
    await p.type(page.getByLabel("Ciudad"), "Ciudad de Panamá");
    await p.type(page.getByLabel("Dirección de entrega"), "Calle 50, local 3");
    await p.tap(page.getByRole("checkbox", { name: /Acepto que/ }));
    await p.next();
    await p.tap(page.getByRole("button", { name: /Enviar solicitud/ }));
    await expect(page.getByTestId("request-number")).toBeVisible({ timeout: 20_000 });
    report("alimentos + comercio · 2 piezas", Date.now() - started, p.stats);
  });
});
