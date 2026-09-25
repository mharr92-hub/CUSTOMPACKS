import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const baseURL = process.env.E2E_BASE_URL ?? `http://localhost:${PORT}`;

/**
 * E2E con Playwright. Por defecto levanta la app con `pnpm dev` (que a su vez
 * arranca el Postgres embebido local). Con E2E_BASE_URL apunta a un servidor ya
 * corriendo (por ejemplo, un preview de Vercel).
 */
export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "es-PA",
    timezoneId: "America/Panama",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] } },
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `node scripts/dev.mjs dev --port ${PORT}`,
        url: baseURL,
        reuseExistingServer: false,
        timeout: 180_000,
        stdout: "ignore",
        stderr: "pipe",
        env: {
          ADMIN_EMAIL: "admin@provenpack.test",
          FACTORY_EMAIL: "fabrica@provenpack.test",
          NEXT_PUBLIC_SITE_URL: baseURL,
          // Base aislada para e2e, recreada en cada corrida (no toca los datos de desarrollo).
          LOCAL_DB_PORT: "54323",
          LOCAL_DB_DIR: ".data/postgres-e2e",
          LOCAL_DB_RESET: "1",
          STORAGE_LOCAL_DIR: ".data/storage-e2e",
          NEXT_DIST_DIR: ".next-e2e",
        },
      },
});
