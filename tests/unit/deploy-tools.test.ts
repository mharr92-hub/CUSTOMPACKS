import { describe, expect, it } from "vitest";
import { diagnose } from "../../scripts/lib/doctor-rules.mjs";
// @ts-expect-error módulo .mjs sin tipos
import { argsWithoutEnv, scriptDatabaseUrl } from "../../scripts/lib/pg-local.mjs";
import { poolerUrls, previewAuthConfig, previewEnvFile, previewPlan } from "../../scripts/lib/supabase-preview.mjs";

type Finding = { service: string; status: string; detail: string };
const prod = {
  NEXT_PUBLIC_SITE_URL: "https://provenpack.com",
  DATABASE_URL: "postgres://postgres.abc:clave@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
  DB_POOL_MAX: "1",
  SUPABASE_URL: "https://abc.supabase.co",
  SUPABASE_ANON_KEY: "anon",
  SUPABASE_SERVICE_ROLE_KEY: "service",
  AUTH_SECRET: "a".repeat(40),
  ADMIN_EMAIL: "mark@provenpack.com",
  CRON_SECRET: "c".repeat(30),
  RESEND_API_KEY: "re_abc",
  MAIL_FROM: "ProvenPack <hola@provenpack.com>",
  FACTORY_EMAIL: "fabrica@example.com",
  NEXT_PUBLIC_WHATSAPP_NUMBER: "50761234567",
  NEXT_PUBLIC_CONTACT_EMAIL: "hola@provenpack.com",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAA",
  TURNSTILE_SECRET_KEY: "0x4BBB",
};
const byService = (env: Record<string, string>, production: boolean) =>
  Object.fromEntries((diagnose(env, { production }) as Finding[]).map((f) => [f.service, f]));

describe("pnpm run doctor", () => {
  it("un entorno de producción completo no tiene errores", () => {
    const errors = (diagnose(prod, { production: true }) as Finding[]).filter((f) => f.status === "error");
    expect(errors).toEqual([]);
  });

  it("en producción, lo que falta es error y explica qué deja de funcionar", () => {
    const r = byService({ ...prod, RESEND_API_KEY: "", AUTH_SECRET: "corta", NEXT_PUBLIC_WHATSAPP_NUMBER: "50760000000", RATE_LIMIT_FACTOR: "20", TURNSTILE_SECRET_KEY: "" }, true);
    expect(r["Correo (Resend)"]?.status).toBe("error");
    expect(r["Sesiones del panel"]?.detail).toMatch(/mínimo 32/);
    expect(r["WhatsApp"]?.detail).toMatch(/ejemplo/);
    expect(r["Variables de prueba"]?.status).toBe("error");
    expect(r["Captcha (Turnstile)"]?.detail).toMatch(/falta TURNSTILE_SECRET_KEY/);
  });

  it("en local, lo que falta solo se informa (modo simulado)", () => {
    const all = diagnose({}, { production: false }) as Finding[];
    expect(all.filter((f) => f.status === "error")).toEqual([]);
    expect(all.find((f) => f.service === "Base de datos")?.status).toBe("missing");
  });

  it("avisa si la base no usa el Transaction pooler o el pool no es 1", () => {
    expect(byService({ ...prod, DATABASE_URL: prod.DATABASE_URL.replace(":6543", ":5432") }, true)["Base de datos"]?.status).toBe("warn");
    expect(byService({ ...prod, DB_POOL_MAX: "5" }, true)["Base de datos"]?.status).toBe("warn");
  });
});

describe("scripts contra Supabase", () => {
  it("pasan del Transaction pooler al Session pooler y aceptan --env", () => {
    expect(scriptDatabaseUrl(prod.DATABASE_URL)).toBe(prod.DATABASE_URL.replace(":6543/", ":5432/"));
    expect(scriptDatabaseUrl("postgres://postgres:postgres@localhost:54322/postgres")).toBe("postgres://postgres:postgres@localhost:54322/postgres");
    expect(argsWithoutEnv(["mark@x.com", "--env", ".env.production", "admin"])).toEqual(["mark@x.com", "admin"]);
  });

  it("el proyecto de previews: plan, Auth cerrada y .env.preview sin Resend", () => {
    expect(previewPlan({ name: "p", region: "us-east-1", org: "", reuseRef: "" })[0]).toMatch(/plan Free/);
    expect(previewAuthConfig({ siteUrl: "https://p.vercel.app", redirectPatterns: ["a", "b"] })).toMatchObject({ disable_signup: true, uri_allow_list: "a,b" });
    const urls = poolerUrls([{ pool_mode: "transaction", connection_string: "postgres://postgres.ref:[YOUR-PASSWORD]@aws-0-us-east-1.pooler.supabase.com:6543/postgres" }], "c/ave");
    expect(urls).toEqual({
      transactionUrl: "postgres://postgres.ref:c%2Fave@aws-0-us-east-1.pooler.supabase.com:6543/postgres",
      sessionUrl: "postgres://postgres.ref:c%2Fave@aws-0-us-east-1.pooler.supabase.com:5432/postgres",
    });
    const file = previewEnvFile({ supabaseUrl: "https://ref.supabase.co", anonKey: "a", serviceRoleKey: "s", transactionUrl: urls.transactionUrl, adminEmail: "m@x.com", siteUrl: "https://p.vercel.app", authSecret: "x".repeat(43), cronSecret: "y".repeat(32) });
    expect(file).not.toMatch(/^RESEND_API_KEY=/m);
    expect(file).toMatch(/^DB_POOL_MAX=1$/m);
  });
});
