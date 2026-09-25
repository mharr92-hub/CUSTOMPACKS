#!/usr/bin/env node
// Ensayo local del despliegue a producción (docs/deploy.md, "Checklist de despliegue").
// Uso: pnpm verify:deploy
// 1. Base nueva (Postgres embebido en un puerto y carpeta temporales): migraciones + seed.
// 2. `next build` con NODE_ENV=production y las variables mínimas de producción.
// 3. Revisión de secretos en el código público.
// 4. `next start` y comprobaciones HTTP: páginas, cabeceras, SEO, crons con y sin
//    CRON_SECRET, rutas protegidas, sesión falsificada con la clave de desarrollo.
// No usa servicios externos ni credenciales reales. Sale con código 1 si algo falla.
import { spawn } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { SignJWT } from "jose";
import { ROOT, connect, migrate, seed, startEmbedded } from "./lib/pg-local.mjs";

const require = createRequire(import.meta.url);
const nextBin = require.resolve("next/dist/bin/next");
const PG_PORT = 56000 + Math.floor(Math.random() * 1000);
const APP_PORT = 3300 + Math.floor(Math.random() * 300);
const BASE = `http://localhost:${APP_PORT}`;
const DIST = ".next-deploy";
const out = (m) => process.stdout.write(`${m}\n`);

const results = [];
function check(name, ok, detail = "") {
  results.push({ name, ok });
  out(`${ok ? "✔" : "✘"} ${name}${detail ? ` — ${detail}` : ""}`);
}

