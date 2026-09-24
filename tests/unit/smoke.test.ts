import { describe, expect, it } from "vitest";
import messages from "@/messages/es.json";
import { brand } from "@/config/brand";
import { whatsappLink } from "@/lib/whatsapp";

describe("humo", () => {
  it("la marca tiene nombre y slogan", () => {
    expect(brand.name.length).toBeGreaterThan(0);
    expect(brand.slogan).toBe("Probamos que somos los mejores");
  });

  it("los textos viven en messages/es.json", () => {
    expect(messages.nav.ctaQuote).toBe("Cotiza en 5 minutos");
  });

  it("arma enlaces wa.me con texto codificado", () => {
    expect(whatsappLink("Hola, ¿cotizan cajas?", "+507 6000-0000")).toBe(
      "https://wa.me/50760000000?text=Hola%2C%20%C2%BFcotizan%20cajas%3F",
    );
    expect(whatsappLink(undefined, "50760000000")).toBe("https://wa.me/50760000000");
  });
});
