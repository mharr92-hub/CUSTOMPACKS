import { describe, expect, it } from "vitest";
import { escapeHtml, htmlParagraph } from "@/lib/mail";

describe("HTML de los correos", () => {
  it("escapa lo que escribe el visitante y solo enlaza la URL del servidor", () => {
    const render = (v: Record<string, string>) => `Hola ${v.name}, sigue aquí: ${v.link}`;
    const html = htmlParagraph(render, { name: '<a href="https://evil.example">Paga</a>' }, "https://provenpack.test/seguimiento/abc");
    expect(html).toBe(
      '<p>Hola &lt;a href=&quot;https://evil.example&quot;&gt;Paga&lt;/a&gt;, sigue aquí: <a href="https://provenpack.test/seguimiento/abc">https://provenpack.test/seguimiento/abc</a></p>',
    );
    expect(html.match(/<a /g)).toHaveLength(1);
  });

  it("escapeHtml cubre los cinco caracteres especiales", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });
});
