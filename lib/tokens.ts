import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { authSecret, MissingAuthSecretError } from "@/lib/auth/local-session";

function secretKey(): Uint8Array | null {
  const secret = authSecret();
  return secret ? new TextEncoder().encode(secret) : null;
}

/** Firma un token corto (HS256) para un propósito concreto (sesión local, archivo, subida). */
export async function signToken(payload: JWTPayload, purpose: string, expiresInSeconds: number): Promise<string> {
  const key = secretKey();
  if (!key) throw new MissingAuthSecretError();
  return new SignJWT({ ...payload, pur: purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(key);
}

/** Verifica firma, vencimiento y propósito. Devuelve null si no es válido. */
export async function verifyToken<T extends JWTPayload>(token: string, purpose: string): Promise<T | null> {
  const key = secretKey();
  if (!key) return null;
  try {
    const { payload } = await jwtVerify(token, key, { algorithms: ["HS256"] });
    if (payload.pur !== purpose) return null;
    return payload as T;
  } catch {
    return null;
  }
}

/** Token aleatorio apto para URL (enlaces seguros, borradores). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Prefijo aleatorio para nombres de archivo (hexadecimal: sin "-" ni "_"). */
export function fileNonce(): string {
  return randomBytes(8).toString("hex");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
