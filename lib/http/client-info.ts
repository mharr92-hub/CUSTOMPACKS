import "server-only";
import { headers } from "next/headers";

/** IP y navegador de quien hace la petición (para registros de consentimiento y aprobaciones). */
export async function clientInfo(): Promise<{ ip: string | null; userAgent: string | null }> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null;
  return { ip, userAgent: h.get("user-agent") };
}
