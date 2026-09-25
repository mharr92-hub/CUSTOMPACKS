import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyCaptcha } from "@/lib/captcha";
import { resetServerEnvCache } from "@/lib/env";

function withSecret(secret: string | undefined) {
  if (secret) process.env.TURNSTILE_SECRET_KEY = secret;
  else delete process.env.TURNSTILE_SECRET_KEY;
  resetServerEnvCache();
}

afterEach(() => {
  vi.unstubAllGlobals();
  withSecret(undefined);
});

describe("captcha invisible (Turnstile, opcional)", () => {
  it("sin clave secreta no se exige y no llama a Cloudflare", async () => {
    withSecret(undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyCaptcha(null, "203.0.113.1")).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("con clave: sin token o con token rechazado bloquea; aceptado deja pasar", async () => {
    withSecret("secreto-de-prueba");
    expect(await verifyCaptcha(null, null)).toBe(false);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: false, "error-codes": ["invalid-input-response"] }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await verifyCaptcha("token-malo", "203.0.113.1")).toBe(false);
    const body = (fetchMock.mock.calls[0] as unknown as [string, { body: URLSearchParams }])[1].body;
    expect(body.get("secret")).toBe("secreto-de-prueba");
    expect(body.get("remoteip")).toBe("203.0.113.1");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: true }), { status: 200 })));
    expect(await verifyCaptcha("token-bueno", null)).toBe(true);
  });

  it("si Cloudflare no responde, deja pasar (el límite de intentos sigue activo)", async () => {
    withSecret("secreto-de-prueba");
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("timeout");
      }),
    );
    expect(await verifyCaptcha("token", null)).toBe(true);
  });
});
