import { jwtVerify, SignJWT } from "jose";

/**
 * Sesión del modo local (sin Supabase): cookie httpOnly con un JWT HS256.
 * Sin `server-only` a propósito: también lo usa proxy.ts.
 */
export const LOCAL_SESSION_COOKIE = "pp_session";
export const LOCAL_SESSION_MAX_AGE = 60 * 60 * 24 * 7;

export const DEV_AUTH_SECRET = "dev-only-insecure-secret-change-me-0123456789";

function key(): Uint8Array {
  return new TextEncoder().encode(process.env.AUTH_SECRET?.trim() || DEV_AUTH_SECRET);
}

export type LocalSessionClaims = { userId: string; email: string | null };

export async function signLocalSession(claims: LocalSessionClaims): Promise<string> {
  return new SignJWT({ email: claims.email, pur: "session" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + LOCAL_SESSION_MAX_AGE)
    .sign(key());
}

export async function verifyLocalSession(token: string | undefined | null): Promise<LocalSessionClaims | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (payload.pur !== "session" || !payload.sub) return null;
    return { userId: payload.sub, email: typeof payload.email === "string" ? payload.email : null };
  } catch {
    return null;
  }
}

export function isSupabaseAuthConfigured(): boolean {
  return Boolean(process.env.SUPABASE_URL?.trim() && process.env.SUPABASE_ANON_KEY?.trim() && process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}
