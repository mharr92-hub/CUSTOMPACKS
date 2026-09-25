import "server-only";
import { getServerEnv } from "@/lib/env";
import { log } from "@/lib/log";

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

/**
 * Captcha invisible (Cloudflare Turnstile), opcional: sin TURNSTILE_SECRET_KEY
 * no se exige. Con clave, un token ausente o rechazado bloquea el envío; si
 * Cloudflare no responde, deja pasar y lo registra (el límite de intentos
 * sigue activo), para no perder solicitudes por una caída ajena.
 */
export function captchaRequired(): boolean {
  return Boolean(getServerEnv().turnstileSecretKey);
}

export async function verifyCaptcha(token: string | null | undefined, ip: string | null): Promise<boolean> {
  const secret = getServerEnv().turnstileSecretKey;
  if (!secret) return true;
  if (!token || token.length > 2048) return false;
  const body = new URLSearchParams({ secret, response: token });
  if (ip && ip !== "local") body.set("remoteip", ip);
  let response: Response;
  try {
    response = await fetch(VERIFY_URL, { method: "POST", body, signal: AbortSignal.timeout(8000) });
  } catch (error) {
    log.error("Turnstile no respondió; se deja pasar", { error });
    return true;
  }
  if (!response.ok) {
    log.error("Turnstile respondió con error; se deja pasar", { status: response.status });
    return true;
  }
  const data = (await response.json().catch(() => ({}))) as { success?: boolean; "error-codes"?: string[] };
  if (data.success !== true) log.warn("captcha rechazado", { codes: data["error-codes"] ?? [] });
  return data.success === true;
}
