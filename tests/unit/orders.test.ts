import { describe, expect, it } from "vitest";
import { mergeQaResults, qaChecklistFromSpec, qaComplete, type QaKey } from "@/lib/orders/qa";
import { reorderState } from "@/lib/orders/reorder";
import type { PublicCatalog } from "@/lib/catalog/public";
import type { ItemSpec } from "@/lib/quote/spec";

const labels: Record<QaKey, string> = { material: "Material", caliber: "Calibre", size: "Medidas", print: "Colores e impresión", finish: "Acabado", quantity: "Cantidad" };
const t = (key: string) => (key === "advice" ? "El equipo lo propone" : "—");

function spec(over: Partial<ItemSpec> = {}): ItemSpec {
  return {
    position: 1,
    needsAdvice: false,
    category: { id: "c1", code: "CJ", name: "Cajas" },
    type: { id: "t1", code: "CJ-01", name: "Caja plegadiza" },
    size: { mode: "standard", standard: { id: "s1", code: "M-01", name: "Mediana", l: 20, w: 15, h: 8.5 }, custom: null },
    materialAdvice: false,
    paper: { id: "p1", code: "PA-02", name: "Kraft" },
    caliber: { id: "k1", code: "CA-03", name: "350 g" },
    eco: [],
    food: [],
    print: { option: { id: "i1", code: "IM-02", name: "2 tintas" }, noPrint: false, pantone: ["186 C"], faces: "outside", coverage: "logo" },
    finishes: [{ id: "f1", code: "AC-01", name: "Laminado mate" }],
    product: { name: "Kits", contents: "", weightG: 350, dims: { l: 18, w: 12, h: 7 }, volume: "", conditions: [], uses: [] },
    quantities: [1000, 5000],
    frequency: "once",
    artwork: "has_artwork",
    artworkFileCount: 1,
    references: { links: ["https://example.com"], samples: [{ id: "g-old", code: "MU-99", name: "Retirada" }], photoCount: 0 },
    ...over,
  } as ItemSpec;
}

describe("checklist de QA contra la especificación", () => {
  it("genera seis puntos por pieza con el valor esperado de la ficha", () => {
    const points = qaChecklistFromSpec([{ position: 1, spec: spec(), quantity: 5000 }, { position: 2, spec: spec({ paper: null, finishes: [] }), quantity: 1000 }], labels, t);
    expect(points).toHaveLength(12);
    expect(points[0]).toMatchObject({ key: "1:material", label: "1. Material", expected: "PA-02 · Kraft", result: null });
    expect(points.find((p) => p.key === "1:size")?.expected).toBe("20 × 15 × 8.5 cm");
    expect(points.find((p) => p.key === "1:print")?.expected).toBe("2 tintas · 186 C");
    expect(points.find((p) => p.key === "1:quantity")?.expected).toBe("5,000");
    expect(points.find((p) => p.key === "2:material")?.expected).toBe("El equipo lo propone");
    expect(points.find((p) => p.key === "2:finish")?.expected).toBe("—");
  });

  it("solo está completo cuando cada punto tiene resultado; sanea lo que llega del formulario", () => {
    const points = qaChecklistFromSpec([{ position: 1, spec: spec(), quantity: 5000 }], labels, t);
    expect(qaComplete(points)).toBe(false);
    expect(qaComplete([])).toBe(false);
    const merged = mergeQaResults(points, [
      ...points.map((p) => ({ key: p.key, result: "ok", comment: "  bien  " })),
      { key: "9:inventado", result: "ok" },
      { key: "1:size", result: "roto" },
    ]);
    expect(merged).toHaveLength(6);
    expect(merged.find((p) => p.key === "1:material")?.comment).toBe("bien");
    expect(qaComplete(merged)).toBe(true);
    expect(qaComplete(mergeQaResults(points, "no es una lista"))).toBe(false);
    // El valor esperado no se puede cambiar desde el formulario.
    const tampered = mergeQaResults(points, [{ key: "1:material", result: "ok", expected: "otro" }]);
    expect(tampered[0]?.expected).toBe("PA-02 · Kraft");
  });
});

describe("Pedir de nuevo", () => {
  const catalog = {
    categories: [{ id: "c1" }],
    productTypes: [{ id: "t1" }],
    sizes: [{ id: "s1" }],
    papers: [{ id: "p1" }],
    calibers: [],
    printOptions: [{ id: "i1" }],
    finishes: [{ id: "f1" }],
    ecoAttributes: [],
    foodAttributes: [],
    gallery: [],
  } as unknown as PublicCatalog;

  it("copia las piezas con la cantidad pedida y descarta opciones que ya no están activas", () => {
    const state = reorderState(
      {
        segment: "commercial",
        company: "Dulces Istmo",
        contactName: "Paula Ríos",
        email: "paula@example.com",
        whatsapp: "+507 6444-5555",
        city: "Panamá",
        address: null,
        comment: "Repetición del pedido P-2026-00001",
        lines: [{ position: 1, quantity: 5000, spec: spec() }],
      },
      catalog,
    );
    expect(state.step).toBe(9);
    const item = state.items[0]!;
    expect([item.productTypeId, item.standardSizeId, item.paperId, item.caliberId, item.printOptionId]).toEqual(["t1", "s1", "p1", null, "i1"]);
    expect(item.quantities).toEqual(["5000", "", ""]);
    expect(item.pantone).toBe("186 C");
    expect(item.referenceSampleIds).toEqual([]);
    expect(state.product).toMatchObject({ name: "Kits", weight: "350", weightUnit: "g", length: "18" });
    expect(state.contact).toMatchObject({ company: "Dulces Istmo", consent: false, comments: "Repetición del pedido P-2026-00001" });
  });
});
