import type { NextRequest } from "next/server";
import { allowIp } from "@/lib/rate-limit";
import { captureError, sentryEnabled } from "@/lib/sentry";

export const runtime = "nodejs";

/**
 * Errores del navegador hacia Sentry (así el DSN no necesita permiso en la
 * CSP y se limpian tokens y correos del lado del servidor). Sin DSN no hace nada.
 */
export async function POST(request: NextRequest) {
  if (!sentryEnabled()) return new Response(null, { status: 204 });
  const text = await request.text();
  if (text.length > 16_384 || !(await allowIp("errors"))) return new Response(null, { status: 204 });
  let body: { message?: unknown; error?: { name?: unknown; message?: unknown; stack?: unknown }; path?: unknown };
  try {
    body = JSON.parse(text) as typeof body;
  } catch {
    return new Response(null, { status: 204 });
  }
  const error = body.error && typeof body.error.message === "string" ? Object.assign(new Error(body.error.message), { name: String(body.error.name ?? "Error"), stack: String(body.error.stack ?? "") }) : undefined;
  await captureError({
    message: typeof body.message === "string" ? body.message : "error en el navegador",
    error,
    runtime: "browser",
    path: typeof body.path === "string" ? body.path.slice(0, 300) : undefined,
    extra: { userAgent: request.headers.get("user-agent") ?? "" },
  });
  return new Response(null, { status: 204 });
}
