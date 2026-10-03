import { afterEach, describe, expect, it, vi } from "vitest";
import { log } from "@/lib/log";

afterEach(() => vi.restoreAllMocks());

describe("logs sin datos personales ni tokens (M17, SEG-02)", () => {
  it("quita correos, teléfonos, enlaces de WhatsApp y tokens; conserva los UUID", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const token = "a".repeat(20) + "B".repeat(23);
    const id = "0f9dd48d-fee3-4bea-a3ec-423a7427fe59";
    log.error("aviso para ana@example.com", {
      to: "+50761234567",
      link: `https://wa.me/50761234567?text=hola`,
      portal: `https://provenpack.com/seguimiento/${token}`,
      draft: `https://provenpack.com/cotizar?borrador=${token}`,
      id,
    });
    const line = String(spy.mock.calls[0]?.[0]);
    expect(line).not.toContain("ana@example.com");
    expect(line).not.toContain("50761234567");
    expect(line).not.toContain(token);
    expect(line).toContain(id);
    expect(line).toContain("[correo]");
    expect(line).toContain("[teléfono]");
  });
});
