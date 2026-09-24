import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { jwtVerify, SignJWT, type JWTPayload } from "jose";
import { getServerEnv } from "@/lib/env";

function secretKey(): Uint8Array {
  return new TextEncoder().encode(getServerEnv().authSecret);
}

/** Firma un token corto (HS256) para un propósito concreto (sesión local, archivo, subida). */
export async function signToken(payload: JWTPayload, purpose: string, expiresInSeconds: number): Promise<string> {
  return new SignJWT({ ...payload, pur: purpose })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + expiresInSeconds)
    .sign(secretKey());
}

/** Verifica firma, vencimiento y propósito. Devuelve null si no es válido. */
export async function verifyToken<T extends JWTPayload>(token: string, purpose: string): Promise<T | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey(), { algorithms: ["HS256"] });
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

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}
