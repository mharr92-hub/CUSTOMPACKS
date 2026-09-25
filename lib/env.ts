import "server-only";
import { z } from "zod";
import { authSecret } from "@/lib/auth/local-session";

/** Postgres embebido que levanta `pnpm dev` / `pnpm db:start` cuando no hay DATABASE_URL. */
export const LOCAL_DATABASE_URL = "postgres://postgres:postgres@localhost:54322/postgres";

const optionalString = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() !== "" ? value.trim() : undefined));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: optionalString,
  DB_POOL_MAX: z.coerce.number().int().positive().default(5),
  SUPABASE_URL: optionalString,
  SUPABASE_ANON_KEY: optionalString,
  SUPABASE_SERVICE_ROLE_KEY: optionalString,
  STORAGE_LOCAL_DIR: optionalString,
  AUTH_SECRET: optionalString,
  ADMIN_EMAIL: optionalString,
  RESEND_API_KEY: optionalString,
  MAIL_FROM: optionalString,
  FACTORY_EMAIL: optionalString,
  CRON_SECRET: optionalString,
  TURNSTILE_SECRET_KEY: optionalString,
});

export type ServerEnv = {
  nodeEnv: "development" | "production" | "test";
  databaseUrl: string;
  /** true si la base es el Postgres embebido local (sin DATABASE_URL). */
  isLocalDatabase: boolean;
  dbPoolMax: number;
  supabase: { url: string; anonKey: string; serviceRoleKey: string } | null;
  storageLocalDir: string;
  /** null en producción sin AUTH_SECRET válido (ver lib/auth/local-session.ts). */
  authSecret: string | null;
  adminEmail: string | undefined;
  resendApiKey: string | undefined;
  mailFrom: string;
  factoryEmail: string | undefined;
  cronSecret: string | undefined;
  turnstileSecretKey: string | undefined;
};

let cached: ServerEnv | undefined;

/** Lee y valida las variables de entorno del servidor una sola vez. */
export function getServerEnv(): ServerEnv {
  if (cached) return cached;
  const raw = schema.parse(process.env);
  const supabase =
    raw.SUPABASE_URL && raw.SUPABASE_ANON_KEY && raw.SUPABASE_SERVICE_ROLE_KEY
      ? { url: raw.SUPABASE_URL, anonKey: raw.SUPABASE_ANON_KEY, serviceRoleKey: raw.SUPABASE_SERVICE_ROLE_KEY }
      : null;
  cached = {
    nodeEnv: raw.NODE_ENV,
    databaseUrl: raw.DATABASE_URL ?? LOCAL_DATABASE_URL,
    isLocalDatabase: raw.DATABASE_URL === undefined,
    dbPoolMax: raw.DB_POOL_MAX,
    supabase,
    storageLocalDir: raw.STORAGE_LOCAL_DIR ?? ".data/storage",
    authSecret: authSecret(),
    adminEmail: raw.ADMIN_EMAIL?.toLowerCase(),
    resendApiKey: raw.RESEND_API_KEY,
    mailFrom: raw.MAIL_FROM ?? "ProvenPack <no-reply@provenpack.com>",
    factoryEmail: raw.FACTORY_EMAIL,
    cronSecret: raw.CRON_SECRET,
    turnstileSecretKey: raw.TURNSTILE_SECRET_KEY,
  };
  return cached;
}

/** Solo para tests: fuerza a releer process.env. */
export function resetServerEnvCache(): void {
  cached = undefined;
}
