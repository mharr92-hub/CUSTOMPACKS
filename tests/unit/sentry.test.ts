import { afterEach, describe, expect, it, vi } from "vitest";
import { buildEnvelope, captureError, parseDsn, scrub } from "@/lib/sentry";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.NEXT_PUBLIC_SENTRY_DSN;
});

describe("Sentry opcional", () => {
  it("lee el DSN y rechaza uno mal formado", () => {
    expect(parseDsn("https://abc123@o1.ingest.us.sentry.io/4507")).toEqual({ key: "abc123", host: "o1.ingest.us.sentry.io", projectId: "4507", protocol: "https" });
    expect(parseDsn("https://o1.ingest.sentry.io/4507")).toBeNull();
    expect(parseDsn("no es una url")).toBeNull();
    expect(parseDsn(undefined)).toBeNull();
  });

  it("borra tokens de enlaces, correos y contraseñas antes de enviar", () => {
    const token = "aB3_dE5-gH7iJ9kL1mN3oP5qR7sT9uV1wX3yZ5";
    const text = `falló /seguimiento/${token} y /api/documentos/pedido/1?t=${token} para ana@empresa.com en postgres://user:clave@db:5432/x`;
    const clean = scrub(text);
    expect(clean).not.toContain(token);
    expect(clean).not.toContain("ana@empresa.com");
    expect(clean).not.toContain("clave");
    expect(clean).toContain("/seguimiento/[token]");
    expect(clean).toContain("?t=[token]");
  });

  it("arma el envelope con el error y oculta claves sensibles del contexto", () => {
    const dsn = parseDsn("https://abc123@o1.ingest.sentry.io/42")!;
    const { url, body } = buildEnvelope(dsn, { message: "no se pudo enviar", error: new TypeError("x falló"), extra: { authorization: "Bearer s3cr3t", email: "a@b.com" }, runtime: "server", path: "/cotizar" });
    expect(url).toBe("https://o1.ingest.sentry.io/api/42/envelope/?sentry_key=abc123&sentry_version=7&sentry_client=provenpack%2F1.0");
    const [header, type, event] = body.split("\n").map((l) => JSON.parse(l));
    expect(type).toEqual({ type: "event" });
    expect(header.event_id).toBe(event.event_id);
    expect(event.exception.values[0]).toEqual({ type: "TypeError", value: "x falló" });
    expect(event.extra.authorization).toBe("[oculto]");
    expect(event.extra.email).toBe("[correo]");
  });

  it("sin DSN no envía nada; con DSN, un fallo de red no lanza", async () => {
    const fetchMock = vi.fn(async () => {
      throw new Error("sin red");
    });
    vi.stubGlobal("fetch", fetchMock);
    await captureError({ message: "x", runtime: "server" });
    expect(fetchMock).not.toHaveBeenCalled();
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://abc123@o1.ingest.sentry.io/42";
    await expect(captureError({ message: "x", runtime: "server" })).resolves.toBeUndefined();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
