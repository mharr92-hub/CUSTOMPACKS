import "server-only";
import { timingSafeEqual } from "node:crypto";
import { getServerEnv } from "@/lib/env";

/**
 * Autoriza una llamada a /api/cron/*. Vercel Cron envía
 * `Authorization: Bearer $CRON_SECRET`. Sin CRON_SECRET solo se permite en
 * desarrollo (para probar a mano); en producción se rechaza.
 */
export function isAuthorizedCron(request: Request): boolean {
  const env = getServerEnv();
  const header = request.headers.get("authorization") ?? "";
  if (!env.cronSecret) return env.nodeEnv !== "production";
  const expected = Buffer.from(`Bearer ${env.cronSecret}`);
  const received = Buffer.from(header);
  return expected.length === received.length && timingSafeEqual(expected, received);
}
