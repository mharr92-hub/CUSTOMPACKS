import { describe, expect, it } from "vitest";
import { ENTITIES, parseEntityForm } from "@/lib/catalog/entities";
import { detectFileKind } from "@/lib/files/magic";

const bytes = (...values: number[]) => new Uint8Array(values);
const ascii = (text: string) => new TextEncoder().encode(text);

describe("detección de tipo real de archivo", () => {
  it("reconoce los formatos de arte y de imagen", () => {
    expect(detectFileKind(ascii("%PDF-1.7\n"), "arte.pdf")).toBe("pdf");
    expect(detectFileKind(ascii("%PDF-1.5\n"), "logo.ai")).toBe("ai");
    expect(detectFileKind(ascii("%!PS-Adobe-3.0 EPSF-3.0\n"), "logo.eps")).toBe("eps");
    expect(detectFileKind(bytes(0xc5, 0xd0, 0xd3, 0xc6, 0, 0), "logo.eps")).toBe("eps");
    expect(detectFileKind(ascii('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'), "x.svg")).toBe("svg");
    expect(detectFileKind(bytes(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a))).toBe("png");
    expect(detectFileKind(bytes(0xff, 0xd8, 0xff, 0xe0))).toBe("jpeg");
    expect(detectFileKind(ascii("RIFF\0\0\0\0WEBPVP8 "))).toBe("webp");
  });

  it("no se deja engañar por la extensión", () => {
    expect(detectFileKind(ascii("MZ\x90\0 ejecutable"), "arte.pdf")).toBe("unknown");
    expect(detectFileKind(ascii("<html><script>alert(1)</script>"), "logo.svg")).toBe("unknown");
  });
});

describe("parser de formularios del catálogo", () => {
  it("convierte y valida según la definición de campos", () => {
    const form = new FormData();
    form.set("code", "CA-09");
    form.set("name", "Extra pesado");
    form.set("min_weight_g", "5000");
    form.set("max_weight_g", "");
    form.set("is_active", "on");
    const result = parseEntityForm(ENTITIES.calibers, form);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.values).toMatchObject({ code: "CA-09", min_weight_g: 5000, max_weight_g: null, is_active: true, is_provisional: false, sort_order: 0 });
    }
  });

  it("reporta campos obligatorios y formatos no válidos", () => {
    const form = new FormData();
    form.set("code", "minúsculas no");
    form.set("slug", "Con Espacios");
    form.append("segments", "commercial");
    form.append("segments", "inventado");
    const result = parseEntityForm(ENTITIES.product_types, form);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors).toMatchObject({ code: "invalid", name: "required", slug: "invalid", category_id: "required", size_family: "required" });
    }
  });

  it("filtra valores de enum desconocidos y separa líneas", () => {
    const form = new FormData();
    form.set("code", "M-020");
    form.set("name", "Muestra");
    form.append("segments", "food");
    form.append("segments", "hackeo");
    form.set("tags", "premium\n\n  retail  \n");
    const result = parseEntityForm(ENTITIES.gallery_samples, form);
    expect(result.ok && result.values.segments).toEqual(["food"]);
    expect(result.ok && result.values.tags).toEqual(["premium", "retail"]);
  });
});
