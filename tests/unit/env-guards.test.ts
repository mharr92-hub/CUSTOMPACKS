import { describe, expect, it } from "vitest";
import { assertNoTestVariablesInProduction, captchaMissingInProduction } from "@/lib/env";

describe("guardas de producción (M15)", () => {
  it("el servidor no arranca en producción con variables solo para pruebas", () => {
    expect(() => assertNoTestVariablesInProduction({ VERCEL_ENV: "production", ALLOW_LOCAL_AUTH_LINKS: "true" } as unknown as NodeJS.ProcessEnv)).toThrow(/ALLOW_LOCAL_AUTH_LINKS/);
    expect(() => assertNoTestVariablesInProduction({ VERCEL_ENV: "production", RATE_LIMIT_FACTOR: "20" } as unknown as NodeJS.ProcessEnv)).toThrow(/RATE_LIMIT_FACTOR/);
    expect(() => assertNoTestVariablesInProduction({ VERCEL_ENV: "preview", RATE_LIMIT_FACTOR: "20" } as unknown as NodeJS.ProcessEnv)).not.toThrow();
    expect(() => assertNoTestVariablesInProduction({ VERCEL_ENV: "production" } as unknown as NodeJS.ProcessEnv)).not.toThrow();
  });
  it("avisa si falta Turnstile en producción", () => {
    expect(captchaMissingInProduction({ VERCEL_ENV: "production" } as unknown as NodeJS.ProcessEnv)).toBe(true);
    expect(captchaMissingInProduction({ VERCEL_ENV: "production", TURNSTILE_SECRET_KEY: "s", NEXT_PUBLIC_TURNSTILE_SITE_KEY: "k" } as unknown as NodeJS.ProcessEnv)).toBe(false);
    expect(captchaMissingInProduction({ VERCEL_ENV: "preview" } as unknown as NodeJS.ProcessEnv)).toBe(false);
  });
});
