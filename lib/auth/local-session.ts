import { jwtVerify, SignJWT } from "jose";

/**
 * Sesión del modo local (sin Supabase): cookie httpOnly con un JWT HS256.
 * Sin `server-only` a propósito: también lo usa proxy.ts.
 */
export const LOCAL_SESSION_COOKIE = "pp_session";
export const LOCAL_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export const DEV_AUTH_SECRET = "dev-only-insecure-secret-change-me-0123456789";

/**
 * Clave de firma de sesiones y enlaces de archivos: AUTH_SECRET. En producción
 * es obligatoria y de 32 caracteres o más; si falta, no se firma ni se acepta
 * ningún token (la clave de desarrollo está en el repositorio). Fuera de
 * producción, sin AUTH_SECRET se usa la de desarrollo.
 */
export function authSecret(): string | null {
  const value = process.env.AUTH_SECRET?.trim();
  if (value && value.length >= 32) return value;
  if (process.env.NODE_ENV === "production") return null;
  return value || DEV_AUTH_SECRET;
}

export class MissingAuthSecretError extends Error {
  constructor() {
    super("AUTH_SECRET falta o tiene menos de 32 caracteres: en producción no se pueden firmar sesiones ni enlaces.");
    this.name = "MissingAuthSecretError";
  }
}

function key(): Uint8Array | null {
  const secret = authSecret();
  return secret ? new TextEncoder().encode(secret) : null;
}

export type LocalSessionClaims = { userId: string; email: string | null };

export async function signLocalSession(claims: LocalSessionClaims): Promise<string> {
  const k = key();
  if (!k) throw new MissingAuthSecretError();
  return new SignJWT({ email: claims.email, pur: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + LOCAL_SESSION_MAX_AGE)
    .sign(k);
}

export async function verifyLocalSession(token: string | undefined | null): Promise<LocalSessionClaims | null> {
  const k = key();
  if (!token || !k) return null;
  try {
    const { payload } = await jwtVerify(token, k, { algorithms: ["HS256"] });
    if (payload.pur !== "session" || !payload.sub) return null;
    return { userId: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
  } catch {
    return null;
  }
}

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_ANON_KEY?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
