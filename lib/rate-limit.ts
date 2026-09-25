import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { serviceActor, withActor } from "@/lib/db/actor";
import { log } from "@/lib/log";

/**
 * Límite de intentos por acción (OWASP A04/A07). Ventana fija en la base
 * (`rate_limit_hit`), con el identificador (IP, correo o token) guardado como
 * hash. Si la base falla, deja pasar: un tope caído no debe bloquear ventas.
 */
export const RATE_RULES = {
  /** Envío de solicitudes por IP. */
  submit: { limit: 20, windowSec: 3600 },
  /** Autoguardado del borrador por IP (se guarda 1,2 s después de cada cambio). */
  draft: { limit: 600, windowSec: 600 },
  /** Correos "seguir después" por IP (además del tope de 3 por borrador). */
  resume: { limit: 10, windowSec: 3600 },
  /** Subidas (pedir URL firmada) por IP. */
  upload: { limit: 200, windowSec: 600 },
  /** Acciones del portal del cliente por IP (aprobar, aceptar, responder, encuesta). */
  portal: { limit: 60, windowSec: 600 },
  /** Enlaces de acceso al panel por IP y por correo. */
  login: { limit: 20, windowSec: 900 },
  loginEmail: { limit: 5, windowSec: 900 },
  /** Errores del navegador reenviados a Sentry, por IP. */
  errors: { limit: 30, windowSec: 600 },
} as const;
export type RateBucket = keyof typeof RATE_RULES;

/** Factor para la suite e2e, que corre todo desde una sola IP (1 en producción). */
function factor(): number {
  const n = Number(process.env.RATE_LIMIT_FACTOR ?? 1);
  return Number.isFinite(n) && n >= 1 ? n : 1;
}

export function rateKey(bucket: RateBucket, id: string): string {
  return `${bucket}:${createHash("sha256").update(id.trim().toLowerCase()).digest("base64url").slice(0, 32)}`;
}

export async function allowRate(bucket: RateBucket, id: string | null | undefined): Promise<boolean> {
  if (!id) return true;
  const rule = RATE_RULES[bucket];
  try {
    const [row] = await withActor(serviceActor, (tx) => tx<{ ok: boolean }[]>`
      select public.rate_limit_hit(${rateKey(bucket, id)}, ${rule.windowSec}, ${Math.floor(rule.limit * factor())}) as ok`);
    if (row?.ok === false) {
      log.warn("límite de intentos alcanzado", { bucket });
      return false;
    }
    return true;
  } catch (error) {
    log.error("no se pudo verificar el límite de intentos", { bucket, error });
    return true;
  }
}

/**
 * IP de quien hace la petición para el límite. En Vercel, `x-real-ip` la fija
 * la plataforma; `x-forwarded-for` queda de respaldo (primer salto).
 */
export async function requestIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip")?.trim() || h.get("x-forwarded-for")?.split(",")[0]?.trim() || "local";
}

/** Atajo: límite por IP de la petición actual. */
export async function allowIp(bucket: RateBucket): Promise<boolean> {
  return allowRate(bucket, await requestIp());
}

/** Limpieza diaria de ventanas viejas. */
export async function purgeRateLimits(): Promise<number> {
  const rows = await withActor(serviceActor, (tx) => tx`delete from public.rate_limits where window_start < now() - interval '1 day' returning 1`);
  return rows.length;
}