function run(args, env, { quiet = true } = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, { cwd: ROOT, env, stdio: quiet ? ["ignore", "pipe", "pipe"] : "inherit" });
    let log = "";
    child.stdout?.on("data", (d) => (log += d));
    child.stderr?.on("data", (d) => (log += d));
    child.on("exit", (code) => resolve({ code, log }));
  });
}

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "provenpack-deploy-pg-"));
const storageDir = fs.mkdtempSync(path.join(os.tmpdir(), "provenpack-deploy-storage-"));
let pg = null;
let server = null;
try {
  // 1. Base nueva
  out(`Base nueva en :${PG_PORT}…`);
  const started = await startEmbedded({ dataDir, port: PG_PORT, persistent: false });
  pg = started.pg;
  const sql = connect(started.url);
  const applied = await migrate(sql);
  await seed(sql, { adminEmail: "mark@provenpack.test" });
  const [{ n: tables }] = await sql`select count(*)::int as n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r'`;
  const [{ n: noRls }] = await sql`select count(*)::int as n from pg_class c join pg_namespace s on s.oid = c.relnamespace where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`;
  await sql.end({ timeout: 5 });
  check("Migraciones y seed en una base vacía", applied > 0, `${applied} migraciones, ${tables} tablas`);
  check("RLS activado en todas las tablas", noRls === 0, `${noRls} sin RLS`);

  // 2. Build de producción
  const env = {
    ...process.env,
    NODE_ENV: "production",
    NEXT_TELEMETRY_DISABLED: "1",
    DATABASE_URL: started.url,
    DB_POOL_MAX: "2",
    NEXT_DIST_DIR: DIST,
    STORAGE_LOCAL_DIR: storageDir,
    NEXT_PUBLIC_SITE_URL: BASE,
    AUTH_SECRET: randomBytes(32).toString("base64url"),
    CRON_SECRET: randomBytes(24).toString("base64url"),
    ADMIN_EMAIL: "mark@provenpack.test",
    FACTORY_EMAIL: "fabrica@provenpack.test",
  };
  for (const k of ["SUPABASE_URL", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "NEXT_PUBLIC_SENTRY_DSN", "TURNSTILE_SECRET_KEY", "NEXT_PUBLIC_TURNSTILE_SITE_KEY", "RATE_LIMIT_FACTOR", "ALLOW_LOCAL_AUTH_LINKS"]) delete env[k];
  out("Build de producción (1–3 minutos)…");
  const build = await run([nextBin, "build"], env);
  check("next build con NODE_ENV=production", build.code === 0, build.code === 0 ? "" : build.log.slice(-800));
  if (build.code !== 0) throw new Error("build");

  // 3. Secretos en el código público
  const scan = await run(["scripts/check-client-secrets.mjs", DIST], env);
  check("Sin secretos (ni AUTH_SECRET ni CRON_SECRET) en el código público", scan.code === 0, scan.log.trim().split("\n").pop());

  // 4. Servidor y comprobaciones HTTP
  server = spawn(process.execPath, [nextBin, "start", "-p", String(APP_PORT)], { cwd: ROOT, env, stdio: ["ignore", "pipe", "pipe"] });
  let ready = false;
  for (let i = 0; i < 90 && !ready; i++) {
    try {
      ready = (await fetch(`${BASE}/`, { redirect: "manual" })).status === 200;
    } catch {
      await new Promise((r) => setTimeout(r, 1000));
    }
  }
  check("next start responde", ready);
  if (!ready) throw new Error("start");

  const home = await fetch(`${BASE}/`);
  const h = home.headers;
  check("Inicio 200 con CSP, HSTS, X-Frame-Options y nosniff", home.status === 200 && Boolean(h.get("content-security-policy")?.includes("frame-ancestors 'none'")) && Boolean(h.get("strict-transport-security")) && h.get("x-frame-options") === "DENY" && h.get("x-content-type-options") === "nosniff");
  check("Sin cabecera X-Powered-By", !h.get("x-powered-by"));
  for (const route of ["/catalogo", "/galeria", "/cotizar", "/legal/privacidad", "/legal/terminos", "/admin/ingresar"]) {
    const r = await fetch(`${BASE}${route}`, { redirect: "manual" });
    check(`${route} responde 200`, r.status === 200, String(r.status));
  }
  const sitemap = await (await fetch(`${BASE}/sitemap.xml`)).text();
  check("sitemap.xml usa NEXT_PUBLIC_SITE_URL", sitemap.includes(`<loc>${BASE}/`));
  const robots = await (await fetch(`${BASE}/robots.txt`)).text();
  check("robots.txt bloquea /admin y /seguimiento", /Disallow: \/admin/.test(robots) && /Disallow: \/seguimiento/.test(robots));

  const admin = await fetch(`${BASE}/admin/solicitudes`, { redirect: "manual" });
  check("/admin sin sesión redirige al ingreso", [302, 303, 307, 308].includes(admin.status) && (admin.headers.get("location") ?? "").includes("/admin/ingresar"), `${admin.status}`);
  const forged = await new SignJWT({ email: "mark@provenpack.test", pur: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject("00000000-0000-0000-0000-000000000001")
    .setIssuedAt()
    .setExpirationTime("1h")
    .sign(new TextEncoder().encode("dev-only-insecure-secret-change-me-0123456789"));
  const forgedRes = await fetch(`${BASE}/admin/solicitudes`, { redirect: "manual", headers: { cookie: `pp_session=${forged}` } });
  check("Una sesión firmada con la clave de desarrollo no entra", (forgedRes.headers.get("location") ?? "").includes("/admin/ingresar"), `${forgedRes.status}`);
  check("CSV de reportes sin sesión → 401", (await fetch(`${BASE}/api/reportes/pipeline`)).status === 401);
  check("Seguimiento con un enlace inventado → 404", (await fetch(`${BASE}/seguimiento/${"x".repeat(43)}`)).status === 404);
  check("Archivo privado con token falso → rechazado", (await fetch(`${BASE}/api/storage/object?t=falso`)).status >= 400);

  const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, "vercel.json"), "utf8"));
  for (const cron of vercel.crons ?? []) {
    const denied = await fetch(`${BASE}${cron.path}`);
    const allowed = await fetch(`${BASE}${cron.path}`, { headers: { authorization: `Bearer ${env.CRON_SECRET}` } });
    check(`Cron ${cron.path}: 401 sin secreto y 200 con CRON_SECRET`, denied.status === 401 && allowed.status === 200, `${denied.status}/${allowed.status}`);
  }
} catch (error) {
  if (!(error instanceof Error && ["build", "start"].includes(error.message))) check("Ensayo sin errores inesperados", false, String(error));
} finally {
  if (server) server.kill("SIGTERM");
  if (pg) await pg.stop().catch(() => {});
  for (const dir of [dataDir, storageDir]) fs.rmSync(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok).length;
out(`\n${results.length - failed}/${results.length} comprobaciones en verde.`);
process.exit(failed ? 1 : 0);
