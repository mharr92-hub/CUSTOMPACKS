import { afterEach, describe, expect, it, vi } from "vitest";
import { authSecret, DEV_AUTH_SECRET, MissingAuthSecretError, signLocalSession, verifyLocalSession } from "@/lib/auth/local-session";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("clave de firma de sesiones (OWASP A02/A07)", () => {
  it("fuera de producción usa la de desarrollo si falta AUTH_SECRET", () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "");
    expect(authSecret()).toBe(DEV_AUTH_SECRET);
  });

  it("en producción sin AUTH_SECRET válido no firma ni acepta sesiones (ni las firmadas con la clave pública de desarrollo)", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "");
    const forged = await signLocalSession({ userId: "00000000-0000-0000-0000-000000000001", email: "admin@provenpack.com" });

    vi.stubEnv("NODE_ENV", "production");
    expect(authSecret()).toBeNull();
    expect(await verifyLocalSession(forged)).toBeNull();
    await expect(signLocalSession({ userId: "x", email: null })).rejects.toBeInstanceOf(MissingAuthSecretError);

    vi.stubEnv("AUTH_SECRET", "corta");
    expect(authSecret()).toBeNull();
  });

  it("en producción con AUTH_SECRET de 32+ caracteres firma y verifica, y rechaza tokens de otra clave", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.stubEnv("AUTH_SECRET", "");
    const forged = await signLocalSession({ userId: "u1", email: null });

    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("AUTH_SECRET", "k".repeat(40));
    const token = await signLocalSession({ userId: "u1", email: "a@b.com" });
    expect(await verifyLocalSession(token)).toEqual({ userId: "u1", email: "a@b.com" });
    expect(await verifyLocalSession(forged)).toBeNull();
  });
});
